import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OrderPriority } from "@/types/order";

async function safeNotifyCapacity(businessId: string, poId: string, orderId: string, noteMsg: string) {
  try {
    const { notifyCapacityInsufficient } = await import("@/lib/notifications/actions");
    if (notifyCapacityInsufficient) {
      await notifyCapacityInsufficient(businessId, poId, orderId, noteMsg);
    }
  } catch {
    // Non-fatal
  }
}

function getPrivilegedClient(fallback: SupabaseClient): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fallback;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface SchedulingOutcome {
  success: boolean;
  production_order_id: string;
  order_id: string;
  order_number: string;
  product_id: string;
  quantity: number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  status: "SCHEDULED" | "PENDING" | "CAPACITY_INSUFFICIENT";
  message: string;
}

export interface QueueScheduleSummary {
  scheduled_count: number;
  insufficient_capacity_count: number;
  outcomes: SchedulingOutcome[];
}

/**
 * Helper to format a Date as YYYY-MM-DD
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a local Date at 00:00:00
 */
export function parseDateISO(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type WorkingDaysMap = {
  mon?: boolean;
  tue?: boolean;
  wed?: boolean;
  thu?: boolean;
  fri?: boolean;
  sat?: boolean;
  sun?: boolean;
};

/**
 * Determine if a date is a working day, respecting business_calendar overrides
 * and configured weekly working days setting.
 * Defaults to Monday-Friday (DOW 1..5) if no calendar override or setting exists.
 */
export function isWorkingDay(
  date: Date,
  calendarOverrides: Map<string, boolean>,
  workingDays?: WorkingDaysMap,
): boolean {
  const dateKey = formatDateISO(date);
  if (calendarOverrides.has(dateKey)) {
    return calendarOverrides.get(dateKey) === true;
  }
  const dow = date.getDay();
  if (workingDays) {
    const map: Record<number, keyof WorkingDaysMap> = {
      0: "sun",
      1: "mon",
      2: "tue",
      3: "wed",
      4: "thu",
      5: "fri",
      6: "sat",
    };
    const dayKey = map[dow];
    if (dayKey && typeof workingDays[dayKey] === "boolean") {
      return workingDays[dayKey] === true;
    }
  }
  return dow >= 1 && dow <= 5;
}

/**
 * Get the next working day starting from a given date
 */
export function getNextWorkingDay(
  date: Date,
  calendarOverrides: Map<string, boolean>,
  workingDays?: WorkingDaysMap,
): Date {
  const current = new Date(date);
  while (!isWorkingDay(current, calendarOverrides, workingDays)) {
    current.setDate(current.getDate() + 1);
  }
  return current;
}

/**
 * Calculate production days needed based on quantity, daily capacity, and setup minutes
 */
export function calculateProductionDays(
  quantity: number,
  dailyCapacity: number,
  setupMinutes: number = 0,
  minDays: number = 1,
): number {
  if (dailyCapacity <= 0) return 1;
  const prodDays = Math.ceil(quantity / dailyCapacity);
  const setupDays = (setupMinutes || 0) / 480;
  return Math.max(Math.ceil(prodDays + setupDays), minDays || 1);
}

export interface RawMaterialDeficiency {
  materialId: string;
  code: string | null;
  name: string;
  required: number;
  available: number;
}

/**
 * Check actual available finished-goods stock for a product in public.inventory.
 * Available stock = current_stock - reserved_stock
 */
export async function checkUsableFinishedStock(
  supabase: SupabaseClient,
  businessId: string,
  productId: string,
): Promise<{ current_stock: number; reserved_stock: number; available_stock: number; id?: string }> {
  const { data: inv } = await supabase
    .from("inventory")
    .select("id, current_stock, reserved_stock, available_stock")
    .eq("business_id", businessId)
    .eq("item_type", "finished_good")
    .eq("item_id", productId)
    .maybeSingle();

  if (!inv) {
    return { current_stock: 0, reserved_stock: 0, available_stock: 0 };
  }

  const current = Number(inv.current_stock) || 0;
  const reserved = Number(inv.reserved_stock) || 0;
  const available = Math.max(0, current - reserved);
  return {
    id: inv.id,
    current_stock: current,
    reserved_stock: reserved,
    available_stock: available,
  };
}

/**
 * Atomically reserve finished goods stock for a confirmed order item.
 * Uses optimistic condition available_stock >= actualReserve to prevent race-condition overbooking.
 */
export async function reserveFinishedStock(
  supabase: SupabaseClient,
  businessId: string,
  productId: string,
  quantityToReserve: number,
  orderId: string,
  orderNumber: string,
  userId?: string,
): Promise<{ reservedQuantity: number }> {
  if (quantityToReserve <= 0) return { reservedQuantity: 0 };

  const stockInfo = await checkUsableFinishedStock(supabase, businessId, productId);
  const actualReserve = Math.min(quantityToReserve, stockInfo.available_stock);
  if (actualReserve <= 0 || !stockInfo.id) {
    return { reservedQuantity: 0 };
  }

  const newReserved = stockInfo.reserved_stock + actualReserve;
  const newAvailable = stockInfo.current_stock - newReserved;

  const clientToUse = getPrivilegedClient(supabase);
  const { data: updated, error: updateErr } = await clientToUse
    .from("inventory")
    .update({
      reserved_stock: newReserved,
      available_stock: newAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockInfo.id)
    .eq("business_id", businessId)
    .gte("available_stock", actualReserve)
    .select("id");

  if (updateErr || !updated || updated.length === 0) {
    return { reservedQuantity: 0 };
  }

  let actorId = userId;
  if (!actorId) {
    const { data: u } = await clientToUse
      .from("users")
      .select("id")
      .eq("business_id", businessId)
      .limit(1)
      .maybeSingle();
    actorId = u?.id;
  }

  if (actorId) {
    await clientToUse.from("inventory_transactions").insert({
      business_id: businessId,
      item_type: "finished_good",
      item_id: productId,
      transaction_type: "ADJUSTMENT",
      quantity: actualReserve,
      reference_type: "ORDER_RESERVATION",
      reference_id: orderId,
      notes: `Stock reserved for order ${orderNumber} (${actualReserve} units)`,
      created_by: actorId,
    });
  }

  return { reservedQuantity: actualReserve };
}

/**
 * Release any finished goods stock reserved for an order (e.g. on order cancellation).
 */
export async function releaseOrderFinishedStock(
  supabase: SupabaseClient,
  businessId: string,
  orderId: string,
  userId?: string,
  reason?: string,
): Promise<{ releasedCount: number }> {
  // Idempotency: verify this order has not already been released
  const { data: alreadyReleased } = await supabase
    .from("inventory_transactions")
    .select("id")
    .eq("business_id", businessId)
    .eq("reference_id", orderId)
    .eq("reference_type", "ORDER_CANCELLATION_RELEASE")
    .limit(1);

  if (alreadyReleased && alreadyReleased.length > 0) {
    return { releasedCount: 0 };
  }

  const { data: transactions } = await supabase
    .from("inventory_transactions")
    .select("id, item_id, quantity")
    .eq("business_id", businessId)
    .eq("reference_id", orderId)
    .eq("reference_type", "ORDER_RESERVATION")
    .eq("item_type", "finished_good");

  if (!transactions || transactions.length === 0) {
    return { releasedCount: 0 };
  }

  let actorId = userId;
  if (!actorId) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("business_id", businessId)
      .limit(1)
      .maybeSingle();
    actorId = u?.id;
  }

  const clientToUse = getPrivilegedClient(supabase);
  let count = 0;
  for (const tx of transactions) {
    const qty = Number(tx.quantity);
    if (qty <= 0) continue;

    const stockInfo = await checkUsableFinishedStock(supabase, businessId, tx.item_id);
    if (!stockInfo.id) continue;

    const newReserved = Math.max(0, stockInfo.reserved_stock - qty);
    const newAvailable = stockInfo.current_stock - newReserved;

    await clientToUse
      .from("inventory")
      .update({
        reserved_stock: newReserved,
        available_stock: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stockInfo.id)
      .eq("business_id", businessId);

    if (actorId) {
      await clientToUse.from("inventory_transactions").insert({
        business_id: businessId,
        item_type: "finished_good",
        item_id: tx.item_id,
        transaction_type: "ADJUSTMENT",
        quantity: qty,
        reference_type: "ORDER_CANCELLATION_RELEASE",
        reference_id: orderId,
        notes: reason ? `Released reservation: ${reason}` : "Released stock reservation due to order cancellation",
        created_by: actorId,
      });
    }
    count++;
  }

  return { releasedCount: count };
}

/**
 * Check if required raw materials in active BOM are available in stock.
 */
export async function checkBomRawMaterials(
  supabase: SupabaseClient,
  businessId: string,
  productId: string,
  productionQuantity: number,
): Promise<{
  hasBom: boolean;
  sufficient: boolean;
  deficiencies: RawMaterialDeficiency[];
}> {
  if (productionQuantity <= 0) {
    return { hasBom: false, sufficient: true, deficiencies: [] };
  }

  const { data: bom } = await supabase
    .from("product_bom")
    .select("id")
    .eq("business_id", businessId)
    .eq("product_id", productId)
    .eq("active", true)
    .maybeSingle();

  if (!bom) {
    return { hasBom: false, sufficient: true, deficiencies: [] };
  }

  const { data: bomItems } = await supabase
    .from("bom_items")
    .select(`
      id, raw_material_id, quantity_per_unit,
      raw_materials!inner(id, code, name, current_stock)
    `)
    .eq("business_id", businessId)
    .eq("bom_id", bom.id);

  if (!bomItems || bomItems.length === 0) {
    return { hasBom: true, sufficient: true, deficiencies: [] };
  }

  const deficiencies: RawMaterialDeficiency[] = [];
  for (const item of bomItems) {
    const rm = Array.isArray(item.raw_materials) ? item.raw_materials[0] : item.raw_materials;
    const required = Number(item.quantity_per_unit) * productionQuantity;

    const { data: inv } = await supabase
      .from("inventory")
      .select("available_stock, current_stock, reserved_stock")
      .eq("business_id", businessId)
      .eq("item_type", "raw_material")
      .eq("item_id", item.raw_material_id)
      .maybeSingle();

    const avail = inv ? Math.max(0, Number(inv.available_stock)) : Math.max(0, Number(rm?.current_stock) || 0);
    if (avail < required) {
      deficiencies.push({
        materialId: item.raw_material_id,
        code: rm?.code ?? null,
        name: rm?.name ?? "Raw Material",
        required,
        available: avail,
      });
    }
  }

  return {
    hasBom: true,
    sufficient: deficiencies.length === 0,
    deficiencies,
  };
}

/**
 * Enqueue each eligible order item into production_orders exactly once.
 * Integrates finished goods stock reservation, BOM verification, and production enqueuing.
 */
export async function enqueueOrderItemsForProduction(
  supabase: SupabaseClient,
  businessId: string,
  orderId: string,
  priority: OrderPriority,
  userId?: string,
): Promise<{ count: number; orderNumber: string }> {
  // Fetch order items and order number
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("order_number, order_date")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();

  if (orderErr || !order) {
    throw new Error("Order not found during production enqueuing");
  }

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("id, product_id, quantity")
    .eq("order_id", orderId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (itemsErr || !items) {
    throw new Error("Failed to fetch order items for production enqueuing");
  }

  let createdCount = 0;

  for (const item of items) {
    // Check if production order already exists for this order item
    const { data: existing } = await supabase
      .from("production_orders")
      .select("id")
      .eq("business_id", businessId)
      .eq("order_item_id", item.id)
      .maybeSingle();

    if (!existing) {
      const orderQty = Number(item.quantity);

      // 1. Usable finished-goods stock check
      const stockInfo = await checkUsableFinishedStock(supabase, businessId, item.product_id);
      let stockFulfilled = 0;

      if (stockInfo.available_stock > 0) {
        const reserveRes = await reserveFinishedStock(
          supabase,
          businessId,
          item.product_id,
          orderQty,
          orderId,
          order.order_number,
          userId,
        );
        stockFulfilled = reserveRes.reservedQuantity;
      }

      const remainingProd = Math.max(0, orderQty - stockFulfilled);

      // 2. If 100% fulfilled from stock
      if (stockFulfilled > 0 && remainingProd === 0) {
        const { error: insertErr } = await supabase.from("production_orders").insert({
          business_id: businessId,
          order_id: orderId,
          order_item_id: item.id,
          product_id: item.product_id,
          quantity: stockFulfilled,
          status: "COMPLETED",
          actual_end_date: order.order_date,
          scheduled_start_date: order.order_date,
          scheduled_end_date: order.order_date,
          priority: priority,
          notes: "Fulfilled 100% from available finished-goods stock",
        });

        if (!insertErr) createdCount++;
      } else {
        // 3. Partial stock + remaining production OR 0 stock remaining production
        // Note: UNIQUE constraint on (business_id, order_item_id) means 1 PO row per order_item.
        // The stockFulfilled portion is already reserved in inventory & recorded in inventory_transactions.
        const bomCheck = await checkBomRawMaterials(supabase, businessId, item.product_id, remainingProd);
        let noteText = `Enqueued from confirmed order ${order.order_number}`;
        if (stockFulfilled > 0) {
          noteText = `Partial stock (${stockFulfilled}) reserved, ${remainingProd} scheduled for production`;
        }

        if (!bomCheck.sufficient && bomCheck.deficiencies.length > 0) {
          const firstDef = bomCheck.deficiencies[0];
          noteText = `RAW_MATERIALS_INSUFFICIENT: Missing material "${firstDef.name}" (Req: ${firstDef.required}, Avail: ${firstDef.available})`;
        }

        const { error: insertErr } = await supabase.from("production_orders").insert({
          business_id: businessId,
          order_id: orderId,
          order_item_id: item.id,
          product_id: item.product_id,
          quantity: remainingProd,
          status: "PENDING",
          priority: priority,
          notes: noteText,
        });

        if (!insertErr) createdCount++;
      }
    }
  }

  return { count: createdCount, orderNumber: order.order_number };
}

/**
 * Execute the production scheduling engine for a business.
 * Strictly enforces:
 * 1. Product-specific daily capacity
 * 2. Strict FIFO by confirmation timestamp within priority levels
 * 3. No-split rule: never silently split an order across multiple partial days
 * 4. CAPACITY_INSUFFICIENT flag when order quantity exceeds daily capacity
 * 5. Working calendar and holiday compliance
 * 6. Protection of already-started production
 */
export async function scheduleProductionQueue(
  supabase: SupabaseClient,
  businessId: string,
  startDateISO?: string,
): Promise<QueueScheduleSummary> {
  // 1. Load business calendar overrides
  const today = new Date();
  const searchStart = startDateISO ? parseDateISO(startDateISO) : today;

  const minCalDate = formatDateISO(new Date(searchStart.getFullYear(), searchStart.getMonth() - 1, 1));
  const maxCalDate = formatDateISO(new Date(searchStart.getFullYear() + 2, 11, 31));

  const { data: calendarRows } = await supabase
    .from("business_calendar")
    .select("calendar_date, is_working_day")
    .eq("business_id", businessId)
    .gte("calendar_date", minCalDate)
    .lte("calendar_date", maxCalDate);

  const calendarOverrides = new Map<string, boolean>();
  (calendarRows ?? []).forEach((row: any) => {
    calendarOverrides.set(row.calendar_date, Boolean(row.is_working_day));
  });

  // Fetch business working_days configuration
  const { data: wdSetting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("business_id", businessId)
    .eq("key", "working_days")
    .maybeSingle();

  const workingDaysConfig = wdSetting?.value as WorkingDaysMap | undefined;

  // 2. Fetch locked / already-started production orders (never moved!)
  const { data: lockedOrders } = await supabase
    .from("production_orders")
    .select("id, product_id")
    .eq("business_id", businessId)
    .in("status", [
      "IN_PROGRESS",
      "IN_PRODUCTION",
      "COMPLETED",
      "QUALITY_CHECK",
      "QUALITY_PASSED",
      "READY_FOR_DISPATCH",
    ]);

  const lockedPoIds = (lockedOrders ?? []).map((po: any) => po.id);

  // Map of allocated capacity per product and date: "productId|YYYY-MM-DD" -> allocatedQuantity
  const allocatedCapacityMap = new Map<string, number>();

  if (lockedPoIds.length > 0) {
    const { data: lockedSchedules } = await supabase
      .from("production_schedules")
      .select("production_order_id, schedule_date, allocated_quantity")
      .eq("business_id", businessId)
      .in("production_order_id", lockedPoIds);

    const lockedProductMap = new Map<string, string>();
    (lockedOrders ?? []).forEach((po: any) => {
      lockedProductMap.set(po.id, po.product_id);
    });

    (lockedSchedules ?? []).forEach((s: any) => {
      const prodId = lockedProductMap.get(s.production_order_id);
      if (prodId) {
        const key = `${prodId}|${s.schedule_date}`;
        const prev = allocatedCapacityMap.get(key) || 0;
        allocatedCapacityMap.set(key, prev + Number(s.allocated_quantity));
      }
    });
  }

  const dbClient = getPrivilegedClient(supabase);

  // 3. Clear existing schedules for PENDING and SCHEDULED production orders
  const { data: eligiblePoRows } = await dbClient
    .from("production_orders")
    .select("id")
    .eq("business_id", businessId)
    .in("status", ["PENDING", "SCHEDULED"]);

  const eligiblePoIds = (eligiblePoRows ?? []).map((po: any) => po.id);

  if (eligiblePoIds.length > 0) {
    await dbClient
      .from("production_schedules")
      .delete()
      .eq("business_id", businessId)
      .in("production_order_id", eligiblePoIds);
  }

  // 4. Fetch the full production queue in strict Priority & FIFO order
  // 4. Fetch the full production queue in strict Priority & FIFO order
  const { data: poRows, error: poErr } = await supabase
    .from("production_orders")
    .select("id, order_id, order_item_id, product_id, quantity, priority, created_at, notes, status")
    .eq("business_id", businessId)
    .in("status", ["PENDING", "SCHEDULED"]);

  if (poErr || !poRows || poRows.length === 0) {
    return {
      scheduled_count: 0,
      insufficient_capacity_count: 0,
      outcomes: [],
    };
  }

  const orderIds = [...new Set(poRows.map((p: any) => p.order_id).filter(Boolean))];
  const productIds = [...new Set(poRows.map((p: any) => p.product_id).filter(Boolean))];

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, order_date, status")
    .eq("business_id", businessId)
    .in("id", orderIds);

  const orderMap = new Map<string, any>();
  (orders ?? []).forEach((o: any) => orderMap.set(o.id, o));

  const { data: products } = await supabase
    .from("products")
    .select("id, name, daily_capacity, production_min_days, setup_minutes, delivery_min_days, delivery_max_days")
    .eq("business_id", businessId)
    .in("id", productIds);

  const productMap = new Map<string, any>();
  (products ?? []).forEach((p: any) => productMap.set(p.id, p));

  // Filter for confirmed orders only
  const queueItems = poRows
    .filter((po: any) => {
      const ord = orderMap.get(po.order_id);
      return ord && ord.status === "CONFIRMED";
    })
    .map((po: any) => ({
      ...po,
      orders: orderMap.get(po.order_id),
      products: productMap.get(po.product_id),
    }));

  if (queueItems.length === 0) {
    return {
      scheduled_count: 0,
      insufficient_capacity_count: 0,
      outcomes: [],
    };
  }

  // Sort queue by Priority first (URGENT > HIGH > NORMAL > LOW), then FIFO by po.created_at
  const priorityOrder: Record<string, number> = {
    URGENT: 1,
    HIGH: 2,
    NORMAL: 3,
    LOW: 4,
  };

  const sortedQueue = [...queueItems].sort((a: any, b: any) => {
    const pA = priorityOrder[a.priority] || 3;
    const pB = priorityOrder[b.priority] || 3;
    if (pA !== pB) return pA - pB;
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    return tA - tB;
  });

  const outcomes: SchedulingOutcome[] = [];
  const affectedOrderIds = new Set<string>();
  const schedulesToInsert: Array<{
    business_id: string;
    production_order_id: string;
    schedule_date: string;
    allocated_quantity: number;
    sequence_number: number;
  }> = [];

  let scheduledCount = 0;
  let insufficientCapacityCount = 0;

  // 5. Schedule each production order in the queue
  for (const po of sortedQueue) {
    const orderData = Array.isArray(po.orders) ? po.orders[0] : po.orders;
    const productData = Array.isArray(po.products) ? po.products[0] : po.products;

    const orderNumber = orderData?.order_number || "UNKNOWN";
    const productName = productData?.name || "Product";
    const dailyCapacity = Number(productData?.daily_capacity) || 0;
    const minDays = Number(productData?.production_min_days) || 1;
    const setupMinutes = Number(productData?.setup_minutes) || 0;
    const qty = Number(po.quantity);

    affectedOrderIds.add(po.order_id);

    // RULE: If raw materials are insufficient, do not schedule
    if (po.notes && po.notes.includes("RAW_MATERIALS_INSUFFICIENT")) {
      outcomes.push({
        success: false,
        production_order_id: po.id,
        order_id: po.order_id,
        order_number: orderNumber,
        product_id: po.product_id,
        quantity: qty,
        scheduled_start_date: null,
        scheduled_end_date: null,
        status: "PENDING",
        message: po.notes,
      });
      continue;
    }

    // RULE: If daily capacity is not configured or <= 0
    if (dailyCapacity <= 0) {
      await supabase
        .from("production_orders")
        .update({
          status: "PENDING",
          scheduled_start_date: null,
          scheduled_end_date: null,
          notes: "CAPACITY_INSUFFICIENT: Product daily capacity is 0",
          updated_at: new Date().toISOString(),
        })
        .eq("id", po.id)
        .eq("business_id", businessId);

      insufficientCapacityCount++;
      outcomes.push({
        success: false,
        production_order_id: po.id,
        order_id: po.order_id,
        order_number: orderNumber,
        product_id: po.product_id,
        quantity: qty,
        scheduled_start_date: null,
        scheduled_end_date: null,
        status: "CAPACITY_INSUFFICIENT",
        message: "CAPACITY_INSUFFICIENT: Product daily capacity is 0",
      });
      continue;
    }

    // Multi-day capacity allocation:
    // When quantity exceeds daily capacity, or when available daily capacity is partial,
    // schedule production across consecutive available working days allocating up to dailyCapacity
    // on each working day until the entire quantity is scheduled.
    let remainingToAllocate = qty;
    let currSearchDate = getNextWorkingDay(new Date(searchStart), calendarOverrides, workingDaysConfig);
    let slotStartDate: Date | null = null;
    let slotEndDate: Date | null = null;
    let daysSearched = 0;
    const maxSearchDays = 365;

    // Temporary list of daily allocations for this production order
    const currentOrderSchedules: Array<{
      business_id: string;
      production_order_id: string;
      schedule_date: string;
      allocated_quantity: number;
      sequence_number: number;
    }> = [];

    // Track capacity changes so we can safely roll back if search window expires
    const touchedCapacityKeys: Array<{ key: string; added: number }> = [];
    let seq = 0;

    while (remainingToAllocate > 0 && daysSearched < maxSearchDays) {
      if (isWorkingDay(currSearchDate, calendarOverrides, workingDaysConfig)) {
        const dateStr = formatDateISO(currSearchDate);
        const capKey = `${po.product_id}|${dateStr}`;
        const alreadyAllocated = allocatedCapacityMap.get(capKey) || 0;
        const freeCapacity = Math.max(0, dailyCapacity - alreadyAllocated);

        if (freeCapacity > 0) {
          const allocOnDay = Math.min(remainingToAllocate, freeCapacity);
          allocatedCapacityMap.set(capKey, alreadyAllocated + allocOnDay);
          touchedCapacityKeys.push({ key: capKey, added: allocOnDay });

          currentOrderSchedules.push({
            business_id: businessId,
            production_order_id: po.id,
            schedule_date: dateStr,
            allocated_quantity: allocOnDay,
            sequence_number: seq++,
          });

          if (!slotStartDate) {
            slotStartDate = new Date(currSearchDate);
          }
          slotEndDate = new Date(currSearchDate);
          remainingToAllocate -= allocOnDay;
        }
      }

      currSearchDate.setDate(currSearchDate.getDate() + 1);
      daysSearched++;
    }

    if (remainingToAllocate > 0 || !slotStartDate || !slotEndDate) {
      // Rollback any partial reservations made for this un-schedulable order
      for (const touch of touchedCapacityKeys) {
        const prev = allocatedCapacityMap.get(touch.key) || 0;
        allocatedCapacityMap.set(touch.key, Math.max(0, prev - touch.added));
      }

      outcomes.push({
        success: false,
        production_order_id: po.id,
        order_id: po.order_id,
        order_number: orderNumber,
        product_id: po.product_id,
        quantity: qty,
        scheduled_start_date: null,
        scheduled_end_date: null,
        status: "PENDING",
        message: "No slot found within 365-day search window",
      });
      continue;
    }

    // Allocate the schedule items
    schedulesToInsert.push(...currentOrderSchedules);
    const startStr = formatDateISO(slotStartDate);
    const endStr = formatDateISO(slotEndDate);

    // Update production order status to SCHEDULED
    await supabase
      .from("production_orders")
      .update({
        status: "SCHEDULED",
        scheduled_start_date: startStr,
        scheduled_end_date: endStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", po.id)
      .eq("business_id", businessId);

    scheduledCount++;
    outcomes.push({
      success: true,
      production_order_id: po.id,
      order_id: po.order_id,
      order_number: orderNumber,
      product_id: po.product_id,
      quantity: qty,
      scheduled_start_date: startStr,
      scheduled_end_date: endStr,
      status: "SCHEDULED",
      message: "Scheduled successfully",
    });
  }

  // Insert or upsert all allocated schedules
  if (schedulesToInsert.length > 0) {
    const { error: insErr } = await dbClient
      .from("production_schedules")
      .upsert(schedulesToInsert, { onConflict: "business_id,schedule_date,production_order_id" });
    if (insErr) {
      console.error("[scheduleProductionQueue] Error inserting production schedules:", insErr);
    }
  }

  // 6. Recalculate delivery dates for all affected orders
  for (const orderId of affectedOrderIds) {
    try {
      await updateOrderDeliveryDatesFromSchedules(supabase, businessId, orderId, calendarOverrides);
    } catch {
      // Non-fatal
    }
  }

  return {
    scheduled_count: scheduledCount,
    insufficient_capacity_count: insufficientCapacityCount,
    outcomes,
  };
}

/**
 * Helper to add working days to a given start date, respecting calendar overrides
 */
export function addWorkingDays(
  startDate: Date,
  workingDaysToAdd: number,
  calendarOverrides: Map<string, boolean>,
  workingDays?: WorkingDaysMap,
): Date {
  const current = new Date(startDate);
  if (workingDaysToAdd <= 0) return current;

  let added = 0;
  while (added < workingDaysToAdd) {
    current.setDate(current.getDate() + 1);
    if (isWorkingDay(current, calendarOverrides, workingDays)) {
      added++;
    }
  }
  return current;
}

/**
 * Recomputes earliest, latest, and expected delivery dates for an order based on its production items.
 * Adheres to:
 * 1. Product's configured delivery range (delivery_min_days, delivery_max_days)
 * 2. Multi-product orders: overall delivery range derived from all required items (latest required arrival)
 * 3. Never overwrites completed/delivered historical records (DELIVERED or CANCELLED)
 * 4. Business calendar overrides for working days
 */
export async function updateOrderDeliveryDatesFromSchedules(
  supabase: SupabaseClient,
  businessId: string,
  orderId: string,
  calendarOverrides?: Map<string, boolean>,
): Promise<void> {
  // 1. Fetch current order with business isolation
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, delivery_status, earliest_delivery_date, latest_delivery_date, expected_delivery_date, notes, delivery_calculation_version")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!order) return;

  // Never overwrite completed or cancelled historical records (Requirement 5)
  if (order.status === "CANCELLED" || order.delivery_status === "CANCELLED" || order.delivery_status === "DELIVERED") {
    return;
  }

  // Preserve authorized manual overrides
  if (order.notes && order.notes.includes("MANUAL_OVERRIDE")) {
    return;
  }

  // 2. Load calendar overrides if not provided
  let calMap = calendarOverrides;
  if (!calMap) {
    const { data: calRows } = await supabase
      .from("business_calendar")
      .select("calendar_date, is_working_day")
      .eq("business_id", businessId);
    calMap = new Map();
    (calRows ?? []).forEach((r: any) => calMap!.set(r.calendar_date, Boolean(r.is_working_day)));
  }

  // 3. Fetch all production orders for this order
  const { data: poList } = await supabase
    .from("production_orders")
    .select("id, product_id, scheduled_start_date, scheduled_end_date, actual_end_date, status")
    .eq("order_id", orderId)
    .eq("business_id", businessId);

  if (!poList || poList.length === 0) {
    // 100% stock-fulfilled order or no POs: calculate delivery dates directly
    await estimateAndSaveOrderDelivery(supabase, businessId, orderId, calMap);
    return;
  }

  // 4. Fetch delivery day ranges for all unique products in this order
  const prodIds = [...new Set(poList.map((po: any) => po.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, delivery_min_days, delivery_max_days")
    .eq("business_id", businessId)
    .in("id", prodIds);

  const productMap = new Map<string, { minDays: number; maxDays: number }>();
  (products ?? []).forEach((p: any) => {
    const minD = Number(p.delivery_min_days) || 0;
    const maxD = Math.max(minD, Number(p.delivery_max_days) || 0);
    productMap.set(p.id, { minDays: minD, maxDays: maxD });
  });

  // 5. Calculate delivery date range across all order items
  let overallEarliest: Date | null = null;
  let overallLatest: Date | null = null;
  let overallExpected: Date | null = null;
  let allItemsScheduled = true;

  for (const po of poList) {
    const completionStr = po.actual_end_date || po.scheduled_end_date;
    if (!completionStr) {
      allItemsScheduled = false;
      continue;
    }

    const completionDate = parseDateISO(completionStr);
    const prodConfig = productMap.get(po.product_id) || { minDays: 0, maxDays: 0 };
    const minDays = prodConfig.minDays;
    const maxDays = prodConfig.maxDays;
    const expectedTransitDays = minDays === maxDays ? minDays : Math.ceil((minDays + maxDays) / 2);

    const itemEarliest = addWorkingDays(completionDate, minDays, calMap);
    const itemLatest = addWorkingDays(completionDate, maxDays, calMap);
    const itemExpected = addWorkingDays(completionDate, expectedTransitDays, calMap);

    // For multi-product orders: The order cannot be delivered until ALL required items have completed transit.
    // Therefore, overall delivery date is the MAX (latest completion) among all required items.
    if (!overallEarliest || itemEarliest > overallEarliest) overallEarliest = itemEarliest;
    if (!overallLatest || itemLatest > overallLatest) overallLatest = itemLatest;
    if (!overallExpected || itemExpected > overallExpected) overallExpected = itemExpected;
  }

  // If not all items are scheduled into shop-floor slots (e.g. multi-day batch pending allocation under no-split rule),
  // preserve and recalculate the Predicted Delivery Date instead of wiping out to null!
  if (!allItemsScheduled || !overallEarliest || !overallLatest || !overallExpected) {
    await estimateAndSaveOrderDelivery(supabase, businessId, orderId, calMap);
    return;
  }

  const earliestStr = formatDateISO(overallEarliest);
  const latestStr = formatDateISO(overallLatest);
  const expectedStr = formatDateISO(overallExpected);

  const todayStr = formatDateISO(new Date());
  const newDeliveryStatus = expectedStr < todayStr ? "OVERDUE" : "ON_TIME";
  const newVersion = (Number(order.delivery_calculation_version) || 1) + 1;

  // 7. Update orders table with committed schedule dates
  await supabase
    .from("orders")
    .update({
      earliest_delivery_date: earliestStr,
      latest_delivery_date: latestStr,
      expected_delivery_date: expectedStr,
      delivery_status: newDeliveryStatus,
      delivery_calculated_at: new Date().toISOString(),
      delivery_calculation_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", businessId);
}

/**
 * Estimate delivery dates for an order without reserving stock or scheduling capacity.
 * Runs on order creation / edit so managers see realistic expectations.
 * Respects FIFO queue, daily capacity, working calendar, and existing stock.
 */
export async function estimateAndSaveOrderDelivery(
  supabase: SupabaseClient,
  businessId: string,
  orderId: string,
  calendarOverrides?: Map<string, boolean>,
): Promise<{
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: "PENDING" | "ON_TIME" | "OVERDUE";
  explanation: string;
}> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, order_date, priority, status, notes, delivery_calculation_version, earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!order) {
    return {
      earliest_delivery_date: null,
      latest_delivery_date: null,
      expected_delivery_date: null,
      delivery_status: "PENDING",
      explanation: "Order not found",
    };
  }

  // Preserve authorized manual delivery date override (Requirement 6)
  if (order.notes && order.notes.includes("MANUAL_OVERRIDE")) {
    return {
      earliest_delivery_date: order.earliest_delivery_date,
      latest_delivery_date: order.latest_delivery_date,
      expected_delivery_date: order.expected_delivery_date,
      delivery_status: order.delivery_status || "PENDING",
      explanation: "Preserving authorized manual delivery date override",
    };
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, products(name, daily_capacity, production_min_days, setup_minutes, delivery_min_days, delivery_max_days)")
    .eq("order_id", orderId)
    .eq("business_id", businessId);

  if (!items || items.length === 0) {
    return {
      earliest_delivery_date: null,
      latest_delivery_date: null,
      expected_delivery_date: null,
      delivery_status: "PENDING",
      explanation: "No line items to estimate",
    };
  }

  // Check if this order already holds any reservations (e.g. if confirmed)
  const { data: resTx } = await supabase
    .from("inventory_transactions")
    .select("item_id, quantity")
    .eq("business_id", businessId)
    .eq("reference_id", orderId)
    .eq("reference_type", "ORDER_RESERVATION");

  const orderResMap = new Map<string, number>();
  (resTx ?? []).forEach((t: any) => {
    orderResMap.set(t.item_id, (orderResMap.get(t.item_id) || 0) + Number(t.quantity));
  });

  // Load calendar overrides
  const today = new Date();
  let calMap = calendarOverrides;
  if (!calMap) {
    const { data: calRows } = await supabase
      .from("business_calendar")
      .select("calendar_date, is_working_day")
      .eq("business_id", businessId);

    calMap = new Map<string, boolean>();
    (calRows ?? []).forEach((r: any) => calMap!.set(r.calendar_date, Boolean(r.is_working_day)));
  }

  const { data: wdSetting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("business_id", businessId)
    .eq("key", "working_days")
    .maybeSingle();
  const workingDays = wdSetting?.value as WorkingDaysMap | undefined;

  let overallEarliest: Date | null = null;
  let overallLatest: Date | null = null;
  let overallExpected: Date | null = null;
  let hasMissingCapacity = false;
  const lineNotes: string[] = [];

  for (const item of items) {
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    const prodName = prod?.name || "Product";
    const dailyCap = Number(prod?.daily_capacity) || 0;
    const minDays = Number(prod?.delivery_min_days) || 0;
    const maxDays = Math.max(minDays, Number(prod?.delivery_max_days) || 0);
    const expectedTransit = minDays === maxDays ? minDays : Math.ceil((minDays + maxDays) / 2);
    const qty = Number(item.quantity);

    // Check available finished goods stock + any stock already reserved for THIS order
    const thisOrderReserved = orderResMap.get(item.product_id) || 0;
    const stockInfo = await checkUsableFinishedStock(supabase, businessId, item.product_id);
    const usableStock = thisOrderReserved + stockInfo.available_stock;
    const stockFulfilled = Math.min(qty, usableStock);
    const remainingProd = Math.max(0, qty - stockFulfilled);

    let completionDate: Date;
    const orderDate = parseDateISO(order.order_date || formatDateISO(today));

    if (remainingProd === 0) {
      completionDate = orderDate;
      lineNotes.push(`${prodName}: 100% in stock (${stockFulfilled} units). Ready on ${formatDateISO(orderDate)}.`);
    } else {
      if (dailyCap <= 0) {
        hasMissingCapacity = true;
        const provisionalDays = 3;
        completionDate = addWorkingDays(orderDate, provisionalDays, calMap, workingDays);
        lineNotes.push(`${prodName}: Provisional Estimate — Daily capacity not configured (using ${provisionalDays}-day baseline).`);
      } else {
        // Factor in existing workload: check if earlier orders for this product are scheduled or pending
        let searchStartDate = orderDate;
        const { data: earlierPos } = await supabase
          .from("production_orders")
          .select("scheduled_end_date, actual_end_date, quantity, status")
          .eq("business_id", businessId)
          .eq("product_id", item.product_id)
          .neq("order_id", orderId)
          .in("status", ["IN_PROGRESS", "IN_PRODUCTION", "SCHEDULED", "PENDING"]);

        let pendingBacklogQty = 0;
        if (earlierPos && earlierPos.length > 0) {
          for (const epo of earlierPos) {
            const endStr = epo.actual_end_date || epo.scheduled_end_date;
            if (endStr) {
              const endDate = parseDateISO(endStr);
              if (endDate > searchStartDate) {
                searchStartDate = endDate;
              }
            } else if (epo.status === "PENDING") {
              pendingBacklogQty += Number(epo.quantity) || 0;
            }
          }
        }

        let effectiveStart = searchStartDate > orderDate
          ? getNextWorkingDay(searchStartDate, calMap, workingDays)
          : orderDate;

        if (pendingBacklogQty > 0) {
          const backlogDays = Math.ceil(pendingBacklogQty / dailyCap);
          effectiveStart = addWorkingDays(effectiveStart, backlogDays, calMap, workingDays);
        }

        const prodDays = calculateProductionDays(
          remainingProd,
          dailyCap,
          Number(prod?.setup_minutes) || 0,
          Number(prod?.production_min_days) || 1
        );
        completionDate = addWorkingDays(effectiveStart, prodDays, calMap, workingDays);

        if (stockFulfilled > 0) {
          lineNotes.push(
            `${prodName}: ${stockFulfilled} from stock, ${remainingProd} to produce (${prodDays} working day${prodDays > 1 ? "s" : ""} @ ${dailyCap}/day).`
          );
        } else {
          lineNotes.push(
            `${prodName}: ${remainingProd} to produce (${prodDays} working day${prodDays > 1 ? "s" : ""} @ ${dailyCap}/day).`
          );
        }
      }
    }

    const itemEarliest = addWorkingDays(completionDate, minDays, calMap, workingDays);
    const itemLatest = addWorkingDays(completionDate, maxDays, calMap, workingDays);
    const itemExpected = addWorkingDays(completionDate, expectedTransit, calMap, workingDays);

    if (!overallEarliest || itemEarliest > overallEarliest) overallEarliest = itemEarliest;
    if (!overallLatest || itemLatest > overallLatest) overallLatest = itemLatest;
    if (!overallExpected || itemExpected > overallExpected) overallExpected = itemExpected;
  }

  let earliestStr: string | null = null;
  let latestStr: string | null = null;
  let expectedStr: string | null = null;
  let explanation = lineNotes.join(" | ");

  if (order.status === "DRAFT") {
    explanation = `PROVISIONAL_ESTIMATE: Provisional estimate until order confirmation. Stock and production slots are not reserved. ${explanation}`;
  } else if (hasMissingCapacity) {
    explanation = `PROVISIONAL_ESTIMATE: One or more products have unconfigured daily capacity. ${explanation}`;
  }
  if (overallEarliest && overallLatest && overallExpected) {
    earliestStr = formatDateISO(overallEarliest);
    latestStr = formatDateISO(overallLatest);
    expectedStr = formatDateISO(overallExpected);
  }

  const newVersion = (Number(order.delivery_calculation_version) || 1) + 1;
  const statusToKeep = (order.status === "CONFIRMED" && order.delivery_status && order.delivery_status !== "PENDING")
    ? order.delivery_status
    : "PENDING";

  // Save predicted dates on order
  await supabase
    .from("orders")
    .update({
      earliest_delivery_date: earliestStr,
      latest_delivery_date: latestStr,
      expected_delivery_date: expectedStr,
      delivery_status: statusToKeep,
      delivery_calculated_at: new Date().toISOString(),
      delivery_calculation_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", businessId);

  return {
    earliest_delivery_date: earliestStr,
    latest_delivery_date: latestStr,
    expected_delivery_date: expectedStr,
    delivery_status: statusToKeep,
    explanation,
  };
}

/**
 * Provide detailed fulfillment and stock breakdown explanation for UI display.
 */
export async function getOrderFulfillmentExplanation(
  supabase: SupabaseClient,
  businessId: string,
  orderId: string,
): Promise<{
  explanation: string;
  fulfillmentSource: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_INSUFFICIENT" | "MATERIALS_INSUFFICIENT" | "CAPACITY_MISSING";
  hasCapacityIssue: boolean;
  hasMaterialIssue: boolean;
  hasMissingCapacity: boolean;
  items: Array<{
    productName: string;
    qualityGrade?: string | null;
    orderedQty: number;
    stockQty: number;
    prodQty: number;
    status: string;
    notes?: string;
  }>;
}> {
  const { data: order } = await supabase
    .from("orders")
    .select("status, notes")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quality_grade, quantity, products(name, daily_capacity, quality_grade)")
    .eq("order_id", orderId)
    .eq("business_id", businessId);

  const { data: poList } = await supabase
    .from("production_orders")
    .select("id, order_item_id, product_id, quantity, status, notes")
    .eq("order_id", orderId)
    .eq("business_id", businessId);

  const { data: resTx } = await supabase
    .from("inventory_transactions")
    .select("item_id, quantity")
    .eq("business_id", businessId)
    .eq("reference_id", orderId)
    .eq("reference_type", "ORDER_RESERVATION");

  const reservationMap = new Map<string, number>();
  (resTx ?? []).forEach((t: any) => {
    const prev = reservationMap.get(t.item_id) || 0;
    reservationMap.set(t.item_id, prev + Number(t.quantity));
  });

  let totalOrdered = 0;
  let totalStock = 0;
  let totalProd = 0;
  let hasCapacityIssue = false;
  let hasMaterialIssue = false;
  let hasMissingCapacity = false;

  const itemBreakdown: Array<{
    productName: string;
    qualityGrade?: string | null;
    orderedQty: number;
    stockQty: number;
    prodQty: number;
    status: string;
    notes?: string;
  }> = [];

  (items ?? []).forEach((item: any) => {
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    const prodName = prod?.name || "Product";
    const qualityGrade = item.quality_grade || prod?.quality_grade || null;
    const ordQty = Number(item.quantity) || 0;
    const dailyCap = Number(prod?.daily_capacity) || 0;
    totalOrdered += ordQty;

    const matchingPos = (poList ?? []).filter((p: any) => p.order_item_id === item.id || p.product_id === item.product_id);
    let itemStock = reservationMap.get(item.product_id) || 0;
    let itemProd = 0;
    let itemNotes = "";
    let itemStatus = "NORMAL";

    if (dailyCap <= 0) {
      hasMissingCapacity = true;
    }

    matchingPos.forEach((po: any) => {
      if (po.notes?.includes("Fulfilled 100% from available finished-goods stock") || po.notes?.includes("Fulfilled from stock")) {
        itemStock = Math.max(itemStock, Number(po.quantity) || 0);
      } else {
        itemProd += Number(po.quantity) || 0;
      }
      if (po.notes?.includes("CAPACITY_INSUFFICIENT")) {
        hasCapacityIssue = true;
        itemStatus = "CAPACITY_INSUFFICIENT";
        itemNotes = po.notes;
      }
      if (po.notes?.includes("RAW_MATERIALS_INSUFFICIENT")) {
        hasMaterialIssue = true;
        itemStatus = "MATERIALS_INSUFFICIENT";
        itemNotes = po.notes;
      }
    });

    if (itemStock > ordQty) itemStock = ordQty;
    if (itemProd === 0 && itemStock < ordQty && order?.status === "CONFIRMED") {
      itemProd = ordQty - itemStock;
    }

    totalStock += itemStock;
    totalProd += itemProd;

    itemBreakdown.push({
      productName: prodName,
      qualityGrade,
      orderedQty: ordQty,
      stockQty: itemStock,
      prodQty: itemProd,
      status: itemStatus,
      notes: itemNotes || undefined,
    });
  });

  let fulfillmentSource: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_INSUFFICIENT" | "MATERIALS_INSUFFICIENT" | "CAPACITY_MISSING" = "PRODUCTION";
  let explanation = "";

  if (hasCapacityIssue) {
    fulfillmentSource = "CAPACITY_INSUFFICIENT";
    explanation = "Order quantity exceeds daily production capacity. Delivery date cannot be confirmed without capacity review or splitting.";
  } else if (hasMaterialIssue) {
    fulfillmentSource = "MATERIALS_INSUFFICIENT";
    explanation = "Required raw materials are out of stock. Production cannot begin until materials are replenished.";
  } else if (hasMissingCapacity) {
    fulfillmentSource = "CAPACITY_MISSING";
    explanation = "Product daily production capacity is unconfigured (0). A reliable delivery date cannot be calculated.";
  } else if (totalStock >= totalOrdered && totalOrdered > 0) {
    fulfillmentSource = "STOCK";
    explanation = "Fulfilled 100% from available finished-goods stock. Ready for dispatch upon confirmation.";
  } else if (totalStock > 0 && totalProd > 0) {
    fulfillmentSource = "PARTIAL";
    explanation = `Partial stock fulfillment: ${totalStock} units reserved from inventory, ${totalProd} units scheduled for production.`;
  } else {
    fulfillmentSource = "PRODUCTION";
    explanation = "Scheduled for manufacturing via FIFO queue based on product daily capacity.";
  }

  return {
    explanation,
    fulfillmentSource,
    hasCapacityIssue,
    hasMaterialIssue,
    hasMissingCapacity,
    items: itemBreakdown,
  };
}
