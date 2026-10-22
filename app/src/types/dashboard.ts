export type DashboardDateRange = "today" | "7d" | "30d" | "this_month" | "custom";

export interface DashboardFilters {
  dateRange: DashboardDateRange;
  customStartDate?: string;
  customEndDate?: string;
}

export interface DashboardSummary {
  // Sales & Revenue
  total_sales: string | number;
  payments_received: string | number;
  outstanding_due: string | number;
  // Expenses & Profit
  total_expenses: string | number;
  profit: string | number;
  // Orders
  total_orders: string | number;
  pending_orders: string | number;
  // Production
  in_production: string | number;
  ready_for_dispatch: string | number;
  delivered: string | number;
  // Inventory
  low_stock_items: string | number;
  // Delivery
  overdue_deliveries: string | number;
}

export interface TrendDataPoint {
  date: string;
  value: string | number;
}

export interface SalesTrendPoint extends TrendDataPoint {
  gross_sales: string | number;
  net_sales: string | number;
  payments_received: string | number;
  outstanding: string | number;
}

export interface PaymentTrendPoint extends TrendDataPoint {
  received: string | number;
  pending: string | number;
}

export interface ExpenseTrendPoint extends TrendDataPoint {
  amount: string | number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: string | number;
  total_amount: string | number;
}

export interface ProductionStatusBreakdown {
  status: string;
  count: string | number;
  total_quantity: string | number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  product_sku: string | null;
  total_quantity: string | number;
  total_revenue: string | number;
  order_count: string | number;
}

export interface TopCustomer {
  customer_id: string;
  customer_name: string;
  company_name: string | null;
  total_orders: string | number;
  total_revenue: string | number;
  total_paid: string | number;
  total_due: string | number;
}

export interface LowStockItem {
  raw_material_id: string;
  code: string | null;
  name: string;
  unit: string;
  current_stock: string | number;
  reserved_stock: string | number;
  available_stock: string | number;
  reorder_level: string | number;
}

export interface UpcomingDelivery {
  delivery_id: string;
  delivery_number: string;
  order_number: string;
  customer_name: string | null;
  expected_delivery_date: string;
  status: string;
  vehicle: string | null;
  driver: string | null;
}

export interface DashboardData {
  summary: DashboardSummary;
  salesTrend: SalesTrendPoint[];
  paymentTrend: PaymentTrendPoint[];
  expenseTrend: ExpenseTrendPoint[];
  orderStatusBreakdown: OrderStatusBreakdown[];
  productionStatusBreakdown: ProductionStatusBreakdown[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  lowStockItems: LowStockItem[];
  upcomingDeliveries: UpcomingDelivery[];
}

export const DASHBOARD_DATE_RANGE_LABELS: Record<DashboardDateRange, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  this_month: "This Month",
  custom: "Custom Range",
};

export const DASHBOARD_DATE_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
] as const;