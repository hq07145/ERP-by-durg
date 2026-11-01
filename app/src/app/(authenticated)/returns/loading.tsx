export default function ReturnsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-36 bg-teal-100 rounded text-transparent" />
          <div className="h-8 w-44 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-80 bg-slate-100 rounded" />
        </div>
        <div className="h-10 w-32 bg-teal-600/30 rounded-lg shrink-0" />
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-7 w-14 bg-slate-300 rounded" />
            <div className="h-2.5 w-24 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 flex-1 max-w-md bg-slate-100 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-slate-100 rounded-lg" />
            <div className="h-10 w-24 bg-slate-100 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 grid grid-cols-6 gap-4">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
        </div>

        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="px-5 py-4 grid grid-cols-6 gap-4 items-center">
              <div className="space-y-1.5">
                <div className="h-4 w-28 bg-slate-300 rounded font-mono" />
                <div className="h-3 w-16 bg-slate-100 rounded" />
              </div>
              <div className="h-4 w-24 bg-slate-200 rounded font-mono" />
              <div className="space-y-1">
                <div className="h-4 w-36 bg-slate-200 rounded" />
                <div className="h-3 w-20 bg-slate-100 rounded" />
              </div>
              <div className="h-4 w-14 bg-slate-200 rounded" />
              <div className="h-6 w-24 bg-slate-100 rounded-full" />
              <div className="flex justify-end gap-2">
                <div className="h-7 w-16 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-slate-200 rounded-lg" />
            <div className="h-8 w-8 bg-slate-200 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

