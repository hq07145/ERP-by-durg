import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { ProductionTrackingDetail } from "@/components/production/production-tracking-detail";
import {
  getProductionLogs,
  getQualityChecks,
  getProductionOutput,
  getMaterialConsumption,
  checkProductionMaterialAvailability,
} from "@/lib/production/actions";
import type { ProductionOrderWithDetails, ProductionScheduleWithOrder } from "@/types/production";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductionTrackingPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) redirect("/production?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/production?error=auth_unconfigured");

  const [
    { data: po },
    { data: schedules },
    logs,
    qualityChecks,
    outputs,
    materialConsumption,
    materialAvailability,
  ] = await Promise.all([
    supabase
      .from("production_orders")
      .select(
        `
        id, business_id, order_id, order_item_id, product_id, quantity, status, priority,
        scheduled_start_date, scheduled_end_date, actual_start_date, actual_end_date, notes, created_at, updated_at,
        orders!inner(order_number, order_date, priority, customers!inner(name, company_name)),
        products!inner(name, sku, unit, daily_capacity, production_unit, production_min_days, production_max_days, setup_minutes)
      `
      )
      .eq("business_id", context.user.business_id)
      .eq("id", id)
      .single(),
    supabase
      .from("production_schedules")
      .select(
        `
        id, business_id, production_order_id, schedule_date, allocated_quantity, sequence_number, created_at,
        production_orders!inner(
          id, business_id, order_id, order_item_id, product_id, quantity, status, priority,
          scheduled_start_date, scheduled_end_date, created_at,
          orders!inner(order_number, order_date, customers!inner(name)),
          products!inner(name, sku, unit)
        )
      `
      )
      .eq("business_id", context.user.business_id)
      .eq("production_order_id", id)
      .order("schedule_date")
      .order("sequence_number"),
    getProductionLogs(id),
    getQualityChecks(id),
    getProductionOutput(id),
    getMaterialConsumption(id),
    checkProductionMaterialAvailability(id),
  ]);

  if (!po) redirect("/production?error=not_found");

  const canEdit = hasPermission({ permissions: context.permissions }, "production.edit");
  const canSchedule = hasPermission({ permissions: context.permissions }, "production.schedule");
  const canCancel = hasPermission({ permissions: context.permissions }, "production.cancel");
  const canStart = hasPermission({ permissions: context.permissions }, "production.start");
  const canQualityCheck = hasPermission({ permissions: context.permissions }, "production.quality_check");
  const canComplete = hasPermission({ permissions: context.permissions }, "production.complete");
  const canDispatch = hasPermission({ permissions: context.permissions }, "production.dispatch");

  const orderData = po.orders?.[0] || {};
  const customerData = orderData.customers?.[0] || {};
  const productData = po.products?.[0] || {};

  const productionOrder: ProductionOrderWithDetails = {
    id: po.id,
    business_id: po.business_id,
    order_id: po.order_id,
    order_item_id: po.order_item_id,
    product_id: po.product_id,
    quantity: po.quantity,
    status: po.status,
    priority: po.priority,
    scheduled_start_date: po.scheduled_start_date,
    scheduled_end_date: po.scheduled_end_date,
    actual_start_date: po.actual_start_date,
    actual_end_date: po.actual_end_date,
    notes: po.notes,
    created_at: po.created_at,
    updated_at: po.updated_at,
    order_number: orderData.order_number,
    customer_name: customerData.name ?? null,
    product_name: productData.name,
    product_sku: productData.sku,
    product_unit: productData.unit,
    product_daily_capacity: productData.daily_capacity,
    product_production_unit: productData.production_unit,
    product_production_min_days: productData.production_min_days,
    product_production_max_days: productData.production_max_days,
    product_setup_minutes: productData.setup_minutes,
  };

  const schedulesWithOrder: ProductionScheduleWithOrder[] = (schedules ?? []).map((s) => {
    const soOrder = s.production_orders?.[0] || {};
    const soOrderData = soOrder.orders?.[0] || {};
    const soCustomerData = soOrderData.customers?.[0] || {};
    const soProductData = soOrder.products?.[0] || {};

    return {
      id: s.id,
      business_id: s.business_id,
      production_order_id: s.production_order_id,
      schedule_date: s.schedule_date,
      allocated_quantity: s.allocated_quantity,
      sequence_number: s.sequence_number,
      created_at: s.created_at,
      production_order: {
        id: soOrder.id,
        business_id: soOrder.business_id,
        order_id: soOrder.order_id,
        order_number: soOrderData.order_number,
        customer_name: soCustomerData.name ?? null,
        product_id: soOrder.product_id,
        product_name: soProductData.name,
        product_sku: soProductData.sku,
        product_unit: soProductData.unit,
        quantity: soOrder.quantity,
        status: soOrder.status,
        priority: soOrder.priority,
        scheduled_start_date: soOrder.scheduled_start_date,
        scheduled_end_date: soOrder.scheduled_end_date,
        created_at: soOrder.created_at,
      },
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/production" className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Back to Production
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production Tracking</h1>
            <p className="text-gray-500">{productionOrder.order_number} - {productionOrder.product_name}</p>
          </div>
        </div>
      </div>

      <ProductionTrackingDetail
        productionOrder={productionOrder}
        schedules={schedulesWithOrder}
        logs={logs}
        qualityChecks={qualityChecks}
        outputs={outputs}
        materialConsumption={materialConsumption}
        materialAvailability={materialAvailability}
        canEdit={canEdit}
        canSchedule={canSchedule}
        canCancel={canCancel}
        canStart={canStart}
        canQualityCheck={canQualityCheck}
        canComplete={canComplete}
        canDispatch={canDispatch}
      />
    </div>
  );
}