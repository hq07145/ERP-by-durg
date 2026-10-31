export default function SettingsLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-3 w-28 bg-teal-100 rounded" />
          <div className="h-8 w-64 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-96 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 pb-2">
        <div className="h-8 w-36 bg-slate-200 rounded" />
        <div className="h-8 w-44 bg-slate-100 rounded" />
      </div>

      {/* Settings Form Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-3 w-72 bg-slate-100 rounded mt-1.5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3.5 w-32 bg-slate-200 rounded" />
              <div className="h-10 w-full bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <div className="h-10 w-32 bg-teal-600/30 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

