import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/lib/auth/actions";
import { getAuthContext } from "@/lib/auth/context";

import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  account_unavailable: "This account is inactive or not provisioned. Contact your administrator.",
  auth_unconfigured: "Authentication is not configured for this environment.",
  callback_failed: "That authentication link is invalid or expired. Request a new one.",
  reset_session_required: "Open the password reset link from your email before setting a new password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const existingContext = await getAuthContext();
  if (existingContext) {
    if (existingContext.roleKey === "manager") redirect("/manager/dashboard");
    redirect("/");
  }
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : null;

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="auth-brand">
          <span className="auth-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>Manufacturing Workspace</span>
        </div>
        <p className="auth-eyebrow">Secure account access</p>
        <h1 id="login-title">Sign in</h1>
        <p className="auth-copy">Use the account invited by your business administrator.</p>

        {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
        {params.notice === "signed_out" && <p className="auth-message" role="status">You have been signed out.</p>}

        <LoginForm action={signInAction} />
        <Link className="auth-link" href="/forgot-password">Forgot password?</Link>
        <div className="mt-5 pt-4 border-t border-[var(--line)] flex items-center justify-between text-xs">
          <span className="text-[var(--muted)]">Are you a Manager?</span>
          <Link
            href="/manager/login"
            className="font-semibold text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            Manager Portal Login &rarr;
          </Link>
        </div>
        <p className="auth-footnote">Access is provisioned by your administrator. Public registration is disabled.</p>
      </section>
      <div className="auth-side" aria-hidden="true">
        <div className="auth-grid" />
        <div className="auth-side-label">ACCOUNT<br />CONTROL</div>
        <div className="auth-side-line" />
        <div className="auth-side-dot" />
      </div>
    </main>
  );
}