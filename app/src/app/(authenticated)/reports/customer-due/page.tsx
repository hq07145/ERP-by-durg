"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { getReportPreview, exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { REPORT_CONFIGS, type ReportType, type CustomerDueReportFilters, type CustomerDueReportRow } from "@/types/reports";

export default function CustomerDueReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType: ReportType = "customer_due";
  const config = REPORT_CONFIGS[reportType];

  const [filters, setFilters] = useState<CustomerDueReportFilters>(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const fromUrl: CustomerDueReportFilters = {};
      if (sp.get("dateRange")) fromUrl.dateRange = sp.get("dateRange") as CustomerDueReportFilters["dateRange"];
      if (sp.get("startDate")) fromUrl.startDate = sp.get("startDate")!;
      if (sp.get("endDate")) fromUrl.endDate = sp.get("endDate")!;
      if (sp.get("customerId")) fromUrl.customerId = sp.get("customerId")!;
      if (sp.get("minDueAmount")) fromUrl.minDueAmount = sp.get("minDueAmount")!;

      if (Object.keys(fromUrl).length > 0) {
        return fromUrl;
      }

      const saved = sessionStorage.getItem("customer_due_report_filters");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object") {
            return parsed;
          }
        } catch {
          // ignore parse error
        }
      }
    }
    return { dateRange: "this_month" };
  });

  const [rows, setRows] = useState<CustomerDueReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  // Sync saved filters to URL if arrived without query params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const hasUrlParams = sp.has("dateRange") || sp.has("customerId") || sp.has("minDueAmount") || sp.has("startDate");
      if (!hasUrlParams && Object.keys(filters).length > 0) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== "") params.set(k, String(v));
        });
        if (params.toString()) {
          router.replace(`/reports/customer-due?${params.toString()}`);
        }
      }
    }
  }, []);

  // Save current filters to session storage for persistence
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("customer_due_report_filters", JSON.stringify(filters));
    }
  }, [filters]);

  const initializeFromSearchParams = useCallback(() => {
    const params: CustomerDueReportFilters = {};
    if (searchParams.get("dateRange")) params.dateRange = searchParams.get("dateRange") as CustomerDueReportFilters["dateRange"];
    if (searchParams.get("startDate")) params.startDate = searchParams.get("startDate")!;
    if (searchParams.get("endDate")) params.endDate = searchParams.get("endDate")!;
    if (searchParams.get("customerId")) params.customerId = searchParams.get("customerId")!;
    if (searchParams.get("minDueAmount")) params.minDueAmount = searchParams.get("minDueAmount")!;
    if (searchParams.get("page")) setCurrentPage(Number(searchParams.get("page")!));
    if (Object.keys(params).length > 0) {
      setFilters(params);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    initializeFromSearchParams();
  }, [initializeFromSearchParams]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { rows: data, totalCount: total } = await getReportPreview(
          reportType,
          filters,
          50,
          (currentPage - 1) * 50
        );
        setRows(data as CustomerDueReportRow[]);
        setTotalCount(total);
      } catch (err: any) {
        console.error("Failed to fetch customer due report:", err);
        setError(err.message || "Failed to load customer due report data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [filters, currentPage]);

  const handleFiltersChange = (newFilters: CustomerDueReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    if (typeof window !== "undefined") {
      sessionStorage.setItem("customer_due_report_filters", JSON.stringify(newFilters));
    }
    router.push(`/reports/customer-due?${params.toString()}`);
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    setIsExporting(true);
    try {
      const { content, contentType, filename } = await exportReport(reportType, filters, format);
      triggerDownload(content, contentType, filename);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert(err.message || "Export failed. Please check permissions and try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/reports/customer-due?${params.toString()}`);
  };

  const handleBackToReports = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (typeof window !== "undefined") {
      let isFromReports = false;

      // 1. Check document.referrer
      if (document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (
            refUrl.origin === window.location.origin &&
            refUrl.pathname.replace(/\/$/, "") === "/reports"
          ) {
            isFromReports = true;
          }
        } catch {
          // ignore invalid referrer URL
        }
      }

      // 2. Check session storage for prev_route
      const prevRoute = sessionStorage.getItem("prev_route");
      if (prevRoute && prevRoute.split("?")[0].replace(/\/$/, "") === "/reports") {
        isFromReports = true;
      }

      // 3. If arrived from /reports and browser history has entries, use router.back()
      if (isFromReports && window.history.length > 1) {
        router.back();
        return;
      }
    }

    // 4. Fallback: navigate directly to the Reports overview route
    router.push("/reports");
  };

  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden">
      <div>
        {/* Back to Reports Button */}
        <div className="mb-3 flex items-center justify-start">
          <Link
            href="/reports"
            onClick={handleBackToReports}
            id="back-to-reports-btn"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            aria-label="Back to Reports"
          >
            <span className="text-slate-500 font-bold" aria-hidden="true">←</span>
            <span>Back to Reports</span>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">Reports</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{config.title}</h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">{config.description}</p>
          </div>
        </div>
      </div>

      <ReportFiltersComponent
        reportType={reportType}
        filters={filters}
        onChange={handleFiltersChange}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      <ReportTable
        reportType={reportType}
        rows={rows}
        pageSize={50}
        onPageChange={handlePageChange}
        totalCount={totalCount}
        currentPage={currentPage}
        isLoading={isLoading}
      />
    </div>
  );
}