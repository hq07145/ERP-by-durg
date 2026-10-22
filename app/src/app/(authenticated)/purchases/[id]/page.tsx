import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect, notFound } from "next/navigation";
import { PurchaseDetail } from "./purchase-detail";

interface PurchaseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseDetailPage({ params }: PurchaseDetailPageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "purchases.view")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/purchases?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/purchases?error=auth_unconfigured");

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      supplier:suppliers(id, name, phone, email, address, gst_number)
    `)
    .eq("id", id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (!po) notFound();

  const { data: items } = await supabase
    .from("purchase_order_items")
    .select(`
      *,
      raw_material:raw_materials(id, code, name, unit)
    `)
    .eq("purchase_order_id", id)
    .eq("business_id", context.user.business_id)
    .order("created_at");

  const { data: receipts } = await supabase
    .from("purchase_receipts")
    .select(`
      *,
      raw_material:raw_materials(code, name, unit)
    `)
    .eq("purchase_order_id", id)
    .eq("business_id", context.user.business_id)
    .order("received_at", { ascending: false });

  const itemsWithRemaining = (items ?? []).map((item) => ({
    ...item,
    raw_material_code: item.raw_material?.code ?? null,
    raw_material_name: item.raw_material?.name ?? "Unknown",
    raw_material_unit: item.raw_material?.unit ?? "",
    remaining_quantity: Number(item.ordered_quantity) - Number(item.received_quantity),
  }));

  return (
    <PurchaseDetail
      po={po}
      items={itemsWithRemaining}
      receipts={receipts ?? []}
      canEdit={hasPermission({ permissions: context.permissions }, "purchases.edit")}
      canDelete={hasPermission({ permissions: context.permissions }, "purchases.delete")}
      canReceive={hasPermission({ permissions: context.permissions }, "purchases.receive")}
    />
  );
}