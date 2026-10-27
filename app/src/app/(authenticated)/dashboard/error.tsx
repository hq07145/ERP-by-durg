"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error caught by boundary:", error);
  }, [error]);

  return (
    <div className="max-w-4xl mx-auto p-6 my-12">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 sm:p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl mb-4">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-red-900">Unable to load dashboard data</h2>
        <p className="mt-2 text-sm text-red-700 max-w-md mx-auto">
          {error.message || "An unexpected error occurred while loading dashboard metrics and analytics."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              try {
                reset();
              } catch {
                window.location.reload();
              }
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition"
          >
            Retry Dashboard
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 transition"
          >
            Reload Page
          </button>
          <a
            href="/orders"
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 transition"
          >
            Go to Orders
          </a>
        </div>
      </div>
    </div>
  );
}
