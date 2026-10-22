import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ManagerLoginForm } from "@/components/auth/manager-login-form";
import { ShieldCheck, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manager Login — Manufacturing Workspace",
  description: "Secure dedicated sign in portal for operational Managers",
};

interface ManagerLoginPageProps {
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
}

export default async function ManagerLoginPage({ searchParams }: ManagerLoginPageProps) {
  const context = await getAuthContext();
  if (context?.roleKey === "manager") {
    redirect("/manager/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen w-full flex flex-col justify-center items-center bg-[#f8fafc] px-4 py-12 sm:px-6 lg:px-8">
      {/* Background Decorative Element */}
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-md mb-3">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            Manufacturing Operations
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
            Manager Portal Login
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-[var(--muted)]">
            Sign in with your administrator-assigned Manager credentials.
          </p>
        </div>

        {/* Card Shell */}
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8 shadow-sm">
          <ManagerLoginForm
            initialError={params.error}
            initialNotice={params.notice}
          />
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-[var(--muted)]">
          <p>Multi-Tenant Manufacturing ERP &copy; {new Date().getFullYear()}</p>
          <p className="mt-1 text-[11px] opacity-75">
            Strict isolation and granular module-level authorization enforced.
          </p>
        </div>
      </div>
    </main>
  );
}
