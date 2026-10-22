export default function ExpensesLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-slate-200 rounded-md mb-2" />
          <div className="h-4 w-52 bg-slate-100 rounded-md" />
        </div>
      </div>

      {/* Filter Bar Skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-3 flex-1 w-full">
            <div className="h-9 w-36 bg-slate-100 rounded-md" />
            <div className="h-9 w-32 bg-slate-100 rounded-md" />
            <div className="h-9 w-32 bg-slate-100 rounded-md" />
            <div className="h-9 w-32 bg-slate-100 rounded-md" />
          </div>
          <div className="h-9 w-28 bg-slate-200 rounded-md self-end sm:self-auto" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="grid grid-cols-8 gap-4">
            <div className="h-4 bg-slate-200 rounded col-span-1" />
            <div className="h-4 bg-slate-200 rounded col-span-1" />
            <div className="h-4 bg-slate-200 rounded col-span-2" />
            <div className="h-4 bg-slate-200 rounded col-span-1" />
            <div className="h-4 bg-slate-200 rounded col-span-1" />
            <div className="h-4 bg-slate-200 rounded col-span-1" />
            <div className="h-4 bg-slate-200 rounded col-span-1" />
          </div>
        </div>
        <div className="divide-y divide-slate-100 p-2 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="grid grid-cols-8 gap-4 py-3 px-2">
              <div className="h-4 bg-slate-100 rounded col-span-1" />
              <div className="h-4 bg-slate-100 rounded col-span-1" />
              <div className="h-4 bg-slate-100 rounded col-span-2" />
              <div className="h-4 bg-slate-100 rounded col-span-1" />
              <div className="h-4 bg-slate-100 rounded col-span-1" />
              <div className="h-4 bg-slate-100 rounded col-span-1" />
              <div className="h-4 bg-slate-200 rounded col-span-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
