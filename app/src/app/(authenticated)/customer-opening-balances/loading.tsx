export default function CustomerOpeningBalancesLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 lg:p-8 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-3 w-40 bg-slate-200 rounded" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-gray-200">
        <div className="space-y-2">
          <div className="h-5 w-36 bg-teal-100 rounded-full" />
          <div className="h-8 w-64 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-96 bg-slate-100 rounded" />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-9 w-28 bg-slate-100 rounded-xl" />
          <div className="h-9 w-28 bg-teal-50 rounded-xl" />
          <div className="h-9 w-28 bg-slate-100 rounded-xl" />
          <div className="h-9 w-36 bg-teal-600/30 rounded-xl" />
        </div>
      </div>

      {/* 4 Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-2">
            <div className="h-3 w-28 bg-slate-200 rounded" />
            <div className="h-7 w-24 bg-slate-300 rounded" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 flex-1 bg-slate-100 rounded-xl" />
          <div className="h-10 w-36 bg-slate-100 rounded-xl" />
        </div>
      </div>

      {/* Balances Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 grid grid-cols-5 gap-4">
          <div className="h-3 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
        </div>

        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="px-6 py-4 grid grid-cols-5 gap-4 items-center">
              <div className="space-y-1">
                <div className="h-4 w-36 bg-slate-300 rounded" />
                <div className="h-3 w-24 bg-slate-100 rounded" />
              </div>
              <div className="h-3.5 w-24 bg-slate-200 rounded" />
              <div className="h-4 w-28 bg-slate-200 rounded font-mono" />
              <div className="h-6 w-20 bg-emerald-100/60 rounded-full" />
              <div className="flex justify-end gap-2">
                <div className="h-8 w-8 bg-slate-100 rounded-lg" />
                <div className="h-8 w-8 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

