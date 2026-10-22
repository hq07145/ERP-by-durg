import { cancelOrderAction, confirmOrderAction } from "@/lib/orders/actions";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let orderId = "";
  let status = "";
  let reason = "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      orderId = String(body.order_id ?? "");
      status = String(body.status ?? "");
      reason = String(body.reason ?? "");
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  } else {
    try {
      const formData = await request.formData();
      orderId = String(formData.get("order_id") ?? "");
      status = String(formData.get("status") ?? "");
      reason = String(formData.get("reason") ?? "");
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
  }

  if (!orderId || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (status === "CANCELLED") {
    const result = await cancelOrderAction(orderId, reason);
    if (!result.success) {
      const statusCode = result.error === "forbidden" ? 403 : result.error === "account_unavailable" ? 401 : 400;
      if (contentType.includes("application/json")) {
        return NextResponse.json({ error: result.error }, { status: statusCode });
      }
      return NextResponse.redirect(new URL(`/orders?error=${result.error ?? "status_failed"}`, request.url));
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json({ success: true, status: "CANCELLED" });
    }
    return NextResponse.redirect(new URL(`/orders/${orderId}?notice=order_cancelled`, request.url));
  }

  if (status === "CONFIRMED") {
    const result = await confirmOrderAction(orderId);
    if (!result.success) {
      const statusCode = result.error === "forbidden" ? 403 : result.error === "account_unavailable" ? 401 : 400;
      if (contentType.includes("application/json")) {
        return NextResponse.json({ error: result.error, message: result.message }, { status: statusCode });
      }
      return NextResponse.redirect(new URL(`/orders?error=${result.error ?? "status_failed"}`, request.url));
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json({ success: true, status: "CONFIRMED" });
    }
    return NextResponse.redirect(new URL(`/orders/${orderId}?notice=order_status_updated`, request.url));
  }

  return NextResponse.json({ error: "Unsupported status transition" }, { status: 400 });
}