import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { PaymentList } from "@/components/payments/payment-list";
import { listPayments } from "@/lib/payments/actions";
import type { PaymentStatus } from "@/types/payment";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    customerId?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export const metadata = {
  title: "Payments & Customer Ledger",
};

export default async function PaymentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    redirect("/?error=forbidden");
  }

  const status = params.status as PaymentStatus | undefined;
  const customerId = params.customerId;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "20", 10);
  const offset = (page - 1) * pageSize;

  const [payments, totalResult] = await Promise.all([
    listPayments(status, customerId, undefined, pageSize, offset),
    getTotalCount(status, customerId),
  ]);

  const totalCount = totalResult?.count ?? 0;

  const canCreate = hasPermission({ permissions: context.permissions }, "payments.add");
  const canView = hasPermission({ permissions: context.permissions }, "payments.view");
  const canEdit = hasPermission({ permissions: context.permissions }, "payments.edit");
  const canDelete = hasPermission({ permissions: context.permissions }, "payments.delete");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payments & Receipts</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage customer payments, monitor cleared receipts, and track financial reconciliations.
        </p>
      </div>

      <PaymentList
        payments={payments}
        canCreate={canCreate}
        canView={canView}
        canEdit={canEdit}
        canDelete={canDelete}
        currentStatus={status}
        currentCustomerId={customerId}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  );
}

async function getTotalCount(status?: PaymentStatus, customerId?: string): Promise<{ count: number } | null> {
  const context = await getAuthContext();
  if (!context) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  let query = supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("business_id", context.user.business_id);

  if (status) {
    query = query.eq("status", status);
  }
  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { count, error } = await query;
  if (error) return null;
  return { count: count ?? 0 };
}