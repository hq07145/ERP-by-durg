export default function ImportLoading() {
  return (
    <div className="max-w-full mx-auto space-y-8 p-4 sm:p-6 overflow-x-hidden animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-2">
          <div className="h-3 w-44 bg-teal-100 rounded" />
          <div className="h-8 w-56 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-96 bg-slate-100 rounded" />
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between max-w-2xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-slate-200" />
            <div className="h-3 w-20 bg-slate-100 rounded hidden sm:block" />
          </div>
        ))}
      </div>

      {/* Upload Box Placeholder */}
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center space-y-4 max-w-3xl mx-auto">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-100" />
        <div className="h-5 w-60 mx-auto bg-slate-200 rounded" />
        <div className="h-3.5 w-80 mx-auto bg-slate-100 rounded" />
        <div className="h-10 w-36 mx-auto bg-teal-600/30 rounded-xl" />
      </div>

      {/* History Section Placeholder */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="h-5 w-44 bg-slate-200 rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-full bg-slate-50 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

