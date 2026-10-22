import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { ProfitDashboard } from "@/components/profit/profit-dashboard";
import { getProfitSummary, getExpensesByCategory } from "@/lib/expenses/actions";

interface PageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
  }>;
}

export default async function ProfitPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) redirect("/dashboard?error=forbidden");

  const startDate = params.startDate;
  const endDate = params.endDate;

  const [profitSummary, expensesByCategory] = await Promise.all([
    getProfitSummary(startDate, endDate),
    getExpensesByCategory(startDate, endDate),
  ]);

  const canViewOrders = hasPermission({ permissions: context.permissions }, "orders.view");
  const canViewExpenses = hasPermission({ permissions: context.permissions }, "expenses.view");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit & Loss</h1>
          <p className="text-gray-500 mt-1">View profit summary and expense breakdown</p>
        </div>
      </div>

      <ProfitDashboard
        profitSummary={profitSummary}
        expensesByCategory={expensesByCategory}
        canViewOrders={canViewOrders}
        canViewExpenses={canViewExpenses}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}