"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ExpenseListItem, ExpenseStatus } from "@/types/expense";
import { EXPENSE_STATUS_COLORS, EXPENSE_STATUS_LABELS } from "@/types/expense";
import { deleteExpense } from "@/lib/expenses/actions";
import { ChevronDown, Plus, Filter, AlertCircle, CheckCircle2, X } from "lucide-react";

interface ExpenseListProps {
  expenses: ExpenseListItem[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  currentCategory?: string;
  currentStatus?: ExpenseStatus;
  startDate?: string;
  endDate?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  onCategoryChange?: (category: string | undefined) => void;
  onStatusChange?: (status: ExpenseStatus | undefined) => void;
  onDateChange?: (startDate: string | undefined, endDate: string | undefined) => void;
  categories?: string[];
}

function formatIndianCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "₹0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "₹0.00";
  return (
    "₹" +
    num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function ExpenseList({
  expenses,
  canCreate,
  canView,
  canEdit,
  canDelete,
  currentCategory,
  currentStatus,
  startDate,
  endDate,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onCategoryChange,
  onStatusChange,
  onDateChange,
  categories = [],
}: ExpenseListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; message: string } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ open: boolean; expenseId: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setOpenDropdownId(null);
      }
    }
    if (openDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdownId]);

  // Notice and error params handling from searchParams
  const noticeParam = searchParams?.get("notice");
  const errorParam = searchParams?.get("error");
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);

  const noticeAlert =
    noticeParam && dismissedNotice !== noticeParam
      ? noticeParam === "expense_created"
        ? "Expense created successfully!"
        : noticeParam === "expense_updated"
        ? "Expense updated successfully!"
        : noticeParam
      : null;

  const errorAlert =
    errorParam && dismissedNotice !== errorParam
      ? errorParam === "forbidden"
        ? "Access denied: You do not have permission to view or manage expenses."
        : errorParam === "not_found"
        ? "The requested expense could not be found."
        : errorParam
      : null;

  const dismissAlert = () => {
    if (noticeParam) setDismissedNotice(noticeParam);
    if (errorParam) setDismissedNotice(errorParam);
    setStatusMessage(null);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("notice");
    params.delete("error");
    const newQuery = params.toString();
    router.replace(newQuery ? `${pathname}?${newQuery}` : pathname);
  };

  const handlePageChange = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("page", page.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleCategoryChange = (cat: string | undefined) => {
    if (onCategoryChange) {
      onCategoryChange(cat);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (cat) params.set("category", cat);
    else params.delete("category");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleStatusChange = (st: ExpenseStatus | undefined) => {
    if (onStatusChange) {
      onStatusChange(st);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (st) params.set("status", st);
    else params.delete("status");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDateChange = (newStartDate: string | undefined, newEndDate: string | undefined) => {
    if (onDateChange) {
      onDateChange(newStartDate, newEndDate);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (newStartDate) params.set("startDate", newStartDate);
    else params.delete("startDate");
    if (newEndDate) params.set("endDate", newEndDate);
    else params.delete("endDate");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDeleteClick = (expenseId: string) => {
    setOpenDropdownId(null);
    setShowDeleteDialog({ open: true, expenseId });
    setDeleteReason("");
  };

  const handleDeleteSubmit = async () => {
    if (!showDeleteDialog) return;
    setIsDeleting(true);
    try {
      await deleteExpense({ expense_id: showDeleteDialog.expenseId, reason: deleteReason.trim() });
      setShowDeleteDialog(null);
      setStatusMessage({ success: true, message: "Expense voided successfully." });
      router.refresh();
    } catch (error) {
      setStatusMessage({
        success: false,
        message: error instanceof Error ? error.message : "Failed to void expense",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const statusFilterOptions = [
    { value: "", label: "All Statuses" },
    ...(["DRAFT", "POSTED", "VOIDED"] as ExpenseStatus[]).map((s) => ({
      value: s,
      label: EXPENSE_STATUS_LABELS[s],
    })),
  ];

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6" ref={dropdownContainerRef}>
      {/* Success Notification */}
      {(statusMessage?.success || noticeAlert) && (
        <div className="rounded-xl p-4 text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage?.message || noticeAlert}</span>
          </div>
          <button
            onClick={dismissAlert}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Notification */}
      {((statusMessage && !statusMessage.success) || errorAlert) && (
        <div className="rounded-xl p-4 text-xs font-semibold flex items-center justify-between border bg-rose-50 text-rose-800 border-rose-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{statusMessage?.message || errorAlert}</span>
          </div>
          <button
            onClick={dismissAlert}
            className="text-rose-700 hover:text-rose-900 text-xs font-semibold underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters & Actions Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Filter className="w-4 h-4 text-slate-400" />
              <span>Filters:</span>
            </div>

            <select
              value={currentCategory ?? ""}
              onChange={(e) => handleCategoryChange(e.target.value || undefined)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={currentStatus ?? ""}
              onChange={(e) => handleStatusChange(e.target.value ? (e.target.value as ExpenseStatus) : undefined)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate ?? ""}
                onChange={(e) => handleDateChange(e.target.value || undefined, endDate)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                title="Start date"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={endDate ?? ""}
                onChange={(e) => handleDateChange(startDate, e.target.value || undefined)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                title="End date"
              />
            </div>

            <span className="text-xs text-slate-400 ml-auto md:ml-2">
              ({totalCount} expense{totalCount === 1 ? "" : "s"})
            </span>
          </div>

          {canCreate && (
            <Link
              href="/expenses/new"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#0D655E] transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </Link>
          )}
        </div>
      </div>

      {/* Expenses Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse" role="table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 whitespace-nowrap">Reference</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap">Created By</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                    <div className="text-4xl mb-3">💸</div>
                    <p className="text-sm font-semibold text-slate-700">No expenses found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Try clearing filters or click &quot;Add Expense&quot; to create a new record.
                    </p>
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => {
                  const isOpen = openDropdownId === expense.id;
                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                        {format(new Date(expense.expense_date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-900">
                        {expense.category}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={expense.description ?? undefined}>
                        {expense.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                        {formatIndianCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {expense.reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            EXPENSE_STATUS_COLORS[expense.status]
                          }`}
                        >
                          {EXPENSE_STATUS_LABELS[expense.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {expense.created_by_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="relative inline-flex items-center justify-end gap-1.5">
                          {canView && (
                            <Link
                              href={`/expenses/${expense.id}`}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                            >
                              View
                            </Link>
                          )}

                          {(canEdit || canDelete) && (
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(isOpen ? null : expense.id);
                                }}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                  isOpen
                                    ? "bg-[#0F766E] text-white"
                                    : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                                }`}
                                aria-expanded={isOpen}
                              >
                                Actions
                                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                              </button>

                              {isOpen && (
                                <div className="absolute right-0 top-full mt-1.5 z-50 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                                  {canEdit && expense.status !== "VOIDED" && (
                                    <Link
                                      href={`/expenses/${expense.id}/edit`}
                                      onClick={() => setOpenDropdownId(null)}
                                      className="flex items-center px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                    >
                                      Edit Details
                                    </Link>
                                  )}
                                  {canDelete && expense.status !== "VOIDED" && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteClick(expense.id)}
                                      className="w-full text-left flex items-center px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                                    >
                                      Void Expense
                                    </button>
                                  )}
                                  {expense.status === "VOIDED" && (
                                    <span className="block px-3 py-2 text-[11px] text-slate-400 italic">
                                      Expense Voided
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination Bar */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <p className="text-xs text-slate-600">
              Showing page <span className="font-semibold text-slate-900">{currentPage}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalPages}</span> ({totalCount} total records)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Void Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Void Expense Record</h3>
            <p className="text-xs text-slate-600 mb-4">
              Voiding this expense will mark it as void for accounting and exclude it from active financial reports.
              Please provide a valid reason:
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g., Duplicate voucher, entered incorrect amount..."
              className="w-full rounded-lg border border-slate-300 p-3 text-xs bg-white text-slate-800 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              rows={3}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(null)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={!deleteReason.trim() || isDeleting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {isDeleting ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}