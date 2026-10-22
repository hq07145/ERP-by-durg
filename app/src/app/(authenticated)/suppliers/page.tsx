import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect } from "next/navigation";
import { SupplierList } from "./supplier-list";

export default async function SuppliersPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "suppliers.view")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/dashboard?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/suppliers?error=auth_unconfigured");

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, phone, email, gst_number, status, created_at")
    .eq("business_id", context.user.business_id)
    .order("created_at", { ascending: false })
    .limit(100);

  return <SupplierList suppliers={(suppliers ?? []) as { id: string; name: string; phone: string | null; email: string | null; gst_number: string | null; status: "ACTIVE" | "INACTIVE"; created_at: string }[]} canCreate={hasPermission({ permissions: context.permissions }, "suppliers.create")} />;
}