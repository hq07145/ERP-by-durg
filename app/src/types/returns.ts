export type ReturnStatus =
  | "PENDING_INSPECTION"
  | "APPROVED"
  | "REJECTED"
  | "POSTED"
  | "CANCELLED";

export type ProductCondition =
  | "SALEABLE"
  | "DAMAGED"
  | "REWORK"
  | "SCRAP";

export type AdjustmentType =
  | "CREDIT_NOTE"
  | "REFUND"
  | "REPLACEMENT"
  | "OTHER_ADJUSTMENT";

export const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  PENDING_INSPECTION: "bg-amber-100 text-amber-800 border-amber-300",
  APPROVED: "bg-blue-100 text-blue-800 border-blue-300",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-300",
  POSTED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-300",
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING_INSPECTION: "Pending Inspection",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

export const PRODUCT_CONDITION_COLORS: Record<ProductCondition, string> = {
  SALEABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DAMAGED: "bg-rose-50 text-rose-700 border-rose-200",
  REWORK: "bg-purple-50 text-purple-700 border-purple-200",
  SCRAP: "bg-slate-100 text-slate-600 border-slate-300",
};

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  CREDIT_NOTE: "Credit Note",
  REFUND: "Refund",
  REPLACEMENT: "Replacement Delivery",
  OTHER_ADJUSTMENT: "Other Adjustment",
};

export interface GoodsReturn {
  id: string;
  business_id: string;
  return_number: string;
  customer_id: string;
  order_id: string | null;
  delivery_id: string | null;
  invoice_number: string | null;
  return_date: string;
  status: ReturnStatus;
  product_condition: ProductCondition;
  reason: string;
  notes: string | null;
  adjustment_type: AdjustmentType | null;
  adjustment_amount: number;
  product_id: string | null;
  order_item_id: string | null;
  returned_quantity: number;
  replacement_delivery_id: string | null;
  credit_note_ledger_id: string | null;
  refund_payment_id: string | null;
  has_override?: boolean;
  override_reason?: string | null;
  inspection_notes: string | null;
  inspected_by: string | null;
  inspected_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GoodsReturnItem {
  id: string;
  business_id: string;
  goods_return_id: string;
  order_item_id: string | null;
  delivery_item_id: string | null;
  product_id: string;
  returned_quantity: number;
  product_condition: ProductCondition;
  reason: string | null;
  unit_price: number;
  total_amount: number;
  inventory_transaction_id: string | null;
  created_at: string;
  product_name?: string;
  sku?: string;
}

export interface GoodsReturnWithDetails extends GoodsReturn {
  customer_name: string;
  customer_code?: string;
  order_number?: string | null;
  delivery_number?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  items: GoodsReturnItem[];
}

export interface CreateGoodsReturnInput {
  customer_id: string;
  order_id?: string | null;
  delivery_id?: string | null;
  invoice_number?: string | null;
  product_id?: string | null;
  order_item_id?: string | null;
  returned_quantity?: number | null;
  product_condition?: ProductCondition;
  reason: string;
  notes?: string | null;
  adjustment_type?: AdjustmentType | null;
  adjustment_amount?: number;
  return_date?: string;
  allow_override?: boolean;
  override_reason?: string | null;
  items?: Array<{
    product_id: string;
    order_item_id?: string | null;
    delivery_item_id?: string | null;
    returned_quantity: number;
    product_condition?: ProductCondition;
    unit_price?: number;
    reason?: string | null;
  }>;
}

export interface ApproveGoodsReturnInput {
  return_id: string;
  product_condition?: ProductCondition;
  adjustment_type?: AdjustmentType | null;
  adjustment_amount?: number;
  inspection_notes?: string | null;
}

export interface RejectGoodsReturnInput {
  return_id: string;
  rejection_reason: string;
}

export interface PostGoodsReturnInput {
  return_id: string;
  adjustment_type?: AdjustmentType | null;
  adjustment_amount?: number;
}

export interface CancelGoodsReturnInput {
  return_id: string;
  reason: string;
}
