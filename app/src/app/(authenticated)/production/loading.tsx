export default function ProductionLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-72 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-32 bg-teal-600/30 rounded-sm" />
      </div>

      {/* 2-column Layout (Queue & Schedule vs Calendar) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Production Queue Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="h-5 w-40 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-100 rounded" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="h-5 w-20 bg-amber-100/60 rounded-full" />
                  </div>
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Side Panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="h-5 w-36 bg-slate-200 rounded" />
          <div className="grid grid-cols-7 gap-1 pt-2">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="h-8 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

