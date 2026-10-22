"use client";

import { useState, useActionState } from "react";
import { format } from "date-fns";
import type {
  ProductionOrderWithDetails,
  ProductionScheduleWithOrder,
  ProductionOrderStatus,
  ProductionOrderPriority,
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

const STATUS_TRANSITIONS: Record<ProductionOrderStatus, ProductionOrderStatus[]> = {
  PENDING: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["MATERIAL_READY", "IN_PRODUCTION", "CANCELLED", "PENDING", "DELAYED", "ON_HOLD"],
  MATERIAL_READY: ["IN_PRODUCTION", "CANCELLED", "SCHEDULED", "ON_HOLD"],
  IN_PRODUCTION: ["QUALITY_CHECK", "COMPLETED", "CANCELLED", "ON_HOLD"],
  QUALITY_CHECK: ["COMPLETED", "IN_PRODUCTION", "CANCELLED", "ON_HOLD"],
  COMPLETED: ["READY_FOR_DISPATCH", "CANCELLED"],
  READY_FOR_DISPATCH: [],
  ON_HOLD: ["SCHEDULED", "MATERIAL_READY", "IN_PRODUCTION", "CANCELLED"],
  DELAYED: ["SCHEDULED", "CANCELLED"],
  CANCELLED: [],
};

const PRIORITY_COLORS: Record<ProductionOrderPriority, string> = {
  URGENT: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  NORMAL: "bg-blue-100 text-blue-800",
  LOW: "bg-gray-100 text-gray-800",
};

interface ProductionOrderDetailProps {
  productionOrder: ProductionOrderWithDetails;
  schedules: ProductionScheduleWithOrder[];
  canEdit: boolean;
  canSchedule: boolean;
  canCancel: boolean;
}

async function changeStatusAction(
  prevState: { success: boolean; message: string | null },
  formData: FormData
) {
  const productionOrderId = String(formData.get("production_order_id"));
  const status = String(formData.get("status")) as ProductionOrderStatus;
  const reason = String(formData.get("reason") ?? "");

  const { updateProductionOrderStatus } = await import("@/lib/production/actions");
  try {
    await updateProductionOrderStatus(productionOrderId, status, reason);
    return { success: true, message: null };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update status" };
  }
}

export function ProductionOrderDetail({
  productionOrder,
  schedules,
  canEdit,
  canSchedule,
  canCancel,
}: ProductionOrderDetailProps) {
  const [statusFormState, statusAction] = useActionState(changeStatusAction, { success: true, message: null });
  const [showReasonDialog, setShowReasonDialog] = useState<{ open: boolean; targetStatus: ProductionOrderStatus } | null>(null);
  const [reason, setReason] = useState("");

  const validNextStatuses = STATUS_TRANSITIONS[productionOrder.status] || [];
  const canChangeStatus = (canEdit || canSchedule || canCancel) && validNextStatuses.length > 0;

  const handleStatusClick = (status: ProductionOrderStatus) => {
    if (status === "CANCELLED") {
      setShowReasonDialog({ open: true, targetStatus: status });
      setReason("");
    } else {
      const formData = new FormData();
      formData.append("production_order_id", productionOrder.id);
      formData.append("status", status);
      formData.append("reason", "");
      statusAction(formData);
    }
  };

  const handleReasonSubmit = () => {
    if (!showReasonDialog) return;
    const formData = new FormData();
    formData.append("production_order_id", productionOrder.id);
    formData.append("status", showReasonDialog.targetStatus);
    formData.append("reason", reason);
    statusAction(formData);
    setShowReasonDialog(null);
  };

  const quantity = Number(productionOrder.quantity);
  const dailyCapacity = productionOrder.product_daily_capacity;
  const estDays = Math.ceil(quantity / dailyCapacity);
  const setupHours = productionOrder.product_setup_minutes / 60;

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {statusFormState.message && (
        <div className={`rounded-lg p-4 ${statusFormState.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {statusFormState.message}
        </div>
      )}

      {/* Header Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[productionOrder.status]}`}
              >
                {productionOrder.status}
              </span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${PRIORITY_COLORS[productionOrder.priority]}`}
              >
                {productionOrder.priority}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{productionOrder.product_name}</h2>
            {productionOrder.product_sku && (
              <p className="text-gray-500 mb-1">SKU: {productionOrder.product_sku}</p>
            )}
            <p className="text-gray-500">Order: {productionOrder.order_number} • Customer: {productionOrder.customer_name ?? "N/A"}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">{quantity.toLocaleString()}</p>
            <p className="text-gray-500">{productionOrder.product_unit}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Daily Capacity</p>
            <p className="font-medium">{dailyCapacity.toLocaleString()} {productionOrder.product_production_unit}/day</p>
          </div>
          <div>
            <p className="text-gray-500">Est. Production Days</p>
            <p className="font-medium">{estDays} day{estDays !== 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="text-gray-500">Setup Time</p>
            <p className="font-medium">{setupHours} hour{setupHours !== 1 ? "s" : ""}</p>
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

      {/* Status Actions */}
      {canChangeStatus && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Status</h3>
          <div className="flex flex-wrap gap-3">
            {validNextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusClick(status)}
                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                  STATUS_COLORS[status].replace("bg-", "bg-").replace("text-", "text-")
                } hover:opacity-90`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      )}

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
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reason Dialog */}
      {showReasonDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm {showReasonDialog.targetStatus}
            </h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for changing status to <strong>{showReasonDialog.targetStatus}</strong>:
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required for cancellation)"
              className="w-full rounded-sm border border-gray-300 p-3 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              rows={3}
              required
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setShowReasonDialog(null)}
                className="rounded-sm border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReasonSubmit}
                disabled={!reason.trim()}
                className="rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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