import { changeOrderPriorityAction } from "@/lib/orders/actions";
import { type OrderPriority } from "@/types/order";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let orderId = "";
  let priority = "";
  let reason = "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      orderId = String(body.order_id ?? "");
      priority = String(body.priority ?? "");
      reason = String(body.reason ?? "");
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    try {
      const formData = await request.formData();
      orderId = String(formData.get("order_id") ?? "");
      priority = String(formData.get("priority") ?? "");
      reason = String(formData.get("reason") ?? "");
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
  }

  if (!orderId || !priority) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const result = await changeOrderPriorityAction(
    orderId,
    priority as OrderPriority,
    reason,
  );

  if (!result.success) {
    const statusCode = result.error === "forbidden" ? 403 : result.error === "account_unavailable" ? 401 : 400;
    if (contentType.includes("application/json")) {
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }
    return NextResponse.redirect(new URL(`/orders?error=${result.error ?? "priority_failed"}`, request.url));
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json({ success: true, priority });
  }
  return NextResponse.redirect(new URL(`/orders/${orderId}?notice=priority_changed`, request.url));
}