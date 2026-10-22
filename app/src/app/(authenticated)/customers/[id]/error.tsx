"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

export default function CustomerProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CustomerProfilePage error boundary caught:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12 px-4 sm:px-6">
      <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">Unable to load customer profile</h2>
          <p className="text-sm text-slate-600">
            A temporary issue occurred while retrieving the requested customer information.
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0D655E] transition-colors shadow-xs"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try again</span>
          </button>
          <Link
            href="/customers"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Customers</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
