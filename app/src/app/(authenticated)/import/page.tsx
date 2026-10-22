import { requireAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { getRecentImportJobs } from "@/lib/import/actions";
import { ImportWizard } from "@/components/import/import-wizard";
import { ImportHistoryTable } from "@/components/import/import-history-table";
import { FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import Data - Bulk Spreadsheet Import",
  description: "Import historical business data, opening balances, and catalogs from Excel and CSV files",
};

export default async function ImportPage() {
  const context = await requireAuthContext();

  // Enforce Admin / Super Admin access
  const isAdminOrSuper =
    context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    redirect("/dashboard?error=forbidden");
  }

  const jobs = await getRecentImportJobs();

  return (
    <div className="max-w-full mx-auto space-y-8 p-4 sm:p-6 overflow-x-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">
              Administration & Data Migration
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileSpreadsheet className="h-7 w-7 text-[var(--accent)]" />
            <span>Bulk Data Import</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Import historical business records, customer ledgers, catalogs, and opening balances from Excel (.xlsx, .xls) and CSV.
          </p>
        </div>
      </div>

      {/* Main Wizard */}
      <ImportWizard />

      {/* Previous Import Jobs */}
      <ImportHistoryTable jobs={jobs} />
    </div>
  );
}
