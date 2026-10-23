import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeliveryDetail } from "@/components/delivery/delivery-detail";
import { getDeliveryWithItems, getDeliveryStatusHistory } from "@/lib/delivery/actions";
import type { DeliveryWithDetails, DeliveryStatusHistory } from "@/types/delivery";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeliveryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) redirect("/delivery?error=forbidden");

  const [delivery, statusHistory] = await Promise.all([
    getDeliveryWithItems(id),
    getDeliveryStatusHistory(id),
  ]);

  if (!delivery) redirect("/delivery?error=not_found");

  const canEdit = hasPermission({ permissions: context.permissions }, "delivery.edit");
  const canDispatch = hasPermission({ permissions: context.permissions }, "delivery.dispatch");
  const canComplete = hasPermission({ permissions: context.permissions }, "delivery.complete");
  const canCancel = hasPermission({ permissions: context.permissions }, "delivery.cancel");
  const canPack =
    hasPermission({ permissions: context.permissions }, "delivery.update") ||
    canDispatch ||
    hasPermission({ permissions: context.permissions }, "delivery.create");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/delivery" className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Back to Deliveries
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delivery Details</h1>
            <p className="text-gray-500">{delivery.delivery_number} - {delivery.order_number}</p>
          </div>
        </div>
      </div>

      <DeliveryDetail
        delivery={delivery}
        statusHistory={statusHistory}
        canEdit={canEdit}
        canDispatch={canDispatch}
        canComplete={canComplete}
        canCancel={canCancel}
        canPack={canPack}
      />
    </div>
  );
}