import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getEligibleOrdersForDelivery } from "@/lib/delivery/actions";
import { DeliveryCreateForm } from "@/components/delivery/delivery-create-form";

export const metadata = {
  title: "Create Delivery",
};

interface PageProps {
  searchParams: Promise<{
    orderId?: string;
  }>;
}

export default async function NewDeliveryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.create")) {
    redirect("/delivery?error=forbidden");
  }

  const eligibleOrders = await getEligibleOrdersForDelivery();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/delivery"
          className="text-sm font-medium text-slate-500 hover:text-slate-800 transition"
        >
          ← Back to Deliveries
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create Delivery</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create a shipment for production-complete orders
          </p>
        </div>
      </div>

      <DeliveryCreateForm
        eligibleOrders={eligibleOrders}
        preselectedOrderId={params.orderId}
      />
    </div>
  );
}
