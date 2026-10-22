import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect, notFound } from "next/navigation";
import { SupplierDetail } from "./supplier-detail";

interface SupplierDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SupplierDetailPage({ params }: SupplierDetailPageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "suppliers.view")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/suppliers?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/suppliers?error=auth_unconfigured");

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (!supplier) notFound();

  const { data: purchaseOrders } = await supabase
    .from("purchase_orders")
    .select("id, po_number, order_date, expected_date, status, total_amount")
    .eq("business_id", context.user.business_id)
    .eq("supplier_id", id)
    .order("order_date", { ascending: false })
    .limit(20);

  return (
    <SupplierDetail
      supplier={supplier}
      purchaseOrders={purchaseOrders ?? []}
      canEdit={hasPermission({ permissions: context.permissions }, "suppliers.edit")}
      canDelete={hasPermission({ permissions: context.permissions }, "suppliers.delete")}
      canCreatePo={hasPermission({ permissions: context.permissions }, "purchases.create")}
    />
  );
}