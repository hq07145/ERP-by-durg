"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { getReportPreview, exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { REPORT_CONFIGS, type ReportType, type ProfitReportFilters, type ProfitReportRow } from "@/types/reports";

export function ProfitReportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType: ReportType = "profit";
  const config = REPORT_CONFIGS[reportType];

  const [filters, setFilters] = useState<ProfitReportFilters>({
    dateRange: "this_month",
  });
  const [rows, setRows] = useState<ProfitReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  const initializeFromSearchParams = useCallback(() => {
    const params: ProfitReportFilters = {};
    if (searchParams.get("dateRange")) params.dateRange = searchParams.get("dateRange") as ProfitReportFilters["dateRange"];
    if (searchParams.get("startDate")) params.startDate = searchParams.get("startDate")!;
    if (searchParams.get("endDate")) params.endDate = searchParams.get("endDate")!;
    if (searchParams.get("customerId")) params.customerId = searchParams.get("customerId")!;
    const pageVal = Number(searchParams.get("page") || "1");
    if (pageVal !== currentPage) setCurrentPage(pageVal);

    setFilters((prev) => {
      const keysA = Object.keys(prev) as (keyof ProfitReportFilters)[];
      const keysB = Object.keys(params) as (keyof ProfitReportFilters)[];
      if (keysA.length === keysB.length && keysA.every((k) => prev[k] === params[k])) {
        return prev;
      }
      return params;
    });
  }, [searchParams, currentPage]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    initializeFromSearchParams();
  }, [initializeFromSearchParams]);

  useEffect(() => {
    let isCancelled = false;
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
        if (!isCancelled) {
          setRows(data as ProfitReportRow[]);
          setTotalCount(total);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Failed to fetch profit report:", err);
          setError(err.message || "Failed to load profit report data.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      isCancelled = true;
    };
  }, [filters, currentPage]);

  const handleFiltersChange = (newFilters: ProfitReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    router.push(`/reports/profit?${params.toString()}`);
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
    router.push(`/reports/profit?${params.toString()}`);
  };

  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">Reports</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{config.title}</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">{config.description}</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 flex items-start gap-2">
        <span className="text-base leading-none">ℹ️</span>
        <div>
          <span className="font-semibold">Note on Estimated Profit: </span>
          Profit is derived strictly as Net Sales minus Operating Expenses. Direct manufacturing production costs (COGS) are not tracked per order, so this represents an Estimated Operating Profit.
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
