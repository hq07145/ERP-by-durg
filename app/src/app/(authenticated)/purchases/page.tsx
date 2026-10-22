import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect } from "next/navigation";
import { PurchaseList } from "./purchase-list";

export default async function PurchasesPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "purchases.view")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/dashboard?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/purchases?error=auth_unconfigured");

  const { data: purchases } = await supabase
    .from("purchase_orders")
    .select(`
      id,
      po_number,
      order_date,
      expected_date,
      status,
      subtotal,
      tax_amount,
      total_amount,
      supplier_id,
      supplier:suppliers!inner(id, name)
    `)
    .eq("business_id", context.user.business_id)
    .order("order_date", { ascending: false })
    .limit(100);

  const transformed = (purchases ?? []).map((p) => ({
    ...p,
    suppliers: p.supplier && p.supplier.length > 0 ? { name: p.supplier[0].name } : null,
    expected_date: p.expected_date ?? null,
  }));

  return <PurchaseList purchases={transformed as { id: string; po_number: string; order_date: string; expected_date: string | null; status: "DRAFT" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED"; subtotal: string | number; tax_amount: string | number; total_amount: string | number; supplier_id: string; suppliers: { name: string } | null }[]} canCreate={hasPermission({ permissions: context.permissions }, "purchases.create")} />;
}