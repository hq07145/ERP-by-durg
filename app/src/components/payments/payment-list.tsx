"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { PaymentListItem, PaymentStatus, PaymentMethod } from "@/types/payment";
import {
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/types/payment";
import { CreditCard, Plus, ArrowLeft, ArrowRight, Trash2, Filter } from "lucide-react";

interface PaymentListProps {
  payments: PaymentListItem[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  currentStatus?: PaymentStatus;
  currentCustomerId?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  onStatusChange?: (status: PaymentStatus | undefined) => void;
  onCustomerChange?: (customerId: string | undefined) => void;
}

export function PaymentList({
  payments,
  canCreate,
  canView,
  canEdit,
  canDelete,
  currentStatus,
  currentCustomerId,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onStatusChange,
  onCustomerChange,
}: PaymentListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusMessage, setStatusMessage] = useState<{ success: boolean; message: string } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ open: boolean; paymentId: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const errorParam = searchParams?.get("error");
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const errorAlert =
    errorParam && dismissedError !== errorParam
      ? errorParam === "not_found"
        ? "The requested payment could not be found or you do not have permission to access it."
        : errorParam === "forbidden"
        ? "Access denied: You do not have permission to view payment details."
        : `Payment error: ${errorParam}`
      : null;

  const handleStatusFilter = (targetStatus: string) => {
    if (onStatusChange) {
      onStatusChange(targetStatus ? (targetStatus as PaymentStatus) : undefined);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (targetStatus) {
      params.set("status", targetStatus);
    } else {
      params.delete("status");
    }
    params.set("page", "1");
    router.push(`/payments?${params.toString()}`);
  };

  const handlePagination = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("page", newPage.toString());
    router.push(`/payments?${params.toString()}`);
  };

  const handleStatusClick = async (payment: PaymentListItem, targetStatus: PaymentStatus) => {
    setActionMenuOpen(null);
    if (targetStatus === "REFUNDED" || targetStatus === "FAILED") {
      setShowDeleteDialog({ open: true, paymentId: payment.id });
      setDeleteReason("");
    } else {
      try {
        const { updatePayment } = await import("@/lib/payments/actions");
        await updatePayment({
          payment_id: payment.id,
          status: targetStatus,
          notes: "",
        });
        setStatusMessage({ success: true, message: "Payment status updated successfully." });
        router.refresh();
      } catch (error) {
        setStatusMessage({ success: false, message: error instanceof Error ? error.message : "Failed to update status" });
      }
    }
  };

  const handleDeleteSubmit = async () => {
    if (!showDeleteDialog) return;
    try {
      const { deletePayment } = await import("@/lib/payments/actions");
      await deletePayment({ payment_id: showDeleteDialog.paymentId, reason: deleteReason });
      setShowDeleteDialog(null);
      setStatusMessage({ success: true, message: "Payment successfully reversed and marked as refunded." });
      router.refresh();
    } catch (error) {
      setStatusMessage({ success: false, message: error instanceof Error ? error.message : "Failed to delete payment" });
    }
  };

  const statusFilterOptions = [
    { value: "", label: "All Statuses" },
    ...(["SUCCESS", "PENDING", "FAILED", "REFUNDED"] as PaymentStatus[]).map((s) => ({
      value: s,
      label: PAYMENT_STATUS_LABELS[s],
    })),
  ];

  const totalPages = Math.ceil(totalCount / pageSize);

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

      {/* URL Error Alert */}
      {errorAlert && !statusMessage && (
        <div className="rounded-xl p-4 text-xs font-semibold flex items-center justify-between border bg-amber-50 text-amber-900 border-amber-200">
          <span>{errorAlert}</span>
          <button
            onClick={() => {
              setDismissedError(errorParam);
              const params = new URLSearchParams(searchParams?.toString() || "");
              params.delete("error");
              router.replace(`/payments${params.toString() ? `?${params.toString()}` : ""}`);
            }}
            className="text-amber-700 hover:text-amber-950 underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Control Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Filter className="w-4 h-4 text-slate-400" />
            <span>Filter Status:</span>
          </div>
          <select
            value={currentStatus ?? ""}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            ({totalCount} payment{totalCount === 1 ? "" : "s"})
          </span>
        </div>

        {canCreate && (
          <Link
            href="/payments/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#0D655E] transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </Link>
        )}
      </div>

      {/* Payments Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="table">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3.5">Payment #</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Order Link</th>
                <th className="px-4 py-3.5 text-right">Amount</th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Method</th>
                <th className="px-4 py-3.5">Reference</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-sm text-slate-700">No payment records found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Payments created for orders or customer advances will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                      {canView ? (
                        <Link
                          href={`/payments/${payment.id}`}
                          className="text-[#0F766E] hover:underline"
                        >
                          {payment.payment_number}
                        </Link>
                      ) : (
                        payment.payment_number
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <Link
                          href={`/customers/${payment.customer_id}`}
                          className="font-semibold text-slate-900 hover:text-[#0F766E]"
                        >
                          {payment.customer_name}
                        </Link>
                        {payment.customer_company && (
                          <p className="text-[11px] text-slate-500">{payment.customer_company}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {payment.order_id ? (
                        <Link
                          href={`/orders/${payment.order_id}`}
                          className="font-mono font-semibold text-[#0F766E] hover:underline"
                        >
                          {payment.order_number || "Order"}
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">Unallocated Advance</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 text-sm">
                      ₹{Number(payment.amount).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {payment.payment_date ? format(new Date(payment.payment_date), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-medium">
                      {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-500">
                      {payment.reference || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          PAYMENT_STATUS_COLORS[payment.status] || "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canView && (
                          <Link
                            href={`/payments/${payment.id}`}
                            className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            View
                          </Link>
                        )}
                        {canDelete && payment.status === "SUCCESS" && (
                          <button
                            type="button"
                            onClick={() => setShowDeleteDialog({ open: true, paymentId: payment.id })}
                            className="px-2.5 py-1 rounded border border-rose-200 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 transition"
                          >
                            Refund / Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <p>
              Page <strong className="text-slate-900">{currentPage}</strong> of{" "}
              <strong className="text-slate-900">{totalPages}</strong> ({totalCount} total records)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePagination(currentPage - 1)}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={() => handlePagination(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <span>Next</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete / Reversal Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Reverse / Refund Payment
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This financial reversal will update order balances, restore the customer's ledger debt, and mark the receipt as <strong>REFUNDED</strong>. A reason is required for the audit trail:
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Bounced cheque, wrong invoice linked, bank reversal..."
              className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              rows={3}
              required
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(null)}
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