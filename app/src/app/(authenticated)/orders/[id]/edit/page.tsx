import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditOrderPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.edit")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/orders?error=auth_unconfigured");

  // Fetch current order, items, customers, products, and active production in parallel
  const [
    { data: order, error: orderError },
    { data: items, error: itemsError },
    { data: customers },
    { data: products },
    { data: activeProduction },
    { data: inventoryRows },
    { data: wdSetting },
    { data: calRows },
    { data: businessDetailsSetting }
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, business_id, customer_id, order_number, order_date, priority, status, notes, delivery_status, place_of_supply, district")
      .eq("business_id", context.user.business_id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, product_id, quantity, unit_price, discount_rate, tax_rate, sgst_rate, cgst_rate, igst_rate")
      .eq("business_id", context.user.business_id)
      .eq("order_id", id)
      .order("created_at"),
    supabase
      .from("customers")
      .select("id, name, company_name, gst_number, customer_addresses(district, state, address_type)")
      .eq("business_id", context.user.business_id)
      .eq("status", "ACTIVE")
      .order("name"),
    supabase
      .from("products")
      .select("id, name, sku, unit, selling_price, tax_rate, daily_capacity, production_min_days, setup_minutes, delivery_min_days, delivery_max_days")
      .eq("business_id", context.user.business_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("production_orders")
      .select("id, status")
      .eq("order_id", id)
      .eq("business_id", context.user.business_id)
      .in("status", ["IN_PROGRESS", "COMPLETED", "QUALITY_CHECK", "QUALITY_PASSED", "QUALITY_FAILED"])
      .limit(1),
    supabase
      .from("inventory")
      .select("item_id, available_stock")
      .eq("business_id", context.user.business_id)
      .eq("item_type", "finished_good"),
    supabase
      .from("business_settings")
      .select("value")
      .eq("business_id", context.user.business_id)
      .eq("key", "working_days")
      .maybeSingle(),
    supabase
      .from("business_calendar")
      .select("calendar_date, is_working_day")
      .eq("business_id", context.user.business_id),
    supabase
      .from("business_settings")
      .select("value")
      .eq("business_id", context.user.business_id)
      .eq("key", "business_details")
      .maybeSingle(),
  ]);

  if (orderError || !order) redirect("/orders?error=not_found");

  // Enforce locking rules: Cancelled or Delivered orders cannot be edited
  if (order.status === "CANCELLED" || order.delivery_status === "DELIVERED") {
    redirect(`/orders/${id}?error=order_locked`);
  }

  // Prevent editing if production for confirmed order has already started
  if (order.status === "CONFIRMED" && activeProduction && activeProduction.length > 0) {
    redirect(`/orders/${id}?error=production_in_progress_locked`);
  }

  const initialValues = {
    customer_id: order.customer_id,
    order_number: order.order_number,
    order_date: order.order_date,
    priority: order.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT",
    district: order.district ?? "",
    place_of_supply: order.place_of_supply ?? "",
    notes: order.notes ?? "",
  };

  const initialItems = (items ?? []).map((it) => ({
    product_id: it.product_id,
    quantity: String(it.quantity),
    unit_price: String(it.unit_price), // Preserves historical unit price snapshot
    discount_rate: String(it.discount_rate ?? "0"),
    tax_rate: String(it.tax_rate ?? "0"),
    sgst_rate: it.sgst_rate != null ? String(it.sgst_rate) : undefined,
    cgst_rate: it.cgst_rate != null ? String(it.cgst_rate) : undefined,
    igst_rate: it.igst_rate != null ? String(it.igst_rate) : undefined,
  }));

  const stockMap = new Map<string, number>();
  (inventoryRows ?? []).forEach((row: any) => {
    stockMap.set(row.item_id, Number(row.available_stock) || 0);
  });

  const calMap: Record<string, boolean> = {};
  (calRows ?? []).forEach((r: any) => {
    calMap[r.calendar_date] = Boolean(r.is_working_day);
  });

  const productsWithStock = (products ?? []).map((p: any) => ({
    ...p,
    available_stock: stockMap.get(p.id) || 0,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/orders/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Order #{order.order_number}</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Order #{order.order_number}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Modify order items, quantities, or pricing. Totals will be recalculated automatically.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <OrderForm
          orderId={id}
          initialValues={initialValues}
          initialItems={initialItems}
          customers={(customers ?? []).map((c: any) => {
            const addrs = c.customer_addresses || [];
            const primary = addrs.find((a: any) => a.address_type === "PRIMARY") || addrs[0];
            return {
              id: c.id,
              name: c.name,
              company_name: c.company_name,
              gst_number: c.gst_number || null,
              state: primary?.state || null,
              district: primary?.district || null,
            };
          })}
          products={productsWithStock as any}
          workingDays={wdSetting?.value as any}
          calendarOverrides={calMap}
          businessDetails={businessDetailsSetting?.value as any}
        />
      </div>
    </div>
  );
}
