export type ProductionOrderStatus =
  | "PENDING"
  | "SCHEDULED"
  | "MATERIAL_READY"
  | "IN_PRODUCTION"
  | "QUALITY_CHECK"
  | "COMPLETED"
  | "READY_FOR_DISPATCH"
  | "ON_HOLD"
  | "DELAYED"
  | "CANCELLED";

export type ProductionOrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type QualityCheckStatus = "PENDING" | "PASSED" | "FAILED" | "CONDITIONAL_PASS";
export type QualityCheckStage = "IN_PROCESS" | "FINAL" | "REWORK";
export type ProductionLogType = "STATUS_CHANGE" | "PROGRESS" | "ISSUE" | "NOTE" | "QUALITY_CHECK";

export interface ProductionOrder {
  id: string;
  business_id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  quantity: string | number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrderWithDetails extends ProductionOrder {
  order_number: string;
  customer_name: string | null;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  product_daily_capacity: number;
  product_production_unit: string;
  product_production_min_days: number;
  product_production_max_days: number;
  product_setup_minutes: number;
}

export interface ProductionOrderListItem {
  id: string;
  business_id: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  quantity: string | number;
  status: ProductionOrderStatus;
  priority: ProductionOrderPriority;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  created_at: string;
}

export interface ProductionSchedule {
  id: string;
  business_id: string;
  production_order_id: string;
  schedule_date: string;
  allocated_quantity: string | number;
  sequence_number: number;
  created_at: string;
}

export interface ProductionScheduleWithOrder extends ProductionSchedule {
  production_order: ProductionOrderListItem;
}

export interface CalendarDay {
  id: string;
  business_id: string;
  calendar_date: string;
  is_working_day: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionQueueItem {
  production_order_id: string;
  order_id?: string;
  order_number: string;
  customer_name: string | null;
  product_id?: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  quantity: number;
  priority: ProductionOrderPriority;
  order_date: string;
  product_daily_capacity: number;
  product_production_unit: string;
  product_production_min_days: number;
  product_production_max_days: number;
  product_setup_minutes: number;
  status?: ProductionOrderStatus;
  scheduled_start_date?: string | null;
  scheduled_end_date?: string | null;
  expected_delivery_date?: string | null;
  fifo_position?: number;
  notes?: string | null;
  created_at?: string;
  is_capacity_insufficient?: boolean;
  has_material_shortage?: boolean;
  is_delayed?: boolean;
  has_failed_quality_check?: boolean;
}

export interface SchedulingResult {
  production_order_id: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  schedules: Array<{
    schedule_date: string;
    allocated_quantity: number;
    sequence_number: number;
  }>;
  success: boolean;
  message: string | null;
}

export interface CapacityCheckResult {
  date: string;
  available_capacity: number;
  used_capacity: number;
  total_capacity: number;
  is_working_day: boolean;
}

export interface BusinessCalendarFormValues {
  calendar_date: string;
  is_working_day: boolean;
  note: string;
}

export interface ProductionOrderFormValues {
  order_item_id: string;
  notes: string;
}

export interface ProductionLog {
  id: string;
  business_id: string;
  production_order_id: string;
  log_type: ProductionLogType;
  message: string;
  quantity_completed: string | number | null;
  quality_status: QualityCheckStatus | null;
  quality_notes: string | null;
  created_by: string;
  created_at: string;
}

export interface QualityCheck {
  id: string;
  business_id: string;
  production_order_id: string;
  check_stage: QualityCheckStage;
  status: QualityCheckStatus;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionOutput {
  id: string;
  business_id: string;
  production_order_id: string;
  product_id: string;
  quantity_produced: string | number;
  quantity_rejected: string | number;
  batch_number: string | null;
  produced_at: string;
  created_by: string;
  created_at: string;
  notes: string | null;
}

export interface ProductionMaterialConsumption {
  id: string;
  business_id: string;
  production_order_id: string;
  raw_material_id: string;
  bom_item_id: string | null;
  planned_quantity: string | number;
  consumed_quantity: string | number;
  inventory_transaction_id: string | null;
  consumed_at: string | null;
  consumed_by: string | null;
  created_at: string;
}

export interface MaterialAvailabilityCheck {
  raw_material_id: string;
  code: string | null;
  name: string;
  unit: string;
  required_quantity: string | number;
  available_stock: string | number;
  is_sufficient: boolean;
}

export interface StartProductionFormValues {
  production_order_id: string;
  notes?: string;
}

export interface RecordProgressFormValues {
  production_order_id: string;
  quantity_completed: string;
  notes?: string;
}

export interface QualityCheckFormValues {
  production_order_id: string;
  check_stage: QualityCheckStage;
  status: QualityCheckStatus;
  notes?: string;
}

export interface CompleteProductionFormValues {
  production_order_id: string;
  quantity_produced: string;
  quantity_rejected?: string;
  batch_number?: string;
  notes?: string;
}

export interface DelayProductionFormValues {
  production_order_id: string;
  new_start_date: string;
  reason: string;
}

export interface HoldProductionFormValues {
  production_order_id: string;
  reason: string;
}

export interface CancelProductionFormValues {
  production_order_id: string;
  reason: string;
}