import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const poId = String(formData.get("purchase_order_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!poId || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const requiredPermission = status === "CANCELLED" ? "purchases.delete" : "purchases.edit";
  if (!isProcurementAuthorized(context, requiredPermission)) {
    return NextResponse.json({ error: "Forbidden: Procurement access is restricted for Manager role" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { error } = await supabase.rpc("update_purchase_order_status", {
    target_business_id: context.user.business_id,
    target_po_id: poId,
    target_status: status,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/purchases/${poId}?notice=po_status_updated`, request.url));
}