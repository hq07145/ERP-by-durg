import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { SalesList } from "@/components/sales/sales-list";
import { getSalesSummary, getTotalOrderCount, getSalesOrders } from "@/lib/expenses/actions";
import { getCustomers } from "@/lib/customers/actions";

interface PageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    customerId?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function SalesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) redirect("/orders?error=forbidden");

  const startDate = params.startDate;
  const endDate = params.endDate;
  const customerId = params.customerId;
  const status = params.status;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "20", 10);
  const offset = (page - 1) * pageSize;

  const [summary, totalCount, orders, customers] = await Promise.all([
    getSalesSummary(startDate, endDate, customerId, status),
    getTotalOrderCount(startDate, endDate, customerId, status),
    getSalesOrders(startDate, endDate, customerId, status, pageSize, offset),
    getCustomers(),
  ]);

  const canView = isAdminOrSuper;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-gray-500 mt-1">View sales summary and transactions</p>
        </div>
      </div>

      <SalesList
        summary={summary}
        orders={orders}
        customers={customers}
        canView={canView}
        startDate={startDate}
        endDate={endDate}
        customerId={customerId}
        status={status}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  );
}