import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { ReturnList } from "@/components/returns/return-list";
import { listGoodsReturns, getReturnStatusCounts } from "@/lib/returns/actions";
import type { ReturnStatus } from "@/types/returns";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    pageSize?: string;
    create?: string;
    q?: string;
  }>;
}

export const metadata = {
  title: "Goods Returns | SANKALP IRRIGATION ERP",
};

export default async function GoodsReturnsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  // Permission check: allow users who can view orders, deliveries, or inventory
  const canView =
    hasPermission({ permissions: context.permissions }, "delivery.view") ||
    hasPermission({ permissions: context.permissions }, "orders.view") ||
    hasPermission({ permissions: context.permissions }, "inventory.view");

  if (!canView) redirect("/dashboard?error=forbidden");

  const status = params.status as ReturnStatus | undefined;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "20", 10);
  const offset = (page - 1) * pageSize;
  const q = params.q?.trim() || "";

  const supabase = await createServerSupabaseClient();
  const [returns, statusCounts, customersRes] = await Promise.all([
    listGoodsReturns({
      status,
      limit: pageSize,
      offset,
    }),
    getReturnStatusCounts(),
    supabase
      ? supabase
          .from("customers")
          .select("id, name, company_name")
          .eq("business_id", context.user.business_id)
          .eq("status", "ACTIVE")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const customers = (customersRes?.data ?? []) as any[];

  // Filter returns client-side for quick search query if specified
  const filteredReturns = q
    ? returns.filter(
        (r) =>
          r.return_number.toLowerCase().includes(q.toLowerCase()) ||
          r.customer_name?.toLowerCase().includes(q.toLowerCase()) ||
          r.order_number?.toLowerCase().includes(q.toLowerCase()) ||
          r.product_name?.toLowerCase().includes(q.toLowerCase()) ||
          r.product_sku?.toLowerCase().includes(q.toLowerCase())
      )
    : returns;

  const canCreate =
    hasPermission({ permissions: context.permissions }, "delivery.create") ||
    hasPermission({ permissions: context.permissions }, "orders.create") ||
    hasPermission({ permissions: context.permissions }, "inventory.adjust");

  const canApprove =
    hasPermission({ permissions: context.permissions }, "orders.approve") ||
    hasPermission({ permissions: context.permissions }, "delivery.update") ||
    hasPermission({ permissions: context.permissions }, "orders.edit") ||
    hasPermission({ permissions: context.permissions }, "inventory.adjust");

  const canPost =
    hasPermission({ permissions: context.permissions }, "inventory.adjust") ||
    hasPermission({ permissions: context.permissions }, "delivery.dispatch") ||
    hasPermission({ permissions: context.permissions }, "payments.edit");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Goods Returns</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage customer returned goods, physical inspection, and settlements
          </p>
        </div>
      </div>

      <ReturnList
        returns={filteredReturns}
        customers={customers}
        statusCounts={statusCounts}
        currentStatus={status}
        searchQuery={q}
        canCreate={canCreate}
        canApprove={canApprove}
        canPost={canPost}
        initialCreateOpen={params.create === "true"}
      />
    </div>
  );
}
