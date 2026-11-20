import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SalesSummary,
  ExpensesSummary,
  ExpenseByCategory,
  ProfitSummary,
  ExpenseStatus,
  OrderListItem,
} from "@/types/expense";
import type { ProfitReportRow } from "@/types/reports";

// ============================================
// DATE RANGE RESOLUTION
// ============================================

export interface FinancialDateRangeParams {
  dateRange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  customStartDate?: string | null;
  customEndDate?: string | null;
}

/**
 * Standardized date range resolver ensuring consistent date filters
 * and business timezone across Dashboard, Sales, Expenses, Profit and Reports.
 */
export function resolveFinancialDateRange(params?: FinancialDateRangeParams): {
  startDate: string | null;
  endDate: string | null;
} {
  if (!params) {
    return { startDate: null, endDate: null };
  }

  const customStart = params.startDate || params.customStartDate;
  const customEnd = params.endDate || params.customEndDate;

  if (params.dateRange === "custom") {
    return {
      startDate: customStart || null,
      endDate: customEnd || null,
    };
  }

  // If custom dates were passed directly without dateRange token
  if (!params.dateRange && (customStart || customEnd)) {
    return {
      startDate: customStart || null,
      endDate: customEnd || null,
    };
  }

  const now = new Date();
  // Get date in YYYY-MM-DD using local/business calendar
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (params.dateRange) {
    case "today": {
      const todayStr = formatDate(now);
      return { startDate: todayStr, endDate: todayStr };
    }
    case "7d": {
      const start = new Date(year, month, date - 6);
      return { startDate: formatDate(start), endDate: formatDate(now) };
    }
    case "30d": {
      const start = new Date(year, month, date - 29);
      return { startDate: formatDate(start), endDate: formatDate(now) };
    }
    case "this_month": {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    default: {
      return {
        startDate: customStart || null,
        endDate: customEnd || null,
      };
    }
  }
}

// ============================================
// SALES FINANCIAL CALCULATIONS
// ============================================

export interface SalesFinancialOptions {
  startDate?: string | null;
  endDate?: string | null;
  customerId?: string | null;
  status?: string | null;
}

/**
 * Derives sales financials directly from existing orders.
 * Accrual Accounting Rules:
 * - Default recognized revenue derives strictly from CONFIRMED orders.
 * - CANCELLED orders generate 0 sales revenue.
 * - DRAFT orders are unconfirmed quotations/estimates and are excluded by default.
 * - Net Sales = Gross Sales (subtotal) - Discounts (discount_amount) + Tax (tax_amount).
 * - Payments Received represents Cash Collection, NOT Sales Revenue.
 * - Outstanding Dues represents Accounts Receivable.
 */
/**
 * Calculates genuine cash collections using the authoritative payments ledger.
 * Filters strictly for SUCCESS payments within the selected period.
 * Automatically excludes REFUNDED, FAILED, and CANCELLED payments.
 */
export async function getPaymentsFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: { startDate?: string | null; endDate?: string | null; customerId?: string | null }
): Promise<{ total_collected: number; payment_count: number }> {
  let query = supabase
    .from("payments")
    .select("id, amount")
    .eq("business_id", businessId)
    .eq("status", "SUCCESS");

  if (options?.startDate) query = query.gte("payment_date", options.startDate);
  if (options?.endDate) query = query.lte("payment_date", options.endDate);
  if (options?.customerId) query = query.eq("customer_id", options.customerId);

  const { data, error } = await query;
  if (error) {
    console.error("getPaymentsFinancials query error:", error);
    return { total_collected: 0, payment_count: 0 };
  }

  let total = 0;
  for (const p of data ?? []) {
    total += Number(p.amount || 0);
  }

  return {
    total_collected: Math.round(total * 100) / 100,
    payment_count: data?.length ?? 0,
  };
}

/**
 * Calculates total customer outstanding receivables as an as-of-date balance
 * reusing the authoritative get_customer_outstanding_report RPC.
 * Factors in opening receivables, credits, advances, and ledger adjustments.
 */
export async function getTotalCustomerOutstanding(
  supabase: SupabaseClient,
  businessId: string,
  asOfDate?: string | null
): Promise<{ totalOutstanding: number; asOfDate: string }> {
  const asOf = asOfDate || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase.rpc("get_customer_outstanding_report", {
    p_business_id: businessId,
    p_start_date: null,
    p_end_date: asOf,
    p_customer_id: null,
    p_min_due: null,
    p_limit: null,
    p_offset: 0,
  });

  if (error) {
    console.error("getTotalCustomerOutstanding RPC error:", error);
    return { totalOutstanding: 0, asOfDate: asOf };
  }

  let totalDue = 0;
  for (const r of data || []) {
    totalDue += Number(r.closing_receivable ?? r.total_due ?? 0);
  }

  return {
    totalOutstanding: Math.round(totalDue * 100) / 100,
    asOfDate: asOf,
  };
}

/**
 * Calculates delivery-based recognized revenue under Option A (Accrual Fulfillment).
 * - Recognized Revenue = Eligible Delivered Quantity × Net Unit Selling Price (excluding GST)
 * - Excludes GST (Output Tax Liability).
 * - Deducts applicable posted sales returns (taxable portion of credit note).
 * - Tracks unfulfilled pipeline on confirmed orders.
 */
export interface DeliveryRecognizedRevenue {
  recognized_net_sales: number;
  delivered_taxable_sales: number;
  delivered_gst: number;
  gross_delivered_invoiced: number;
  taxable_sales_returns: number;
  gst_reversal: number;
  cgst_reversal?: number;
  sgst_reversal?: number;
  igst_reversal?: number;
  unfulfilled_pipeline: number;
  delivered_order_count: number;
  returns_review_required?: boolean;
}

export async function getDeliveredRecognizedRevenue(
  supabase: SupabaseClient,
  businessId: string,
  options?: { startDate?: string | null; endDate?: string | null; customerId?: string | null }
): Promise<DeliveryRecognizedRevenue> {
  // 1. Fetch completed, non-reversed deliveries in period
  let delivQuery = supabase
    .from("deliveries")
    .select("id, order_id, delivered_at")
    .eq("business_id", businessId)
    .eq("status", "DELIVERED")
    .eq("is_ledger_reversed", false);

  if (options?.startDate) delivQuery = delivQuery.gte("delivered_at", `${options.startDate}T00:00:00Z`);
  if (options?.endDate) delivQuery = delivQuery.lte("delivered_at", `${options.endDate}T23:59:59Z`);
  if (options?.customerId) delivQuery = delivQuery.eq("customer_id", options.customerId);

  const { data: delivData, error: delivErr } = await delivQuery;
  if (delivErr) {
    console.error("getDeliveredRecognizedRevenue delivQuery error:", delivErr);
  }

  const deliveredDeliveries = delivData ?? [];
  const deliveryIds = deliveredDeliveries.map((d: any) => d.id).filter(Boolean);
  const orderIds = Array.from(new Set(deliveredDeliveries.map((d: any) => d.order_id).filter(Boolean)));

  let deliveredTaxable = 0;
  let deliveredGst = 0;

  if (deliveryIds.length > 0) {
    // 2. Query delivery items for completed dispatches
    const { data: diRows, error: diErr } = await supabase
      .from("delivery_items")
      .select("id, delivery_id, order_item_id, delivered_quantity")
      .in("delivery_id", deliveryIds);

    if (diErr) {
      console.error("getDeliveredRecognizedRevenue diRows error:", diErr);
    }

    const orderItemIds = Array.from(new Set((diRows || []).map((di: any) => di.order_item_id).filter(Boolean)));
    if (orderItemIds.length > 0) {
      const { data: oiRows, error: oiErr } = await supabase
        .from("order_items")
        .select("id, order_id, quantity, unit_price, discount_rate, tax_rate")
        .in("id", orderItemIds);

      if (oiErr) {
        console.error("getDeliveredRecognizedRevenue oiRows error:", oiErr);
      }

      const oiMap = new Map((oiRows || []).map((oi: any) => [oi.id, oi]));

      for (const di of diRows || []) {
        const oi = oiMap.get(di.order_item_id);
        if (!oi) continue;

        const delivQty = Number(di.delivered_quantity || 0);
        const uPrice = Number(oi.unit_price || 0);
        const discRate = Number(oi.discount_rate || 0);
        const tRate = Number(oi.tax_rate || 0);

        const netDeliveredItemTaxable = Math.round(delivQty * uPrice * (1 - discRate / 100) * 100) / 100;
        const itemDeliveredGst = Math.round(netDeliveredItemTaxable * (tRate / 100) * 100) / 100;

        deliveredTaxable += netDeliveredItemTaxable;
        deliveredGst += itemDeliveredGst;
      }
    }
  }

  // Calculate unfulfilled pipeline: difference between booked subtotal on confirmed orders and delivered taxable
  let unfulfilledQuery = supabase
    .from("orders")
    .select("subtotal")
    .eq("business_id", businessId)
    .eq("status", "CONFIRMED");

  if (options?.startDate) unfulfilledQuery = unfulfilledQuery.gte("order_date", options.startDate);
  if (options?.endDate) unfulfilledQuery = unfulfilledQuery.lte("order_date", options.endDate);
  if (options?.customerId) unfulfilledQuery = unfulfilledQuery.eq("customer_id", options.customerId);

  const { data: unfulfilledOrders } = await unfulfilledQuery;
  let totalBookedSubtotal = 0;
  for (const o of unfulfilledOrders ?? []) {
    totalBookedSubtotal += Number(o.subtotal || 0);
  }
  const unfulfilledTaxable = Math.max(0, Math.round((totalBookedSubtotal - deliveredTaxable) * 100) / 100);

  // 3. Query posted goods returns in period
  let retQuery = supabase
    .from("goods_returns")
    .select("id, return_number, adjustment_amount, product_id, order_item_id, delivery_id, return_date")
    .eq("business_id", businessId)
    .eq("status", "POSTED");

  if (options?.startDate) retQuery = retQuery.gte("return_date", options.startDate);
  if (options?.endDate) retQuery = retQuery.lte("return_date", options.endDate);
  if (options?.customerId) retQuery = retQuery.eq("customer_id", options.customerId);

  const { data: retData, error: retErr } = await retQuery;
  if (retErr) {
    console.error("getDeliveredRecognizedRevenue retQuery error:", retErr);
  }

  const postedReturns = retData ?? [];
  const returnIds = postedReturns.map((r: any) => r.id);

  let taxableReturns = 0;
  let gstReversal = 0;
  let cgstReversal = 0;
  let sgstReversal = 0;
  let igstReversal = 0;
  let reviewRequired = false;

  if (returnIds.length > 0) {
    // A. Query line items of posted returns
    const { data: griRows, error: griErr } = await supabase
      .from("goods_return_items")
      .select("id, goods_return_id, order_item_id, delivery_item_id, product_id, returned_quantity, unit_price, total_amount")
      .in("goods_return_id", returnIds);

    if (griErr) {
      console.error("getDeliveredRecognizedRevenue griRows error:", griErr);
    }

    const returnItems = griRows ?? [];

    // B. Collect unique IDs for authoritative tax lookup
    const lookupOrderItemIds = Array.from(new Set([
      ...returnItems.map((i: any) => i.order_item_id).filter(Boolean),
      ...postedReturns.map((r: any) => r.order_item_id).filter(Boolean),
    ]));

    const lookupDeliveryItemIds = Array.from(new Set(
      returnItems.map((i: any) => i.delivery_item_id).filter(Boolean)
    ));

    const lookupProductIds = Array.from(new Set([
      ...returnItems.map((i: any) => i.product_id).filter(Boolean),
      ...postedReturns.map((r: any) => r.product_id).filter(Boolean),
    ]));

    // C. Batch fetch authoritative tax rates
    const [oiRes, diRes, pRes] = await Promise.all([
      lookupOrderItemIds.length > 0
        ? supabase.from("order_items").select("id, tax_rate, cgst_rate, sgst_rate, igst_rate").in("id", lookupOrderItemIds)
        : Promise.resolve({ data: [] }),
      lookupDeliveryItemIds.length > 0
        ? supabase.from("delivery_items").select("id, tax_rate, cgst_amount, sgst_amount, igst_amount").in("id", lookupDeliveryItemIds)
        : Promise.resolve({ data: [] }),
      lookupProductIds.length > 0
        ? supabase.from("products").select("id, tax_rate").in("id", lookupProductIds)
        : Promise.resolve({ data: [] }),
    ]);

    const oiTaxMap = new Map((oiRes.data ?? []).map((oi: any) => [oi.id, oi]));
    const diTaxMap = new Map((diRes.data ?? []).map((di: any) => [di.id, di]));
    const pTaxMap = new Map((pRes.data ?? []).map((p: any) => [p.id, p]));

    // Group items by return
    const itemsByReturn = new Map<string, any[]>();
    for (const item of returnItems) {
      if (!itemsByReturn.has(item.goods_return_id)) itemsByReturn.set(item.goods_return_id, []);
      itemsByReturn.get(item.goods_return_id)!.push(item);
    }

    // D. Compute taxable base and GST reversal without hardcoded rates
    for (const ret of postedReturns) {
      const items = itemsByReturn.get(ret.id) || [];
      const grossAdjustment = Number(ret.adjustment_amount || 0);

      if (items.length === 0) {
        // Return without child item rows: resolve from return header
        let taxRate: number | null = null;
        let cgstRate = 0;
        let sgstRate = 0;
        let igstRate = 0;

        if (ret.order_item_id && oiTaxMap.has(ret.order_item_id)) {
          const oi = oiTaxMap.get(ret.order_item_id);
          taxRate = Number(oi.tax_rate);
          cgstRate = Number(oi.cgst_rate || 0);
          sgstRate = Number(oi.sgst_rate || 0);
          igstRate = Number(oi.igst_rate || 0);
        } else if (ret.product_id && pTaxMap.has(ret.product_id)) {
          const p = pTaxMap.get(ret.product_id);
          taxRate = p.tax_rate !== null ? Number(p.tax_rate) : null;
        }

        if (taxRate === null || isNaN(taxRate)) {
          reviewRequired = true;
          console.warn(`[Review Required] No authoritative tax rate found for return ${ret.return_number}`);
          continue;
        }

        const taxable = Math.round((grossAdjustment / (1 + taxRate / 100)) * 100) / 100;
        const gst = Math.round((grossAdjustment - taxable) * 100) / 100;
        taxableReturns += taxable;
        gstReversal += gst;

        if (cgstRate > 0 && sgstRate > 0) {
          cgstReversal += Math.round(taxable * (cgstRate / 100) * 100) / 100;
          sgstReversal += Math.round(taxable * (sgstRate / 100) * 100) / 100;
        } else if (igstRate > 0) {
          igstReversal += Math.round(taxable * (igstRate / 100) * 100) / 100;
        }
      } else {
        // Resolve per line item for multi-item / mixed-rate support
        for (const it of items) {
          let taxRate: number | null = null;
          let cgstRate = 0;
          let sgstRate = 0;
          let igstRate = 0;

          if (it.order_item_id && oiTaxMap.has(it.order_item_id)) {
            const oi = oiTaxMap.get(it.order_item_id);
            taxRate = Number(oi.tax_rate);
            cgstRate = Number(oi.cgst_rate || 0);
            sgstRate = Number(oi.sgst_rate || 0);
            igstRate = Number(oi.igst_rate || 0);
          } else if (it.delivery_item_id && diTaxMap.has(it.delivery_item_id)) {
            const di = diTaxMap.get(it.delivery_item_id);
            taxRate = Number(di.tax_rate);
          } else if (it.product_id && pTaxMap.has(it.product_id)) {
            const p = pTaxMap.get(it.product_id);
            taxRate = p.tax_rate !== null ? Number(p.tax_rate) : null;
          }

          if (taxRate === null || isNaN(taxRate)) {
            reviewRequired = true;
            console.warn(`[Review Required] No authoritative tax rate found for line item ${it.id} on return ${ret.return_number}`);
            continue;
          }

          let lineGross = Number(it.total_amount || 0);
          if (lineGross === 0 && Number(it.returned_quantity || 0) > 0 && grossAdjustment > 0) {
            lineGross = grossAdjustment;
          }

          const taxable = Math.round((lineGross / (1 + taxRate / 100)) * 100) / 100;
          const gst = Math.round((lineGross - taxable) * 100) / 100;
          taxableReturns += taxable;
          gstReversal += gst;

          if (cgstRate > 0 && sgstRate > 0) {
            cgstReversal += Math.round(taxable * (cgstRate / 100) * 100) / 100;
            sgstReversal += Math.round(taxable * (sgstRate / 100) * 100) / 100;
          } else if (igstRate > 0) {
            igstReversal += Math.round(taxable * (igstRate / 100) * 100) / 100;
          }
        }
      }
    }
  }

  const recognizedNetSales = Math.max(0, Math.round((deliveredTaxable - taxableReturns) * 100) / 100);

  return {
    recognized_net_sales: recognizedNetSales,
    delivered_taxable_sales: Math.round(deliveredTaxable * 100) / 100,
    delivered_gst: Math.round(deliveredGst * 100) / 100,
    gross_delivered_invoiced: Math.round((deliveredTaxable + deliveredGst) * 100) / 100,
    taxable_sales_returns: Math.round(taxableReturns * 100) / 100,
    gst_reversal: Math.round(gstReversal * 100) / 100,
    cgst_reversal: Math.round(cgstReversal * 100) / 100,
    sgst_reversal: Math.round(sgstReversal * 100) / 100,
    igst_reversal: Math.round(igstReversal * 100) / 100,
    unfulfilled_pipeline: Math.round(unfulfilledTaxable * 100) / 100,
    delivered_order_count: orderIds.length,
    returns_review_required: reviewRequired,
  };
}

/**
 * Gets aggregated sales metrics with accrual accounting filters.
 * Returns gross sales, discounts, taxes, net sales, payments received, and receivables.
 */
export async function getSalesFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: SalesFinancialOptions
): Promise<SalesSummary> {
  const statusFilter = options?.status?.trim();

  // If user explicitly queried CANCELLED orders, accounting rules dictate 0 sales revenue
  if (statusFilter === "CANCELLED") {
    let query = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "CANCELLED");

    if (options?.startDate) query = query.gte("order_date", options.startDate);
    if (options?.endDate) query = query.lte("order_date", options.endDate);
    if (options?.customerId) query = query.eq("customer_id", options.customerId);

    const { count } = await query;
    return {
      gross_sales: 0,
      discounts: 0,
      tax: 0,
      net_sales: 0,
      payments_received: 0,
      outstanding: 0,
      order_count: count ?? 0,
    };
  }

  let query = supabase
    .from("orders")
    .select("subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount")
    .eq("business_id", businessId);

  // Accounting Rule: Default to CONFIRMED orders (accrual recognized revenue)
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  } else {
    query = query.eq("status", "CONFIRMED");
  }

  if (options?.startDate) query = query.gte("order_date", options.startDate);
  if (options?.endDate) query = query.lte("order_date", options.endDate);
  if (options?.customerId) query = query.eq("customer_id", options.customerId);

  const { data, error } = await query;
  if (error) {
    console.error("getSalesFinancials query error:", error);
    return {
      gross_sales: 0,
      discounts: 0,
      tax: 0,
      net_sales: 0,
      payments_received: 0,
      outstanding: 0,
      order_count: 0,
    };
  }

  let gross_sales = 0;
  let discounts = 0;
  let tax = 0;
  let net_sales = 0;
  let order_due_sum = 0;
  const order_count = data?.length ?? 0;

  for (const row of data ?? []) {
    gross_sales += Number(row.subtotal || 0);
    discounts += Number(row.discount_amount || 0);
    tax += Number(row.tax_amount || 0);
    net_sales += Number(row.total_amount || 0);
    order_due_sum += Number(row.due_amount || 0);
  }

  // Get true cash collections from payments table (status = 'SUCCESS')
  const pmtSummary = await getPaymentsFinancials(supabase, businessId, {
    startDate: options?.startDate,
    endDate: options?.endDate,
    customerId: options?.customerId,
  });

  // Calculate true company-wide outstanding balance if not filtering by customer;
  // if filtering by customer, use order_due_sum
  let finalOutstanding = order_due_sum;
  if (!options?.customerId) {
    const custOut = await getTotalCustomerOutstanding(supabase, businessId, options?.endDate);
    finalOutstanding = custOut.totalOutstanding;
  }

  // Option A: Delivery-Based Recognized Revenue (excluding GST and deducting posted taxable sales returns)
  const deliveryRevenue = await getDeliveredRecognizedRevenue(supabase, businessId, {
    startDate: options?.startDate,
    endDate: options?.endDate,
    customerId: options?.customerId,
  });

  return {
    gross_sales: Math.round(gross_sales * 100) / 100,
    discounts: Math.round(discounts * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    net_sales: deliveryRevenue.recognized_net_sales,
    payments_received: pmtSummary.total_collected,
    outstanding: Math.round(finalOutstanding * 100) / 100,
    order_count,
    gross_booked_sales: Math.round(gross_sales * 100) / 100,
    unfulfilled_pipeline: deliveryRevenue.unfulfilled_pipeline,
    gst_on_sales: deliveryRevenue.delivered_gst,
    sales_returns: deliveryRevenue.taxable_sales_returns,
    gross_invoiced_sales: Math.round(net_sales * 100) / 100,
    returns_review_required: deliveryRevenue.returns_review_required,
  };
}

/**
 * Gets sales orders list with pagination and customer metadata
 */
export async function getSalesOrdersList(
  supabase: SupabaseClient,
  businessId: string,
  options?: SalesFinancialOptions & { limit?: number; offset?: number }
): Promise<OrderListItem[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const statusFilter = options?.status?.trim();

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      order_date,
      customer_id,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      paid_amount,
      due_amount,
      status,
      customer:customers!inner(id, name)
    `)
    .eq("business_id", businessId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  } else {
    // Default to confirmed revenue orders
    query = query.eq("status", "CONFIRMED");
  }

  if (options?.startDate) query = query.gte("order_date", options.startDate);
  if (options?.endDate) query = query.lte("order_date", options.endDate);
  if (options?.customerId) query = query.eq("customer_id", options.customerId);

  query = query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    order_date: row.order_date,
    customer_id: row.customer_id,
    customer_name: row.customer?.name ?? "Unknown Customer",
    gross_amount: Number(row.subtotal || 0),
    discount_amount: Number(row.discount_amount || 0),
    tax_amount: Number(row.tax_amount || 0),
    net_amount: Number(row.total_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    outstanding_amount: Number(row.due_amount || 0),
    status: row.status,
  }));
}

/**
 * Gets exact total orders count for pagination
 */
export async function getTotalSalesOrdersCount(
  supabase: SupabaseClient,
  businessId: string,
  options?: SalesFinancialOptions
): Promise<number> {
  const statusFilter = options?.status?.trim();

  let query = supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  } else {
    query = query.eq("status", "CONFIRMED");
  }

  if (options?.startDate) query = query.gte("order_date", options.startDate);
  if (options?.endDate) query = query.lte("order_date", options.endDate);
  if (options?.customerId) query = query.eq("customer_id", options.customerId);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

// ============================================
// EXPENSES FINANCIAL CALCULATIONS
// ============================================

export interface ExpensesFinancialOptions {
  startDate?: string | null;
  endDate?: string | null;
  category?: string | null;
  status?: ExpenseStatus | null;
}

/**
 * Calculates expenses from existing expense records.
 * Rules:
 * - Only POSTED expenses represent recognized business expenses.
 * - VOIDED and DRAFT expenses are excluded to prevent duplicate or phantom counting.
 */
export async function getExpensesFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: ExpensesFinancialOptions
): Promise<ExpensesSummary> {
  let query = supabase
    .from("expenses")
    .select("amount")
    .eq("business_id", businessId);

  if (options?.status) {
    query = query.eq("status", options.status);
  } else {
    // Default: POSTED expenses only
    query = query.eq("status", "POSTED");
  }

  if (options?.startDate) query = query.gte("expense_date", options.startDate);
  if (options?.endDate) query = query.lte("expense_date", options.endDate);
  if (options?.category) query = query.eq("category", options.category);

  const { data, error } = await query;
  if (error) {
    console.error("getExpensesFinancials query error:", error);
    return {
      total_expenses: 0,
      expense_count: 0,
    };
  }

  let total_expenses = 0;
  const expense_count = data?.length ?? 0;

  for (const row of data ?? []) {
    total_expenses += Number(row.amount || 0);
  }

  return {
    total_expenses: Math.round(total_expenses * 100) / 100,
    expense_count,
  };
}

/**
 * Calculates expenses grouped by category
 */
export async function getExpensesByCategoryFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: { startDate?: string | null; endDate?: string | null }
): Promise<ExpenseByCategory[]> {
  let query = supabase
    .from("expenses")
    .select("category, amount")
    .eq("business_id", businessId)
    .eq("status", "POSTED");

  if (options?.startDate) query = query.gte("expense_date", options.startDate);
  if (options?.endDate) query = query.lte("expense_date", options.endDate);

  const { data, error } = await query;
  if (error) {
    console.error("getExpensesByCategoryFinancials error:", error);
    return [];
  }

  const categoryMap = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
    const cat = row.category || "Uncategorized";
    const amt = Number(row.amount || 0);
    const existing = categoryMap.get(cat) || { total: 0, count: 0 };
    categoryMap.set(cat, {
      total: existing.total + amt,
      count: existing.count + 1,
    });
  }

  return Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      total_amount: Math.round(stats.total * 100) / 100,
      expense_count: stats.count,
    }))
    .sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
}

// ============================================
// PROFIT FINANCIAL CALCULATIONS
// ============================================

export interface ProfitFinancialSummary extends ProfitSummary {
  is_estimated: boolean;
  estimation_disclaimer: string;
}

/**
 * Calculates unified profit summary.
 * Formula: Operating Profit = Net Sales - Total Operating Expenses.
 * Strictly flags profit as an ESTIMATE because direct manufacturing/COGS
 * costs are not tracked per order in inventory accounting.
 */
export async function getProfitFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: { startDate?: string | null; endDate?: string | null; customerId?: string | null }
): Promise<ProfitFinancialSummary> {
  const [sales, expenses] = await Promise.all([
    getSalesFinancials(supabase, businessId, {
      startDate: options?.startDate,
      endDate: options?.endDate,
      customerId: options?.customerId,
    }),
    getExpensesFinancials(supabase, businessId, {
      startDate: options?.startDate,
      endDate: options?.endDate,
    }),
  ]);

  const netSalesNum = Number(sales.net_sales || 0);
  const expensesNum = Number(expenses.total_expenses || 0);
  const profitNum = Math.round((netSalesNum - expensesNum) * 100) / 100;

  return {
    gross_sales: sales.gross_sales,
    discounts: sales.discounts,
    tax: sales.tax,
    net_sales: sales.net_sales,
    payments_received: sales.payments_received,
    outstanding: sales.outstanding,
    order_count: sales.order_count,
    total_expenses: expenses.total_expenses,
    expense_count: expenses.expense_count,
    profit: profitNum,
    is_estimated: true,
    estimation_disclaimer:
      "Profit is calculated as Net Sales minus Operating Expenses. Direct manufacturing and production costs (COGS) are not tracked per order, so this represents an Estimated Operating Profit.",
  };
}

/**
 * Calculates periodic profit report rows grouped by Month (YYYY-MM).
 * Reconciles sales and posted expenses month by month.
 */
export async function getProfitByPeriodFinancials(
  supabase: SupabaseClient,
  businessId: string,
  options?: { startDate?: string | null; endDate?: string | null; customerId?: string | null }
): Promise<ProfitReportRow[]> {
  // 1. Fetch confirmed orders
  let ordersQuery = supabase
    .from("orders")
    .select("order_date, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount")
    .eq("business_id", businessId)
    .eq("status", "CONFIRMED");

  if (options?.startDate) ordersQuery = ordersQuery.gte("order_date", options.startDate);
  if (options?.endDate) ordersQuery = ordersQuery.lte("order_date", options.endDate);
  if (options?.customerId) ordersQuery = ordersQuery.eq("customer_id", options.customerId);

  // 2. Fetch posted expenses
  let expensesQuery = supabase
    .from("expenses")
    .select("expense_date, amount")
    .eq("business_id", businessId)
    .eq("status", "POSTED");

  if (options?.startDate) expensesQuery = expensesQuery.gte("expense_date", options.startDate);
  if (options?.endDate) expensesQuery = expensesQuery.lte("expense_date", options.endDate);

  const [ordersRes, expensesRes] = await Promise.all([ordersQuery, expensesQuery]);
  if (ordersRes.error || expensesRes.error) {
    console.error("getProfitByPeriodFinancials error:", ordersRes.error || expensesRes.error);
    return [];
  }

  const periodsMap = new Map<
    string,
    {
      gross_sales: number;
      discounts: number;
      tax: number;
      net_sales: number;
      payments_received: number;
      outstanding: number;
      total_expenses: number;
    }
  >();

  const getPeriodKey = (dateStr: string) => dateStr.substring(0, 7); // YYYY-MM

  // Accumulate sales
  for (const o of ordersRes.data ?? []) {
    if (!o.order_date) continue;
    const period = getPeriodKey(o.order_date);
    const existing = periodsMap.get(period) || {
      gross_sales: 0,
      discounts: 0,
      tax: 0,
      net_sales: 0,
      payments_received: 0,
      outstanding: 0,
      total_expenses: 0,
    };
    existing.gross_sales += Number(o.subtotal || 0);
    existing.discounts += Number(o.discount_amount || 0);
    existing.tax += Number(o.tax_amount || 0);
    existing.net_sales += Number(o.total_amount || 0);
    existing.payments_received += Number(o.paid_amount || 0);
    existing.outstanding += Number(o.due_amount || 0);
    periodsMap.set(period, existing);
  }

  // Accumulate expenses
  for (const e of expensesRes.data ?? []) {
    if (!e.expense_date) continue;
    const period = getPeriodKey(e.expense_date);
    const existing = periodsMap.get(period) || {
      gross_sales: 0,
      discounts: 0,
      tax: 0,
      net_sales: 0,
      payments_received: 0,
      outstanding: 0,
      total_expenses: 0,
    };
    existing.total_expenses += Number(e.amount || 0);
    periodsMap.set(period, existing);
  }

  // Convert to sorted rows
  return Array.from(periodsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => {
      const gross = Math.round(data.gross_sales * 100) / 100;
      const disc = Math.round(data.discounts * 100) / 100;
      const tax = Math.round(data.tax * 100) / 100;
      const net = Math.round(data.net_sales * 100) / 100;
      const paid = Math.round(data.payments_received * 100) / 100;
      const due = Math.round(data.outstanding * 100) / 100;
      const exp = Math.round(data.total_expenses * 100) / 100;
      const profit = Math.round((net - exp) * 100) / 100;

      return {
        period,
        gross_sales: gross,
        discounts: disc,
        tax: tax,
        net_sales: net,
        payments_received: paid,
        outstanding: due,
        total_expenses: exp,
        profit: profit,
      };
    });
}

// ============================================
// TREND FINANCIAL CALCULATIONS (DASHBOARD CHARTS)
// ============================================

function generateDateList(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startDate);
  const end = new Date(endDate);
  const pad = (n: number) => String(n).padStart(2, "0");

  while (curr <= end) {
    const dStr = `${curr.getFullYear()}-${pad(curr.getMonth() + 1)}-${pad(curr.getDate())}`;
    dates.push(dStr);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

export async function getSalesTrendFinancials(
  supabase: SupabaseClient,
  businessId: string,
  startDate: string | null,
  endDate: string | null
): Promise<Array<{ date: string; value: number; gross_sales: number; net_sales: number; payments_received: number; outstanding: number }>> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const defEnd = endDate || formatDate(now);
  const defStart = startDate || formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

  const dates = generateDateList(defStart, defEnd);

  const { data, error } = await supabase
    .from("orders")
    .select("order_date, subtotal, total_amount, paid_amount, due_amount")
    .eq("business_id", businessId)
    .eq("status", "CONFIRMED")
    .gte("order_date", defStart)
    .lte("order_date", defEnd);

  if (error) {
    console.error("getSalesTrendFinancials error:", error);
    return [];
  }

  const dateMap = new Map<string, { gross: number; net: number; paid: number; due: number }>();
  for (const d of dates) {
    dateMap.set(d, { gross: 0, net: 0, paid: 0, due: 0 });
  }

  for (const row of data ?? []) {
    if (!row.order_date || !dateMap.has(row.order_date)) continue;
    const entry = dateMap.get(row.order_date)!;
    entry.gross += Number(row.subtotal || 0);
    entry.net += Number(row.total_amount || 0);
    entry.paid += Number(row.paid_amount || 0);
    entry.due += Number(row.due_amount || 0);
  }

  return dates.map((date) => {
    const stat = dateMap.get(date)!;
    const net = Math.round(stat.net * 100) / 100;
    return {
      date,
      value: net,
      gross_sales: Math.round(stat.gross * 100) / 100,
      net_sales: net,
      payments_received: Math.round(stat.paid * 100) / 100,
      outstanding: Math.round(stat.due * 100) / 100,
    };
  });
}

export async function getExpenseTrendFinancials(
  supabase: SupabaseClient,
  businessId: string,
  startDate: string | null,
  endDate: string | null
): Promise<Array<{ date: string; value: number; amount: number }>> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const defEnd = endDate || formatDate(now);
  const defStart = startDate || formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

  const dates = generateDateList(defStart, defEnd);

  const { data, error } = await supabase
    .from("expenses")
    .select("expense_date, amount")
    .eq("business_id", businessId)
    .eq("status", "POSTED")
    .gte("expense_date", defStart)
    .lte("expense_date", defEnd);

  if (error) {
    console.error("getExpenseTrendFinancials error:", error);
    return [];
  }

  const dateMap = new Map<string, number>();
  for (const d of dates) {
    dateMap.set(d, 0);
  }

  for (const row of data ?? []) {
    if (!row.expense_date || !dateMap.has(row.expense_date)) continue;
    dateMap.set(row.expense_date, (dateMap.get(row.expense_date) || 0) + Number(row.amount || 0));
  }

  return dates.map((date) => {
    const amt = Math.round((dateMap.get(date) || 0) * 100) / 100;
    return {
      date,
      value: amt,
      amount: amt,
    };
  });
}

export async function getPaymentTrendFinancials(
  supabase: SupabaseClient,
  businessId: string,
  startDate: string | null,
  endDate: string | null
): Promise<Array<{ date: string; value: number; received: number; pending: number }>> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const defEnd = endDate || formatDate(now);
  const defStart = startDate || formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

  const dates = generateDateList(defStart, defEnd);

  // Payments received on payment_date
  const paymentsQuery = supabase
    .from("payments")
    .select("payment_date, amount")
    .eq("business_id", businessId)
    .eq("status", "SUCCESS")
    .gte("payment_date", defStart)
    .lte("payment_date", defEnd);

  // Orders outstanding on order_date
  const ordersQuery = supabase
    .from("orders")
    .select("order_date, due_amount")
    .eq("business_id", businessId)
    .eq("status", "CONFIRMED")
    .gte("order_date", defStart)
    .lte("order_date", defEnd);

  const [payRes, ordRes] = await Promise.all([paymentsQuery, ordersQuery]);
  if (payRes.error || ordRes.error) {
    console.error("getPaymentTrendFinancials error:", payRes.error || ordRes.error);
    return [];
  }

  const dateMap = new Map<string, { received: number; pending: number }>();
  for (const d of dates) {
    dateMap.set(d, { received: 0, pending: 0 });
  }

  for (const p of payRes.data ?? []) {
    if (!p.payment_date || !dateMap.has(p.payment_date)) continue;
    const entry = dateMap.get(p.payment_date)!;
    entry.received += Number(p.amount || 0);
  }

  for (const o of ordRes.data ?? []) {
    if (!o.order_date || !dateMap.has(o.order_date)) continue;
    const entry = dateMap.get(o.order_date)!;
    entry.pending += Number(o.due_amount || 0);
  }

  return dates.map((date) => {
    const stat = dateMap.get(date)!;
    const rec = Math.round(stat.received * 100) / 100;
    const pend = Math.round(stat.pending * 100) / 100;
    return {
      date,
      value: rec,
      received: rec,
      pending: pend,
    };
  });
}
