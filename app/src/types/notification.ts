export type NotificationType =
  | 'ORDER_NEW'
  | 'ORDER_CONFIRMED'
  | 'ORDER_CANCELLED'
  | 'PRODUCTION_STARTED'
  | 'PRODUCTION_COMPLETED'
  | 'PRODUCTION_DELAYED'
  | 'MATERIAL_SHORTAGE'
  | 'LOW_STOCK'
  | 'DELIVERY_READY'
  | 'DELIVERY_DISPATCHED'
  | 'DELIVERY_DELIVERED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'CUSTOMER_DUE'
  | 'CAPACITY_INSUFFICIENT'
  | 'QUALITY_CHECK_FAILED';

export type NotificationRefType =
  | 'order'
  | 'production_order'
  | 'delivery'
  | 'payment'
  | 'customer'
  | 'raw_material'
  | 'product';

export interface Notification {
  id: string;
  business_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  ref_type: NotificationRefType;
  ref_id: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface CreateNotificationParams {
  business_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  ref_type: NotificationRefType;
  ref_id: string;
}

export interface NotificationListParams {
  limit?: number;
  offset?: number;
  unread_only?: boolean;
}

export interface NotificationListResult {
  notifications: Notification[];
  total_count: number;
  unread_count: number;
}

// Route mapping for notification references
export const NOTIFICATION_ROUTES: Record<NotificationRefType, (id: string) => string> = {
  order: (id) => `/orders/${id}`,
  production_order: (id) => `/production/tracking/${id}`,
  delivery: (id) => `/delivery/${id}`,
  payment: (id) => `/payments/${id}`,
  customer: (id) => `/customers/${id}`,
  raw_material: (id) => `/raw-materials/${id}`,
  product: (id) => `/products/${id}`,
};

// Type colors for UI
export const NOTIFICATION_TYPE_COLORS: Record<NotificationType, string> = {
  ORDER_NEW: 'bg-blue-100 text-blue-800 border-blue-200',
  ORDER_CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  ORDER_CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  PRODUCTION_STARTED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  PRODUCTION_COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PRODUCTION_DELAYED: 'bg-amber-100 text-amber-800 border-amber-200',
  MATERIAL_SHORTAGE: 'bg-red-100 text-red-800 border-red-200',
  LOW_STOCK: 'bg-orange-100 text-orange-800 border-orange-200',
  DELIVERY_READY: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  DELIVERY_DISPATCHED: 'bg-purple-100 text-purple-800 border-purple-200',
  DELIVERY_DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  PAYMENT_RECEIVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAYMENT_OVERDUE: 'bg-red-100 text-red-800 border-red-200',
  CUSTOMER_DUE: 'bg-amber-100 text-amber-800 border-amber-200',
  CAPACITY_INSUFFICIENT: 'bg-red-100 text-red-800 border-red-200',
  QUALITY_CHECK_FAILED: 'bg-red-100 text-red-800 border-red-200',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ORDER_NEW: 'New Order',
  ORDER_CONFIRMED: 'Order Confirmed',
  ORDER_CANCELLED: 'Order Cancelled',
  PRODUCTION_STARTED: 'Production Started',
  PRODUCTION_COMPLETED: 'Production Completed',
  PRODUCTION_DELAYED: 'Production Delayed',
  MATERIAL_SHORTAGE: 'Material Shortage',
  LOW_STOCK: 'Low Stock',
  DELIVERY_READY: 'Delivery Ready',
  DELIVERY_DISPATCHED: 'Delivery Dispatched',
  DELIVERY_DELIVERED: 'Delivery Completed',
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_OVERDUE: 'Payment Overdue',
  CUSTOMER_DUE: 'Customer Due',
  CAPACITY_INSUFFICIENT: 'Capacity Insufficient',
  QUALITY_CHECK_FAILED: 'Quality Check Failed',
};

export const NOTIFICATION_REF_TYPE_LABELS: Record<NotificationRefType, string> = {
  order: 'Order',
  production_order: 'Production Order',
  delivery: 'Delivery',
  payment: 'Payment',
  customer: 'Customer',
  raw_material: 'Raw Material',
  product: 'Product',
};