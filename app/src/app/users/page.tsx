import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UserManagementClient } from "@/components/users/user-management-client";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const messages: Record<string, string> = {
  manager_created: "Manager account created successfully. The user can now log in using the initial password.",
  permissions_updated: "Granular permissions updated successfully and enforced in database RLS.",
  invite_sent: "Invitation sent.",
  account_updated: "Account access updated.",
  invalid_input: "Check the name, email, role, and status values.",
  auth_unconfigured: "Supabase auth or the server admin key is not configured.",
  invalid_role: "Select a role from this business.",
  role_not_allowed: "Your role cannot assign or change that access level.",
  email_in_use: "An account already exists for that email.",
  invite_failed: "The invitation could not be sent.",
  provision_failed: "The account could not be provisioned. Review the pending user in Supabase Auth.",
  cannot_change_self: "You cannot change your own role or permissions here.",
  user_not_found: "That account is not available in this business.",
  update_failed: "The account update failed. No update was saved.",
  password_too_short: "Password must be at least 12 characters long.",
  password_needs_lowercase: "Password must include at least one lowercase letter.",
  password_needs_uppercase: "Password must include at least one uppercase letter.",
  password_needs_number: "Password must include at least one number.",
  password_needs_symbol: "Password must include at least one special symbol (!@#$%^&*...).",
  password_weak: "Password does not meet strength requirements.",
  auth_create_failed: "Could not create user in authentication provider.",
  permission_update_failed: "Failed to update user permissions in database.",
  permissions_fetch_failed: "Could not load permissions table.",
  password_reset_success: "Password reset successfully. Existing user sessions have been terminated securely.",
  password_reset_link_sent: "Password recovery link has been generated and sent to the manager's email.",
  password_reset_failed: "Failed to reset password in authentication provider.",
  cannot_change_super_admin: "Super Admin accounts and permissions are strictly protected.",
  user_deleted: "Account successfully removed/deactivated. Authentication access has been revoked and historical records preserved.",
  cannot_delete_self: "You cannot delete your own signed-in account.",
  cannot_delete_super_admin: "Super Admin accounts are strictly protected and cannot be deleted.",
  delete_failed: "Account deletion failed. Check database/auth constraints.",
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; createdUserId?: string; userId?: string }>;
}) {
  const context = await requireAuthContext();
  await requirePermission(context, "users.manage");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return <p className="text-sm text-[var(--signal)]">Supabase is not configured.</p>;
  }

  // Load all users, roles, assignments, all permissions, role_permissions, and user_permissions
  const [
    usersResult,
    rolesResult,
    assignmentsResult,
    permissionsResult,
    rolePermissionsResult,
    userPermissionsResult,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, status, created_at")
      .eq("business_id", context.user.business_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("roles")
      .select("id, name")
      .eq("business_id", context.user.business_id)
      .order("name"),
    supabase
      .from("user_roles")
      .select("user_id, role_id")
      .eq("business_id", context.user.business_id),
    supabase
      .from("permissions")
      .select("id, module, action, description")
      .order("module"),
    supabase
      .from("role_permissions")
      .select("role_id, permission_id"),
    supabase
      .from("user_permissions")
      .select("user_id, permission_id, allowed"),
  ]);

  if (usersResult.error || rolesResult.error || assignmentsResult.error) {
    return <p className="text-sm text-[var(--signal)]">User access data could not be loaded.</p>;
  }

  const users = (usersResult.data ?? []) as UserRow[];
  const roles = (rolesResult.data ?? []) as { id: string; name: string }[];
  const assignments = (assignmentsResult.data ?? []) as { user_id: string; role_id: string }[];
  const allPermissions = (permissionsResult.data ?? []) as { id: string; module: string; action: string; description?: string }[];
  const rolePermissions = (rolePermissionsResult.data ?? []) as { role_id: string; permission_id: string }[];
  const userPermissions = (userPermissionsResult.data ?? []) as { user_id: string; permission_id: string; allowed: boolean }[];

  const message = params.notice ? messages[params.notice] : params.error ? messages[params.error] : null;
  const isError = Boolean(params.error);
  const highlightedUserId = params.createdUserId || params.userId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Access & Security Management
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
            User Management & Permissions
          </h1>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[var(--muted)]">
          {users.length} account{users.length === 1 ? "" : "s"} enrolled
        </p>
      </div>

      {/* Notice / Error Feedback Banner */}
      {message && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-medium transition ${
            isError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {isError ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-semibold">{isError ? "Error Occurred" : "Action Completed"}</p>
            <p className="text-xs sm:text-sm opacity-90">{message}</p>
          </div>
        </div>
      )}

      {/* Interactive Client Component */}
      <UserManagementClient
        currentUserId={context.user.id}
        currentUserRoleKey={context.roleKey ?? "manager"}
        users={users}
        roles={roles}
        userRoles={assignments}
        allPermissions={allPermissions}
        rolePermissions={rolePermissions}
        userPermissions={userPermissions}
        highlightedUserId={highlightedUserId}
      />
    </div>
  );
}