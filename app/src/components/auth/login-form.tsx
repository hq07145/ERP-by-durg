"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

interface LoginFormProps {
  action: (formData: FormData) => Promise<never>;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 px-4 text-sm font-semibold text-white shadow-xs hover:bg-[#0d655e] transition disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Signing in...</span>
        </>
      ) : (
        <span>Continue</span>
      )}
    </button>
  );
}

export function LoginForm({ action }: LoginFormProps) {
  return (
    <form action={action} className="auth-form space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Email address or Username
        <input
          autoComplete="username"
          name="email"
          required
          type="text"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Password
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
        />
      </label>
      <SubmitButton />
    </form>
  );
}
