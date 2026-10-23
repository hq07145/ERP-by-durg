export type OrderStatus = "DRAFT" | "CONFIRMED" | "CANCELLED";
export type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type DeliveryStatus = "PENDING" | "ON_TIME" | "OVERDUE" | "DELIVERED" | "CANCELLED";
export type OrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export function getOrderPaymentStatus(
  total: number | string,
  paid: number | string,
  due: number | string
): OrderPaymentStatus {
  const numPaid = Number(paid) || 0;
  const numTotal = Number(total) || 0;
  const numDue = Number(due) || 0;

  if (numPaid <= 0) return "UNPAID";
  if (numDue > 0 && numPaid < numTotal) return "PARTIAL";
  return "PAID";
}

export const ORDER_PAYMENT_STATUS_COLORS: Record<OrderPaymentStatus, string> = {
  UNPAID: "bg-rose-50 text-rose-700 border-rose-200",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially Paid",
  PAID: "Paid",
};

export interface Order {
  id: string;
  business_id: string;
  customer_id: string;
  order_number: string;
  order_date: string;
  priority: OrderPriority;
  status: OrderStatus;
  subtotal: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  due_amount: string | number;
  advance_applied?: string | number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // GST fields
  tax_type?: "INTRA_STATE" | "INTER_STATE" | "EXEMPT";
  place_of_supply?: string | null;
  district?: string | null;
  business_gstin?: string | null;
  customer_gstin?: string | null;
  cgst_amount?: string | number;
  sgst_amount?: string | number;
  igst_amount?: string | number;
  // Delivery date fields
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: DeliveryStatus;
  delivery_calculated_at: string | null;
  delivery_calculation_version: number;
}

export interface CustomerAdvanceAllocation {
  id: string;
  business_id: string;
  customer_id: string;
  order_id: string;
  payment_id: string;
  allocated_amount: number | string;
  allocation_date: string;
  status: "ACTIVE" | "REVERSED";
  notes?: string | null;
  created_at: string;
  payments?: {
    payment_number: string;
    payment_date: string;
    reference?: string | null;
    payment_method?: string | null;
  } | null;
}


export interface OrderItem {
  id: string;
  business_id: string;
  order_id: string;
  product_id: string;
  product_name?: string | null;
  quantity: string | number;
  unit_price: string | number;
  discount_rate: string | number;
  tax_rate: string | number;
  line_total: string | number;
  created_at: string;
  updated_at: string;
  // GST item fields
  taxable_amount?: string | number;
  cgst_rate?: string | number;
  cgst_amount?: string | number;
  sgst_rate?: string | number;
  sgst_amount?: string | number;
  igst_rate?: string | number;
  igst_amount?: string | number;
}

export interface OrderItemWithProduct extends OrderItem {
  product_name: string;
  product_sku: string | null;
  product_unit: string;
}

export interface OrderWithCustomer extends Order {
  customer: {
    id: string;
    name: string;
    company_name: string | null;
    phone: string | null;
    email: string | null;
    gst_number?: string | null;
  } | null;
}

export interface OrderStatusHistory {
  id: string;
  business_id: string;
  order_id: string;
  old_status: string | null;
  new_status: string;
  old_priority: string | null;
  new_priority: string;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

export interface OrderItemFormValues {
  product_id: string;
  quantity: string;
  unit_price: string;
  discount_rate: string;
  tax_rate: string;
  sgst_rate?: string;
  cgst_rate?: string;
  igst_rate?: string;
  lgst_rate?: string;
}

export interface OrderFormValues {
  customer_id: string;
  order_number: string;
  order_date: string;
  priority: OrderPriority;
  district?: string;
  place_of_supply?: string;
  notes: string;
  items: OrderItemFormValues[];
}

export interface OrderListItem {
  id: string;
  business_id: string;
  customer_id: string;
  order_number: string;
  order_date: string;
  priority: OrderPriority;
  status: OrderStatus;
  total_amount: string | number;
  paid_amount: string | number;
  due_amount: string | number;
  customer_name: string | null;
  company_name?: string | null;
  item_count: number;
  created_at: string;
  // Delivery fields
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: DeliveryStatus;
}

export interface OrderItemFulfillmentSummary {
  productName: string;
  orderedQty: number;
  stockQty: number;
  prodQty: number;
  status: string;
  notes?: string;
}

export interface OrderDeliveryDates {
  order_id: string;
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_calculation_version: number;
  explanation?: string;
  fulfillmentSource?: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_INSUFFICIENT" | "MATERIALS_INSUFFICIENT" | "CAPACITY_MISSING";
  hasCapacityIssue?: boolean;
  hasMaterialIssue?: boolean;
  hasMissingCapacity?: boolean;
  itemsSummary?: OrderItemFulfillmentSummary[];
}

export interface OrderItemDeliveryDates {
  order_item_id: string;
  production_completion_date: string | null;
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
}

export interface OrderPaymentItem {
  id: string;
  payment_number: string;
  amount: string | number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface OrderDeliveryItem {
  id: string;
  delivery_number: string;
  status: string;
  expected_delivery_date: string | null;
  tracking_number: string | null;
  vehicle: string | null;
  driver: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrderProductionItem {
  id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  status: string;
  priority: string;
  quantity: string | number;
  completed_quantity: string | number;
  scrap_quantity: string | number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  notes?: string | null;
  created_at: string;
}