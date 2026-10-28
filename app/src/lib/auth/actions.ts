"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  getAuthContext,
  normalizeRoleKey,
  fetchAuthContextForUser,
  setCachedAuthContext,
  invalidateAuthCache,
  getRawAuthCookie,
  extractUserIdFromCookie,
} from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function siteUrl(path: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${path}`;
}

export async function signInAction(formData: FormData): Promise<never> {
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/login?error=invalid_credentials");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login?error=auth_unconfigured");

  const admin = createAdminSupabaseClient();

  // Resolve identifier: if not already an email, lookup user by UUID, phone, or email prefix
  let resolvedEmail = identifier.toLowerCase();
  if (!isValidEmail(resolvedEmail) && admin) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    let query = admin.from("users").select("id, email, auth_user_id, status");
    if (isUuid) {
      query = query.or(`id.eq.${identifier},auth_user_id.eq.${identifier}`);
    } else {
      query = query.or(`phone.eq.${identifier},email.ilike.${identifier}@%`);
    }
    const { data: matchedUser } = await query.limit(1).maybeSingle();
    if (matchedUser?.email) {
      resolvedEmail = matchedUser.email.toLowerCase();
    }
  }

  if (!isValidEmail(resolvedEmail)) {
    redirect("/login?error=invalid_credentials");
  }

  // Direct GoTrue authentication (single network round trip)
  let { data: authData, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  });

  const isEmailUnconfirmed =
    error &&
    (error.message?.toLowerCase().includes("email not confirmed") ||
      (error as unknown as { code?: string })?.code === "email_not_confirmed");

  if (isEmailUnconfirmed && admin) {
    const { data: profile } = await admin
      .from("users")
      .select("id, status, auth_user_id")
      .eq("email", resolvedEmail)
      .maybeSingle();

    if (profile && profile.status === "ACTIVE" && profile.auth_user_id) {
      await admin.auth.admin.updateUserById(profile.auth_user_id, {
        email_confirm: true,
      });

      const retryResult = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });
      authData = retryResult.data;
      error = retryResult.error;
    }
  }

  if (error || !authData?.user) redirect("/login?error=invalid_credentials");

  // Resolve unified context and pre-populate in-memory authCache so redirected page renders in 0ms
  const context = await fetchAuthContextForUser(authData.user.id, supabase);
  if (!context) {
    await supabase.auth.signOut();
    redirect("/login?error=account_unavailable");
  }

  setCachedAuthContext(authData.user.id, context);

  if (context.roleKey === "manager") {
    redirect("/manager/dashboard");
  }

  redirect("/");
}

export async function requestPasswordResetAction(formData: FormData): Promise<never> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) redirect("/forgot-password?error=invalid_email");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/forgot-password?error=auth_unconfigured");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl("/auth/callback?next=/reset-password"),
  });

  redirect(error ? "/forgot-password?error=request_failed" : "/forgot-password?sent=1");
}

export async function updatePasswordAction(formData: FormData): Promise<never> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12) redirect("/reset-password?error=password_too_short");
  if (password !== confirmation) redirect("/reset-password?error=password_mismatch");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/reset-password?error=auth_unconfigured");
  if (!(await getAuthContext())) redirect("/login?error=reset_session_required");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=update_failed");
  redirect("/?notice=password_updated");
}

export async function signOutAction(): Promise<never> {
  let isManager = false;
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const rawCookie = getRawAuthCookie(allCookies);
    const cookieUser = rawCookie ? extractUserIdFromCookie(rawCookie) : null;
    if (cookieUser) {
      invalidateAuthCache(cookieUser.userId);
    } else {
      invalidateAuthCache();
    }

    try {
      const current = await getAuthContext();
      isManager = current?.roleKey === "manager";
    } catch {
      // Ignore
    }

    // Immediately remove auth cookies so session is destroyed locally in 0ms
    for (const c of allCookies) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        cookieStore.delete(c.name);
      }
    }
  } catch (err) {
    console.error("SignOut error:", err);
  }

  // Non-blocking background session revoke
  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      void supabase.auth.signOut().catch(() => {});
    }
  } catch {
    // Non-blocking
  }

  if (isManager) {
    redirect("/manager/login?notice=signed_out");
  }
  redirect("/login?notice=signed_out");
}

export async function managerSignInAction(formData: FormData): Promise<never> {
  const rawIdentifier = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Safe normalization: strip zero-width spaces/BOM, trim surrounding whitespace
  const identifier = rawIdentifier.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!identifier || !password) {
    redirect("/manager/login?error=invalid_credentials");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    redirect("/manager/login?error=auth_unconfigured");
  }

  const admin = createAdminSupabaseClient();

  // Resolve identifier: if not already an email, lookup user by UUID, phone, or email prefix
  let resolvedEmail = identifier.toLowerCase();
  if (!isValidEmail(resolvedEmail) && admin) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    let query = admin.from("users").select("id, email, auth_user_id, status");
    if (isUuid) {
      query = query.or(`id.eq.${identifier},auth_user_id.eq.${identifier}`);
    } else {
      query = query.or(`phone.eq.${identifier},email.ilike.${identifier}@%`);
    }
    const { data: matchedUser } = await query.limit(1).maybeSingle();
    if (matchedUser?.email) {
      resolvedEmail = matchedUser.email.toLowerCase().trim();
    }
  }

  if (!isValidEmail(resolvedEmail)) {
    redirect("/manager/login?error=invalid_credentials");
  }

  // Pre-check: inspect application profile to distinguish inactive or unprovisioned accounts
  if (admin) {
    const { data: existingProfile } = await admin
      .from("users")
      .select("id, status, auth_user_id, business_id")
      .eq("email", resolvedEmail)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.status === "SUSPENDED") {
        redirect("/manager/login?error=suspended_account");
      }
      if (existingProfile.status !== "ACTIVE") {
        redirect("/manager/login?error=account_unavailable");
      }

      // Check if user is unlinked to Supabase Auth (missing provisioning)
      if (!existingProfile.auth_user_id) {
        // Check if an auth user already exists in auth.users by email
        const { data: authList } = await admin.auth.admin.listUsers();
        const matchingAuth = authList?.users?.find(
          (u) => u.email?.toLowerCase() === resolvedEmail
        );

        if (matchingAuth) {
          // Auto-link matching Auth user to public.users record
          await admin
            .from("users")
            .update({ auth_user_id: matchingAuth.id })
            .eq("id", existingProfile.id);
          existingProfile.auth_user_id = matchingAuth.id;
        } else {
          // Account exists in ERP records but has no Supabase Auth account provisioned
          redirect("/manager/login?error=account_unavailable");
        }
      }

      // Verify business status
      const { data: business } = await admin
        .from("businesses")
        .select("status")
        .eq("id", existingProfile.business_id)
        .maybeSingle();

      if (business && business.status !== "ACTIVE") {
        redirect("/manager/login?error=account_unavailable");
      }
    }
  }

  // Authenticate credentials against Supabase Auth
  let { data: authData, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  });

  // Handle unconfirmed email auto-recovery for Administrator-provisioned active users
  const isEmailUnconfirmed =
    error &&
    (error.message?.toLowerCase().includes("email not confirmed") ||
      (error as unknown as { code?: string })?.code === "email_not_confirmed");

  if (isEmailUnconfirmed && admin) {
    const { data: profile } = await admin
      .from("users")
      .select("id, status, auth_user_id")
      .eq("email", resolvedEmail)
      .maybeSingle();

    if (profile && profile.status === "ACTIVE" && profile.auth_user_id) {
      // Confirm the email in Supabase Auth since the Admin already provisioned them
      await admin.auth.admin.updateUserById(profile.auth_user_id, {
        email_confirm: true,
      });

      // Retry sign in with the user's password
      const retryResult = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });
      authData = retryResult.data;
      error = retryResult.error;
    }
  }

  if (error || !authData.user) {
    redirect("/manager/login?error=invalid_credentials");
  }

  // Fast single-roundtrip context resolution and auth cache pre-seeding
  const context = await fetchAuthContextForUser(authData.user.id, supabase);
  if (!context) {
    await supabase.auth.signOut();
    redirect("/manager/login?error=account_unavailable");
  }

  setCachedAuthContext(authData.user.id, context);

  // Enforce role separation: Deny access if user is not a Manager
  const roleNameLower = context.role?.name?.toLowerCase() ?? "";
  const isManager = context.roleKey === "manager" || roleNameLower.includes("manager");

  if (!isManager) {
    await supabase.auth.signOut();
    redirect("/manager/login?error=manager_role_required");
  }

  redirect("/manager/dashboard");
}

export async function managerSignOutAction(): Promise<never> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const rawCookie = getRawAuthCookie(allCookies);
    const cookieUser = rawCookie ? extractUserIdFromCookie(rawCookie) : null;
    if (cookieUser) {
      invalidateAuthCache(cookieUser.userId);
    } else {
      invalidateAuthCache();
    }

    for (const c of allCookies) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        cookieStore.delete(c.name);
      }
    }
  } catch (err) {
    console.error("Manager signOut error:", err);
  }

  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      void supabase.auth.signOut().catch(() => {});
    }
  } catch {
    // Non-blocking
  }

  redirect("/manager/login?notice=signed_out");
}