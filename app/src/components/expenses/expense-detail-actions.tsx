"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteExpense } from "@/lib/expenses/actions";
import { Pencil, Trash2 } from "lucide-react";

interface ExpenseDetailActionsProps {
  expenseId: string;
  canEdit: boolean;
  canDelete: boolean;
  isVoided: boolean;
}

export function ExpenseDetailActions({
  expenseId,
  canEdit,
  canDelete,
  isVoided,
}: ExpenseDetailActionsProps) {
  const router = useRouter();
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVoid = async () => {
    if (!voidReason.trim()) {
      setError("Please provide a reason for voiding this expense.");
      return;
    }
    setIsVoiding(true);
    setError(null);
    try {
      await deleteExpense({ expense_id: expenseId, reason: voidReason.trim() });
      setShowVoidDialog(false);
      setVoidReason("");
      router.push("/expenses?notice=expense_voided");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to void expense");
    } finally {
      setIsVoiding(false);
    }
  };

  if (isVoided) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
        Voided
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {canEdit && (
          <Link
            href={`/expenses/${expenseId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Pencil className="h-4 w-4 text-gray-500" />
            Edit
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              setVoidReason("");
              setError(null);
              setShowVoidDialog(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            Void
          </button>
        )}
      </div>

      {showVoidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-gray-900">Void Expense</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to void this expense? This action will mark it as VOIDED in the ledger and cannot be undone.
            </p>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Reason for Voiding <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Enter justification (e.g. Duplicate entry, incorrect amount)..."
                rows={3}
                className="w-full rounded-sm border border-gray-300 p-2.5 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                disabled={isVoiding}
                autoFocus
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isVoiding}
                onClick={() => setShowVoidDialog(false)}
                className="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVoiding}
                onClick={handleVoid}
                className="rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                {isVoiding ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
