"use client";

import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cancelOrderAction } from "@/lib/orders/actions";
import { useRouter } from "next/navigation";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    customer_name?: string | null;
    total_amount?: string | number;
    status?: string;
  };
  onSuccess?: () => void;
}

export function CancelOrderModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: CancelOrderModalProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmCancel = async () => {
    // 4. Disable duplicate submissions while cancellation is in progress
    if (isSubmitting || isSubmittingRef.current) return;

    setError(null);
    setIsSubmitting(true);
    isSubmittingRef.current = true;

    try {
      // Safety timeout: abort client waiting after 15s so modal never hangs indefinitely
      const timeoutPromise = new Promise<{ success: false; error: "timeout" }>((resolve) => {
        setTimeout(() => resolve({ success: false, error: "timeout" }), 15000);
      });

      const result = await Promise.race([
        cancelOrderAction(order.id, reason),
        timeoutPromise,
      ]);

      if (!result.success) {
        if (result.error === "order_delivered_locked") {
          setError("Cannot cancel this order because it has already been delivered.");
        } else if (result.error === "production_in_progress_locked") {
          setError("Cannot cancel this order because production has already started or completed.");
        } else if (result.error === "forbidden") {
          setError("You do not have permission to cancel orders.");
        } else if (result.error === "timeout") {
          setError("Cancellation request is taking longer than expected. Please check Order Status or refresh the page.");
        } else if (result.error === "order_not_found") {
          setError("Order could not be found.");
        } else {
          setError(
            result.error
              ? `Failed to cancel order: ${result.error}`
              : "Failed to cancel order. Please verify Order Status and try again."
          );
        }
        return;
      }

      // 5. On confirmed success: close modal, then refresh list and notify
      onClose();
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (err) {
      // 6. On failure: keep modal open and display error
      setError(err instanceof Error ? err.message : "An unexpected error occurred during cancellation.");
    } finally {
      // 3. Always reset loading state in finally block on both success and failure
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 id="cancel-modal-title" className="text-base font-bold text-slate-900">
                Cancel Order
              </h2>
              <p className="text-xs text-slate-500">
                Order <span className="font-mono font-semibold text-slate-700">#{order.order_number}</span>
                {order.customer_name ? ` • ${order.customer_name}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warning text */}
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/70 p-3.5 text-xs text-rose-900 leading-relaxed">
          <p className="font-semibold text-rose-950 mb-1">Warning: Irreversible Action</p>
          Cancelling will mark this order as <strong>CANCELLED</strong> and safely release any pending production schedules. Historical payments and records will be preserved for auditing.
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

        {/* Reason input */}
        <div className="mt-4">
          <label htmlFor="cancel-reason" className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Cancellation <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            maxLength={500}
            placeholder="e.g., Customer requested cancellation, duplicate order entry..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <div className="mt-1 flex justify-end">
            <span className="text-[10px] text-slate-400">{reason.length}/500</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 min-h-10 cursor-pointer disabled:cursor-not-allowed"
          >
            Keep Order
          </button>
          <button
            type="button"
            onClick={handleConfirmCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition disabled:opacity-50 min-h-10 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <span>Confirm Cancellation</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
