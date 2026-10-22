import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { getExpenseCategories, getExpenseById } from "@/lib/expenses/actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.edit")) {
    redirect("/expenses?error=forbidden");
  }

  const [expense, categories] = await Promise.all([
    getExpenseById(id),
    getExpenseCategories(),
  ]);

  if (!expense) notFound();

  if (expense.status === "VOIDED") {
    redirect(`/expenses/${id}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-3 group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Expenses
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Expense</h1>
        <p className="text-gray-500 mt-1">Update operational expense voucher details</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <ExpenseForm
          initialData={expense}
          isEditing={true}
          categories={categories}
        />
      </div>
    </div>
  );
}