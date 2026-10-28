import { redirect } from "next/navigation";
import { cache } from "react";
import { cookies } from "next/headers";
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

export function invalidateAuthCache(authUserId?: string) {
  if (authUserId) {
    authCache.delete(authUserId);
  } else {
    authCache.clear();
  }
}

export function setCachedAuthContext(authUserId: string, context: AuthContext) {
  authCache.set(authUserId, { context, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function extractUserIdFromCookie(raw: string): { userId: string; exp: number } | null {
  try {
    let str = raw;
    if (str.startsWith("base64-")) {
      str = Buffer.from(str.slice(7), "base64url").toString("utf8");
    }
    const parsed = JSON.parse(str);
    const token =
      typeof parsed === "string"
        ? parsed
        : parsed.access_token || (Array.isArray(parsed) ? parsed[0] : null);

    if (token && typeof token === "string") {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        if (payload?.sub) {
          return { userId: String(payload.sub), exp: Number(payload.exp || 0) };
        }
      }
    }

    if (parsed.user?.id) {
      return { userId: String(parsed.user.id), exp: Number(parsed.expires_at || 0) };
    }
    return null;
  } catch {
    return null;
  }
}

export function getRawAuthCookie(allCookies: { name: string; value: string }[]): string | null {
  const baseCookie = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (baseCookie) return baseCookie.value;

  const chunk0 = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token.0")
  );
  if (chunk0) {
    const baseName = chunk0.name.replace(/\.0$/, "");
    let combined = "";
    for (let i = 0; ; i++) {
      const chunk = allCookies.find((c) => c.name === `${baseName}.${i}`);
      if (!chunk) break;
      combined += chunk.value;
    }
    return combined || null;
  }
  return null;
}

export async function fetchAuthContextForUser(
  authUserId: string,
  fallbackSupabase?: any
): Promise<AuthContext | null> {
  const admin = createAdminSupabaseClient() || fallbackSupabase;
  if (!admin) return null;

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
    .eq("auth_user_id", authUserId)
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
    authUserId,
    user: profile,
    role,
    roleKey: role ? normalizeRoleKey(role.name) : null,
    permissions: [...new Set(permissions)],
    businessName,
  };

  return result;
}

export const getAuthContext = cache(async function getAuthContext(): Promise<AuthContext | null> {
  const now = Date.now();

  // 1. Fast Path: inspect incoming session cookie directly (0.01ms, zero remote network calls)
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const rawCookie = getRawAuthCookie(allCookies);
    if (rawCookie) {
      const cookieUser = extractUserIdFromCookie(rawCookie);
      if (cookieUser && cookieUser.exp * 1000 > now) {
        const cached = authCache.get(cookieUser.userId);
        if (cached && cached.expiresAt > now) {
          return cached.context;
        }

        // Cache miss: resolve user context from DB directly without Supabase GoTrue network roundtrip
        const supabase = await createServerSupabaseClient();
        const context = await fetchAuthContextForUser(cookieUser.userId, supabase);
        if (context) {
          authCache.set(cookieUser.userId, { context, expiresAt: now + CACHE_TTL_MS });
          return context;
        }
      }
    }
  } catch {
    // Fall back to standard flow if cookie reading encounters unexpected state
  }

  // 2. Fallback Path: standard Supabase Auth user check
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const userId = authData.user.id;
  const cached = authCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.context;
  }

  const context = await fetchAuthContextForUser(userId, supabase);
  if (context) {
    authCache.set(userId, { context, expiresAt: now + CACHE_TTL_MS });
  }
  return context;
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