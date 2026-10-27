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
