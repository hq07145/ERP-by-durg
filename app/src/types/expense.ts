export type ExpenseStatus = "DRAFT" | "POSTED" | "VOIDED";

export interface Expense {
  id: string;
  business_id: string;
  category: string;
  amount: string | number;
  expense_date: string;
  description: string | null;
  reference: string | null;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface ExpenseWithCreator extends Expense {
  created_by_name: string | null;
}

export interface ExpenseListItem {
  id: string;
  business_id: string;
  category: string;
  amount: string | number;
  expense_date: string;
  description: string | null;
  reference: string | null;
  status: ExpenseStatus;
  created_at: string;
  created_by_name: string | null;
}

export interface CreateExpenseFormValues {
  category: string;
  amount: string;
  expense_date: string;
  description?: string;
  reference?: string;
  status?: ExpenseStatus;
}

export interface UpdateExpenseFormValues {
  expense_id: string;
  category?: string;
  amount?: string;
  expense_date?: string;
  description?: string;
  reference?: string;
  status?: ExpenseStatus;
}

export interface DeleteExpenseFormValues {
  expense_id: string;
  reason: string;
}

export interface SalesSummary {
  gross_sales: string | number;
  discounts: string | number;
  tax: string | number;
  net_sales: string | number;
  payments_received: string | number;
  outstanding: string | number;
  order_count: string | number;
}

export interface ExpensesSummary {
  total_expenses: string | number;
  expense_count: string | number;
}

export interface ExpenseByCategory {
  category: string;
  total_amount: string | number;
  expense_count: string | number;
}

export interface ProfitSummary {
  gross_sales: string | number;
  discounts: string | number;
  tax: string | number;
  net_sales: string | number;
  payments_received: string | number;
  outstanding: string | number;
  order_count: string | number;
  total_expenses: string | number;
  expense_count: string | number;
  profit: string | number;
}

export const EXPENSE_STATUS_COLORS: Record<ExpenseStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  POSTED: "bg-green-100 text-green-800",
  VOIDED: "bg-red-100 text-red-800",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOIDED: "Voided",
};

export interface OrderListItem {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer_name: string;
  gross_amount: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  net_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
  status: string;
}