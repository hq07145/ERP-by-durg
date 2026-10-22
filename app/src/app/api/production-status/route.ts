import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const productionOrderId = String(formData.get("production_order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!productionOrderId || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let requiredPermission: string;
  if (status === "CANCELLED") requiredPermission = "production.cancel";
  else if (status === "SCHEDULED") requiredPermission = "production.schedule";
  else requiredPermission = "production.edit";

  if (!hasPermission({ permissions: context.permissions }, requiredPermission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { error } = await supabase.rpc("update_production_order_status", {
    p_business_id: context.user.business_id,
    p_production_order_id: productionOrderId,
    p_status: status,
    p_reason: reason || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(
    new URL(`/production/queue/${productionOrderId}?notice=status_updated`, request.url)
  );
}