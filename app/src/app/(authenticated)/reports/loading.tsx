export default function ReportsLoading() {
  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-32 bg-teal-100 rounded" />
          <div className="h-8 w-40 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-80 bg-slate-100 rounded" />
        </div>
      </div>

      {/* Reports 3-column Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="h-4 w-36 bg-slate-200 rounded" />
              <div className="h-6 w-6 bg-slate-100 rounded" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-slate-100 rounded" />
              <div className="h-3 w-4/5 bg-slate-100 rounded" />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <div className="h-3 w-20 bg-teal-100 rounded" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

