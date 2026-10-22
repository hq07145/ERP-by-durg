"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2, AlertTriangle, Loader2, X } from "lucide-react";
import { deleteOrderAction } from "@/lib/orders/actions";

interface DeleteOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number: string;
    customer_name?: string | null;
  };
  onSuccess?: () => void;
}

export function DeleteOrderModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: DeleteOrderModalProps) {
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

  const handleConfirmDelete = async () => {
    if (isSubmitting || isSubmittingRef.current) return;
    setError(null);
    setIsSubmitting(true);
    isSubmittingRef.current = true;

    try {
      const res = await deleteOrderAction(order.id);
      if (!res.success) {
        setError(res.message || "Failed to delete order.");
        return;
      }
      onClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order.");
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 transition-all animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h2 id="delete-modal-title" className="text-base font-bold text-slate-900">
                Delete Draft Order
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
          <p className="font-semibold text-rose-950 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Permanent Deletion
          </p>
          Are you sure you want to permanently delete draft order <strong>#{order.order_number}</strong>? This action cannot be undone and will remove all associated line items.
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

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
            onClick={handleConfirmDelete}
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 transition disabled:opacity-50 flex items-center justify-center gap-2 min-h-10 cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Permanently</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
