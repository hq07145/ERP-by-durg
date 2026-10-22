"use client";

import { useState, useTransition } from "react";
import { Clock, Loader2, X, AlertCircle } from "lucide-react";
import { changeOrderPriorityAction } from "@/lib/orders/actions";
import { useRouter } from "next/navigation";
import type { OrderPriority } from "@/types/order";

interface ChangePriorityModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    current_priority: OrderPriority;
  };
  onSuccess?: () => void;
}

const PRIORITIES: { value: OrderPriority; label: string; desc: string; badgeClass: string }[] = [
  {
    value: "LOW",
    label: "Low Priority",
    desc: "Scheduled after standard and urgent manufacturing queues",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    value: "NORMAL",
    label: "Normal Priority",
    desc: "Standard FIFO scheduling workflow",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
  },
  {
    value: "HIGH",
    label: "High Priority",
    desc: "Prioritized over low and normal orders in queue",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "URGENT",
    label: "Urgent Priority",
    desc: "Highest precedence for immediate eligible queue allocation",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  },
];

export function ChangePriorityModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: ChangePriorityModalProps) {
  const router = useRouter();
  const [selectedPriority, setSelectedPriority] = useState<OrderPriority>(order.current_priority);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleConfirmChange = () => {
    if (selectedPriority === order.current_priority) {
      onClose();
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await changeOrderPriorityAction(order.id, selectedPriority, reason);
        if (!result.success) {
          if (result.error === "order_cancelled_locked") {
            setError("Cannot change priority: this order is cancelled.");
          } else if (result.error === "order_delivered_locked") {
            setError("Cannot change priority: this order is already delivered.");
          } else if (result.error === "forbidden") {
            setError("You do not have permission to change order priorities.");
          } else {
            setError("Failed to update priority. Please try again.");
          }
          return;
        }

        onClose();
        if (onSuccess) {
          onSuccess();
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="priority-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h2 id="priority-modal-title" className="text-base font-bold text-slate-900">
                Change Order Priority
              </h2>
              <p className="text-xs text-slate-500">
                Order <span className="font-mono font-semibold text-slate-700">#{order.order_number}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Informational note */}
        <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs text-sky-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
          <span>
            Priority changes update the queue and recalculate only <strong>future pending schedules</strong>. Production already in progress will not be moved automatically.
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

        {/* Priority Radio Options */}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Select Priority Level
          </label>
          {PRIORITIES.map((p) => {
            const isSelected = selectedPriority === p.value;
            const isCurrent = order.current_priority === p.value;
            return (
              <label
                key={p.value}
                className={`flex items-start justify-between p-3 rounded-xl border cursor-pointer transition ${
                  isSelected
                    ? "border-[#0F766E] bg-teal-50/40 ring-1 ring-[#0F766E]"
                    : "border-slate-200 hover:bg-slate-50"
                } ${isPending ? "pointer-events-none opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="order_priority"
                    value={p.value}
                    checked={isSelected}
                    onChange={() => setSelectedPriority(p.value)}
                    disabled={isPending}
                    className="mt-0.5 text-[#0F766E] focus:ring-[#0F766E]"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{p.label}</span>
                      {isCurrent && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{p.desc}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.badgeClass}`}>
                  {p.value}
                </span>
              </label>
            );
          })}
        </div>

        {/* Reason input */}
        <div className="mt-4">
          <label htmlFor="priority-reason" className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Change <span className="text-slate-400 font-normal">(Optional audit note)</span>
          </label>
          <textarea
            id="priority-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            maxLength={300}
            placeholder="e.g., Customer requested urgent rush delivery..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] disabled:bg-slate-50"
          />
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 min-h-10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmChange}
            disabled={isPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition disabled:opacity-50 min-h-10"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              <span>Save Priority</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
