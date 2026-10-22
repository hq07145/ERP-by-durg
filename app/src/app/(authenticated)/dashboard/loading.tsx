export default function DashboardLoading() {
  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 animate-pulse">
      {/* Header skeleton */}
      <div>
        <div className="h-3 w-20 bg-gray-200 rounded"></div>
        <div className="mt-2 h-8 w-64 bg-gray-200 rounded"></div>
        <div className="mt-2 h-4 w-96 bg-gray-200 rounded"></div>
      </div>

      {/* Date Filter skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="h-8 w-72 bg-gray-200 rounded"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>

      {/* Summary Cards skeleton (12 cards) */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-gray-200 rounded"></div>
              <div className="h-9 w-9 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="mt-4 h-7 w-32 bg-gray-200 rounded"></div>
            <div className="mt-2 h-3 w-40 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>

      {/* Trend Charts skeleton (3 charts) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-32 bg-gray-200 rounded"></div>
              <div className="h-6 w-24 bg-gray-200 rounded"></div>
            </div>
            <div className="h-44 bg-gray-100 rounded"></div>
          </div>
        ))}
      </div>

      {/* Status Breakdowns skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-40 bg-gray-200 rounded"></div>
              <div className="h-5 w-16 bg-gray-200 rounded"></div>
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded"></div>
              <div className="h-4 bg-gray-100 rounded"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Lists skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="h-5 w-36 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-2">
              <div className="h-8 bg-gray-100 rounded"></div>
              <div className="h-8 bg-gray-100 rounded"></div>
              <div className="h-8 bg-gray-100 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
