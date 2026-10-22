"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { getReportPreview, exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { REPORT_CONFIGS, type ReportType, type OrdersReportFilters, type OrdersReportRow } from "@/types/reports";

export default function OrdersReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType: ReportType = "orders";
  const config = REPORT_CONFIGS[reportType];

  const [filters, setFilters] = useState<OrdersReportFilters>({
    dateRange: "this_month",
  });
  const [rows, setRows] = useState<OrdersReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  const initializeFromSearchParams = useCallback(() => {
    const params: OrdersReportFilters = {};
    if (searchParams.get("dateRange")) params.dateRange = searchParams.get("dateRange") as OrdersReportFilters["dateRange"];
    if (searchParams.get("startDate")) params.startDate = searchParams.get("startDate")!;
    if (searchParams.get("endDate")) params.endDate = searchParams.get("endDate")!;
    if (searchParams.get("customerId")) params.customerId = searchParams.get("customerId")!;
    if (searchParams.get("status")) params.status = searchParams.get("status") as OrdersReportFilters["status"];
    if (searchParams.get("priority")) params.priority = searchParams.get("priority") as OrdersReportFilters["priority"];
    const pageVal = Number(searchParams.get("page") || "1");
    if (pageVal !== currentPage) setCurrentPage(pageVal);

    setFilters((prev) => {
      const keysA = Object.keys(prev) as (keyof OrdersReportFilters)[];
      const keysB = Object.keys(params) as (keyof OrdersReportFilters)[];
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
          setRows(data as OrdersReportRow[]);
          setTotalCount(total);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Failed to fetch orders report:", err);
          setError(err.message || "Failed to load orders report data.");
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

  const handleFiltersChange = (newFilters: OrdersReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    router.push(`/reports/orders?${params.toString()}`);
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
    router.push(`/reports/orders?${params.toString()}`);
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