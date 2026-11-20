"use server";

import { redirect } from "next/navigation";
import { getAuthContext, normalizeRoleKey } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  Notification,
  NotificationType,
  NotificationRefType,
  NotificationListParams,
  NotificationListResult,
  CreateNotificationParams,
} from "@/types/notification";

// ============================================
// NOTIFICATION SERVICE - Server Actions
// ============================================

/**
 * Get user notifications with pagination and business isolation
 */
export async function getNotifications(
  params: NotificationListParams = {}
): Promise<NotificationListResult> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { limit = 50, offset = 0, unread_only = false } = params;

  // Try RPC first
  const { data: notifications, error } = await supabase.rpc("get_user_notifications", {
    p_user_id: context.user.id,
    p_limit: limit,
    p_offset: offset,
    p_unread_only: unread_only,
  });

  if (!error && notifications) {
    const { data: unreadCount } = await supabase.rpc("get_unread_notification_count", {
      p_user_id: context.user.id,
    });

    const notifArray = (notifications as unknown as Notification[]) ?? [];
    return {
      notifications: notifArray,
      total_count: notifArray.length,
      unread_count: (unreadCount as number) ?? 0,
    };
  }

  // Fallback direct query with strict user_id and business_id isolation + 24h retention window
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("business_id", context.user.business_id)
    .eq("user_id", context.user.id)
    .gt("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unread_only) {
    query = query.eq("is_read", false);
  }

  const { data, count, error: directErr } = await query;
  if (directErr) throw directErr;

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("business_id", context.user.business_id)
    .eq("user_id", context.user.id)
    .gt("created_at", cutoffIso)
    .eq("is_read", false);

  return {
    notifications: (data as Notification[]) ?? [],
    total_count: count ?? 0,
    unread_count: unreadCount ?? 0,
  };
}

/**
 * Get unread notification count for bell badge
 */
export async function getUnreadCount(): Promise<number> {
  const context = await getAuthContext();
  if (!context) return 0;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase.rpc("get_unread_notification_count", {
    p_user_id: context.user.id,
  });

  if (!error && typeof data === "number") {
    return data;
  }

  // Direct query fallback with 24h retention window
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("business_id", context.user.business_id)
    .eq("user_id", context.user.id)
    .gt("created_at", cutoffIso)
    .eq("is_read", false);

  return count ?? 0;
}

/**
 * Mark a single notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<{ success: boolean }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
    p_user_id: context.user.id,
  });

  if (!error && typeof data === "boolean") {
    return { success: data };
  }

  // Direct query fallback
  const { error: updateErr } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", context.user.id)
    .eq("business_id", context.user.business_id);

  if (updateErr) throw updateErr;
  return { success: true };
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<{ count: number }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("mark_all_notifications_read", {
    p_user_id: context.user.id,
  });

  if (!error && typeof data === "number") {
    return { count: data };
  }

  // Direct query fallback
  const { data: updated, error: updateErr } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("business_id", context.user.business_id)
    .eq("is_read", false)
    .select("id");

  if (updateErr) throw updateErr;
  return { count: updated?.length ?? 0 };
}

/**
 * Create a notification with database-level idempotent deduplication.
 * Uses event identity (event_type, entity_type, entity_id, event_version, idempotency_key).
 * Atomic upsert prevents duplicate creation across concurrent requests, retries, and dual code paths.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<{ id: string | null; error?: string }> {
  // Use admin client if available to bypass RLS cross-user visibility barriers
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;

  if (!supabase) return { id: null, error: "Supabase client not available" };

  try {
    const eventType = params.event_type || params.type;
    const entityType = params.entity_type || params.ref_type;
    const entityId = params.entity_id || params.ref_id;
    const eventVersion = params.event_version || "1";
    const idempotencyKey =
      params.idempotency_key ||
      `${eventType}:${entityType}:${entityId}:${eventVersion}`;

    // 1. Try atomic RPC insertion
    const { data, error } = await supabase.rpc("create_notification", {
      p_business_id: params.business_id,
      p_user_id: params.user_id,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_ref_type: params.ref_type,
      p_ref_id: params.ref_id,
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_event_version: eventVersion,
      p_idempotency_key: idempotencyKey,
    });

    if (!error && data) {
      return { id: data as string, error: undefined };
    }

    // 2. Fallback direct upsert with database UNIQUE constraint conflict target
    const { data: upserted, error: upsertErr } = await supabase
      .from("notifications")
      .upsert(
        {
          business_id: params.business_id,
          user_id: params.user_id,
          type: params.type,
          title: params.title,
          message: params.message,
          ref_type: params.ref_type,
          ref_id: params.ref_id,
          event_type: eventType,
          entity_type: entityType,
          entity_id: entityId,
          event_version: eventVersion,
          idempotency_key: idempotencyKey,
          is_read: false,
        },
        { onConflict: "business_id,user_id,idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (upsertErr) {
      // If error was due to constraint or duplicate, query existing
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("business_id", params.business_id)
        .eq("user_id", params.user_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existing?.id) {
        return { id: existing.id, error: undefined };
      }
      return { id: null, error: upsertErr.message };
    }

    if (upserted?.id) {
      return { id: upserted.id, error: undefined };
    }

    // Upsert ignored duplicate row, fetch existing ID
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("business_id", params.business_id)
      .eq("user_id", params.user_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    return { id: existing?.id || null, error: undefined };
  } catch (err: any) {
    return { id: null, error: err.message || "Failed to create notification" };
  }
}

/**
 * Get users who should be notified for a specific permission.
 * Resolves permissions via (module, action), joins roles via user_roles,
 * filters active users in the given business, and honors user_permissions overrides.
 */
export async function getUsersToNotify(
  businessId: string,
  permissionName: string,
  excludeUserId?: string
): Promise<string[]> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  if (!supabase) return [];

  try {
    const parts = permissionName.split(".");
    const targetModule = parts[0];
    const action = parts[1] || "view";

    // 1. Get permission ID
    const { data: permData } = await supabase
      .from("permissions")
      .select("id")
      .eq("module", targetModule)
      .eq("action", action)
      .maybeSingle();

    const authorizedUserIds = new Set<string>();

    if (permData?.id) {
      // 2. Roles having this permission
      const { data: roleData } = await supabase
        .from("role_permissions")
        .select("role_id")
        .eq("permission_id", permData.id);

      const roleIds = (roleData ?? []).map(r => r.role_id);

      if (roleIds.length > 0) {
        // 3. Active users assigned to these roles in this business via user_roles
        const { data: userRoleData } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("business_id", businessId)
          .in("role_id", roleIds);

        const candidateIds = (userRoleData ?? []).map(ur => ur.user_id);

        if (candidateIds.length > 0) {
          const { data: activeUsers } = await supabase
            .from("users")
            .select("id")
            .eq("business_id", businessId)
            .eq("status", "ACTIVE")
            .in("id", candidateIds);

          (activeUsers ?? []).forEach(u => authorizedUserIds.add(u.id));
        }
      }

      // 4. Check user_permissions direct overrides
      const { data: directOverrides } = await supabase
        .from("user_permissions")
        .select("user_id, allowed")
        .eq("permission_id", permData.id);

      (directOverrides ?? []).forEach(o => {
        if (o.allowed) {
          authorizedUserIds.add(o.user_id);
        } else {
          authorizedUserIds.delete(o.user_id);
        }
      });
    }

    // 5. Fallback safety: if no role/permission matched, notify all active business admins
    if (authorizedUserIds.size === 0) {
      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("business_id", businessId)
        .eq("status", "ACTIVE")
        .limit(10);

      (admins ?? []).forEach(u => authorizedUserIds.add(u.id));
    }

    let result = Array.from(authorizedUserIds);
    if (excludeUserId) {
      // Business Rule (Option B): Super Admin must receive all authorized operational notifications,
      // even when Super Admin performs the triggering action.
      // Acting Managers, Staff, Supervisors, and unknown roles strictly retain normal actor-exclusion behavior.
      // Strict role identification: requires exact match to canonical role name ("Super Admin"),
      // canonical role key ("super_admin"), or canonical role UUID ("22222222-2222-4222-8222-222222222222").
      const CANONICAL_SUPER_ADMIN_ROLE_NAME = "Super Admin";
      const CANONICAL_SUPER_ADMIN_ROLE_KEY = "super_admin";
      const CANONICAL_SUPER_ADMIN_ROLE_ID = "22222222-2222-4222-8222-222222222222";

      const { data: actorRoles } = await supabase
        .from("user_roles")
        .select("role_id, role:roles(id, name)")
        .eq("user_id", excludeUserId)
        .eq("business_id", businessId);

      const isActorSuperAdmin = (actorRoles ?? []).some((ur: any) => {
        const roleObj = Array.isArray(ur.role) ? ur.role[0] : ur.role;
        const roleName = roleObj?.name?.trim();
        const roleKey = roleName ? normalizeRoleKey(roleName) : null;
        return (
          roleKey === CANONICAL_SUPER_ADMIN_ROLE_KEY ||
          roleName === CANONICAL_SUPER_ADMIN_ROLE_NAME ||
          ur.role_id === CANONICAL_SUPER_ADMIN_ROLE_ID ||
          roleObj?.id === CANONICAL_SUPER_ADMIN_ROLE_ID
        );
      });

      if (!isActorSuperAdmin) {
        result = result.filter(id => id !== excludeUserId);
      }
    }
    return result;
  } catch (err) {
    console.error("Error in getUsersToNotify:", err);
    return [];
  }
}

/**
 * Broadcast notification to all authorized users
 */
/**
 * Broadcast notification to all authorized users with idempotent event identity
 */
export async function broadcastNotification(
  businessId: string,
  permissionName: string,
  type: NotificationType,
  title: string,
  message: string,
  refType: NotificationRefType,
  refId: string,
  excludeUserId?: string,
  eventIdentity?: {
    eventType?: string;
    entityType?: string;
    entityId?: string;
    eventVersion?: string;
    idempotencyKey?: string;
  }
): Promise<{ sent: number; failed: number }> {
  const userIds = await getUsersToNotify(businessId, permissionName, excludeUserId);

  let sent = 0;
  let failed = 0;

  const eventType = eventIdentity?.eventType || type;
  const entityType = eventIdentity?.entityType || refType;
  const entityId = eventIdentity?.entityId || refId;
  const eventVersion = eventIdentity?.eventVersion || "1";
  const idempotencyKey =
    eventIdentity?.idempotencyKey ||
    `${eventType}:${entityType}:${entityId}:${eventVersion}`;

  for (const userId of userIds) {
    const result = await createNotification({
      business_id: businessId,
      user_id: userId,
      type,
      title,
      message,
      ref_type: refType,
      ref_id: refId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      event_version: eventVersion,
      idempotency_key: idempotencyKey,
    });
    if (result.id) sent++;
    else failed++;
  }

  return { sent, failed };
}

// ============================================
// DOMAIN EVENT NOTIFIERS (Centralized Service)
// ============================================

/**
 * Notify on order events (creation, confirmation, cancellation)
 */
export async function notifyOrderEvent(
  businessId: string,
  orderId: string,
  orderNumber: string,
  eventType: "created" | "confirmed" | "cancelled",
  actorId?: string
): Promise<void> {
  const typeMap = {
    created: "ORDER_NEW",
    confirmed: "ORDER_CONFIRMED",
    cancelled: "ORDER_CANCELLED",
  } as const;

  const titleMap = {
    created: "New Order Created",
    confirmed: "Order Confirmed",
    cancelled: "Order Cancelled",
  } as const;

  const messageMap = {
    created: `Order #${orderNumber} has been created`,
    confirmed: `Order #${orderNumber} has been confirmed`,
    cancelled: `Order #${orderNumber} has been cancelled`,
  } as const;

  const notifType = typeMap[eventType];

  await broadcastNotification(
    businessId,
    "orders.view",
    notifType,
    titleMap[eventType],
    messageMap[eventType],
    "order",
    orderId,
    actorId,
    {
      eventType: notifType,
      entityType: "order",
      entityId: orderId,
      eventVersion: "1",
      idempotencyKey: `${notifType}:order:${orderId}:1`,
    }
  );
}

/**
 * Notify on production events (start, completion, delay)
 */
export async function notifyProductionEvent(
  businessId: string,
  productionOrderId: string,
  orderId: string,
  eventType: "started" | "completed" | "delayed",
  actorId?: string
): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  let orderNumber = "Order";

  if (supabase) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.order_number) orderNumber = `#${data.order_number}`;
  }

  const typeMap = {
    started: "PRODUCTION_STARTED",
    completed: "PRODUCTION_COMPLETED",
    delayed: "PRODUCTION_DELAYED",
  } as const;

  const titleMap = {
    started: "Production Started",
    completed: "Production Completed",
    delayed: "Production Delayed",
  } as const;

  const messageMap = {
    started: `Production for order ${orderNumber} has started`,
    completed: `Production for order ${orderNumber} has completed`,
    delayed: `Production for order ${orderNumber} has been delayed`,
  } as const;

  const notifType = typeMap[eventType];

  await broadcastNotification(
    businessId,
    "production.view",
    notifType,
    titleMap[eventType],
    messageMap[eventType],
    "production_order",
    productionOrderId,
    actorId,
    {
      eventType: notifType,
      entityType: "production_order",
      entityId: productionOrderId,
      eventVersion: "1",
      idempotencyKey: `${notifType}:production_order:${productionOrderId}:1`,
    }
  );
}

/**
 * Notify on failed quality check
 */
export async function notifyQualityCheckFailed(
  businessId: string,
  productionOrderId: string,
  orderId: string,
  notes: string | null,
  actorId?: string
): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  let orderNumber = "Order";

  if (supabase) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.order_number) orderNumber = `#${data.order_number}`;
  }

  await broadcastNotification(
    businessId,
    "production.view",
    "QUALITY_CHECK_FAILED",
    "Quality Check Failed",
    `Quality check failed for order ${orderNumber}: ${notes ?? "Defects identified during inspection"}`,
    "production_order",
    productionOrderId,
    actorId,
    {
      eventType: "QUALITY_CHECK_FAILED",
      entityType: "production_order",
      entityId: productionOrderId,
      eventVersion: "1",
      idempotencyKey: `QUALITY_CHECK_FAILED:production_order:${productionOrderId}:1`,
    }
  );
}

/**
 * Notify on delivery events (ready, dispatched, delivered)
 */
export async function notifyDeliveryEvent(
  businessId: string,
  deliveryId: string,
  orderId: string,
  eventType: "ready" | "dispatched" | "delivered",
  actorId?: string
): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  let orderNumber = "Order";

  if (supabase) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.order_number) orderNumber = `#${data.order_number}`;
  }

  const typeMap = {
    ready: "DELIVERY_READY",
    dispatched: "DELIVERY_DISPATCHED",
    delivered: "DELIVERY_DELIVERED",
  } as const;

  const titleMap = {
    ready: "Delivery Ready",
    dispatched: "Delivery Dispatched",
    delivered: "Delivery Completed",
  } as const;

  const messageMap = {
    ready: `Order ${orderNumber} is ready for dispatch`,
    dispatched: `Delivery for order ${orderNumber} has been dispatched`,
    delivered: `Delivery for order ${orderNumber} has been delivered successfully`,
  } as const;

  const notifType = typeMap[eventType];

  await broadcastNotification(
    businessId,
    "delivery.view",
    notifType,
    titleMap[eventType],
    messageMap[eventType],
    "delivery",
    deliveryId,
    actorId,
    {
      eventType: notifType,
      entityType: "delivery",
      entityId: deliveryId,
      eventVersion: "1",
      idempotencyKey: `${notifType}:delivery:${deliveryId}:1`,
    }
  );
}

/**
 * Notify on payment received
 */
export async function notifyPaymentReceived(
  businessId: string,
  paymentId: string,
  paymentNumber: string,
  amount: string | number,
  actorId?: string
): Promise<void> {
  const numAmount = Number(amount) || 0;
  const formattedAmount = `₹${numAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  await broadcastNotification(
    businessId,
    "payments.view",
    "PAYMENT_RECEIVED",
    "Payment Received",
    `Payment #${paymentNumber} of ${formattedAmount} has been received`,
    "payment",
    paymentId,
    actorId,
    {
      eventType: "PAYMENT_RECEIVED",
      entityType: "payment",
      entityId: paymentId,
      eventVersion: "1",
      idempotencyKey: `PAYMENT_RECEIVED:payment:${paymentId}:1`,
    }
  );
}

/**
 * Notify on goods return events (created, approved, rejected, cancelled)
 */
export async function notifyGoodsReturnEvent(
  businessId: string,
  returnId: string,
  returnNumber: string,
  orderNumber?: string | null,
  eventType: "created" | "approved" | "rejected" | "cancelled" = "created",
  actorId?: string
): Promise<void> {
  const titleMap = {
    created: "Goods Return Created",
    approved: "Goods Return Approved",
    rejected: "Goods Return Rejected",
    cancelled: "Goods Return Cancelled",
  } as const;

  const orderSuffix = orderNumber ? ` for Order #${orderNumber}` : "";

  const messageMap = {
    created: `Goods return #${returnNumber}${orderSuffix} has been recorded`,
    approved: `Goods return #${returnNumber}${orderSuffix} has been approved`,
    rejected: `Goods return #${returnNumber}${orderSuffix} has been rejected`,
    cancelled: `Goods return #${returnNumber}${orderSuffix} has been cancelled`,
  } as const;

  await broadcastNotification(
    businessId,
    "orders.view",
    "GOODS_RETURN",
    titleMap[eventType],
    messageMap[eventType],
    "goods_return",
    returnId,
    actorId,
    {
      eventType: `GOODS_RETURN_${eventType.toUpperCase()}`,
      entityType: "goods_return",
      entityId: returnId,
      eventVersion: eventType,
      idempotencyKey: `GOODS_RETURN:goods_return:${returnId}:${eventType}`,
    }
  );
}

/**
 * Notify on overdue payment
 */
export async function notifyPaymentOverdue(
  businessId: string,
  orderId: string,
  orderNumber: string,
  amountDue: string | number,
  dueDate: string,
  actorId?: string
): Promise<void> {
  const numDue = Number(amountDue) || 0;
  const formattedAmount = `₹${numDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  await broadcastNotification(
    businessId,
    "payments.view",
    "PAYMENT_OVERDUE",
    "Payment Overdue Alert",
    `Payment of ${formattedAmount} for order #${orderNumber} is overdue (due: ${dueDate})`,
    "order",
    orderId,
    actorId,
    {
      eventType: "PAYMENT_OVERDUE",
      entityType: "order",
      entityId: orderId,
      eventVersion: dueDate,
      idempotencyKey: `PAYMENT_OVERDUE:order:${orderId}:${dueDate}`,
    }
  );
}

/**
 * Notify on customer due / credit limit threshold
 */
export async function notifyCustomerDue(
  businessId: string,
  customerId: string,
  customerName: string,
  totalDue: string | number,
  actorId?: string
): Promise<void> {
  const numDue = Number(totalDue) || 0;
  const formattedAmount = `₹${numDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const today = new Date().toISOString().split("T")[0];

  await broadcastNotification(
    businessId,
    "customers.view",
    "CUSTOMER_DUE",
    "Customer Outstanding Due Alert",
    `Customer "${customerName}" has outstanding dues of ${formattedAmount}`,
    "customer",
    customerId,
    actorId,
    {
      eventType: "CUSTOMER_DUE",
      entityType: "customer",
      entityId: customerId,
      eventVersion: today,
      idempotencyKey: `CUSTOMER_DUE:customer:${customerId}:${today}`,
    }
  );
}

/**
 * Notify on capacity insufficient / bottleneck
 */
export async function notifyCapacityInsufficient(
  businessId: string,
  productionOrderId: string,
  orderId: string,
  reason: string,
  actorId?: string
): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  let orderNumber = "Order";

  if (supabase) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.order_number) orderNumber = `#${data.order_number}`;
  }

  await broadcastNotification(
    businessId,
    "production.view",
    "CAPACITY_INSUFFICIENT",
    "Production Capacity Insufficient",
    `Capacity bottleneck for ${orderNumber}: ${reason}`,
    "production_order",
    productionOrderId,
    actorId,
    {
      eventType: "CAPACITY_INSUFFICIENT",
      entityType: "production_order",
      entityId: productionOrderId,
      eventVersion: "1",
      idempotencyKey: `CAPACITY_INSUFFICIENT:production_order:${productionOrderId}:1`,
    }
  );
}

/**
 * Notify on low stock
 */
export async function notifyLowStock(
  businessId: string,
  materialId: string,
  materialName: string,
  availableStock: string | number,
  reorderLevel: string | number
): Promise<void> {
  await broadcastNotification(
    businessId,
    "inventory.view",
    "LOW_STOCK",
    "Low Stock Alert",
    `Raw material "${materialName}" is below reorder level (Available: ${availableStock}, Reorder: ${reorderLevel})`,
    "raw_material",
    materialId,
    undefined,
    {
      eventType: "LOW_STOCK",
      entityType: "raw_material",
      entityId: materialId,
      eventVersion: "1",
      idempotencyKey: `LOW_STOCK:raw_material:${materialId}:1`,
    }
  );
}

/**
 * Notify on material shortage for production
 */
export async function notifyMaterialShortage(
  businessId: string,
  productionOrderId: string,
  orderId: string,
  shortages: string[]
): Promise<void> {
  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;
  let orderNumber = "Order";

  if (supabase) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.order_number) orderNumber = `#${data.order_number}`;
  }

  await broadcastNotification(
    businessId,
    "production.view",
    "MATERIAL_SHORTAGE",
    "Material Shortage Alert",
    `Insufficient raw materials for ${orderNumber}: ${shortages.join("; ")}`,
    "production_order",
    productionOrderId,
    undefined,
    {
      eventType: "MATERIAL_SHORTAGE",
      entityType: "production_order",
      entityId: productionOrderId,
      eventVersion: "1",
      idempotencyKey: `MATERIAL_SHORTAGE:production_order:${productionOrderId}:1`,
    }
  );
}