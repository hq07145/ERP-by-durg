"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PaymentWithDetails, PaymentStatus, PaymentMethod } from "@/types/payment";
import {
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/types/payment";
import {
  CreditCard,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShoppingBag,
  ArrowLeft,
  Edit,
  Trash2,
} from "lucide-react";

interface PaymentDetailProps {
  payment: PaymentWithDetails;
  canEdit: boolean;
  canDelete: boolean;
}

export function PaymentDetail({ payment, canEdit, canDelete }: PaymentDetailProps) {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; message: string } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState({
    amount: String(payment.amount),
    payment_date: payment.payment_date,
    payment_method: payment.payment_method,
    reference: payment.reference ?? "",
    notes: payment.notes ?? "",
    status: payment.status,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  const handleStatusClick = async (targetStatus: PaymentStatus) => {
    if (targetStatus === "REFUNDED" || targetStatus === "FAILED") {
      setShowDeleteDialog(true);
      setDeleteReason("");
    } else {
      try {
        const { updatePayment } = await import("@/lib/payments/actions");
        await updatePayment({
          payment_id: payment.id,
          status: targetStatus,
          notes: "",
        });
        setStatusMessage({ success: true, message: "Payment Status updated successfully." });
        router.refresh();
      } catch (error) {
        setStatusMessage({ success: false, message: error instanceof Error ? error.message : "Failed to update Status" });
      }
    }
  };

  const handleDeleteSubmit = async () => {
    try {
      const { deletePayment } = await import("@/lib/payments/actions");
      await deletePayment({ payment_id: payment.id, reason: deleteReason });
      setShowDeleteDialog(false);
      setStatusMessage({ success: true, message: "Payment successfully reversed and marked as refunded." });
      router.refresh();
    } catch (error) {
      setStatusMessage({ success: false, message: error instanceof Error ? error.message : "Failed to delete payment" });
    }
  };

  const handleEditSubmit = async () => {
    try {
      const { updatePayment } = await import("@/lib/payments/actions");
      await updatePayment({
        payment_id: payment.id,
        amount: editData.amount,
        payment_date: editData.payment_date,
        payment_method: editData.payment_method as PaymentMethod,
        reference: editData.reference || undefined,
        notes: editData.notes || undefined,
        status: editData.status,
      });
      setShowEditDialog(false);
      setStatusMessage({ success: true, message: "Payment updated successfully." });
      router.refresh();
    } catch (error) {
      setStatusMessage({ success: false, message: error instanceof Error ? error.message : "Failed to update payment" });
    }
  };

  const validNextStatuses = (() => {
    switch (payment.status) {
      case "PENDING":
        return ["SUCCESS", "FAILED", "REFUNDED"] as const;
      case "SUCCESS":
        return ["REFUNDED"] as const;
      case "FAILED":
        return ["SUCCESS", "REFUNDED"] as const;
      case "REFUNDED":
        return [] as const;
      default:
        return [] as const;
    }
  })();

  const filteredStatuses = validNextStatuses.filter((s) => {
    if (s === "REFUNDED") return canDelete;
    if (s === "FAILED") return canEdit;
    return canEdit;
  });

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`rounded-xl p-4 text-xs font-semibold flex items-center justify-between border ${
            statusMessage.success
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <span>{statusMessage.message}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-500 hover:text-slate-800 underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-2xl font-bold text-slate-900 tracking-tight">
                {payment.payment_number}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  PAYMENT_STATUS_COLORS[payment.status] || "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
              </span>
            </div>
            <p className="text-xs text-slate-600 flex items-center gap-1.5">
              <span>Customer:</span>
              <Link
                href={`/customers/${payment.customer_id}`}
                className="font-semibold text-slate-900 hover:text-[#0F766E] underline"
              >
                {payment.customer_name}
              </Link>
              {payment.customer_company && (
                <span className="text-slate-400">({payment.customer_company})</span>
              )}
            </p>
            {payment.order_id && (
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <span>Linked Order:</span>
                <Link
                  href={`/orders/${payment.order_id}`}
                  className="font-mono font-semibold text-[#0F766E] hover:underline"
                >
                  {payment.order_number || "Order Details"}
                </Link>
              </p>
            )}
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Receipt Amount
            </p>
            <p className="text-3xl font-bold font-mono text-[#0F766E] mt-1">
              ₹{Number(payment.amount).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-slate-500 font-medium">Payment Date</p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {payment.payment_date ? format(new Date(payment.payment_date), "MMM d, yyyy") : "—"}
            </p>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Method</p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
            </p>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Transaction Reference</p>
            <p className="font-mono font-semibold text-slate-900 mt-0.5">
              {payment.reference || "—"}
            </p>
          </div>
          <div>
            <p className="text-slate-500 font-medium">Recorded At</p>
            <p className="font-medium text-slate-700 mt-0.5">
              {format(new Date(payment.created_at), "MMM d, yyyy HH:mm")}
            </p>
          </div>
        </div>

        {payment.notes && (
          <div className="mt-5 p-3.5 bg-slate-50 rounded-lg border border-slate-200/70 text-xs">
            <p className="font-semibold text-slate-600">Audit Notes & Remarks</p>
            <p className="text-slate-800 mt-1 whitespace-pre-wrap">{payment.notes}</p>
          </div>
        )}
      </div>

      {/* Actions Bar */}
      {(canEdit || canDelete) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Authorized Financial Operations
          </h3>
          <div className="flex flex-wrap items-center gap-2.5">
            {filteredStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusClick(status)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all border ${
                  status === "REFUNDED"
                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : status === "SUCCESS"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                Mark as {PAYMENT_STATUS_LABELS[status]}
              </button>
            ))}

            {canEdit && payment.status !== "REFUNDED" && (
              <button
                type="button"
                onClick={() => setShowEditDialog(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Payment Details</span>
              </button>
            )}

            {canDelete && payment.status === "SUCCESS" && (
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(true);
                  setDeleteReason("");
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Reverse / Refund Receipt</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Edit Payment — {payment.payment_number}
            </h3>
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editData.amount}
                  onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-mono font-bold text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={editData.payment_date}
                  onChange={(e) => setEditData({ ...editData, payment_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={editData.payment_method}
                  onChange={(e) =>
                    setEditData({ ...editData, payment_method: e.target.value as PaymentMethod })
                  }
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-[#0F766E] focus:outline-none"
                >
                  {(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "CARD", "OTHER"] as PaymentMethod[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reference / UTR</label>
                <input
                  type="text"
                  maxLength={128}
                  value={editData.reference}
                  onChange={(e) => setEditData({ ...editData, reference: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowEditDialog(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSubmit}
                className="rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white hover:bg-[#0D655E] transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Refund Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Reverse / Refund Payment — {payment.payment_number}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This financial reversal will update order balances, restore the customer ledger balance, and mark this payment as <strong>REFUNDED</strong>. Please provide an audit reason:
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Reason for payment reversal..."
              className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              rows={3}
              required
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={!deleteReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}