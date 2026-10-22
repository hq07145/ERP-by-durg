import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { listDeliveries } from "@/lib/delivery/actions";
import type { DeliveryStatus } from "@/types/delivery";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export const metadata = {
  title: "Deliveries",
};

export default async function DeliveryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) redirect("/dashboard?error=forbidden");

  const status = params.status as DeliveryStatus | undefined;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "20", 10);
  const offset = (page - 1) * pageSize;

  const [deliveries, totalResult] = await Promise.all([
    listDeliveries(status, undefined, pageSize, offset),
    getTotalCount(status),
  ]);

  const totalCount = totalResult?.count ?? 0;

  const canCreate = hasPermission({ permissions: context.permissions }, "delivery.create");
  const canView = hasPermission({ permissions: context.permissions }, "delivery.view");
  const canDispatch = hasPermission({ permissions: context.permissions }, "delivery.dispatch");
  const canComplete = hasPermission({ permissions: context.permissions }, "delivery.complete");
  const canCancel = hasPermission({ permissions: context.permissions }, "delivery.cancel");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deliveries</h1>
          <p className="text-gray-500 mt-1">Manage delivery workflow and tracking</p>
        </div>
      </div>

      <DeliveryList
        deliveries={deliveries}
        canCreate={canCreate}
        canView={canView}
        canDispatch={canDispatch}
        canComplete={canComplete}
        canCancel={canCancel}
        currentStatus={status}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  );
}

async function getTotalCount(status?: DeliveryStatus): Promise<{ count: number } | null> {
  const context = await getAuthContext();
  if (!context) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  let query = supabase
    .from("deliveries")
    .select("*", { count: "exact", head: true })
    .eq("business_id", context.user.business_id);

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;
  if (error) return null;
  return { count: count ?? 0 };
}