import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import Link from "next/link";
import { REPORT_TYPES } from "@/types/reports";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reports - Management & Exports",
  description: "Generate and export business performance and operational reports",
};

export default async function ReportsPage() {
  const context = await requireAuthContext();
  await requirePermission(context, "reports.view");

  // Filter reports based on permissions and role restrictions
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  const availableReports = REPORT_TYPES.filter((report) => {
    if (report.type === "sales" || report.type === "profit") {
      return isAdminOrSuper;
    }
    return hasPermission({ permissions: context.permissions }, report.requiredPermission);
  });

  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">Analytics & Records</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">Generate, audit, and export operational and financial reports</p>
        </div>
      </div>

      {availableReports.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">You don&apos;t have permission to view any reports.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {availableReports.map((report) => {
            const reportSlug = report.type.replace(/_/g, "-");
            return (
              <Link
                key={report.type}
                href={`/reports/${reportSlug}`}
                className="rounded-lg border border-gray-200 bg-white p-5 hover:border-[var(--accent)] hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-[var(--accent)] transition-colors">
                    {report.title}
                  </h3>
                  <span className="text-lg">📄</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">{report.description}</p>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--accent)]">View Report →</span>
                  <span className="text-gray-400 font-mono capitalize">{report.type.replace(/_/g, " ")}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}