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
  if (error) throw error;

  let gross_sales = 0;
  let discounts = 0;
  let tax = 0;
  let net_sales = 0;
  let payments_received = 0;
  let outstanding = 0;
  const order_count = data?.length ?? 0;

  for (const row of data ?? []) {
    gross_sales += Number(row.subtotal || 0);
    discounts += Number(row.discount_amount || 0);
    tax += Number(row.tax_amount || 0);
    net_sales += Number(row.total_amount || 0);
    payments_received += Number(row.paid_amount || 0);
    outstanding += Number(row.due_amount || 0);
  }

  return {
    gross_sales: Math.round(gross_sales * 100) / 100,
    discounts: Math.round(discounts * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    net_sales: Math.round(net_sales * 100) / 100,
    payments_received: Math.round(payments_received * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    order_count,
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
  if (error) throw error;

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
  if (error) throw error;

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
  if (ordersRes.error) throw ordersRes.error;
  if (expensesRes.error) throw expensesRes.error;

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

  if (error) throw error;

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

  if (error) throw error;

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
  if (payRes.error) throw payRes.error;
  if (ordRes.error) throw ordRes.error;

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
