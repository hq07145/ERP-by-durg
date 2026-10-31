"use client";

import { useState } from "react";
import type { ImportJobRecord, ImportModule } from "@/types/import";
import { IMPORT_MODULE_SCHEMAS } from "@/lib/import/module-schemas";
import { downloadErrorReportFile } from "@/lib/import/file-parser";
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Clock,
  Filter,
} from "lucide-react";

interface ImportHistoryTableProps {
  jobs: ImportJobRecord[];
}

export function ImportHistoryTable({ jobs }: ImportHistoryTableProps) {
  const [filterModule, setFilterModule] = useState<string>("ALL");

  const filteredJobs = jobs.filter((j) => {
    if (filterModule !== "ALL" && j.module !== filterModule) return false;
    return true;
  });

  const handleDownloadErrors = async (filename: string, errors: any[]) => {
    try {
      await downloadErrorReportFile(filename, errors);
    } catch (err) {
      console.error("Failed to download error report:", err);
      alert("Failed to download error report. Please check your network connection and try again.");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Import History & Audit Log</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Record of recent data imports with row counts, status, and error reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-[var(--accent)] focus:outline-none"
          >
            <option value="ALL">All Modules</option>
            {Object.values(IMPORT_MODULE_SCHEMAS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="py-12 text-center">
          <Clock className="mx-auto h-10 w-10 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No import jobs recorded yet</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload your first historical Excel or CSV file using the wizard above.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
              <tr>
                <th className="p-3">Job ID & Date</th>
                <th className="p-3">Module</th>
                <th className="p-3">Filename</th>
                <th className="p-3 text-center">Imported</th>
                <th className="p-3 text-center">Failed</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredJobs.map((job) => {
                const schema = IMPORT_MODULE_SCHEMAS[job.module];
                return (
                  <tr key={job.id} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <div className="font-mono text-slate-900 font-medium">{job.id.slice(0, 8)}...</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(job.created_at).toLocaleString()}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className="font-semibold text-slate-800">
                        {schema?.title || job.module}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        by {job.creator_name || "Admin"}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium text-slate-800 max-w-xs truncate" title={job.filename}>
                        {job.filename}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Hash: {job.file_hash.slice(0, 10)}...
                      </div>
                    </td>

                    <td className="p-3 text-center font-bold text-green-700">
                      {job.imported_rows}
                    </td>

                    <td className="p-3 text-center font-bold text-red-600">
                      {job.failed_rows}
                    </td>

                    <td className="p-3">
                      {job.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Completed</span>
                        </span>
                      ) : job.status === "PARTIAL" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Partial</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200">
                          <XCircle className="h-3 w-3" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      {job.errors && job.errors.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadErrors(job.filename, job.errors)}
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100 transition"
                          title="Download spreadsheet with failed rows and error reasons"
                        >
                          <Download className="h-3 w-3" />
                          <span>Error Report</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Clean</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
