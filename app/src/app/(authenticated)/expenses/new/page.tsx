import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { getExpenseCategories } from "@/lib/expenses/actions";

export default async function NewExpensePage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.create")) {
    redirect("/expenses?error=forbidden");
  }

  const categories = await getExpenseCategories();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          ← Back to Expenses
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Expense</h1>
        <p className="text-gray-500 mt-1">Create a new expense record</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-2xs">
        <ExpenseForm isEditing={false} categories={categories} />
      </div>
    </div>
  );
}