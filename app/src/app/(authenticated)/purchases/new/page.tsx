import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect } from "next/navigation";
import { PoForm } from "@/components/purchases/po-form";

export default async function NewPurchaseOrderPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "purchases.create")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/purchases?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/purchases?error=auth_unconfigured");

  const [{ data: suppliers }, { data: materials }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("business_id", context.user.business_id)
      .eq("status", "ACTIVE")
      .order("name"),
    supabase
      .from("raw_materials")
      .select("id, code, name, unit")
      .eq("business_id", context.user.business_id)
      .eq("status", "ACTIVE")
      .order("name"),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <PoForm suppliers={suppliers ?? []} materials={materials ?? []} />
      </div>
    </div>
  );
}