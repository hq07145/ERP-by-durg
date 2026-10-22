"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Shield, ArrowRight } from "lucide-react";
import { managerSignInAction } from "@/lib/auth/actions";

interface ManagerLoginFormProps {
  initialError?: string | null;
  initialNotice?: string | null;
}

const errorTextMap: Record<string, string> = {
  invalid_credentials: "Invalid Manager credentials or password. Please verify and try again.",
  account_unavailable: "This Manager account is inactive or not provisioned. Contact your administrator.",
  suspended_account: "This Manager account has been suspended. Contact your administrator.",
  manager_role_required: "Access denied: This portal is exclusively for Manager accounts. Administrators must use the main login portal.",
  auth_unconfigured: "Authentication service is not configured for this environment.",
  invalid_input: "Please provide a valid Manager email address and password.",
  reset_session_required: "Open your password reset link from email before proceeding.",
};

export function ManagerLoginForm({ initialError, initialNotice }: ManagerLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef(false);

  const activeError = clientError || (initialError ? errorTextMap[initialError] || initialError : null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending || isSubmittingRef.current) return;
    setClientError(null);

    // Normalize email: strip hidden zero-width characters and whitespace
    const trimmedIdentifier = email.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!trimmedIdentifier) {
      setClientError("Please enter your Manager email address or ID.");
      return;
    }

    if (!password) {
      setClientError("Please enter your account password.");
      return;
    }

    isSubmittingRef.current = true;
    const formData = new FormData();
    formData.set("email", trimmedIdentifier);
    formData.set("password", password);

    startTransition(async () => {
      try {
        await managerSignInAction(formData);
      } catch (err: unknown) {
        // Next.js redirect() throws a NEXT_REDIRECT error internally, let it bubble
        const isNextRedirect =
          typeof err === "object" &&
          err !== null &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string" &&
          (err as { message: string }).message.includes("NEXT_REDIRECT");

        if (isNextRedirect) {
          throw err;
        }

        setClientError("An unexpected error occurred during sign in. Please try again.");
      } finally {
        isSubmittingRef.current = false;
      }
    });
  };

  return (
    <div className="w-full">
      {/* Error alert */}
      {activeError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1 leading-relaxed">{activeError}</div>
        </div>
      )}

      {/* Notice alert */}
      {initialNotice === "signed_out" && !activeError && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">You have signed out of the Manager portal successfully.</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Manager Email / ID */}
        <div className="space-y-1.5">
          <label htmlFor="manager-email" className="block text-xs font-semibold text-[var(--foreground)]">
            Manager ID / Email Address
          </label>
          <input
            id="manager-email"
            name="email"
            type="text"
            autoComplete="username"
            required
            disabled={isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="manager@company.com or Manager ID"
            className="w-full min-h-[44px] rounded-lg border border-[var(--line)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-slate-50 disabled:opacity-60"
          />
        </div>

        {/* Manager Password with Show/Hide Toggle */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="manager-password" className="block text-xs font-semibold text-[var(--foreground)]">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[var(--accent)] hover:underline focus:outline-none"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="manager-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={isPending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your manager password"
              className="w-full min-h-[44px] rounded-lg border border-[var(--line)] bg-white pl-3.5 pr-10 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:bg-slate-50 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] focus:outline-none"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button with Loading State */}
        <button
          type="submit"
          disabled={isPending}
          className="mt-2 flex w-full min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-[var(--accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verifying Manager Access...</span>
            </>
          ) : (
            <>
              <span>Sign In as Manager</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Admin Login Switcher */}
      <div className="mt-6 border-t border-[var(--line)] pt-4 text-center">
        <p className="text-xs text-[var(--muted)]">
          Are you an Administrator?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-0.5">
            Admin Portal Sign In &rarr;
          </Link>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]">
        <Shield className="h-3.5 w-3.5 text-teal-600" />
        <span>Role-Based Access Control Enforced</span>
      </div>
    </div>
  );
}
