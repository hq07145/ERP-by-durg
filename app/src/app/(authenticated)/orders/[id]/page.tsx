import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { OrderDetail } from "@/components/orders/order-detail";
import { getOrderFulfillmentExplanation } from "@/lib/production/scheduler";
import type { OrderWithCustomer, OrderItemWithProduct, OrderStatusHistory } from "@/types/order";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { getCustomerAdvanceBalance } from "@/lib/payments/actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ notice?: string; error?: string }>;
}

export default async function OrderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/orders?error=auth_unconfigured");

  const [
    { data: order },
    { data: items },
    { data: statusHistory },
    { data: payments },
    { data: deliveries },
    { data: productionOrders },
    { data: businessDetails },
    { data: advanceAllocations }
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, business_id, customer_id, order_number, order_date, priority, status, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount, advance_applied, notes, created_at, updated_at, earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status, delivery_calculated_at, delivery_calculation_version, tax_type, place_of_supply, business_gstin, customer_gstin, cgst_amount, sgst_amount, igst_amount, customers(id, name, company_name, phone, email, gst_number)")
      .eq("business_id", context.user.business_id)
      .eq("id", id)
      .single(),
    supabase
      .from("order_items")
      .select("id, business_id, order_id, product_id, product_name, quantity, unit_price, discount_rate, tax_rate, line_total, taxable_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, created_at, updated_at, products(name, sku, unit)")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("created_at"),
    supabase
      .from("order_status_history")
      .select("id, business_id, order_id, old_status, new_status, old_priority, new_priority, changed_by, reason, created_at, users(name)")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, payment_number, amount, payment_date, payment_method, reference, status, notes, created_at")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("deliveries")
      .select("id, delivery_number, status, expected_delivery_date, tracking_number, vehicle, driver, dispatched_at, delivered_at, notes, created_at")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("production_orders")
      .select("id, status, priority, scheduled_start_date, scheduled_end_date, actual_start_date, actual_end_date, quantity, completed_quantity, scrap_quantity, notes, created_at, products(name, sku, unit)")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
      supabase
      .from("business_settings")
      .select("value")
      .eq("business_id", context.user.business_id)
      .eq("key", "business_details")
      .maybeSingle(),
    supabase
      .from("customer_advance_allocations")
      .select("id, business_id, customer_id, order_id, payment_id, allocated_amount, allocation_date, status, notes, created_at, payments(payment_number, payment_date, reference, payment_method)")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .eq("status", "ACTIVE")
      .order("allocation_date"),
  ]);

  if (!order) redirect("/orders?error=not_found");

  const customerAdvBal = await getCustomerAdvanceBalance(order.customer_id);

  const canEdit = hasPermission({ permissions: context.permissions }, "orders.edit");
  const canCancel = hasPermission({ permissions: context.permissions }, "orders.cancel");
  const canApprove = hasPermission({ permissions: context.permissions }, "orders.approve");
  const canChangePriority = hasPermission({ permissions: context.permissions }, "orders.change_priority");
  const canCreateDelivery = hasPermission({ permissions: context.permissions }, "delivery.create");

  // Helper to safely unwrap a joined relation whether PostgREST returns a single object or an array
  const unwrapRelation = <T,>(relation: T | T[] | null | undefined): T | null => {
    if (!relation) return null;
    if (Array.isArray(relation)) return relation[0] ?? null;
    return relation;
  };

  // Check if ALL required order items are production-complete (Requirement 1)
  const isProductionComplete = (items ?? []).length > 0 && (items ?? []).every((item: any) => {
    const itemProd = unwrapRelation(item.products);
    const itemName = item.product_name?.trim() || itemProd?.name?.trim();
    const matchingPOs = (productionOrders ?? []).filter((po: any) => {
      const poProd = unwrapRelation(po.products);
      const poName = poProd?.name?.trim();
      return po.order_item_id === item.id || (!po.order_item_id && poName && itemName && poName === itemName);
    });
    if (matchingPOs.length === 0) return false;
    const allCompleted = matchingPOs.every((po: any) => ["COMPLETED", "READY_FOR_DISPATCH"].includes(po.status));
    const completedQty = matchingPOs.reduce((s: number, po: any) => s + (Number(po.completed_quantity) || 0), 0);
    return allCompleted && completedQty >= Number(item.quantity);
  });

  // Get production completion date from the latest production order
  const productionCompletionDate = productionOrders?.[0]?.actual_end_date ?? productionOrders?.[0]?.scheduled_end_date ?? null;

  const rawCustomer = unwrapRelation((order as any).customers);
  const orderWithCustomer: OrderWithCustomer = {
    ...order,
    customer: rawCustomer ? {
      id: rawCustomer.id,
      name: rawCustomer.name,
      company_name: rawCustomer.company_name,
      phone: rawCustomer.phone,
      email: rawCustomer.email,
      gst_number: rawCustomer.gst_number ?? order.customer_gstin,
    } : null,
  };

  const itemsWithProduct: OrderItemWithProduct[] = (items ?? []).map((i: any) => {
    const prod = unwrapRelation(i.products);
    // Prioritize snapshot on order_items, then active product relation, fallback to "Product unavailable"
    const resolvedName = (i.product_name && i.product_name.trim()) || (prod?.name && prod.name.trim()) || "Product unavailable";
    const resolvedSku = prod?.sku ?? null;
    const resolvedUnit = prod?.unit ?? "";

    return {
      ...i,
      product_name: resolvedName,
      product_sku: resolvedSku,
      product_unit: resolvedUnit,
    };
  });

  const historyWithUser: OrderStatusHistory[] = (statusHistory ?? []).map((h: any) => {
    const usr = unwrapRelation(h.users);
    return {
      ...h,
      changed_by: usr?.name ?? "System",
    };
  });

  const productionWithProduct = (productionOrders ?? []).map((po: any) => {
    const poProd = unwrapRelation(po.products);
    return {
      id: po.id,
      product_name: poProd?.name ?? "Product unavailable",
      product_sku: poProd?.sku ?? null,
      product_unit: poProd?.unit ?? "",
      status: po.status,
      priority: po.priority,
      quantity: po.quantity,
      completed_quantity: po.completed_quantity ?? 0,
      scrap_quantity: po.scrap_quantity ?? 0,
      scheduled_start_date: po.scheduled_start_date,
      scheduled_end_date: po.scheduled_end_date,
      actual_start_date: po.actual_start_date,
      actual_end_date: po.actual_end_date,
      notes: po.notes,
      created_at: po.created_at,
    };
  });

  let explanationData: Awaited<ReturnType<typeof getOrderFulfillmentExplanation>> | null = null;
  try {
    explanationData = await getOrderFulfillmentExplanation(supabase, context.user.business_id, id);
  } catch {
    // Non-fatal
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {query.notice === "order_created" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-sm" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Order Created Successfully</p>
              <p className="text-xs text-emerald-700">Order #{order.order_number} has been recorded into the workspace.</p>
              {order.expected_delivery_date && (
                <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-950">
                    Predicted Delivery Date:
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-white text-emerald-800 border border-emerald-300 shadow-xs">
                    {format(new Date(order.expected_delivery_date), "MMM d, yyyy")}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    (Preliminary prediction based on daily capacity & stock — capacity not reserved until confirmed)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {query.notice === "order_updated" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Order Updated Successfully</p>
            <p className="text-xs text-emerald-700">Changes and totals for Order #{order.order_number} have been saved.</p>
          </div>
        </div>
      )}
      {query.notice === "order_status_updated" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Order Status Updated</p>
            <p className="text-xs text-emerald-700">Status updated to {order.status}.</p>
          </div>
        </div>
      )}
      {query.notice === "order_cancelled" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Order Cancelled</p>
            <p className="text-xs text-rose-700">Order #{order.order_number} has been cancelled and pending production released.</p>
          </div>
        </div>
      )}
      {query.notice === "priority_changed" && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Priority Updated</p>
            <p className="text-xs text-teal-700">Priority updated to {order.priority} and queue recomputed.</p>
          </div>
        </div>
      )}
      {query.error === "order_locked" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex items-center gap-3 shadow-sm" role="alert">
          <div>
            <p className="font-semibold text-sm">Order Locked</p>
            <p className="text-xs text-amber-700">This order is cancelled or delivered and cannot be modified.</p>
          </div>
        </div>
      )}
      {query.error === "order_delivered_locked" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex items-center gap-3 shadow-sm" role="alert">
          <div>
            <p className="font-semibold text-sm">Order Already Delivered</p>
            <p className="text-xs text-amber-700">This order has completed deliveries and cannot be cancelled or modified.</p>
          </div>
        </div>
      )}
      {query.error === "order_cancelled_locked" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex items-center gap-3 shadow-sm" role="alert">
          <div>
            <p className="font-semibold text-sm">Order Already Cancelled</p>
            <p className="text-xs text-amber-700">This order is already cancelled.</p>
          </div>
        </div>
      )}
      {query.error === "production_in_progress_locked" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex items-center gap-3 shadow-sm" role="alert">
          <div>
            <p className="font-semibold text-sm">Production In Progress</p>
            <p className="text-xs text-amber-700">Production for this order has already started or completed. The order cannot be cancelled or modified.</p>
          </div>
        </div>
      )}
      {query.error === "forbidden" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-center gap-3 shadow-sm" role="alert">
          <div>
            <p className="font-semibold text-sm">Permission Denied</p>
            <p className="text-xs text-rose-700">You do not have permission to perform this action.</p>
          </div>
        </div>
      )}
      <OrderDetail
        order={orderWithCustomer}
        items={itemsWithProduct}
        statusHistory={historyWithUser}
        payments={(payments ?? []) as any}
        deliveries={(deliveries ?? []) as any}
        productionOrders={productionWithProduct}
        advanceAllocations={(advanceAllocations ?? []) as any}
        customerAdvanceBalance={customerAdvBal.availableAdvance}
        canEdit={canEdit}
        canCancel={canCancel}
        canApprove={canApprove}
        canChangePriority={canChangePriority}
        canCreateDelivery={canCreateDelivery}
        isProductionComplete={isProductionComplete}
        deliveryInfo={{
          earliestDeliveryDate: order.earliest_delivery_date,
          latestDeliveryDate: order.latest_delivery_date,
          expectedDeliveryDate: order.expected_delivery_date,
          deliveryStatus: order.delivery_status,
          deliveryCalculatedAt: order.delivery_calculated_at,
          deliveryCalculationVersion: order.delivery_calculation_version,
          productionCompletionDate: productionCompletionDate,
          explanation: explanationData?.explanation,
          fulfillmentSource: explanationData?.fulfillmentSource,
          hasCapacityIssue: explanationData?.hasCapacityIssue,
          hasMaterialIssue: explanationData?.hasMaterialIssue,
          hasMissingCapacity: explanationData?.hasMissingCapacity,
          itemsSummary: explanationData?.items,
        }}
        businessDetails={businessDetails?.value as any}
      />
    </div>
  );
}