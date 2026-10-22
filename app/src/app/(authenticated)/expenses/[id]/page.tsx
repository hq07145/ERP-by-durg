import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getExpenseById } from "@/lib/expenses/actions";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ExpenseDetailActions } from "@/components/expenses/expense-detail-actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ notice?: string; error?: string }>;
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

export default async function ExpenseDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    redirect("/expenses?error=forbidden");
  }

  const expense = await getExpenseById(id);
  if (!expense) notFound();

  const canEdit = hasPermission({ permissions: context.permissions }, "expenses.edit");
  const canDelete = hasPermission({ permissions: context.permissions }, "expenses.delete");

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800 border-gray-200",
    POSTED: "bg-green-100 text-green-800 border-green-200",
    VOIDED: "bg-red-100 text-red-800 border-red-200",
  };

  const statusLabels: Record<string, string> = {
    DRAFT: "Draft",
    POSTED: "Posted",
    VOIDED: "Voided",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-3 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Expenses
        </Link>

        {resolvedSearchParams.notice === "expense_updated" && (
          <div className="mb-4 flex items-center justify-between rounded-md bg-green-50 p-4 border border-green-200 text-green-800 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <span>Expense updated successfully.</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expense Details</h1>
            <p className="text-gray-500 mt-1">View expense voucher and audit details</p>
          </div>
          <ExpenseDetailActions
            expenseId={id}
            canEdit={canEdit}
            canDelete={canDelete}
            isVoided={expense.status === "VOIDED"}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Category</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{expense.category}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Amount</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatIndianCurrency(expense.amount)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Expense Date</p>
            <p className="text-base font-medium text-gray-900 mt-1">
              {format(new Date(expense.expense_date), "dd MMM yyyy")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</p>
            <p className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  statusColors[expense.status] || "bg-gray-100 text-gray-800"
                }`}
              >
                {statusLabels[expense.status] || expense.status}
              </span>
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reference / Voucher #
            </p>
            <p className="text-base font-mono text-gray-900 mt-1">{expense.reference || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Description</p>
            <p className="text-base text-gray-900 mt-1 whitespace-pre-wrap">
              {expense.description || "—"}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700 mb-4">
            Audit Information
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Created By</p>
              <p className="font-medium text-gray-900 mt-0.5">{expense.created_by_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Created At</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {format(new Date(expense.created_at), "dd MMM yyyy, h:mm a")}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Updated At</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {format(new Date(expense.updated_at), "dd MMM yyyy, h:mm a")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-start pt-2">
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Expenses
        </Link>
      </div>
    </div>
  );
}