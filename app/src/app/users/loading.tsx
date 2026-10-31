export default function UsersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div className="space-y-2">
          <div className="h-3 w-48 bg-teal-100 rounded" />
          <div className="h-8 w-60 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-80 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2.5">
          <div className="h-9 w-28 bg-slate-200 rounded-md" />
          <div className="h-9 w-32 bg-teal-600/30 rounded-md" />
        </div>
      </div>

      {/* Tabs / Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="h-10 w-72 bg-slate-100 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-100 rounded-lg" />
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-3.5 grid grid-cols-5 gap-4">
          <div className="h-3 w-28 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded ml-auto" />
        </div>

        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="px-5 py-4 grid grid-cols-5 gap-4 items-center">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-200 shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-32 bg-slate-300 rounded" />
                  <div className="h-3 w-24 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-3.5 w-36 bg-slate-200 rounded" />
              <div className="h-6 w-20 bg-slate-100 rounded-full" />
              <div className="h-6 w-16 bg-emerald-100/60 rounded-full" />
              <div className="flex justify-end gap-2">
                <div className="h-7 w-16 bg-slate-100 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

