"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/context";

export type AuditAction =
  | "USER_INVITED"
  | "USER_ACCOUNT_UPDATED"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  | "PERMISSION_GRANTED"
  | "PERMISSION_REVOKED"
  | "BUSINESS_SETTINGS_UPDATED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_DELETED"
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_DELETED"
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_CANCELLED"
  | "ORDER_APPROVED"
  | "INVENTORY_ADJUSTED"
  | "MATERIAL_CREATED"
  | "MATERIAL_UPDATED"
  | "MATERIAL_DELETED"
  | "BOM_CREATED"
  | "BOM_UPDATED"
  | "PRODUCTION_STARTED"
  | "PRODUCTION_COMPLETED"
  | "PRODUCTION_DELAYED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_DELETED"
  | "REPORT_GENERATED"
  | "REPORT_EXPORTED"
  | string;

export type AuditEntityType =
  | "user"
  | "role"
  | "permission"
  | "business_settings"
  | "product"
  | "customer"
  | "order"
  | "inventory"
  | "raw_material"
  | "bom"
  | "production"
  | "payment"
  | "report"
  | string;

export interface AuditLogEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}

/**
 * Logs an audit entry using the service role client.
 * This function is designed to be called from Server Actions or API routes.
 * It requires an AuthContext to get the business_id and user_id.
 */
export async function logAudit(
  context: AuthContext,
  entry: AuditLogEntry
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminSupabaseClient();

  if (!admin) {
    return { success: false, error: "Admin client not configured" };
  }

  try {
    const { error } = await admin.from("audit_logs").insert({
      business_id: context.user.business_id,
      user_id: context.user.id,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
    });

    if (error) {
      console.error("Audit log insert error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Audit log exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Fetches audit logs for a business with optional filtering.
 */
export async function getAuditLogs(
  context: AuthContext,
  options?: {
    entityType?: AuditEntityType;
    entityId?: string;
    action?: AuditAction;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: unknown[] | null; error?: string }> {
  const admin = createAdminSupabaseClient();

  if (!admin) {
    return { data: null, error: "Admin client not configured" };
  }

  try {
    let query = admin
      .from("audit_logs")
      .select("*")
      .eq("business_id", context.user.business_id)
      .order("created_at", { ascending: false });

    if (options?.entityType) {
      query = query.eq("entity_type", options.entityType);
    }
    if (options?.entityId) {
      query = query.eq("entity_id", options.entityId);
    }
    if (options?.action) {
      query = query.eq("action", options.action);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? [], error: undefined };
  } catch (err) {
    console.error("Audit log fetch exception:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Logs a user invitation audit entry.
 */
export async function logUserInvited(
  context: AuthContext,
  invitedUserId: string,
  details: { name: string; email: string; roleId: string }
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: "USER_INVITED",
    entityType: "user",
    entityId: invitedUserId,
    newData: details,
  });
}

/**
 * Logs a user account update audit entry.
 */
export async function logUserAccountUpdated(
  context: AuthContext,
  targetUserId: string,
  oldData: { status: string; roleId: string | null },
  newData: { status: string; roleId: string }
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: "USER_ACCOUNT_UPDATED",
    entityType: "user",
    entityId: targetUserId,
    oldData,
    newData,
  });
}

/**
 * Logs a direct user creation audit entry.
 */
export async function logUserCreated(
  context: AuthContext,
  createdUserId: string,
  details: { name: string; email: string; roleId: string; roleName: string }
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: "USER_CREATED",
    entityType: "user",
    entityId: createdUserId,
    newData: details,
  });
}

/**
 * Logs a user permission changes audit entry with actor, target Manager, old/new permissions, and timestamp.
 */
export async function logUserPermissionsUpdated(
  context: AuthContext,
  targetUserId: string,
  details: {
    actor?: { id: string; name?: string; email?: string };
    targetManager?: { id: string; name?: string; email?: string };
    oldPermissions?: Record<string, boolean>;
    newPermissions?: Record<string, boolean>;
    targetName?: string;
    targetEmail?: string;
    overridesCount: number;
    grantedCount: number;
    revokedCount: number;
    overridesSummary?: Record<string, boolean>;
    timestamp?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const actor = details.actor ?? {
    id: context.user.id,
    email: context.user.email,
  };
  const targetManager = details.targetManager ?? {
    id: targetUserId,
    name: details.targetName,
    email: details.targetEmail,
  };

  return logAudit(context, {
    action: "USER_PERMISSIONS_UPDATED",
    entityType: "user",
    entityId: targetUserId,
    oldData: {
      targetManager,
      permissions: details.oldPermissions ?? {},
    },
    newData: {
      actor,
      targetManager,
      permissions: details.newPermissions ?? details.overridesSummary ?? {},
      overridesCount: details.overridesCount,
      grantedCount: details.grantedCount,
      revokedCount: details.revokedCount,
      timestamp: details.timestamp ?? new Date().toISOString(),
    },
  });
}

/**
 * Logs a business settings update audit entry.
 */
export async function logBusinessSettingsUpdated(
  context: AuthContext,
  key: string,
  oldValue: unknown,
  newValue: unknown
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: "BUSINESS_SETTINGS_UPDATED",
    entityType: "business_settings",
    entityId: key,
    oldData: { key, value: oldValue },
    newData: { key, value: newValue },
  });
}

/**
 * Logs a password reset request or direct update without logging passwords or secrets.
 */
export async function logPasswordReset(
  context: AuthContext,
  targetUserId: string,
  details: {
    targetEmail: string;
    targetName?: string;
    mode: "direct" | "recovery_email";
  }
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "user",
    entityId: targetUserId,
    newData: {
      actorId: context.user.id,
      actorEmail: context.user.email,
      targetUserId,
      targetEmail: details.targetEmail,
      mode: details.mode,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Logs an account deletion / deactivation audit entry with actor, target user, strategy, and reason.
 */
export async function logUserDeleted(
  context: AuthContext,
  targetUserId: string,
  details: {
    targetName: string;
    targetEmail: string;
    targetRole?: string;
    deletionStrategy: "hard_delete" | "soft_delete";
    reason?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return logAudit(context, {
    action: details.deletionStrategy === "hard_delete" ? "USER_DELETED" : "USER_DEACTIVATED",
    entityType: "user",
    entityId: targetUserId,
    oldData: {
      name: details.targetName,
      email: details.targetEmail,
      role: details.targetRole,
    },
    newData: {
      actorId: context.user.id,
      actorEmail: context.user.email,
      targetUserId,
      targetName: details.targetName,
      targetEmail: details.targetEmail,
      targetRole: details.targetRole,
      deletionStrategy: details.deletionStrategy,
      reason: details.reason || "Admin account deletion",
      timestamp: new Date().toISOString(),
    },
  });
}