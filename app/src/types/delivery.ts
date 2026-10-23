export type DeliveryStatus =
  | "NOT_READY"
  | "READY"
  | "PACKED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface Delivery {
  id: string;
  business_id: string;
  order_id: string;
  delivery_number: string;
  invoice_number?: string | null;
  status: DeliveryStatus;
  expected_delivery_date: string | null;
  tracking_number: string | null;
  vehicle: string | null;
  driver: string | null;
  driver_phone?: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  proof_document_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryWithDetails extends Delivery {
  order_number: string;
  customer_name: string | null;
  items: DeliveryItem[];
}

export interface DeliveryListItem {
  id: string;
  business_id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  delivery_number: string;
  invoice_number?: string | null;
  status: DeliveryStatus;
  expected_delivery_date: string | null;
  tracking_number: string | null;
  vehicle: string | null;
  driver: string | null;
  driver_phone?: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface DeliveryItem {
  id: string;
  business_id: string;
  delivery_id: string;
  order_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  ordered_quantity: string | number;
  delivered_quantity: string | number;
  unit: string;
}

export interface DeliveryStatusHistory {
  id: string;
  business_id: string;
  delivery_id: string;
  old_status: string | null;
  new_status: DeliveryStatus;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

export interface CreateDeliveryFormValues {
  order_id: string;
  delivery_number: string;
  notes?: string;
}

export interface PackDeliveryFormValues {
  delivery_id: string;
  notes?: string;
}

export interface DispatchDeliveryFormValues {
  delivery_id: string;
  vehicle?: string;
  driver?: string;
  driver_phone?: string;
  dispatched_at?: string;
  tracking_number?: string;
  notes?: string;
}

export interface DeliveryStatusCounts {
  ALL: number;
  READY: number;
  PACKED: number;
  DISPATCHED: number;
  IN_TRANSIT: number;
  DELIVERED: number;
  CANCELLED: number;
  NOT_READY: number;
}

export interface InTransitDeliveryFormValues {
  delivery_id: string;
  notes?: string;
}

export interface CompleteDeliveryFormValues {
  delivery_id: string;
  proof_document_url?: string | null;
  notes?: string;
}

export interface CancelDeliveryFormValues {
  delivery_id: string;
  reason: string;
}

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  NOT_READY: "bg-gray-100 text-gray-800",
  READY: "bg-blue-100 text-blue-800",
  PACKED: "bg-indigo-100 text-indigo-800",
  DISPATCHED: "bg-purple-100 text-purple-800",
  IN_TRANSIT: "bg-orange-100 text-orange-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  NOT_READY: "Not Ready",
  READY: "Ready",
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  NOT_READY: ["READY", "CANCELLED"],
  READY: ["PACKED", "DISPATCHED", "CANCELLED"],
  PACKED: ["DISPATCHED", "READY", "CANCELLED"],
  DISPATCHED: ["IN_TRANSIT", "DELIVERED", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export interface EligibleDeliveryOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string | null;
    quantity: number;
    unit: string;
  }[];
}

export interface CreateManualDeliveryInput {
  customer_id: string;
  order_id: string;
  delivery_date: string;
  vehicle_number: string;
  invoice_number: string;
  driver_name?: string;
  driver_mobile?: string;
  notes?: string;
}

export interface CustomerOrderForDelivery {
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  status: string;
  delivery_status: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  total_quantity: number;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string | null;
    quantity: number;
    unit: string;
    production_status: string;
    completed_quantity: number;
    available_stock: number;
    current_stock: number;
    is_ready: boolean;
  }[];
  is_fully_ready: boolean;
  not_ready_reason: string | null;
  has_active_delivery: boolean;
  active_delivery_info?: string | null;
}

export interface CustomerDropdownItem {
  id: string;
  name: string;
  company_name: string | null;
  gst_number?: string | null;
}