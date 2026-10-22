"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { getReportPreview, exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { REPORT_CONFIGS, type ReportType, type InventoryReportFilters, type InventoryReportRow } from "@/types/reports";

export default function InventoryReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType: ReportType = "inventory";
  const config = REPORT_CONFIGS[reportType];

  const [filters, setFilters] = useState<InventoryReportFilters>({});
  const [rows, setRows] = useState<InventoryReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  const initializeFromSearchParams = useCallback(() => {
    const params: InventoryReportFilters = {};
    if (searchParams.get("rawMaterialId")) params.rawMaterialId = searchParams.get("rawMaterialId")!;
    if (searchParams.get("lowStockOnly")) params.lowStockOnly = searchParams.get("lowStockOnly") === "true";
    if (searchParams.get("page")) setCurrentPage(Number(searchParams.get("page")!));
    setFilters(params);
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
        setRows(data as InventoryReportRow[]);
        setTotalCount(total);
      } catch (err: any) {
        console.error("Failed to fetch inventory report:", err);
        setError(err.message || "Failed to load inventory report data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [filters, currentPage]);

  const handleFiltersChange = (newFilters: InventoryReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    router.push(`/reports/inventory?${params.toString()}`);
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
    router.push(`/reports/inventory?${params.toString()}`);
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