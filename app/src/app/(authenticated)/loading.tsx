export default function AuthenticatedLoading() {
  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-8 w-48 sm:w-64 bg-slate-300 dark:bg-slate-600 rounded-md" />
          <div className="h-4 w-72 sm:w-96 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="h-9 w-32 bg-teal-600/30 rounded-lg" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 bg-white dark:bg-[#12222F] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-7 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
            <div className="h-3 w-36 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content / Table Skeleton */}
      <div className="bg-white dark:bg-[#12222F] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Filter / Search Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between">
          <div className="h-9 w-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-slate-100 dark:bg-slate-800 rounded-lg" />
            <div className="h-9 w-24 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="py-3.5 px-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-36 bg-slate-300 dark:bg-slate-600 rounded" />
                  <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
              <div className="hidden sm:block h-3.5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
              <div className="h-4 w-16 bg-slate-300 dark:bg-slate-600 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
