import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { OrdersList } from "./orders-list";
import type { OrderListItem, OrderPriority, OrderStatus, DeliveryStatus } from "@/types/order";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

function safeSearch(value: string | undefined): string {
  return (value ?? "").replace(/[^\p{L}\p{N}\s@._+-]/gu, " ").trim();
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    payment?: string;
    startDate?: string;
    endDate?: string;
    sort?: string;
    page?: string;
    notice?: string;
    error?: string;
    new?: string;
  }>;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) redirect("/dashboard?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/orders?error=auth_unconfigured");

  const params = await searchParams;
  const search = safeSearch(params.q);
  const status = params.status && ["DRAFT", "CONFIRMED", "CANCELLED"].includes(params.status) ? params.status : "all";
  const priority = params.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(params.priority) ? params.priority : "all";
  const payment = params.payment || "all";
  const startDate = params.startDate?.trim() || "";
  const endDate = params.endDate?.trim() || "";
  const sort = params.sort || "date_desc";

  const pageNumber = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // 1. Fetch KPI Summary Counts and Create Order Form Dependencies
  const [
    totalRes,
    confirmedRes,
    draftRes,
    customersRes,
    productsRes,
    inventoryRowsRes,
    wdSettingRes,
    calRowsRes,
    businessDetailsRes
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_id", context.user.business_id),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_id", context.user.business_id)
      .eq("status", "CONFIRMED"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_id", context.user.business_id)
      .eq("status", "DRAFT"),
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

  const stockMap = new Map<string, number>();
  (inventoryRowsRes.data ?? []).forEach((row: any) => {
    stockMap.set(row.item_id, Number(row.available_stock) || 0);
  });

  const calMap: Record<string, boolean> = {};
  (calRowsRes.data ?? []).forEach((r: any) => {
    calMap[r.calendar_date] = Boolean(r.is_working_day);
  });

  const productsWithStock = (productsRes.data ?? []).map((p: any) => ({
    ...p,
    available_stock: stockMap.get(p.id) || 0,
  }));

  // 2. Build filtered and paginated query
  let query = supabase
    .from("orders")
    .select(
      "id, customer_id, order_number, order_date, priority, status, total_amount, paid_amount, due_amount, created_at, earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status, customers!inner(name, company_name), order_items(id)",
      { count: "exact" }
    )
    .eq("business_id", context.user.business_id);

  if (search) {
    query = query.or(
      `order_number.ilike.%${search}%,customers.name.ilike.%${search}%,customers.company_name.ilike.%${search}%`
    );
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (priority !== "all") {
    query = query.eq("priority", priority);
  }

  if (payment === "UNPAID") {
    query = query.eq("paid_amount", 0);
  } else if (payment === "PARTIAL") {
    query = query.gt("paid_amount", 0).gt("due_amount", 0);
  } else if (payment === "PAID") {
    query = query.eq("due_amount", 0).gt("total_amount", 0);
  }

  if (startDate) {
    query = query.gte("order_date", startDate);
  }
  if (endDate) {
    query = query.lte("order_date", endDate);
  }

  // Sorting
  if (sort === "date_asc") {
    query = query.order("order_date", { ascending: true }).order("created_at", { ascending: true });
  } else if (sort === "amount_desc") {
    query = query.order("total_amount", { ascending: false });
  } else if (sort === "amount_asc") {
    query = query.order("total_amount", { ascending: true });
  } else if (sort === "number_asc") {
    query = query.order("order_number", { ascending: true });
  } else {
    // Default: date_desc
    query = query.order("order_date", { ascending: false }).order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data: orders, count, error } = await query;

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const ordersWithCustomer: OrderListItem[] = (orders ?? []).map((o: any) => ({
    id: o.id,
    business_id: context.user.business_id,
    customer_id: o.customer_id,
    order_number: o.order_number,
    order_date: o.order_date,
    priority: o.priority as OrderPriority,
    status: o.status as OrderStatus,
    total_amount: o.total_amount,
    paid_amount: o.paid_amount ?? 0,
    due_amount: o.due_amount ?? 0,
    created_at: o.created_at,
    customer_name: o.customers?.name ?? o.customers?.[0]?.name ?? null,
    company_name: o.customers?.company_name ?? o.customers?.[0]?.company_name ?? null,
    item_count: Array.isArray(o.order_items) ? o.order_items.length : 0,
    earliest_delivery_date: o.earliest_delivery_date,
    latest_delivery_date: o.latest_delivery_date,
    expected_delivery_date: o.expected_delivery_date,
    delivery_status: o.delivery_status as DeliveryStatus,
  }));

  const canCreate = hasPermission({ permissions: context.permissions }, "orders.create");
  const canEdit = hasPermission({ permissions: context.permissions }, "orders.edit");
  const canApprove = hasPermission({ permissions: context.permissions }, "orders.approve");
  const canCancel = hasPermission({ permissions: context.permissions }, "orders.cancel");
  const canViewPayments =
    context.roleKey === "admin" ||
    context.roleKey === "super_admin" ||
    hasPermission({ permissions: context.permissions }, "payments.view");

  return (
    <OrdersList
      orders={ordersWithCustomer}
      totalCount={totalCount}
      currentPage={page}
      totalPages={totalPages}
      pageSize={PAGE_SIZE}
      filters={{
        q: search,
        status,
        priority,
        payment,
        startDate,
        endDate,
        sort,
      }}
      counts={{
        total: totalRes.count ?? 0,
        confirmed: confirmedRes.count ?? 0,
        draft: draftRes.count ?? 0,
      }}
      permissions={{
        canCreate,
        canEdit,
        canApprove,
        canCancel,
        canViewPayments,
      }}
      orderFormData={{
        customers: (customersRes.data ?? []).map((c: any) => {
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
        }),
        products: productsWithStock as any,
        workingDays: wdSettingRes.data?.value as any,
        calendarOverrides: calMap,
        businessDetails: businessDetailsRes.data?.value as any,
      }}
      isNewModalRequested={params.new === "true" || params.new === "1"}
      queryError={
        params.error === "order_delivered_locked"
          ? "Cannot cancel order: this order has already been delivered."
          : params.error === "production_in_progress_locked"
          ? "Cannot cancel order: manufacturing is already in progress or completed."
          : params.error === "order_cancelled_locked"
          ? "This order is already cancelled."
          : params.error === "forbidden"
          ? "You do not have permission to perform this action."
          : params.error
          ? `Operation failed (${params.error}).`
          : error
          ? "Unable to load orders list from database."
          : null
      }
      notice={params.notice}
    />
  );
}