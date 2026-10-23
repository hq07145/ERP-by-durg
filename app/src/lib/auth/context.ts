import { redirect } from "next/navigation";
import { cache } from "react";
import type { AppRole, AppUser } from "@/types/business";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AuthContext = {
  authUserId: string;
  user: AppUser;
  role: AppRole | null;
  roleKey: string | null;
  permissions: string[];
  businessName?: string;
};

export function normalizeRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

interface CachedContext {
  context: AuthContext;
  expiresAt: number;
}

const authCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateAuthCache(authUserId?: string) {
  if (authUserId) {
    authCache.delete(authUserId);
  } else {
    authCache.clear();
  }
}

export const getAuthContext = cache(async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const userId = authData.user.id;
  const now = Date.now();
  const cached = authCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.context;
  }

  // Use server admin client to resolve role & permissions in a single unified PostgREST query
  const admin = createAdminSupabaseClient() || supabase;

  const { data: unified, error: uError } = await admin
    .from("users")
    .select(`
      id, business_id, auth_user_id, name, email, phone, status, created_at, updated_at,
      business:businesses(id, status, name, legal_name),
      user_roles(
        role:roles(
          id, business_id, name, description, created_at, updated_at,
          role_permissions(
            permission:permissions(module, action)
          )
        )
      ),
      user_permissions(
        allowed,
        permission:permissions(module, action)
      )
    `)
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (uError || !unified) return null;

  const profile: AppUser = {
    id: unified.id,
    business_id: unified.business_id,
    auth_user_id: unified.auth_user_id,
    name: unified.name,
    email: unified.email,
    phone: unified.phone,
    status: unified.status,
    created_at: unified.created_at,
    updated_at: unified.updated_at,
  };

  const business = Array.isArray(unified.business) ? unified.business[0] : unified.business;
  if (profile.status !== "ACTIVE" || business?.status !== "ACTIVE") {
    return null;
  }

  const userRoleRecord = Array.isArray(unified.user_roles) ? unified.user_roles[0] : unified.user_roles;
  const rawRole = userRoleRecord?.role;
  const roleData = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as {
    id: string;
    business_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    role_permissions?: { permission: { module: string; action: string } | { module: string; action: string }[] | null }[];
  } | null | undefined;

  const role = roleData
    ? ({
        id: roleData.id,
        business_id: roleData.business_id,
        name: roleData.name,
        description: roleData.description,
        created_at: roleData.created_at,
        updated_at: roleData.updated_at,
      } as AppRole)
    : null;

  if (!role) return null;

  let permissions: string[] = [];
  const rolePermissions = roleData?.role_permissions ?? [];
  for (const rp of rolePermissions) {
    const perm = rp.permission;
    if (perm && typeof perm === "object" && !Array.isArray(perm)) {
      permissions.push(`${perm.module}.${perm.action}`);
    } else if (Array.isArray(perm) && perm[0]) {
      permissions.push(`${perm[0].module}.${perm[0].action}`);
    }
  }

  for (const entry of unified.user_permissions ?? []) {
    const perm = Array.isArray(entry.permission) ? entry.permission[0] : entry.permission;
    if (!perm) continue;
    const key = `${perm.module}.${perm.action}`;
    permissions = permissions.filter((p) => p !== key);
    if (entry.allowed) permissions.push(key);
  }

  const businessName = business?.legal_name || business?.name || "SANKALP IRRIGATION";

  const result: AuthContext = {
    authUserId: authData.user.id,
    user: profile,
    role,
    roleKey: role ? normalizeRoleKey(role.name) : null,
    permissions: [...new Set(permissions)],
    businessName,
  };

  authCache.set(userId, { context: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
});

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (context) return context;

  const supabase = await createServerSupabaseClient();
  await supabase?.auth.signOut();
  redirect("/login?error=account_unavailable");
}

export async function requirePermission(
  context: AuthContext,
  permission: string,
): Promise<void> {
  if (!hasPermission({ permissions: context.permissions }, permission)) {
    redirect("/?error=forbidden");
  }
}

export async function requireManagerAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    const supabase = await createServerSupabaseClient();
    await supabase?.auth.signOut();
    redirect("/manager/login?error=account_unavailable");
  }

  const roleNameLower = context.role?.name?.toLowerCase() ?? "";
  const isManager = context.roleKey === "manager" || roleNameLower.includes("manager");

  if (!isManager) {
    redirect("/manager/login?error=manager_role_required");
  }

  return context;
}