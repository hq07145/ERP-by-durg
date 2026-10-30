import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listDeliveries, getDeliveryStatusCounts } from "@/lib/delivery/actions";
import { DeliveryList } from "@/components/delivery/delivery-list";
import type { DeliveryStatus, DeliveryStatusCounts } from "@/types/delivery";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    create?: string;
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
  const q = params.q?.trim() || "";

  const supabase = await createServerSupabaseClient();
  const [deliveriesRes, totalResultRes, statusCountsRes, customersRes] = await Promise.allSettled([
    listDeliveries(status, undefined, pageSize, offset, q),
    getTotalCount(status, q),
    getDeliveryStatusCounts(),
    supabase
      ? supabase
          .from("customers")
          .select("id, name, company_name, gst_number")
          .eq("business_id", context.user.business_id)
          .eq("status", "ACTIVE")
          .order("name")
      : Promise.resolve({ data: [] }),
  ]);

  const deliveries = deliveriesRes.status === "fulfilled" ? deliveriesRes.value : [];
  const totalCount = totalResultRes.status === "fulfilled" ? totalResultRes.value?.count ?? 0 : 0;

  let statusCounts: DeliveryStatusCounts = {
    ALL: 0,
    READY: 0,
    PACKED: 0,
    DISPATCHED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    CANCELLED: 0,
    NOT_READY: 0,
  };
  let countErrorMessage: string | null = null;
  if (statusCountsRes.status === "fulfilled") {
    statusCounts = statusCountsRes.value;
  } else {
    console.error("DeliveryPage: Failed to load delivery status counts:", statusCountsRes.reason);
    countErrorMessage = "Unable to load status metric counts from database.";
  }

  const customers =
    customersRes.status === "fulfilled" && customersRes.value?.data
      ? (customersRes.value.data as any[])
      : [];

  const canCreate = hasPermission({ permissions: context.permissions }, "delivery.create");
  const canView = hasPermission({ permissions: context.permissions }, "delivery.view");
  const canDispatch = hasPermission({ permissions: context.permissions }, "delivery.dispatch");
  const canComplete = hasPermission({ permissions: context.permissions }, "delivery.complete");
  const canCancel = hasPermission({ permissions: context.permissions }, "delivery.cancel");
  const canPack =
    hasPermission({ permissions: context.permissions }, "delivery.update") ||
    canDispatch ||
    canCreate;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deliveries</h1>
          <p className="text-gray-500 mt-1">Manage delivery workflow and tracking</p>
        </div>
      </div>

      {countErrorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
          <p className="font-semibold">{countErrorMessage}</p>
        </div>
      )}

      <DeliveryList
        deliveries={deliveries}
        customers={customers}
        initialCreateModalOpen={params.create === "true"}
        canCreate={canCreate}
        canView={canView}
        canPack={canPack}
        canDispatch={canDispatch}
        canComplete={canComplete}
        canCancel={canCancel}
        currentStatus={status}
        statusCounts={statusCounts}
        searchQuery={q}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
      />
    </div>
  );
}

async function getTotalCount(status?: DeliveryStatus, search?: string): Promise<{ count: number } | null> {
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

  if (search && search.trim()) {
    const s = search.trim();
    query = query.or(
      `delivery_number.ilike.%${s}%,tracking_number.ilike.%${s}%,vehicle.ilike.%${s}%,driver.ilike.%${s}%`
    );
  }

  const { count, error } = await query;
  if (error) return null;
  return { count: count ?? 0 };
}
