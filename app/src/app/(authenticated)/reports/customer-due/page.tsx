"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ReportFilters as ReportFiltersComponent } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { getReportPreview, exportReport, getPendingInvoicesReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { formatINR, formatLedgerDate } from "@/lib/reports/ledger-formatter";
import {
  REPORT_CONFIGS,
  type ReportType,
  type CustomerDueReportFilters,
  type CustomerDueReportRow,
  type InvoicePendingDueRow,
} from "@/types/reports";

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

  const [activeTab, setActiveTab] = useState<"customers" | "invoices">("customers");
  const [rows, setRows] = useState<CustomerDueReportRow[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<InvoicePendingDueRow[]>([]);
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
        const [previewRes, invoicesRes] = await Promise.all([
          getReportPreview(reportType, filters, 50, (currentPage - 1) * 50),
          getPendingInvoicesReport(filters),
        ]);
        setRows(previewRes.rows as CustomerDueReportRow[]);
        setTotalCount(previewRes.totalCount);
        setPendingInvoices(invoicesRes);
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
      const { content, contentType, filename } = await exportReport(
        reportType,
        { ...filters, isTableReport: true } as any,
        format
      );
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

  // KPI Calculations across loaded rows
  const totalDueAmount = rows.reduce((acc, r) => acc + Number(r.closing_receivable ?? r.total_due ?? 0), 0);
  const totalCustomerAdvance = rows.reduce((acc, r) => acc + Number(r.closing_advance ?? 0), 0);
  const customersWithDueCount = rows.filter((r) => Number(r.closing_receivable ?? r.total_due ?? 0) > 0).length;

  const totalInvoiceBill = pendingInvoices.reduce((acc, inv) => acc + Number(inv.bill_amount || 0), 0);
  const totalInvoicePaid = pendingInvoices.reduce((acc, inv) => acc + Number(inv.paid_amount || 0), 0);
  const totalInvoiceCreditNotes = pendingInvoices.reduce((acc, inv) => acc + Number(inv.credit_notes || 0), 0);
  const totalInvoicePendingDue = pendingInvoices.reduce((acc, inv) => acc + Number(inv.pending_due || 0), 0);

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

      {/* Executive Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Due Amount Card */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Total Due Amount</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-rose-950 tabular-nums">
            {formatINR(totalDueAmount, true)}
          </p>
          <p className="mt-1 text-xs text-rose-600">Pending dues across active customers</p>
        </div>

        {/* Total Customer Advance Card */}
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Total Customer Advance</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-teal-950 tabular-nums">
            {formatINR(totalCustomerAdvance, true)}
          </p>
          <p className="mt-1 text-xs text-teal-600">Excess receipts / advance balances held</p>
        </div>

        {/* Customers With Due Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Customers with Dues</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {customersWithDueCount} <span className="text-sm font-normal text-slate-500">of {totalCount}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Active customer accounts with unpaid balance</p>
        </div>

        {/* Pending Invoices Count */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Pending Invoices</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {pendingInvoices.length} <span className="text-sm font-normal text-slate-500">orders</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Confirmed sales with pending dues</p>
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

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab("customers")}
          className={`pb-3 text-sm font-semibold transition border-b-2 ${
            activeTab === "customers"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Customer-wise Due Details ({totalCount})
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`pb-3 text-sm font-semibold transition border-b-2 ${
            activeTab === "invoices"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Invoice-wise Pending Dues ({pendingInvoices.length})
        </button>
      </div>

      {activeTab === "customers" ? (
        <ReportTable
          reportType={reportType}
          rows={rows}
          pageSize={50}
          onPageChange={handlePageChange}
          totalCount={totalCount}
          currentPage={currentPage}
          isLoading={isLoading}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pending Sales Invoices</h2>
              <p className="text-xs text-slate-500">
                Pending Due = Total Bill Amount − Payments Allocated − Applicable Credit Notes
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pending Due: </span>
              <span className="text-sm font-bold text-rose-700 tabular-nums">
                {formatINR(totalInvoicePendingDue, true)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="py-3 px-3 text-left font-semibold">Invoice / Order #</th>
                  <th className="py-3 px-3 text-center font-semibold">Date</th>
                  <th className="py-3 px-3 text-left font-semibold">Customer Name</th>
                  <th className="py-3 px-3 text-left font-semibold">Company</th>
                  <th className="py-3 px-3 text-right font-semibold">Bill Amount</th>
                  <th className="py-3 px-3 text-right font-semibold">Payments Allocated</th>
                  <th className="py-3 px-3 text-right font-semibold">Credit Notes / Adj</th>
                  <th className="py-3 px-3 text-right font-semibold text-rose-800">Pending Due Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pendingInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No pending sales invoices found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  pendingInvoices.map((inv) => (
                    <tr key={inv.order_id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{inv.invoice_number}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{formatLedgerDate(inv.invoice_date)}</td>
                      <td className="py-2.5 px-3 text-slate-900">{inv.customer_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{inv.customer_company || "—"}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-800">{formatINR(inv.bill_amount, true)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">{formatINR(inv.paid_amount, true)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">{formatINR(inv.credit_notes, true)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-rose-700">{formatINR(inv.pending_due, true)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {pendingInvoices.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                  <tr>
                    <td className="py-3 px-3">TOTALS</td>
                    <td className="py-3 px-3 text-center">{pendingInvoices.length} Invoices</td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatINR(totalInvoiceBill, true)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-800">{formatINR(totalInvoicePaid, true)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{formatINR(totalInvoiceCreditNotes, true)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-rose-800">{formatINR(totalInvoicePendingDue, true)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
