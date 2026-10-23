"use client";

import { useState, useActionState } from "react";
import { format } from "date-fns";
import type {
  ProductionOrderWithDetails,
  ProductionScheduleWithOrder,
  ProductionLog,
  QualityCheck,
  ProductionOutput,
  ProductionMaterialConsumption,
  MaterialAvailabilityCheck,
  ProductionOrderStatus,
  ProductionOrderPriority,
  QualityCheckStage,
  QualityCheckStatus,
  StartProductionFormValues,
  RecordProgressFormValues,
  QualityCheckFormValues,
  CompleteProductionFormValues,
  DelayProductionFormValues,
  HoldProductionFormValues,
  CancelProductionFormValues,
} from "@/types/production";

const STATUS_COLORS: Record<ProductionOrderStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  SCHEDULED: "bg-blue-100 text-blue-800",
  MATERIAL_READY: "bg-indigo-100 text-indigo-800",
  IN_PRODUCTION: "bg-yellow-100 text-yellow-800",
  QUALITY_CHECK: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  READY_FOR_DISPATCH: "bg-teal-100 text-teal-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
  DELAYED: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<ProductionOrderPriority, string> = {
  URGENT: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  NORMAL: "bg-blue-100 text-blue-800",
  LOW: "bg-gray-100 text-gray-800",
};

const QUALITY_STATUS_COLORS: Record<QualityCheckStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  PASSED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CONDITIONAL_PASS: "bg-yellow-100 text-yellow-800",
};

const LOG_TYPE_COLORS: Record<string, string> = {
  STATUS_CHANGE: "bg-blue-100 text-blue-800",
  PROGRESS: "bg-green-100 text-green-800",
  ISSUE: "bg-red-100 text-red-800",
  NOTE: "bg-gray-100 text-gray-800",
  QUALITY_CHECK: "bg-purple-100 text-purple-800",
};

interface ProductionTrackingDetailProps {
  productionOrder: ProductionOrderWithDetails;
  schedules: ProductionScheduleWithOrder[];
  logs: ProductionLog[];
  qualityChecks: QualityCheck[];
  outputs: ProductionOutput[];
  materialConsumption: ProductionMaterialConsumption[];
  materialAvailability: MaterialAvailabilityCheck[];
  canEdit: boolean;
  canSchedule: boolean;
  canCancel: boolean;
  canStart: boolean;
  canQualityCheck: boolean;
  canComplete: boolean;
  canDispatch: boolean;
}

// Action functions
async function startProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const notes = String(formData.get("notes") ?? "");

  const { startProduction } = await import("@/lib/production/actions");
  try {
    const result = await startProduction({ production_order_id: productionOrderId, notes });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to start production" };
  }
}

async function recordProgressAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const quantityCompleted = String(formData.get("quantity_completed"));
  const notes = String(formData.get("notes") ?? "");

  const { recordProductionProgress } = await import("@/lib/production/actions");
  try {
    const result = await recordProductionProgress({ production_order_id: productionOrderId, quantity_completed: quantityCompleted, notes });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to record progress" };
  }
}

async function recordQualityCheckAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const checkStage = String(formData.get("check_stage")) as QualityCheckStage;
  const status = String(formData.get("status")) as QualityCheckStatus;
  const notes = String(formData.get("notes") ?? "");

  const { recordQualityCheck } = await import("@/lib/production/actions");
  try {
    const result = await recordQualityCheck({ production_order_id: productionOrderId, check_stage: checkStage, status, notes });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to record quality check" };
  }
}

async function completeProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const quantityProduced = String(formData.get("quantity_produced"));
  const quantityRejected = String(formData.get("quantity_rejected") ?? "0");
  const batchNumber = String(formData.get("batch_number") ?? "");
  const notes = String(formData.get("notes") ?? "");

  const { completeProduction } = await import("@/lib/production/actions");
  try {
    const result = await completeProduction({ production_order_id: productionOrderId, quantity_produced: quantityProduced, quantity_rejected: quantityRejected, batch_number: batchNumber || undefined, notes: notes || undefined });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to complete production" };
  }
}

async function delayProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const newStartDate = String(formData.get("new_start_date"));
  const reason = String(formData.get("reason"));

  const { delayProduction } = await import("@/lib/production/actions");
  try {
    const result = await delayProduction({ production_order_id: productionOrderId, new_start_date: newStartDate, reason });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to delay production" };
  }
}

async function holdProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const reason = String(formData.get("reason"));

  const { holdProduction } = await import("@/lib/production/actions");
  try {
    const result = await holdProduction({ production_order_id: productionOrderId, reason });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to hold production" };
  }
}

async function resumeProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const reason = String(formData.get("reason") ?? "");

  const { resumeProduction } = await import("@/lib/production/actions");
  try {
    const result = await resumeProduction(productionOrderId, reason);
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to resume production" };
  }
}

async function cancelProductionAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const reason = String(formData.get("reason"));

  const { cancelProductionWithRelease } = await import("@/lib/production/actions");
  try {
    const result = await cancelProductionWithRelease({ production_order_id: productionOrderId, reason });
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to cancel production" };
  }
}

async function markReadyForDispatchAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));

  const { markReadyForDispatch } = await import("@/lib/production/actions");
  try {
    const result = await markReadyForDispatch(productionOrderId);
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to mark ready for dispatch" };
  }
}

export function ProductionTrackingDetail({
  productionOrder,
  schedules,
  logs,
  qualityChecks,
  outputs,
  materialConsumption,
  materialAvailability,
  canEdit,
  canSchedule,
  canCancel,
  canStart,
  canQualityCheck,
  canComplete,
  canDispatch,
}: ProductionTrackingDetailProps) {
  const [statusFormState, statusAction] = useActionState(startProductionAction, { success: true, message: null });
  const [progressFormState, progressAction] = useActionState(recordProgressAction, { success: true, message: null });
  const [qualityFormState, qualityAction] = useActionState(recordQualityCheckAction, { success: true, message: null });
  const [completeFormState, completeAction] = useActionState(completeProductionAction, { success: true, message: null });
  const [delayFormState, delayAction] = useActionState(delayProductionAction, { success: true, message: null });
  const [holdFormState, holdAction] = useActionState(holdProductionAction, { success: true, message: null });
  const [resumeFormState, resumeAction] = useActionState(resumeProductionAction, { success: true, message: null });
  const [cancelFormState, cancelAction] = useActionState(cancelProductionAction, { success: true, message: null });
  const [dispatchFormState, dispatchAction] = useActionState(markReadyForDispatchAction, { success: true, message: null });

  const [showDialog, setShowDialog] = useState<{
    type: "start" | "progress" | "quality" | "complete" | "delay" | "hold" | "resume" | "cancel" | "dispatch";
    open: boolean
  } | null>(null);
  const [dialogData, setDialogData] = useState<Record<string, string>>({});

  const canTrack = canEdit || canStart || canQualityCheck || canComplete || canDispatch;

  // Progress calculation
  const totalScheduled = schedules.reduce((sum, s) => sum + Number(s.allocated_quantity), 0);
  const totalCompleted = logs
    .filter(l => l.log_type === "PROGRESS" && l.quantity_completed)
    .reduce((sum, l) => sum + Number(l.quantity_completed), 0);
  const progressPercent = totalScheduled > 0 ? Math.min(100, Math.round((totalCompleted / totalScheduled) * 100)) : 0;

  const openDialog = (type: "start" | "progress" | "quality" | "complete" | "delay" | "hold" | "resume" | "cancel" | "dispatch") => {
    setShowDialog({ type, open: true });
    setDialogData({});
  };

  const closeDialog = () => {
    setShowDialog(null);
    setDialogData({});
  };

  const handleDialogSubmit = () => {
    if (!showDialog) return;

    const formData = new FormData();
    formData.append("production_order_id", productionOrder.id);

    Object.entries(dialogData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    switch (showDialog.type) {
      case "start":
        statusAction(formData);
        break;
      case "progress":
        progressAction(formData);
        break;
      case "quality":
        qualityAction(formData);
        break;
      case "complete":
        completeAction(formData);
        break;
      case "delay":
        delayAction(formData);
        break;
      case "hold":
        holdAction(formData);
        break;
      case "resume":
        resumeAction(formData);
        break;
      case "cancel":
        cancelAction(formData);
        break;
      case "dispatch":
        dispatchAction(formData);
        break;
    }
    closeDialog();
  };

  const renderDialogContent = () => {
    if (!showDialog) return null;

    switch (showDialog.type) {
      case "start":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Start Production</h3>
            <p className="text-gray-600 mb-4">Confirm starting production for this order. Materials will be reserved.</p>
            <textarea
              value={dialogData.notes || ""}
              onChange={(e) => setDialogData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              rows={3}
            />
          </div>
        );

      case "progress":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Progress</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Completed</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={dialogData.quantity_completed || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, quantity_completed: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={dialogData.notes || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notes about progress..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );

      case "quality":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Quality Check</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check Stage</label>
                <select
                  value={dialogData.check_stage || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, check_stage: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  required
                >
                  <option value="">Select stage</option>
                  <option value="IN_PROCESS">In-Process</option>
                  <option value="FINAL">Final</option>
                  <option value="REWORK">Rework</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={dialogData.status || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  required
                >
                  <option value="">Select Status</option>
                  <option value="PASSED">Passed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CONDITIONAL_PASS">Conditional Pass</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={dialogData.notes || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Quality check notes..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );

      case "complete":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Complete Production</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Produced</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={dialogData.quantity_produced || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, quantity_produced: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Rejected</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={dialogData.quantity_rejected || "0"}
                  onChange={(e) => setDialogData(prev => ({ ...prev, quantity_rejected: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number (optional)</label>
                <input
                  type="text"
                  value={dialogData.batch_number || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, batch_number: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={dialogData.notes || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Completion notes..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );

      case "delay":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Delay Production</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Start Date</label>
                <input
                  type="date"
                  value={dialogData.new_start_date || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, new_start_date: e.target.value }))}
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={dialogData.reason || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for delay..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={2}
                  required
                />
              </div>
            </div>
          </div>
        );

      case "hold":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Hold Production</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={dialogData.reason || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for hold..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={3}
                  required
                />
              </div>
            </div>
          </div>
        );

      case "resume":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume Production</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <textarea
                  value={dialogData.reason || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for resuming..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );

      case "cancel":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancel Production</h3>
            <p className="text-gray-600 mb-4">This will release all reserved materials back to inventory.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={dialogData.reason || ""}
                  onChange={(e) => setDialogData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Reason for cancellation..."
                  className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                  rows={3}
                  required
                />
              </div>
            </div>
          </div>
        );

      case "dispatch":
        return (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Mark Ready for Dispatch</h3>
            <p className="text-gray-600 mb-4">Confirm that this production order is complete and ready for delivery to the customer.</p>
          </div>
        );
    }
  };

  // Current status alert
  const currentAlert = [statusFormState, progressFormState, qualityFormState, completeFormState, delayFormState, holdFormState, resumeFormState, cancelFormState, dispatchFormState].find(s => s.message);

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {currentAlert && (
        <div className={`rounded-lg p-4 ${currentAlert.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {currentAlert.message}
        </div>
      )}

      {/* Header Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[productionOrder.status]}`}>
                {productionOrder.status}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${PRIORITY_COLORS[productionOrder.priority]}`}>
                {productionOrder.priority}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{productionOrder.product_name}</h2>
            {productionOrder.product_sku && <p className="text-gray-500 mb-1">SKU: {productionOrder.product_sku}</p>}
            <p className="text-gray-500">Order: {productionOrder.order_number} • Customer: {productionOrder.customer_name ?? "N/A"}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">{Number(productionOrder.quantity).toLocaleString()}</p>
            <p className="text-gray-500">{productionOrder.product_unit}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-500">Production Progress</span>
            <span className="font-medium">{progressPercent}% ({totalCompleted.toLocaleString()} / {totalScheduled.toLocaleString()} {productionOrder.product_unit})</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Key Dates */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Daily Capacity</p>
            <p className="font-medium">{productionOrder.product_daily_capacity.toLocaleString()} {productionOrder.product_production_unit}/day</p>
          </div>
          <div>
            <p className="text-gray-500">Est. Production Days</p>
            <p className="font-medium">{Math.ceil(Number(productionOrder.quantity) / productionOrder.product_daily_capacity)} day(s)</p>
          </div>
          <div>
            <p className="text-gray-500">Setup Time</p>
            <p className="font-medium">{productionOrder.product_setup_minutes / 60} hour(s)</p>
          </div>
          <div>
            <p className="text-gray-500">Min/Max Days</p>
            <p className="font-medium">{productionOrder.product_production_min_days}–{productionOrder.product_production_max_days} days</p>
          </div>
        </div>

        {productionOrder.scheduled_start_date && productionOrder.scheduled_end_date && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Scheduled Start</p>
                <p className="font-medium">{format(new Date(productionOrder.scheduled_start_date), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-gray-500">Scheduled End</p>
                <p className="font-medium">{format(new Date(productionOrder.scheduled_end_date), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-gray-500">Actual Start</p>
                <p className="font-medium">{productionOrder.actual_start_date ? format(new Date(productionOrder.actual_start_date), "MMM d, yyyy") : "—"}</p>
              </div>
              <div>
                <p className="text-gray-500">Actual End</p>
                <p className="font-medium">{productionOrder.actual_end_date ? format(new Date(productionOrder.actual_end_date), "MMM d, yyyy") : "—"}</p>
              </div>
            </div>
          </div>
        )}

        {productionOrder.notes && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-gray-500 text-sm">Notes</p>
            <p className="text-gray-900">{productionOrder.notes}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {canTrack && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
          <div className="flex flex-wrap gap-3">
            {canStart && productionOrder.status === "MATERIAL_READY" && (
              <button
                type="button"
                onClick={() => openDialog("start")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-green-100 text-green-800 hover:bg-green-200"
              >
                Start Production
              </button>
            )}

            {canEdit && productionOrder.status === "IN_PRODUCTION" && (
              <button
                type="button"
                onClick={() => openDialog("progress")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200"
              >
                Record Progress
              </button>
            )}

            {canQualityCheck && ["IN_PRODUCTION", "QUALITY_CHECK"].includes(productionOrder.status) && (
              <button
                type="button"
                onClick={() => openDialog("quality")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-purple-100 text-purple-800 hover:bg-purple-200"
              >
                Quality Check
              </button>
            )}

            {canComplete && !["COMPLETED", "CANCELLED"].includes(productionOrder.status) && (
              <button
                type="button"
                onClick={() => openDialog("complete")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                Mark as Done
              </button>
            )}

            {canDispatch && productionOrder.status === "COMPLETED" && (
              <button
                type="button"
                onClick={() => openDialog("dispatch")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
              >
                Mark Ready for Dispatch
              </button>
            )}

            {canEdit && productionOrder.status === "SCHEDULED" && (
              <button
                type="button"
                onClick={() => openDialog("delay")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"
              >
                Delay
              </button>
            )}

            {canEdit && ["SCHEDULED", "MATERIAL_READY", "IN_PRODUCTION", "QUALITY_CHECK"].includes(productionOrder.status) && (
              <button
                type="button"
                onClick={() => openDialog("hold")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-orange-100 text-orange-800 hover:bg-orange-200"
              >
                Hold
              </button>
            )}

            {canEdit && productionOrder.status === "ON_HOLD" && (
              <button
                type="button"
                onClick={() => openDialog("resume")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-green-100 text-green-800 hover:bg-green-200"
              >
                Resume
              </button>
            )}

            {canCancel && !["COMPLETED", "READY_FOR_DISPATCH", "CANCELLED"].includes(productionOrder.status) && (
              <button
                type="button"
                onClick={() => openDialog("cancel")}
                className="px-4 py-2 rounded-sm text-sm font-medium bg-red-100 text-red-800 hover:bg-red-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Material Availability */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Material Availability</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Required</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Consumed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {materialAvailability.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No material data available
                  </td>
                </tr>
              ) : (
                materialAvailability.map((mat) => (
                  <tr key={mat.raw_material_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {mat.name}
                      {mat.code && <span className="ml-2 text-xs text-gray-500">({mat.code})</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">
                      {Number(mat.required_quantity).toLocaleString()} {mat.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">
                      {Number(mat.available_stock).toLocaleString()} {mat.unit}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        mat.is_sufficient ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {mat.is_sufficient ? "Sufficient" : "Insufficient"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">
                      {materialConsumption
                        .filter(mc => mc.raw_material_id === mat.raw_material_id)
                        .reduce((sum, mc) => sum + Number(mc.consumed_quantity), 0)
                        .toLocaleString()} {mat.unit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Schedule */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Production Schedule ({schedules.length} days)</h3>
        </div>
        <div className="overflow-x-auto">
          {schedules.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-3">📅</div>
              <p>No production schedule yet. Run the scheduler to allocate production days.</p>
            </div>
          ) : (
            <table className="w-full" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Day</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Allocated Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Seq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(s.schedule_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {format(new Date(s.schedule_date), "EEEE")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-medium text-gray-900">
                      {Number(s.allocated_quantity).toLocaleString()} {productionOrder.product_unit}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {s.sequence_number}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-4 py-3 text-sm text-gray-900" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-gray-900">
                    {schedules.reduce((sum, s) => sum + Number(s.allocated_quantity), 0).toLocaleString()} {productionOrder.product_unit}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">—</td>
                </tr>
              </tbody></table>
          )}
        </div>
      </div>

      {/* Production Outputs */}
      {outputs.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Production Output ({outputs.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Produced</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {outputs.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {format(new Date(o.produced_at), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-gray-900">
                      {Number(o.quantity_produced).toLocaleString()} {productionOrder.product_unit}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-red-600">
                      {Number(o.quantity_rejected).toLocaleString()} {productionOrder.product_unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {o.batch_number || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {o.notes || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quality Checks */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Quality Checks ({qualityChecks.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Checked By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {qualityChecks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No quality checks recorded
                  </td>
                </tr>
              ) : (
                qualityChecks.map((qc) => (
                  <tr key={qc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">{qc.check_stage.replace("_", " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${QUALITY_STATUS_COLORS[qc.status]}`}>
                        {qc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{qc.checked_by || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {qc.checked_at ? format(new Date(qc.checked_at), "MMM d, yyyy HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {qc.notes || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Logs */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Activity Log ({logs.length})</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-3">📋</div>
              <p>No activity logs yet</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${LOG_TYPE_COLORS[log.log_type]}`}>
                    {log.log_type.replace("_", " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{log.message}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span>{format(new Date(log.created_at), "MMM d, yyyy HH:mm")}</span>
                      <span>By: {log.created_by}</span>
                      {log.quantity_completed !== null && (
                        <span className="font-mono text-blue-600">Qty: {Number(log.quantity_completed).toLocaleString()}</span>
                      )}
                      {log.quality_status && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${QUALITY_STATUS_COLORS[log.quality_status]}`}>
                          {log.quality_status}
                        </span>
                      )}
                    </div>
                    {log.quality_notes && (
                      <p className="mt-1 text-sm text-gray-600 italic">{log.quality_notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dialog Modal */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            {renderDialogContent()}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-sm border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDialogSubmit}
                disabled={
                  (showDialog.type === "progress" && !dialogData.quantity_completed) ||
                  (showDialog.type === "quality" && (!dialogData.check_stage || !dialogData.status)) ||
                  (showDialog.type === "complete" && !dialogData.quantity_produced) ||
                  (showDialog.type === "delay" && (!dialogData.new_start_date || !dialogData.reason)) ||
                  (showDialog.type === "hold" && !dialogData.reason) ||
                  (showDialog.type === "cancel" && !dialogData.reason)
                }
                className="rounded-sm bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}