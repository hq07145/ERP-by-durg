import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { ExpenseList } from "@/components/expenses/expense-list";
import { listExpenses, getTotalExpenseCount, getExpenseCategories } from "@/lib/expenses/actions";
import type { ExpenseStatus } from "@/types/expense";

interface PageProps {
  searchParams: Promise<{
    category?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    const target = context.roleKey === "manager" ? "/manager/dashboard?error=forbidden" : "/dashboard?error=forbidden";
    redirect(target);
  }

  const category = params.category;
  const status = params.status as ExpenseStatus | undefined;
  const startDate = params.startDate;
  const endDate = params.endDate;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "20", 10);
  const offset = (page - 1) * pageSize;

  const [expenses, totalCount, categories] = await Promise.all([
    listExpenses(category, status, startDate, endDate, pageSize, offset),
    getTotalExpenseCount(category, status, startDate, endDate),
    getExpenseCategories(),
  ]);

  const canCreate = hasPermission({ permissions: context.permissions }, "expenses.create");
  const canView = hasPermission({ permissions: context.permissions }, "expenses.view");
  const canEdit = hasPermission({ permissions: context.permissions }, "expenses.edit");
  const canDelete = hasPermission({ permissions: context.permissions }, "expenses.delete");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 mt-1">Manage business expenses</p>
        </div>
      </div>

      <ExpenseList
        expenses={expenses}
        canCreate={canCreate}
        canView={canView}
        canEdit={canEdit}
        canDelete={canDelete}
        currentCategory={category}
        currentStatus={status}
        startDate={startDate}
        endDate={endDate}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
        categories={categories}
      />
    </div>
  );
}