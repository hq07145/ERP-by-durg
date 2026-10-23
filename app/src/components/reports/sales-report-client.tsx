"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { DistrictSalesSummary } from "@/components/reports/district-sales-summary";
import { ReportTable } from "@/components/reports/report-table";
import { getSalesReportBundle, exportSalesReport, type SalesReportVariant } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { X, FileSpreadsheet, FileText, CheckCircle2, Loader2, Download } from "lucide-react";
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

  // Download selection dialog state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "excel" | "pdf">("pdf");
  const [selectedReportVariant, setSelectedReportVariant] = useState<SalesReportVariant | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    setSelectedFormat(format);
    setSelectedReportVariant(null);
    setExportError(null);
    setIsDownloadModalOpen(true);
  };

  const handleConfirmDownload = async () => {
    if (!selectedReportVariant) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const { content, contentType, filename } = await exportSalesReport(
        selectedReportVariant,
        filters,
        selectedFormat
      );
      triggerDownload(content, contentType, filename);
      setIsDownloadModalOpen(false);
    } catch (err: any) {
      console.error("Export failed:", err);
      setExportError(err.message || "Export failed. Please check permissions and try again.");
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

      {/* SELECT REPORT TO DOWNLOAD MODAL */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Select Report to Download</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Choose which sales report you want to export in <span className="font-semibold uppercase text-[#0F766E]">{selectedFormat}</span> format.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isExporting && setIsDownloadModalOpen(false)}
                disabled={isExporting}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {exportError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                ⚠️ {exportError}
              </div>
            )}

            <div className="mt-5 space-y-3" role="radiogroup">
              {/* Option 1: State-wise Sales & GST Report */}
              <label
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition ${
                  selectedReportVariant === "state_wise_gst"
                    ? "border-[#0F766E] bg-teal-50/40 ring-1 ring-[#0F766E]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="sales_report_variant"
                  value="state_wise_gst"
                  checked={selectedReportVariant === "state_wise_gst"}
                  onChange={() => setSelectedReportVariant("state_wise_gst")}
                  className="mt-1 h-4 w-4 text-[#0F766E] focus:ring-[#0F766E]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-[#0F766E]" />
                    <span className="text-sm font-bold text-slate-900">
                      State-wise Sales &amp; GST Report
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    District and dealer sales breakdown with GST numbers, month of billing, taxable amounts, IGST, CGST, SGST, Cess, and invoice totals.
                  </p>
                </div>
              </label>

              {/* Option 2: Detailed Sales Transactions */}
              <label
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition ${
                  selectedReportVariant === "detailed_transactions"
                    ? "border-[#0F766E] bg-teal-50/40 ring-1 ring-[#0F766E]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <input
                  type="radio"
                  name="sales_report_variant"
                  value="detailed_transactions"
                  checked={selectedReportVariant === "detailed_transactions"}
                  onChange={() => setSelectedReportVariant("detailed_transactions")}
                  className="mt-1 h-4 w-4 text-[#0F766E] focus:ring-[#0F766E]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#0F766E]" />
                    <span className="text-sm font-bold text-slate-900">
                      Detailed Sales Transactions
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Invoice-level records with dealer name, address, GSTIN, bill number, bill date, and separate quantity columns for each product/SKU.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(false)}
                disabled={isExporting}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDownload}
                disabled={!selectedReportVariant || isExporting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Preparing Download...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>Download {selectedFormat.toUpperCase()}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
