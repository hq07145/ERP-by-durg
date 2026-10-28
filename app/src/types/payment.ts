export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "UPI" | "CARD" | "OTHER";

export type LedgerEntryType = "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "DEBIT_NOTE" | "ADJUSTMENT" | "ADVANCE" | "OPENING_BALANCE";

export interface Payment {
  id: string;
  business_id: string;
  customer_id: string;
  order_id: string | null;
  payment_number: string;
  amount: string | number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  idempotency_key?: string | null;
  transaction_id?: string | null;
  utr_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentWithDetails extends Payment {
  customer_name: string;
  customer_company: string | null;
  order_number: string | null;
}

export interface PaymentListItem {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  order_id: string | null;
  order_number: string | null;
  payment_number: string;
  amount: string | number;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  status: PaymentStatus;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  business_id: string;
  customer_id: string;
  order_id: string | null;
  payment_id: string | null;
  entry_type: LedgerEntryType;
  description: string;
  debit: string | number;
  credit: string | number;
  balance: string | number;
  entry_date: string;
  created_at: string;
  created_by: string;
}

export interface CustomerLedgerEntryWithDetails extends CustomerLedgerEntry {
  customer_name: string;
  order_number: string | null;
  payment_number: string | null;
}

export interface CustomerSummary {
  customer_id: string;
  customer_name: string;
  customer_company: string | null;
  total_purchases: string | number; // sum of invoices / orders
  total_paid: string | number; // sum of cleared receipts
  total_due: string | number; // unpaid invoice dues (strictly non-negative)
  available_advance?: string | number; // cleared unallocated customer advance
  total_advance_received?: string | number;
  total_advance_allocated?: string | number;
  opening_balance_amount?: number;
  opening_balance_type?: string | null;
  opening_balance_date?: string | null;
  reconciliation_warning?: string | null;
  last_payment_date: string | null;
  last_payment_amount: string | number | null;
}

export interface CustomerAdvanceTransaction {
  id: string;
  date: string;
  type: "RECEIPT" | "ALLOCATION" | "REFUND" | "REVERSAL";
  receipt_number: string | null;
  reference: string | null;
  order_id: string | null;
  order_number: string | null;
  amount_received: number;
  amount_allocated: number;
  running_advance_balance: number;
  status: string;
  notes: string | null;
}

export interface CreatePaymentFormValues {
  customer_id: string;
  order_id?: string;
  amount: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
  status?: PaymentStatus;
  idempotency_key?: string;
  transaction_id?: string;
  utr_number?: string;
  allow_duplicate_reference?: boolean;
}

export interface CreatePaymentResult {
  payment_id: string;
  payment_number?: string;
  already_processed?: boolean;
  message: string;
}

export interface UpdatePaymentFormValues {
  payment_id: string;
  amount?: string;
  payment_date?: string;
  payment_method?: PaymentMethod;
  reference?: string;
  notes?: string;
  status?: PaymentStatus;
}

export interface DeletePaymentFormValues {
  payment_id: string;
  reason: string;
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  SUCCESS: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  REFUNDED: "bg-gray-100 text-gray-800",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  SUCCESS: "Success",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

export const LEDGER_ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
  INVOICE: "bg-blue-100 text-blue-800",
  PAYMENT: "bg-green-100 text-green-800",
  CREDIT_NOTE: "bg-purple-100 text-purple-800",
  DEBIT_NOTE: "bg-orange-100 text-orange-800",
  ADJUSTMENT: "bg-indigo-100 text-indigo-800",
  ADVANCE: "bg-teal-100 text-teal-800",
  OPENING_BALANCE: "bg-amber-100 text-amber-800",
};

export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  INVOICE: "Invoice",
  PAYMENT: "Payment",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  ADJUSTMENT: "Adjustment",
  ADVANCE: "Advance",
  OPENING_BALANCE: "Opening Balance",
};