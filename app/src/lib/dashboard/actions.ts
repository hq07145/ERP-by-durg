import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardSummary,
  SalesTrendPoint,
  PaymentTrendPoint,
  ExpenseTrendPoint,
  OrderStatusBreakdown,
  ProductionStatusBreakdown,
  TopProduct,
  TopCustomer,
  LowStockItem,
  UpcomingDelivery,
  DashboardFilters,
} from "@/types/dashboard";

import {
  resolveFinancialDateRange,
  getSalesFinancials,
  getExpensesFinancials,
  getSalesTrendFinancials,
  getExpenseTrendFinancials,
  getPaymentTrendFinancials,
} from "@/lib/financials/service";

import type { SalesSummary, ExpensesSummary } from "@/types/expense";

const defaultDashboardSummary: DashboardSummary = {
  total_sales: 0,
  payments_received: 0,
  outstanding_due: 0,
  total_expenses: 0,
  profit: 0,
  total_orders: 0,
  pending_orders: 0,
  in_production: 0,
  ready_for_dispatch: 0,
  delivered: 0,
  low_stock_items: 0,
  overdue_deliveries: 0,
};

function resolveDateRange(filters: DashboardFilters): { startDate: string | null; endDate: string | null } {
  return resolveFinancialDateRange({
    dateRange: filters.dateRange,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
  });
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

export async function getDashboardSummary(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<DashboardSummary | null> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return null;

    const canViewOrders = hasPermission({ permissions: context.permissions }, "orders.view");
    const canViewProduction = hasPermission({ permissions: context.permissions }, "production.view");
    const canViewInventory = hasPermission({ permissions: context.permissions }, "inventory.view");
    const canViewDelivery = hasPermission({ permissions: context.permissions }, "delivery.view");

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return defaultDashboardSummary;

    const { startDate, endDate } = resolveFinancialDateRange({
      dateRange: filters.dateRange,
      customStartDate: filters.customStartDate,
      customEndDate: filters.customEndDate,
    });

    let salesData: SalesSummary = {
      gross_sales: 0,
      discounts: 0,
      tax: 0,
      net_sales: 0,
      payments_received: 0,
      outstanding: 0,
      order_count: 0,
    };
    let expensesData: ExpensesSummary = {
      total_expenses: 0,
      expense_count: 0,
    };

    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (isAdminOrSuper) {
      try {
        const [sales, expenses] = await Promise.all([
          getSalesFinancials(supabase, context.user.business_id, { startDate, endDate }),
          getExpensesFinancials(supabase, context.user.business_id, { startDate, endDate }),
        ]);
        salesData = sales;
        expensesData = expenses;
      } catch (err) {
        console.error("Failed to fetch financial metrics for summary:", err);
      }
    }

    let pendingCount = 0;
    if (canViewOrders) {
      try {
        let pendingOrdersQuery = supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("business_id", context.user.business_id)
          .eq("status", "CONFIRMED");
        if (startDate) pendingOrdersQuery = pendingOrdersQuery.gte("order_date", startDate);
        if (endDate) pendingOrdersQuery = pendingOrdersQuery.lte("order_date", endDate);
        const res = await pendingOrdersQuery;
        pendingCount = res.count ?? 0;
      } catch (err) {
        console.error("Failed to fetch pending orders count:", err);
      }
    }

    let inProdCount = 0;
    let readyCount = 0;
    let deliveredCount = 0;
    if (canViewProduction) {
      try {
        let prodOrdersQuery = supabase
          .from("production_orders")
          .select("status")
          .eq("business_id", context.user.business_id);
        if (startDate) prodOrdersQuery = prodOrdersQuery.gte("created_at", `${startDate}T00:00:00Z`);
        if (endDate) prodOrdersQuery = prodOrdersQuery.lte("created_at", `${endDate}T23:59:59Z`);
        const prodRes = await prodOrdersQuery;
        for (const po of prodRes.data ?? []) {
          if (["SCHEDULED", "MATERIAL_READY", "IN_PRODUCTION", "QUALITY_CHECK"].includes(po.status)) {
            inProdCount++;
          } else if (po.status === "READY_FOR_DISPATCH") {
            readyCount++;
          } else if (po.status === "COMPLETED") {
            deliveredCount++;
          }
        }
      } catch (err) {
        console.error("Failed to fetch production status counts:", err);
      }
    }

    let overdueCount = 0;
    if (canViewDelivery) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const overdueRes = await supabase
          .from("deliveries")
          .select("id", { count: "exact", head: true })
          .eq("business_id", context.user.business_id)
          .in("status", ["READY", "PACKED", "DISPATCHED", "PARTIALLY_DISPATCHED", "FULLY_DISPATCHED", "IN_TRANSIT"])
          .lt("expected_delivery_date", today);
        overdueCount = overdueRes.count ?? 0;
      } catch (err) {
        console.error("Failed to fetch overdue deliveries count:", err);
      }
    }

    let lowStockCount = 0;
    if (canViewInventory) {
      try {
        const { data: rawMats } = await supabase
          .from("raw_materials")
          .select("id, reorder_level")
          .eq("business_id", context.user.business_id);

        if (rawMats && rawMats.length > 0) {
          const { data: invRows } = await supabase
            .from("inventory")
            .select("item_id, available_stock")
            .eq("business_id", context.user.business_id)
            .eq("item_type", "raw_material");

          const stockMap = new Map((invRows ?? []).map((i: any) => [i.item_id, Number(i.available_stock || 0)]));
          for (const rm of rawMats) {
            const avail = stockMap.get(rm.id) ?? 0;
            if (avail <= Number(rm.reorder_level || 0)) {
              lowStockCount++;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch low stock count:", err);
      }
    }

    let pendingReturnsCount = 0;
    try {
      const pRetRes = await supabase
        .from("goods_returns")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id)
        .eq("status", "PENDING_INSPECTION");
      pendingReturnsCount = pRetRes.count ?? 0;
    } catch (err) {
      console.error("Failed to fetch pending returns count:", err);
    }

    const netSalesNum = Number(salesData.net_sales || 0);
    const expensesNum = Number(expensesData.total_expenses || 0);
    const profitNum = Math.round((netSalesNum - expensesNum) * 100) / 100;

    return {
      total_sales: salesData.net_sales,
      payments_received: salesData.payments_received,
      outstanding_due: salesData.outstanding,
      total_expenses: expensesData.total_expenses,
      profit: profitNum,
      total_orders: salesData.order_count,
      pending_orders: pendingCount,
      in_production: inProdCount,
      ready_for_dispatch: readyCount,
      delivered: deliveredCount,
      low_stock_items: lowStockCount,
      overdue_deliveries: overdueCount,
      pending_returns: pendingReturnsCount,
    };
  } catch (err) {
    console.error("getDashboardSummary top-level error:", err);
    return defaultDashboardSummary;
  }
}

// ============================================
// SALES TREND
// ============================================

export async function getSalesTrend(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<SalesTrendPoint[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (!isAdminOrSuper) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveFinancialDateRange({
      dateRange: filters.dateRange,
      customStartDate: filters.customStartDate,
      customEndDate: filters.customEndDate,
    });

    return await getSalesTrendFinancials(supabase, context.user.business_id, startDate, endDate);
  } catch (err) {
    console.error("getSalesTrend error:", err);
    return [];
  }
}

// ============================================
// PAYMENT TREND
// ============================================

export async function getPaymentTrend(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<PaymentTrendPoint[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (!isAdminOrSuper) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveFinancialDateRange({
      dateRange: filters.dateRange,
      customStartDate: filters.customStartDate,
      customEndDate: filters.customEndDate,
    });

    return await getPaymentTrendFinancials(supabase, context.user.business_id, startDate, endDate);
  } catch (err) {
    console.error("getPaymentTrend error:", err);
    return [];
  }
}

// ============================================
// EXPENSE TREND
// ============================================

export async function getExpenseTrend(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<ExpenseTrendPoint[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (!isAdminOrSuper) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveFinancialDateRange({
      dateRange: filters.dateRange,
      customStartDate: filters.customStartDate,
      customEndDate: filters.customEndDate,
    });

    return await getExpenseTrendFinancials(supabase, context.user.business_id, startDate, endDate);
  } catch (err) {
    console.error("getExpenseTrend error:", err);
    return [];
  }
}

// ============================================
// ORDER STATUS BREAKDOWN
// ============================================

export async function getOrderStatusBreakdown(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<OrderStatusBreakdown[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "orders.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveDateRange(filters);

    // Try RPC first
    const { data, error } = await supabase.rpc("get_order_status_breakdown", {
      p_business_id: context.user.business_id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (!error && data) {
      return data as OrderStatusBreakdown[];
    }

    // Fallback to direct query
    let query = supabase
      .from("orders")
      .select("status, total_amount")
      .eq("business_id", context.user.business_id);

    if (startDate) query = query.gte("order_date", startDate);
    if (endDate) query = query.lte("order_date", endDate);

    const { data: rows, error: qErr } = await query;
    if (qErr) {
      console.error("Direct order breakdown query failed:", qErr);
      return [];
    }

    const grouped = new Map<string, { count: number; total_amount: number }>();
    for (const r of rows ?? []) {
      const stat = r.status || "UNKNOWN";
      const cur = grouped.get(stat) || { count: 0, total_amount: 0 };
      cur.count += 1;
      cur.total_amount += Number(r.total_amount || 0);
      grouped.set(stat, cur);
    }

    return Array.from(grouped.entries())
      .map(([status, vals]) => ({
        status,
        count: vals.count,
        total_amount: Math.round(vals.total_amount * 100) / 100,
      }))
      .sort((a, b) => Number(b.count) - Number(a.count));
  } catch (err) {
    console.error("getOrderStatusBreakdown error:", err);
    return [];
  }
}

// ============================================
// PRODUCTION STATUS BREAKDOWN
// ============================================

export async function getProductionStatusBreakdown(
  filters: DashboardFilters,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<ProductionStatusBreakdown[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "production.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveDateRange(filters);

    // Try RPC first
    const { data, error } = await supabase.rpc("get_production_status_breakdown", {
      p_business_id: context.user.business_id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (!error && data) {
      return data as ProductionStatusBreakdown[];
    }

    // Fallback direct query
    let query = supabase
      .from("production_orders")
      .select("status, quantity")
      .eq("business_id", context.user.business_id);

    if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
    if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);

    const { data: rows, error: qErr } = await query;
    if (qErr) {
      console.error("Direct production breakdown query failed:", qErr);
      return [];
    }

    const grouped = new Map<string, { count: number; total_quantity: number }>();
    for (const r of rows ?? []) {
      const stat = r.status || "UNKNOWN";
      const cur = grouped.get(stat) || { count: 0, total_quantity: 0 };
      cur.count += 1;
      cur.total_quantity += Number(r.quantity || 0);
      grouped.set(stat, cur);
    }

    return Array.from(grouped.entries())
      .map(([status, vals]) => ({
        status,
        count: vals.count,
        total_quantity: Math.round(vals.total_quantity * 100) / 100,
      }))
      .sort((a, b) => Number(b.count) - Number(a.count));
  } catch (err) {
    console.error("getProductionStatusBreakdown error:", err);
    return [];
  }
}

// ============================================
// TOP PRODUCTS
// ============================================

export async function getTopProducts(
  filters: DashboardFilters,
  limit = 10,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<TopProduct[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "orders.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveDateRange(filters);

    const { data, error } = await supabase.rpc("get_top_products", {
      p_business_id: context.user.business_id,
      p_start_date: startDate,
      p_end_date: endDate,
      p_limit: limit,
    });

    if (!error && data) {
      return data as TopProduct[];
    }

    // Fallback to direct query
    let ordersQuery = supabase
      .from("orders")
      .select("id, order_date")
      .eq("business_id", context.user.business_id)
      .eq("status", "CONFIRMED");

    if (startDate) ordersQuery = ordersQuery.gte("order_date", startDate);
    if (endDate) ordersQuery = ordersQuery.lte("order_date", endDate);

    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, product_id, quantity, line_total, product:products(name, sku)")
      .in("order_id", orderIds.slice(0, 100)); // Guard against large URL limits

    const productMap = new Map<string, {
      product_id: string;
      product_name: string;
      product_sku: string | null;
      total_quantity: number;
      total_revenue: number;
      orders: Set<string>;
    }>();

    for (const item of items ?? []) {
      const pid = item.product_id;
      const prod = (item.product as any) || {};
      const cur = productMap.get(pid) || {
        product_id: pid,
        product_name: prod.name || "Unknown Product",
        product_sku: prod.sku || null,
        total_quantity: 0,
        total_revenue: 0,
        orders: new Set<string>(),
      };
      cur.total_quantity += Number(item.quantity || 0);
      cur.total_revenue += Number(item.line_total || 0);
      if (item.order_id) cur.orders.add(item.order_id);
      productMap.set(pid, cur);
    }

    return Array.from(productMap.values())
      .map((p) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        product_sku: p.product_sku,
        total_quantity: p.total_quantity,
        total_revenue: Math.round(p.total_revenue * 100) / 100,
        order_count: p.orders.size,
      }))
      .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue))
      .slice(0, limit);
  } catch (err) {
    console.error("getTopProducts error:", err);
    return [];
  }
}

// ============================================
// TOP CUSTOMERS
// ============================================

export async function getTopCustomers(
  filters: DashboardFilters,
  limit = 10,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<TopCustomer[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "customers.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { startDate, endDate } = resolveDateRange(filters);

    const { data, error } = await supabase.rpc("get_top_customers", {
      p_business_id: context.user.business_id,
      p_start_date: startDate,
      p_end_date: endDate,
      p_limit: limit,
    });

    if (!error && data) {
      return data as TopCustomer[];
    }

    // Fallback direct query
    let ordersQuery = supabase
      .from("orders")
      .select("id, customer_id, total_amount, paid_amount, due_amount, customer:customers(name, company_name)")
      .eq("business_id", context.user.business_id)
      .eq("status", "CONFIRMED");

    if (startDate) ordersQuery = ordersQuery.gte("order_date", startDate);
    if (endDate) ordersQuery = ordersQuery.lte("order_date", endDate);

    const { data: orders } = await ordersQuery;
    if (!orders || orders.length === 0) return [];

    const custMap = new Map<string, {
      customer_id: string;
      customer_name: string;
      company_name: string | null;
      total_orders: number;
      total_revenue: number;
      total_paid: number;
      total_due: number;
    }>();

    for (const o of orders) {
      const cid = o.customer_id;
      const cust = (o.customer as any) || {};
      const cur = custMap.get(cid) || {
        customer_id: cid,
        customer_name: cust.name || "Unknown Customer",
        company_name: cust.company_name || null,
        total_orders: 0,
        total_revenue: 0,
        total_paid: 0,
        total_due: 0,
      };
      cur.total_orders += 1;
      cur.total_revenue += Number(o.total_amount || 0);
      cur.total_paid += Number(o.paid_amount || 0);
      cur.total_due += Number(o.due_amount || 0);
      custMap.set(cid, cur);
    }

    return Array.from(custMap.values())
      .map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        company_name: c.company_name,
        total_orders: c.total_orders,
        total_revenue: Math.round(c.total_revenue * 100) / 100,
        total_paid: Math.round(c.total_paid * 100) / 100,
        total_due: Math.round(c.total_due * 100) / 100,
      }))
      .sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue))
      .slice(0, limit);
  } catch (err) {
    console.error("getTopCustomers error:", err);
    return [];
  }
}

// ============================================
// LOW STOCK ITEMS
// ============================================

export async function getLowStockItems(
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<LowStockItem[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "inventory.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const { data, error } = await supabase.rpc("get_low_stock_items", {
      p_business_id: context.user.business_id,
    });

    if (!error && data) {
      return data as LowStockItem[];
    }

    // Fallback direct query
    const { data: rawMats } = await supabase
      .from("raw_materials")
      .select("id, code, name, unit, reorder_level")
      .eq("business_id", context.user.business_id);

    if (!rawMats || rawMats.length === 0) return [];

    const { data: invRows } = await supabase
      .from("inventory")
      .select("item_id, current_stock, reserved_stock, available_stock")
      .eq("business_id", context.user.business_id)
      .eq("item_type", "raw_material");

    const stockMap = new Map((invRows ?? []).map((i: any) => [i.item_id, i]));
    const lowStock: LowStockItem[] = [];

    for (const rm of rawMats) {
      const inv = stockMap.get(rm.id);
      const avail = Number(inv?.available_stock || 0);
      const reorder = Number(rm.reorder_level || 0);
      if (avail <= reorder) {
        lowStock.push({
          raw_material_id: rm.id,
          code: rm.code,
          name: rm.name,
          unit: rm.unit,
          current_stock: Number(inv?.current_stock || 0),
          reserved_stock: Number(inv?.reserved_stock || 0),
          available_stock: avail,
          reorder_level: reorder,
        });
      }
    }

    return lowStock.slice(0, 20);
  } catch (err) {
    console.error("getLowStockItems error:", err);
    return [];
  }
}

// ============================================
// UPCOMING DELIVERIES
// ============================================

export async function getUpcomingDeliveries(
  filters: DashboardFilters,
  limit = 10,
  existingContext?: AuthContext | null,
  existingClient?: SupabaseClient | null
): Promise<UpcomingDelivery[]> {
  try {
    const context = existingContext ?? (await getAuthContext());
    if (!context) return [];
    if (!hasPermission({ permissions: context.permissions }, "delivery.view")) return [];

    const supabase = existingClient ?? (await createServerSupabaseClient());
    if (!supabase) return [];

    const todayStr = new Date().toISOString().split("T")[0];
    const { startDate, endDate } = resolveDateRange(filters);

    const effectiveStart = startDate && startDate > todayStr ? startDate : todayStr;
    const effectiveEnd = endDate && endDate >= effectiveStart ? endDate : null;

    const { data, error } = await supabase.rpc("get_upcoming_deliveries", {
      p_business_id: context.user.business_id,
      p_start_date: effectiveStart,
      p_end_date: effectiveEnd,
      p_limit: limit,
    });

    if (!error && data) {
      return data as UpcomingDelivery[];
    }

    // Fallback direct query
    let query = supabase
      .from("deliveries")
      .select(`
        id,
        delivery_number,
        expected_delivery_date,
        status,
        vehicle,
        driver,
        order:orders(order_number, customer:customers(name))
      `)
      .eq("business_id", context.user.business_id)
      .in("status", ["PACKED", "DISPATCHED", "PARTIALLY_DISPATCHED", "FULLY_DISPATCHED", "IN_TRANSIT"])
      .gte("expected_delivery_date", effectiveStart);

    if (effectiveEnd) {
      query = query.lte("expected_delivery_date", effectiveEnd);
    }

    const { data: rows, error: qErr } = await query
      .order("expected_delivery_date", { ascending: true })
      .limit(limit);

    if (qErr) {
      console.error("Direct upcoming deliveries query failed:", qErr);
      return [];
    }

    return (rows ?? []).map((d: any) => ({
      delivery_id: d.id,
      delivery_number: d.delivery_number,
      order_number: d.order?.order_number || "—",
      customer_name: d.order?.customer?.name || null,
      expected_delivery_date: d.expected_delivery_date,
      status: d.status,
      vehicle: d.vehicle,
      driver: d.driver,
    }));
  } catch (err) {
    console.error("getUpcomingDeliveries error:", err);
    return [];
  }
}

// ============================================
// COMBINED FETCH - Get all dashboard data in one call
// ============================================

interface DashboardCacheEntry {
  data: any;
  expiresAt: number;
}
const dashboardCache = new Map<string, DashboardCacheEntry>();
const DASHBOARD_CACHE_TTL_MS = 30 * 1000; // 30 seconds

export function invalidateDashboardCache(businessId?: string) {
  if (businessId) {
    for (const key of dashboardCache.keys()) {
      if (key.startsWith(`${businessId}:`)) {
        dashboardCache.delete(key);
      }
    }
  } else {
    dashboardCache.clear();
  }
}

export async function getDashboardData(
  filters: DashboardFilters,
  existingContext?: AuthContext | null
): Promise<{
  summary: DashboardSummary | null;
  salesTrend: SalesTrendPoint[];
  paymentTrend: PaymentTrendPoint[];
  expenseTrend: ExpenseTrendPoint[];
  orderStatusBreakdown: OrderStatusBreakdown[];
  productionStatusBreakdown: ProductionStatusBreakdown[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  lowStockItems: LowStockItem[];
  upcomingDeliveries: UpcomingDelivery[];
}> {
  try {
    const context = existingContext ?? (await getAuthContext());
    const businessId = context?.user?.business_id ?? "default";
    const cacheKey = `${businessId}:${filters.dateRange || "30d"}:${filters.customStartDate || ""}:${filters.customEndDate || ""}`;
    const now = Date.now();
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const supabase = await createServerSupabaseClient();

    const [
      summaryResult,
      salesTrendResult,
      paymentTrendResult,
      expenseTrendResult,
      orderStatusResult,
      productionStatusResult,
      topProductsResult,
      topCustomersResult,
      lowStockResult,
      upcomingDeliveriesResult,
    ] = await Promise.allSettled([
      getDashboardSummary(filters, context, supabase),
      getSalesTrend(filters, context, supabase),
      getPaymentTrend(filters, context, supabase),
      getExpenseTrend(filters, context, supabase),
      getOrderStatusBreakdown(filters, context, supabase),
      getProductionStatusBreakdown(filters, context, supabase),
      getTopProducts(filters, 10, context, supabase),
      getTopCustomers(filters, 10, context, supabase),
      getLowStockItems(context, supabase),
      getUpcomingDeliveries(filters, 10, context, supabase),
    ]);

    const result = {
      summary:
        summaryResult.status === "fulfilled" && summaryResult.value
          ? summaryResult.value
          : defaultDashboardSummary,
      salesTrend: salesTrendResult.status === "fulfilled" ? salesTrendResult.value : [],
      paymentTrend: paymentTrendResult.status === "fulfilled" ? paymentTrendResult.value : [],
      expenseTrend: expenseTrendResult.status === "fulfilled" ? expenseTrendResult.value : [],
      orderStatusBreakdown: orderStatusResult.status === "fulfilled" ? orderStatusResult.value : [],
      productionStatusBreakdown:
        productionStatusResult.status === "fulfilled" ? productionStatusResult.value : [],
      topProducts: topProductsResult.status === "fulfilled" ? topProductsResult.value : [],
      topCustomers: topCustomersResult.status === "fulfilled" ? topCustomersResult.value : [],
      lowStockItems: lowStockResult.status === "fulfilled" ? lowStockResult.value : [],
      upcomingDeliveries:
        upcomingDeliveriesResult.status === "fulfilled" ? upcomingDeliveriesResult.value : [],
    };

    dashboardCache.set(cacheKey, { data: result, expiresAt: now + DASHBOARD_CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.error("getDashboardData top-level error:", err);
    return {
      summary: defaultDashboardSummary,
      salesTrend: [],
      paymentTrend: [],
      expenseTrend: [],
      orderStatusBreakdown: [],
      productionStatusBreakdown: [],
      topProducts: [],
      topCustomers: [],
      lowStockItems: [],
      upcomingDeliveries: [],
    };
  }
}