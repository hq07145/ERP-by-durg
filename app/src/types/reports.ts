import type { OrderStatus, OrderPriority } from "@/types/order";
import type { ProductionOrderStatus } from "@/types/production";
import type { DeliveryStatus } from "@/types/delivery";
import type { PaymentStatus, PaymentMethod } from "@/types/payment";
import type { ExpenseStatus } from "@/types/expense";

export type ReportType =
  | "sales"
  | "orders"
  | "payments"
  | "customer_due"
  | "expenses"
  | "profit"
  | "production"
  | "inventory"
  | "delivery";

export type ExportFormat = "csv" | "excel" | "pdf";

export interface BaseReportFilters {
  dateRange?: "today" | "7d" | "30d" | "this_month" | "custom";
  startDate?: string;
  endDate?: string;
}

export interface SalesReportFilters extends BaseReportFilters {
  customerId?: string;
  productId?: string;
  district?: string;
  status?: OrderStatus;
}

export interface DistrictSalesSummaryItem {
  district: string;
  total_orders: number;
  total_quantity: number;
  taxable_sales: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_sales: number;
  amount_received: number;
  outstanding_amount: number;
}

export interface OrdersReportFilters extends BaseReportFilters {
  customerId?: string;
  status?: OrderStatus;
  priority?: OrderPriority;
}

export interface PaymentsReportFilters extends BaseReportFilters {
  customerId?: string;
  orderId?: string;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
}

export interface CustomerDueReportFilters extends BaseReportFilters {
  customerId?: string;
  minDueAmount?: string;
}

export interface ExpensesReportFilters extends BaseReportFilters {
  category?: string;
  status?: ExpenseStatus;
}

export interface ProfitReportFilters extends BaseReportFilters {
  customerId?: string;
}

export interface ProductionReportFilters extends BaseReportFilters {
  productId?: string;
  status?: ProductionOrderStatus;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}

export interface InventoryReportFilters extends BaseReportFilters {
  rawMaterialId?: string;
  lowStockOnly?: boolean;
}

export interface DeliveryReportFilters extends BaseReportFilters {
  orderId?: string;
  status?: DeliveryStatus;
}

export type ReportFilters =
  | SalesReportFilters
  | OrdersReportFilters
  | PaymentsReportFilters
  | CustomerDueReportFilters
  | ExpensesReportFilters
  | ProfitReportFilters
  | ProductionReportFilters
  | InventoryReportFilters
  | DeliveryReportFilters;

// Report row types
export interface SalesReportRow {
  order_id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  customer_district?: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: string | number;
  qty_is_4985?: number;
  qty_is_12786?: number;
  qty_is_13487?: number;
  qty_is_13488?: number;
  qty_is_12785?: number;
  unit_price: string | number;
  discount_rate: string | number;
  tax_rate: string | number;
  line_total: string | number;
  gross_amount: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  cgst_amount?: string | number;
  sgst_amount?: string | number;
  igst_amount?: string | number;
  tax_type?: string;
  net_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
  order_status: OrderStatus;
}

export interface OrdersReportRow {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  priority: OrderPriority;
  status: OrderStatus;
  subtotal: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  cgst_amount?: string | number;
  sgst_amount?: string | number;
  igst_amount?: string | number;
  tax_type?: string;
  total_amount: string | number;
  paid_amount: string | number;
  due_amount: string | number;
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: string;
}

export interface PaymentsReportRow {
  id: string;
  payment_number: string;
  payment_date: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  order_id: string | null;
  order_number: string | null;
  amount: string | number;
  payment_method: PaymentMethod;
  reference: string | null;
  status: PaymentStatus;
  notes: string | null;
}

export interface CustomerDueReportRow {
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total_purchases: string | number;
  total_paid: string | number;
  total_due: string | number;
  last_payment_date: string | null;
  last_payment_amount: string | number;
  credit_limit: string | number;
  payment_terms: string | null;
}

export interface ExpensesReportRow {
  id: string;
  category: string;
  amount: string | number;
  expense_date: string;
  description: string | null;
  reference: string | null;
  status: ExpenseStatus;
  created_by_name: string | null;
  created_at: string;
}

export interface ProfitReportRow {
  period: string;
  gross_sales: string | number;
  discounts: string | number;
  tax: string | number;
  net_sales: string | number;
  payments_received: string | number;
  outstanding: string | number;
  total_expenses: string | number;
  profit: string | number;
}

export interface ProductionReportRow {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: string | number;
  status: ProductionOrderStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_at: string;
}

export interface InventoryReportRow {
  item_id: string;
  code: string | null;
  name: string;
  unit: string;
  current_stock: string | number;
  reserved_stock: string | number;
  available_stock: string | number;
  reorder_level: string | number;
  min_stock: string | number;
  purchase_price: string | number;
  is_low_stock: boolean;
}

export interface DeliveryReportRow {
  id: string;
  delivery_number: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  status: DeliveryStatus;
  expected_delivery_date: string | null;
  tracking_number: string | null;
  vehicle: string | null;
  driver: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export type ReportRow =
  | SalesReportRow
  | OrdersReportRow
  | PaymentsReportRow
  | CustomerDueReportRow
  | ExpensesReportRow
  | ProfitReportRow
  | ProductionReportRow
  | InventoryReportRow
  | DeliveryReportRow;

export interface ReportConfig {
  type: ReportType;
  title: string;
  description: string;
  requiredPermission: string;
  exportPermission: string;
}

export const REPORT_CONFIGS: Record<ReportType, ReportConfig> = {
  sales: {
    type: "sales",
    title: "Sales Report",
    description: "Detailed sales transactions with line items",
    requiredPermission: "reports.view",
    exportPermission: "reports.export",
  },
  orders: {
    type: "orders",
    title: "Orders Report",
    description: "All orders with status and delivery info",
    requiredPermission: "orders.view",
    exportPermission: "reports.export",
  },
  payments: {
    type: "payments",
    title: "Payments/Collection Report",
    description: "Payment transactions and collection details",
    requiredPermission: "payments.view",
    exportPermission: "reports.export",
  },
  customer_due: {
    type: "customer_due",
    title: "Customer Due Report",
    description: "Outstanding amounts by customer",
    requiredPermission: "customers.view",
    exportPermission: "reports.export",
  },
  expenses: {
    type: "expenses",
    title: "Expenses Report",
    description: "All expense transactions by category",
    requiredPermission: "expenses.view",
    exportPermission: "reports.export",
  },
  profit: {
    type: "profit",
    title: "Profit & Loss Report",
    description: "Profitability analysis by period",
    requiredPermission: "reports.view",
    exportPermission: "reports.export",
  },
  production: {
    type: "production",
    title: "Production Report",
    description: "Production orders with status and timeline",
    requiredPermission: "production.view",
    exportPermission: "reports.export",
  },
  inventory: {
    type: "inventory",
    title: "Inventory/Stock Report",
    description: "Current stock levels and low stock items",
    requiredPermission: "inventory.view",
    exportPermission: "reports.export",
  },
  delivery: {
    type: "delivery",
    title: "Delivery Report",
    description: "Delivery status and tracking information",
    requiredPermission: "delivery.view",
    exportPermission: "reports.export",
  },
};

export const REPORT_TYPES = Object.values(REPORT_CONFIGS);