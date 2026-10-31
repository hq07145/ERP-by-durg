export default function PurchasesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-64 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-32 bg-indigo-600/30 rounded-md" />
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="h-10 flex-1 bg-slate-100 rounded-md" />
        <div className="h-10 w-36 bg-slate-100 rounded-md" />
      </div>

      {/* Purchases Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-3.5 grid grid-cols-6 gap-4">
          <div className="h-3 w-28 bg-slate-200 rounded" />
          <div className="h-3 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded ml-auto" />
        </div>

        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="px-5 py-4 grid grid-cols-6 gap-4 items-center">
              <div className="h-4 w-28 bg-slate-300 rounded font-mono" />
              <div className="h-4 w-36 bg-slate-200 rounded" />
              <div className="h-3.5 w-24 bg-slate-200 rounded" />
              <div className="h-3.5 w-24 bg-slate-100 rounded" />
              <div className="h-6 w-20 bg-blue-100/60 rounded-full" />
              <div className="h-4 w-24 bg-slate-300 rounded font-mono ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

