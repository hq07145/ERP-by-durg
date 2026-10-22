import Link from "next/link";
import { requireAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { AlertCircle } from "lucide-react";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const context = await requireAuthContext();
  const params = searchParams ? await searchParams : undefined;
  const canManageUsers = hasPermission(
    { permissions: context.permissions },
    "users.manage",
  );

  return (
    <section className="max-w-3xl">
      {params?.error === "forbidden" && (
        <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <span>Access denied: You do not have permission to access that resource.</span>
        </div>
      )}
      <p className="text-xs font-semibold uppercase text-[var(--accent)]">
        Account access
      </p>
      <h1 className="mt-3 text-3xl font-semibold">Welcome, {context.user.name}</h1>
      <p className="mt-2 text-[var(--muted)]">Your account is active and ready to use.</p>

      <dl className="mt-8 grid gap-x-10 gap-y-6 border-y border-[var(--line)] py-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Email</dt>
          <dd className="mt-1 break-all text-sm font-medium">{context.user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Role</dt>
          <dd className="mt-1 text-sm font-medium">{context.role?.name ?? "No role assigned"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Account status</dt>
          <dd className="mt-1 text-sm font-medium">{context.user.status}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Permissions loaded</dt>
          <dd className="mt-1 text-sm font-medium">{context.permissions.length}</dd>
        </div>
      </dl>

      {canManageUsers && (
        <Link
          className="mt-7 inline-flex items-center rounded-sm bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          href="/users"
        >
          Manage user access
        </Link>
      )}
    </section>
  );
}