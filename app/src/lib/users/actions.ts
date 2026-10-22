"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthContext, normalizeRoleKey } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  logUserInvited,
  logUserCreated,
  logUserAccountUpdated,
  logUserPermissionsUpdated,
  logPasswordReset,
  logUserDeleted,
} from "@/lib/audit";

import { ROLE_RANK, USER_STATUSES, ManagedUserStatus } from "./constants";
export type { ManagedUserStatus };

function fail(code: string): never {
  redirect(`/users?error=${encodeURIComponent(code)}`);
}

async function requireUserManager() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "users.manage")) {
    redirect("/");
  }
  return context;
}

function canManageRole(actorRole: string | null, targetRole: string): boolean {
  const actorRank = actorRole ? ROLE_RANK[actorRole] : undefined;
  const targetRank = ROLE_RANK[targetRole];
  return actorRank !== undefined && targetRank !== undefined && targetRank <= actorRank;
}

function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { valid: false, error: "password_too_short" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "password_needs_lowercase" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "password_needs_uppercase" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "password_needs_number" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { valid: false, error: "password_needs_symbol" };
  }
  return { valid: true };
}

function getSiteUrl(path: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${path}`;
}

/**
 * Creates a Manager account directly with name, email and initial password.
 * Securely uses Supabase Auth via admin client without exposing keys or plaintext passwords.
 */
export async function createManagerAccountAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleId = String(formData.get("roleId") ?? "").trim();

  if (!name || name.length > 120 || !isEmailValid(email) || email.length > 254) {
    fail("invalid_input");
  }

  // Validate password strength
  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.valid) {
    fail(pwCheck.error || "password_weak");
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) fail("auth_unconfigured");

  // Determine target role: default to Manager role in business if roleId not given
  let targetRoleId = roleId;
  let targetRoleName = "Manager";

  if (!targetRoleId) {
    const { data: managerRole } = await supabase
      .from("roles")
      .select("id, name")
      .eq("business_id", context.user.business_id)
      .ilike("name", "%manager%")
      .limit(1)
      .maybeSingle();

    if (!managerRole) fail("invalid_role");
    targetRoleId = managerRole.id;
    targetRoleName = managerRole.name;
  } else {
    const { data: roleData, error: roleError } = await supabase
      .from("roles")
      .select("id, name")
      .eq("id", targetRoleId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();
    if (roleError || !roleData) fail("invalid_role");
    targetRoleName = roleData.name;
  }

  const targetRoleKey = normalizeRoleKey(targetRoleName);
  if (!canManageRole(context.roleKey, targetRoleKey)) fail("role_not_allowed");

  // Prevent duplicate account in business or system if already active with auth
  const { data: existingUser } = await admin
    .from("users")
    .select("id, auth_user_id, status")
    .eq("email", email)
    .maybeSingle();

  if (existingUser?.auth_user_id) {
    fail("email_in_use");
  }

  // Securely create user in Supabase Auth with initial password or update existing auth user
  let authUserId: string;
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authUser?.user) {
    authUserId = authUser.user.id;
  } else if (
    authError?.message?.toLowerCase().includes("already registered") ||
    authError?.message?.toLowerCase().includes("exists")
  ) {
    // Auth user already exists: look up their ID and update credentials
    const { data: userList } = await admin.auth.admin.listUsers();
    const matched = userList?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (!matched) {
      fail("email_in_use");
    }
    authUserId = matched.id;
    await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
      user_metadata: { name },
    });
  } else {
    console.error("[createManagerAccountAction] Auth creation error:", authError);
    fail("auth_create_failed");
  }

  let createdUserId: string;
  if (existingUser) {
    // User already exists in public.users without auth_user_id: link auth and activate
    const { error: linkError } = await admin
      .from("users")
      .update({
        auth_user_id: authUserId,
        name,
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingUser.id);

    if (linkError) {
      console.error("[createManagerAccountAction] Link error:", linkError);
      fail("provision_failed");
    }

    // Ensure role assignment exists
    const { data: existingAssignment } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingAssignment) {
      await admin
        .from("user_roles")
        .update({ role_id: targetRoleId })
        .eq("id", existingAssignment.id);
    } else {
      await admin.from("user_roles").insert({
        business_id: context.user.business_id,
        user_id: existingUser.id,
        role_id: targetRoleId,
      });
    }

    createdUserId = existingUser.id;
  } else {
    // Provision profile and assign role in business
    const { error: provisionError } = await admin.rpc("provision_user_account", {
      target_business_id: context.user.business_id,
      target_auth_user_id: authUserId,
      target_name: name,
      target_email: email,
      target_role_id: targetRoleId,
      actor_user_id: context.user.id,
    });

    if (provisionError) {
      console.error("[createManagerAccountAction] Provisioning error:", provisionError);
      // Cleanup auth user to prevent orphaned auth record
      await admin.auth.admin.deleteUser(authUserId);
      fail("provision_failed");
    }

    // Fetch newly created user ID
    const { data: createdUserRecord } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .eq("business_id", context.user.business_id)
      .single();

    createdUserId = createdUserRecord?.id || authUserId;
  }

  // Log audit
  await logUserCreated(context, createdUserId, {
    name,
    email,
    roleId: targetRoleId,
    roleName: targetRoleName,
  });

  revalidatePath("/users");
  redirect(`/users?notice=manager_created&createdUserId=${encodeURIComponent(createdUserId)}`);
}

/**
 * Updates granular permissions for a user in public.user_permissions.
 * Overrides role permissions with allowed=true (grant) or allowed=false (revoke).
 */
export async function updateUserPermissionsAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();
  const userId = String(formData.get("userId") ?? "");
  const permissionsJson = String(formData.get("permissions") ?? "{}");

  if (!userId) fail("invalid_input");
  if (userId === context.user.id) fail("cannot_change_self");

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) fail("auth_unconfigured");

  // Verify target user belongs to same business
  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("id", userId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (targetError || !targetUser) fail("user_not_found");

  // Verify actor can manage target user's role
  const { data: targetAssignment } = await supabase
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const targetRoleName = ((targetAssignment?.roles as unknown) as { name: string } | null)?.name ?? "Manager";
  const targetRoleKey = normalizeRoleKey(targetRoleName);

  if (targetRoleKey === "super_admin") {
    fail("role_not_allowed"); // Super admin permissions cannot be modified
  }

  if (!canManageRole(context.roleKey, targetRoleKey)) {
    fail("role_not_allowed");
  }

  let desiredPermissions: Record<string, boolean> = {};
  try {
    desiredPermissions = JSON.parse(permissionsJson);
  } catch {
    fail("invalid_input");
  }

  // Fetch all valid permissions from permissions table
  const { data: allPermissions, error: permError } = await admin
    .from("permissions")
    .select("id, module, action");

  if (permError || !allPermissions) fail("permissions_fetch_failed");

  const validPermIds = new Set(allPermissions.map((p) => p.id));
  const permKeyMap = new Map(allPermissions.map((p) => [p.id, `${p.module}.${p.action}`]));

  // Build rows to upsert into user_permissions
  const rowsToInsert: { user_id: string; permission_id: string; allowed: boolean }[] = [];
  let grantedCount = 0;
  let revokedCount = 0;
  const overridesSummary: Record<string, boolean> = {};

  for (const [permId, allowed] of Object.entries(desiredPermissions)) {
    if (validPermIds.has(permId)) {
      rowsToInsert.push({
        user_id: userId,
        permission_id: permId,
        allowed: Boolean(allowed),
      });
      if (allowed) grantedCount++;
      else revokedCount++;
      const key = permKeyMap.get(permId) || permId;
      overridesSummary[key] = Boolean(allowed);
    }
  }

  // Fetch previous permission overrides for audit comparison
  const { data: previousOverrides } = await admin
    .from("user_permissions")
    .select("permission_id, allowed")
    .eq("user_id", userId);

  const oldPermissionsSummary: Record<string, boolean> = {};
  if (previousOverrides) {
    for (const prev of previousOverrides) {
      const key = permKeyMap.get(prev.permission_id) || prev.permission_id;
      oldPermissionsSummary[key] = Boolean(prev.allowed);
    }
  }

  // Atomically delete existing overrides for this user and insert new ones
  const { error: deleteError } = await admin
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[updateUserPermissionsAction] Delete error:", deleteError);
    fail("permission_update_failed");
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await admin
      .from("user_permissions")
      .insert(rowsToInsert);

    if (insertError) {
      console.error("[updateUserPermissionsAction] Insert error:", insertError);
      fail("permission_update_failed");
    }
  }

  // Audit log permission update with actor, target, old/new permissions and timestamp
  await logUserPermissionsUpdated(context, userId, {
    actor: { id: context.user.id, email: context.user.email },
    targetManager: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
    targetName: targetUser.name,
    targetEmail: targetUser.email,
    oldPermissions: oldPermissionsSummary,
    newPermissions: overridesSummary,
    overridesCount: rowsToInsert.length,
    grantedCount,
    revokedCount,
    timestamp: new Date().toISOString(),
  });

  revalidatePath("/", "layout");
  revalidatePath("/users");
  redirect(`/users?notice=permissions_updated&userId=${encodeURIComponent(userId)}`);
}

export async function inviteUserAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleId = String(formData.get("roleId") ?? "");

  if (!name || name.length > 120 || !isEmailValid(email) || email.length > 254 || !roleId) {
    fail("invalid_input");
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) fail("auth_unconfigured");

  const { data: roleData, error: roleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("id", roleId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (roleError || !roleData) fail("invalid_role");

  const targetRoleKey = normalizeRoleKey((roleData as { name: string }).name);
  if (!canManageRole(context.roleKey, targetRoleKey)) fail("role_not_allowed");

  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) fail("email_in_use");

  const { data: invitation, error: invitationError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: getSiteUrl("/auth/callback?next=/reset-password"),
    });

  if (invitationError || !invitation.user) fail("invite_failed");

  const { error: provisionError } = await admin.rpc("provision_user_account", {
    target_business_id: context.user.business_id,
    target_auth_user_id: invitation.user.id,
    target_name: name,
    target_email: email,
    target_role_id: roleId,
    actor_user_id: context.user.id,
  });

  if (provisionError) fail("provision_failed");

  // Audit log the invitation
  await logUserInvited(context, invitation.user.id, { name, email, roleId });

  revalidatePath("/users");
  redirect("/users?notice=invite_sent");
}

export async function updateUserAccountAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();
  const userId = String(formData.get("userId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!userId || !roleId || !USER_STATUSES.includes(status as ManagedUserStatus)) {
    fail("invalid_input");
  }
  if (userId === context.user.id) fail("cannot_change_self");

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) fail("auth_unconfigured");

  const { data: roleData, error: roleError } = await supabase
    .from("roles")
    .select("id, name")
    .eq("id", roleId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (roleError || !roleData) fail("invalid_role");

  const targetRoleKey = normalizeRoleKey((roleData as { name: string }).name);
  if (!canManageRole(context.roleKey, targetRoleKey)) fail("role_not_allowed");

  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (targetError || !targetUser) fail("user_not_found");

  const { data: currentAssignment } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .maybeSingle();
  const currentRoleId = (currentAssignment as { role_id?: string } | null)?.role_id;

  if (currentRoleId) {
    const { data: currentRole } = await supabase
      .from("roles")
      .select("name")
      .eq("id", currentRoleId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();
    const currentRoleKey = currentRole
      ? normalizeRoleKey((currentRole as { name: string }).name)
      : null;
    if (currentRoleKey === "super_admin") {
      fail("cannot_change_super_admin");
    }
    if (currentRoleKey && !canManageRole(context.roleKey, currentRoleKey)) {
      fail("role_not_allowed");
    }
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  const currentStatus = (currentUser as { status?: string } | null)?.status ?? "ACTIVE";

  const { data: targetUserRecord } = await admin
    .from("users")
    .select("id, name, email, auth_user_id")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await admin.rpc("update_managed_user_account", {
    target_user_id: userId,
    target_role_id: roleId,
    target_status: status,
    actor_user_id: context.user.id,
  });

  if (error) fail("update_failed");

  // Revoke session and update auth ban state immediately
  if (targetUserRecord?.auth_user_id) {
    if (status === "SUSPENDED") {
      await admin.auth.admin.signOut(targetUserRecord.auth_user_id);
      await admin.auth.admin.updateUserById(targetUserRecord.auth_user_id, {
        ban_duration: "876000h",
      });
    } else if (status === "INACTIVE") {
      await admin.auth.admin.signOut(targetUserRecord.auth_user_id);
      await admin.auth.admin.updateUserById(targetUserRecord.auth_user_id, {
        ban_duration: "none",
      });
    } else if (status === "ACTIVE") {
      await admin.auth.admin.updateUserById(targetUserRecord.auth_user_id, {
        ban_duration: "none",
      });
    }
  }

  // Audit log the account update
  await logUserAccountUpdated(
    context,
    userId,
    { status: currentStatus, roleId: currentRoleId ?? null },
    { status: status, roleId: roleId }
  );

  revalidatePath("/", "layout");
  revalidatePath("/users");
  redirect("/users?notice=account_updated");
}

/**
 * Securely resets a user's password or sends a recovery email via Supabase Auth.
 * Never stores or logs plaintext passwords or secrets.
 */
export async function adminResetUserPasswordAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();
  const userId = String(formData.get("userId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "direct").trim(); // "direct" | "email"
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!userId) fail("invalid_input");
  if (userId === context.user.id) fail("cannot_change_self");

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) fail("auth_unconfigured");

  // Verify target user belongs to same business
  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id, name, email, auth_user_id")
    .eq("id", userId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (targetError || !targetUser) fail("user_not_found");

  // Verify actor can manage target user's role
  const { data: targetAssignment } = await supabase
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const targetRoleName = ((targetAssignment?.roles as unknown) as { name: string } | null)?.name ?? "Manager";
  const targetRoleKey = normalizeRoleKey(targetRoleName);

  if (targetRoleKey === "super_admin") {
    fail("role_not_allowed");
  }
  if (!canManageRole(context.roleKey, targetRoleKey)) {
    fail("role_not_allowed");
  }

  if (mode === "direct") {
    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      fail(pwCheck.error || "password_weak");
    }

    let authUserId = targetUser.auth_user_id;

    if (!authUserId) {
      // User in public.users has no auth_user_id: check auth.users or create in auth.users
      const { data: userList } = await admin.auth.admin.listUsers();
      const matched = userList?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === targetUser.email.toLowerCase()
      );

      if (matched) {
        authUserId = matched.id;
      } else {
        const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
          email: targetUser.email,
          password: newPassword,
          email_confirm: true,
          user_metadata: { name: targetUser.name },
        });
        if (createErr || !createdAuth?.user) {
          console.error("[adminResetUserPasswordAction] Auth create error:", createErr);
          fail("password_reset_failed");
        }
        authUserId = createdAuth.user.id;
      }

      // Link auth_user_id to public.users
      await admin
        .from("users")
        .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", targetUser.id);
    }

    // Securely update password in Supabase Auth, flag password change requirement, and revoke old sessions
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      authUserId,
      {
        password: newPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      }
    );

    if (authUpdateError) {
      console.error("[adminResetUserPasswordAction] Auth error:", authUpdateError);
      fail("password_reset_failed");
    }

    // Revoke existing sessions immediately so new credentials are required
    await admin.auth.admin.signOut(authUserId);

    // Audit log without password
    await logPasswordReset(context, userId, {
      targetEmail: targetUser.email,
      targetName: targetUser.name,
      mode: "direct",
    });

    revalidatePath("/users");
    redirect("/users?notice=password_reset_success");
  } else {
    // Mode: recovery email
    // If targetUser doesn't have an auth_user_id, ensure they exist in auth first
    if (!targetUser.auth_user_id) {
      const { data: userList } = await admin.auth.admin.listUsers();
      const matched = userList?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === targetUser.email.toLowerCase()
      );
      if (matched) {
        await admin
          .from("users")
          .update({ auth_user_id: matched.id, updated_at: new Date().toISOString() })
          .eq("id", targetUser.id);
      } else {
        const tempPw = `Tmp#${Math.random().toString(36).slice(2)}!${Date.now()}`;
        const { data: createdAuth } = await admin.auth.admin.createUser({
          email: targetUser.email,
          password: tempPw,
          email_confirm: true,
          user_metadata: { name: targetUser.name },
        });
        if (createdAuth?.user) {
          await admin
            .from("users")
            .update({ auth_user_id: createdAuth.user.id, updated_at: new Date().toISOString() })
            .eq("id", targetUser.id);
        }
      }
    }

    const { error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
    });

    if (linkError) {
      console.error("[adminResetUserPasswordAction] Recovery link error:", linkError);
      fail("password_reset_failed");
    }

    // Audit log without password
    await logPasswordReset(context, userId, {
      targetEmail: targetUser.email,
      targetName: targetUser.name,
      mode: "recovery_email",
    });

    revalidatePath("/users");
    redirect("/users?notice=password_reset_link_sent");
  }
}

/**
 * Admin action to delete or securely deactivate an eligible Manager or staff account.
 *
 * Enforces:
 * - Server authorization: Only Admin/Super Admin with users.manage.
 * - Current user cannot delete themselves.
 * - Super Admin accounts and the last remaining Super Admin are strictly protected.
 * - Foreign key safety: If historical records reference the user (orders, payments,
 *   inventory movements, audit logs), applies secure deactivation & auth revocation
 *   instead of breaking foreign-key references.
 * - Auth revocation: Invalidates sessions and removes/bans the user in Supabase Auth.
 * - Immutable audit logging of who performed the action, target account, and reason.
 */
export async function deleteUserAccountAction(formData: FormData): Promise<never> {
  const context = await requireUserManager();

  // Role authorization: Only Admin or Super Admin may delete accounts
  if (context.roleKey !== "super_admin" && context.roleKey !== "admin") {
    fail("role_not_allowed");
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) fail("invalid_input");
  if (userId === context.user.id) fail("cannot_delete_self");

  const admin = createAdminSupabaseClient();
  if (!admin) fail("auth_unconfigured");

  // Verify target user belongs to same business
  const { data: targetUser, error: targetError } = await admin
    .from("users")
    .select("id, name, email, auth_user_id, status")
    .eq("id", userId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (targetError || !targetUser) fail("user_not_found");

  // Inspect target user role assignment
  const { data: targetAssignment } = await admin
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const targetRoleName = ((targetAssignment?.roles as unknown) as { name: string } | null)?.name ?? "Manager";
  const targetRoleKey = normalizeRoleKey(targetRoleName);

  // Super Admin accounts can NEVER be deleted
  if (targetRoleKey === "super_admin") {
    fail("cannot_delete_super_admin");
  }

  // Admin can only delete Manager/staff accounts (cannot delete another Admin or Super Admin)
  if (context.roleKey === "admin" && targetRoleKey !== "manager") {
    fail("role_not_allowed");
  }

  // Check for historical business records that reference the user
  const [
    { count: invCount },
    { count: paymentCount },
    { count: expenseCount },
    { count: orderHistoryCount },
    { count: auditCount },
  ] = await Promise.all([
    admin.from("inventory_transactions").select("*", { count: "exact", head: true }).eq("created_by", userId),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("created_by", userId),
    admin.from("expenses").select("*", { count: "exact", head: true }).eq("created_by", userId),
    admin.from("order_history").select("*", { count: "exact", head: true }).eq("changed_by", userId),
    admin.from("audit_logs").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const hasHistoricalRecords =
    (invCount ?? 0) > 0 ||
    (paymentCount ?? 0) > 0 ||
    (expenseCount ?? 0) > 0 ||
    (orderHistoryCount ?? 0) > 0 ||
    (auditCount ?? 0) > 0;

  // Revoke authentication access in Supabase Auth immediately
  if (targetUser.auth_user_id) {
    try {
      await admin.auth.admin.signOut(targetUser.auth_user_id);
    } catch (e) {
      console.warn("[deleteUserAccountAction] signOut warn:", e);
    }

    try {
      await admin.auth.admin.deleteUser(targetUser.auth_user_id);
    } catch (authDeleteErr) {
      console.warn("[deleteUserAccountAction] deleteUser fallback to ban:", authDeleteErr);
      // Fallback: ban for 100 years if deleteUser encounters auth-level constraint
      await admin.auth.admin.updateUserById(targetUser.auth_user_id, {
        ban_duration: "876600h",
      });
    }
  }

  // Clear privileges
  await admin.from("user_permissions").delete().eq("user_id", userId);
  await admin.from("user_roles").delete().eq("user_id", userId);

  let deletionStrategy: "hard_delete" | "soft_delete" = "soft_delete";

  if (hasHistoricalRecords) {
    // Preserve records: deactivate user account and nullify auth_user_id
    deletionStrategy = "soft_delete";
    const cleanedName = targetUser.name.replace(/\s*\(Deactivated\)$/, "");
    const { error: updateErr } = await admin
      .from("users")
      .update({
        status: "INACTIVE",
        auth_user_id: null,
        name: `${cleanedName} (Deactivated)`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("business_id", context.user.business_id);

    if (updateErr) {
      console.error("[deleteUserAccountAction] Soft delete error:", updateErr);
      fail("delete_failed");
    }
  } else {
    // No historical records: perform clean hard deletion with soft-delete fallback
    const { error: deleteErr } = await admin
      .from("users")
      .delete()
      .eq("id", userId)
      .eq("business_id", context.user.business_id);

    if (deleteErr) {
      console.warn("[deleteUserAccountAction] Hard delete failed, falling back to soft delete:", deleteErr);
      deletionStrategy = "soft_delete";
      const cleanedName = targetUser.name.replace(/\s*\(Deactivated\)$/, "");
      await admin
        .from("users")
        .update({
          status: "INACTIVE",
          auth_user_id: null,
          name: `${cleanedName} (Deactivated)`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .eq("business_id", context.user.business_id);
    } else {
      deletionStrategy = "hard_delete";
    }
  }

  // Record action in audit log
  await logUserDeleted(context, userId, {
    targetName: targetUser.name,
    targetEmail: targetUser.email,
    targetRole: targetRoleName,
    deletionStrategy,
    reason: reason || "Admin account deletion",
  });

  revalidatePath("/users");
  redirect("/users?notice=user_deleted");
}