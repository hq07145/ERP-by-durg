export type CustomerBalanceType = "RECEIVABLE" | "PAYABLE";

export interface CustomerOpeningBalance {
  id: string;
  business_id: string;
  customer_id: string;
  amount: number;
  balance_type: CustomerBalanceType;
  as_on_date: string; // YYYY-MM-DD
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  initial_amount?: number;
  initial_balance_type?: CustomerBalanceType;
  initial_as_on_date?: string;
  is_corrected?: boolean;
  correction_count?: number;
  customer_name?: string;
  customer_company?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  creator_name?: string | null;
}

export interface SetCustomerOpeningBalanceInput {
  customerId: string;
  amount: number;
  balanceType: CustomerBalanceType;
  asOnDate: string; // YYYY-MM-DD
  notes?: string | null;
}

export interface CorrectCustomerOpeningBalanceInput {
  customerId: string;
  newAmount: number;
  newBalanceType: CustomerBalanceType;
  newAsOnDate: string; // YYYY-MM-DD
  reason: string;
}

export interface CustomerOpeningBalanceHistoryItem {
  history_id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  opening_balance_id: string;
  old_amount: number;
  old_balance_type: CustomerBalanceType;
  old_as_on_date: string;
  new_amount: number;
  new_balance_type: CustomerBalanceType;
  new_as_on_date: string;
  difference_amount: number;
  adjustment_type: "DEBIT" | "CREDIT" | "NONE";
  adjustment_amount: number;
  ledger_entry_id: string | null;
  reason: string;
  corrected_by: string;
  corrected_by_name: string;
  corrected_by_email: string | null;
  created_at: string;
}

export interface CustomerPeriodBalanceStatement {
  customerId: string;
  customerName?: string;
  periodStartDate: string;
  periodEndDate: string;
  dayBeforeStartDate: string;
  openingBalance: number;
  openingBalanceType: CustomerBalanceType;
  periodSales: number;
  periodPayments: number;
  periodCreditsAdjustments: number;
  periodDebitsAdjustments: number;
  periodNetChange: number;
  closingBalance: number;
  closingBalanceType: CustomerBalanceType;
  closingDue: number;
  closingAdvance: number;
}

export interface CustomerOpeningBalanceAuditItem {
  id: string;
  action: string;
  entity_id: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  old_data: any;
  new_data: any;
}

export interface CustomerOption {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  hasOpeningBalance?: boolean;
}
