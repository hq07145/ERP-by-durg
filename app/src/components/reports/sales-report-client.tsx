"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { DistrictSalesSummary } from "@/components/reports/district-sales-summary";
import { ReportTable } from "@/components/reports/report-table";
import { getSalesReportBundle, exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import {
  REPORT_CONFIGS,
  type ReportType,
  type SalesReportFilters,
  type SalesReportRow,
  type DistrictSalesSummaryItem,
} from "@/types/reports";

export function SalesReportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType: ReportType = "sales";
  const config = REPORT_CONFIGS[reportType];

  const [filters, setFilters] = useState<SalesReportFilters>({
    dateRange: "this_month",
  });
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [districtSummary, setDistrictSummary] = useState<DistrictSalesSummaryItem[]>([]);
  const [districtTotals, setDistrictTotals] = useState<DistrictSalesSummaryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  // Initialize filters from URL with reference preservation to avoid duplicate fetches
  const initializeFromSearchParams = useCallback(() => {
    const params: SalesReportFilters = {};
    if (searchParams.get("dateRange")) {
      params.dateRange = searchParams.get("dateRange") as SalesReportFilters["dateRange"];
    } else if (!searchParams.get("startDate") && !searchParams.get("endDate")) {
      params.dateRange = "this_month";
    }
    if (searchParams.get("startDate")) params.startDate = searchParams.get("startDate")!;
    if (searchParams.get("endDate")) params.endDate = searchParams.get("endDate")!;
    if (searchParams.get("district")) params.district = searchParams.get("district")!;
    if (searchParams.get("customerId")) params.customerId = searchParams.get("customerId")!;
    if (searchParams.get("productId")) params.productId = searchParams.get("productId")!;
    if (searchParams.get("status")) params.status = searchParams.get("status") as SalesReportFilters["status"];
    const pageVal = Number(searchParams.get("page") || "1");
    if (pageVal !== currentPage) setCurrentPage(pageVal);

    setFilters((prev) => {
      const keysA = Object.keys(prev) as (keyof SalesReportFilters)[];
      const keysB = Object.keys(params) as (keyof SalesReportFilters)[];
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

  // Fetch data in ONE single unified bundle call
  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const bundle = await getSalesReportBundle(
          filters,
          50,
          (currentPage - 1) * 50
        );
        if (!isCancelled) {
          setRows(bundle.rows);
          setTotalCount(bundle.totalCount);
          setDistrictSummary(bundle.summary);
          setDistrictTotals(bundle.totals);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Failed to fetch sales report:", err);
          setError(err.message || "Failed to load sales report data.");
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

  const handleFiltersChange = (newFilters: SalesReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    router.push(`/reports/sales?${params.toString()}`);
  };

  const handleDistrictSelect = (district: string | undefined) => {
    handleFiltersChange({
      ...filters,
      district,
    });
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
    router.push(`/reports/sales?${params.toString()}`);
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

      {/* District-Wise Sales Summary Section */}
      <DistrictSalesSummary
        summary={districtSummary}
        totals={districtTotals}
        selectedDistrict={filters.district}
        onSelectDistrict={handleDistrictSelect}
        isLoading={isLoading}
      />

      {/* Detailed Sales Transactions Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
            Detailed Sales Transactions
          </h3>
          <span className="text-xs text-gray-500 font-medium">
            Showing {rows.length} of {totalCount} records
          </span>
        </div>
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
    </div>
  );
}
