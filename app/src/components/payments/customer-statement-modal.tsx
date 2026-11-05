"use client";

import React, { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import {
  X,
  FileText,
  FileSpreadsheet,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Building2,
  User,
  Loader2,
} from "lucide-react";
import { exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";

export type StatementPeriodOption =
  | "all"
  | "1m"
  | "3m"
  | "6m"
  | "12m"
  | "specific_month"
  | "custom";

export type StatementExportFormat = "pdf" | "excel" | "csv";

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: {
    customer_id: string;
    customer_name: string;
    customer_company?: string | null;
  };
  initialFormat?: StatementExportFormat;
  currentFilterStartDate?: string;
  currentFilterEndDate?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function CustomerStatementModal({
  isOpen,
  onClose,
  customer,
  initialFormat = "pdf",
  currentFilterStartDate,
  currentFilterEndDate,
}: CustomerStatementModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<StatementExportFormat>(initialFormat);
  const [periodOption, setPeriodOption] = useState<StatementPeriodOption>("all");

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const [specificMonth, setSpecificMonth] = useState<number>(currentMonth);
  const [specificYear, setSpecificYear] = useState<number>(currentYear);

  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFormat(initialFormat);
      setErrorMessage(null);

      // If current filter on screen has start date, default to custom or preset
      if (currentFilterStartDate && currentFilterEndDate) {
        setPeriodOption("custom");
        setCustomStartDate(currentFilterStartDate);
        setCustomEndDate(currentFilterEndDate);
      } else {
        setPeriodOption("all");
      }
    }
  }, [isOpen, initialFormat, currentFilterStartDate, currentFilterEndDate]);

  // Format Date to YYYY-MM-DD
  const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Safe display date helper
  const formatDisplayDate = (dStr: string): string => {
    try {
      const parts = dStr.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return format(d, "dd-MMM-yyyy");
      }
      return dStr;
    } catch {
      return dStr;
    }
  };

  // Compute effective start and end dates
  const dateCalculation = useMemo(() => {
    const todayStr = formatLocalDate(today);

    switch (periodOption) {
      case "all":
        return {
          startDate: undefined,
          endDate: undefined,
          label: "All Time — Complete Customer History",
          displayRange: "Inception to Present",
          accountingRule: "Starts from original Admin-entered opening balance and includes complete historical transactions.",
          isValid: true,
          validationError: null,
        };

      case "1m": {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const s = formatLocalDate(firstDay);
        const e = formatLocalDate(lastDay);
        return {
          startDate: s,
          endDate: e,
          label: "1 Month (Current Month)",
          displayRange: `${formatDisplayDate(s)} to ${formatDisplayDate(e)}`,
          accountingRule: "Carries forward previous period's closing ledger balance as opening balance.",
          isValid: true,
          validationError: null,
        };
      }

      case "3m": {
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const s = formatLocalDate(firstDay);
        const e = formatLocalDate(lastDay);
        return {
          startDate: s,
          endDate: e,
          label: "Last 3 Months",
          displayRange: `${formatDisplayDate(s)} to ${formatDisplayDate(e)}`,
          accountingRule: "Carries forward closing balance before start date as opening balance.",
          isValid: true,
          validationError: null,
        };
      }

      case "6m": {
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const s = formatLocalDate(firstDay);
        const e = formatLocalDate(lastDay);
        return {
          startDate: s,
          endDate: e,
          label: "Last 6 Months",
          displayRange: `${formatDisplayDate(s)} to ${formatDisplayDate(e)}`,
          accountingRule: "Carries forward closing balance before start date as opening balance.",
          isValid: true,
          validationError: null,
        };
      }

      case "12m": {
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const s = formatLocalDate(firstDay);
        const e = formatLocalDate(lastDay);
        return {
          startDate: s,
          endDate: e,
          label: "Last 12 Months",
          displayRange: `${formatDisplayDate(s)} to ${formatDisplayDate(e)}`,
          accountingRule: "Carries forward closing balance before start date as opening balance.",
          isValid: true,
          validationError: null,
        };
      }

      case "specific_month": {
        const firstDay = new Date(specificYear, specificMonth, 1);
        const lastDay = new Date(specificYear, specificMonth + 1, 0);
        const s = formatLocalDate(firstDay);
        const e = formatLocalDate(lastDay);
        const monthName = MONTH_NAMES[specificMonth];
        return {
          startDate: s,
          endDate: e,
          label: `Specific Month: ${monthName} ${specificYear}`,
          displayRange: `${formatDisplayDate(s)} to ${formatDisplayDate(e)}`,
          accountingRule: "Carries forward the immediately preceding month's closing ledger balance as opening balance.",
          isValid: true,
          validationError: null,
        };
      }

      case "custom": {
        if (!customStartDate || !customEndDate) {
          return {
            startDate: customStartDate || undefined,
            endDate: customEndDate || undefined,
            label: "Custom Date Range",
            displayRange: "Please specify both From and To dates",
            accountingRule: "Carries forward closing balance before start date as opening balance.",
            isValid: false,
            validationError: "Please specify both Start Date and End Date.",
          };
        }

        if (customStartDate > customEndDate) {
          return {
            startDate: customStartDate,
            endDate: customEndDate,
            label: "Custom Date Range",
            displayRange: "Invalid date range",
            accountingRule: "Start date cannot be after end date.",
            isValid: false,
            validationError: "Invalid Date Range: Start Date cannot be later than End Date.",
          };
        }

        return {
          startDate: customStartDate,
          endDate: customEndDate,
          label: "Custom Date Range",
          displayRange: `${formatDisplayDate(customStartDate)} to ${formatDisplayDate(customEndDate)}`,
          accountingRule: "Carries forward closing balance before start date as opening balance.",
          isValid: true,
          validationError: null,
        };
      }
    }
  }, [periodOption, specificMonth, specificYear, customStartDate, customEndDate, today]);

  // Handle export submission
  const handleDownload = async () => {
    if (!dateCalculation.isValid) {
      setErrorMessage(dateCalculation.validationError || "Invalid date selection");
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      const isAllTime = periodOption === "all";
      const { content, contentType, filename } = await exportReport(
        "customer_due",
        {
          customerId: customer.customer_id,
          startDate: isAllTime ? undefined : dateCalculation.startDate,
          endDate: isAllTime ? undefined : dateCalculation.endDate,
          isLedgerStatement: true,
          isAllTime,
          dateRange: isAllTime ? ("all" as any) : undefined,
        } as any,
        selectedFormat
      );

      triggerDownload(content, contentType, filename);
      onClose();
    } catch (err: any) {
      console.error("Statement export failed:", err);
      setErrorMessage(err.message || "Failed to generate statement. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10 text-white">
              <Calendar className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-white">
                Download Customer Statement
              </h2>
              <p className="text-xs text-slate-300">
                Authoritative double-entry accounts ledger statement
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Customer Info Card */}
          <div className="rounded-xl border border-gray-200 bg-slate-50/80 p-3.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Customer Account
              </span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-sm">
                  {customer.customer_name}
                </span>
                {customer.customer_company && (
                  <span className="text-xs text-gray-600 font-medium bg-white px-2 py-0.5 rounded border border-gray-200">
                    {customer.customer_company}
                  </span>
                )}
              </div>
            </div>
            <span className="px-2 py-1 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
              SANKALP ERP
            </span>
          </div>

          {/* Export Format Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              1. Choose Export Format
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedFormat("pdf")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedFormat === "pdf"
                    ? "border-red-600 bg-red-50/70 text-red-700 shadow-xs ring-1 ring-red-600"
                    : "border-gray-200 hover:bg-gray-50 text-gray-700"
                }`}
              >
                <FileText className="w-4 h-4 text-red-600" />
                <span>PDF Statement</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat("excel")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedFormat === "excel"
                    ? "border-emerald-600 bg-emerald-50/70 text-emerald-700 shadow-xs ring-1 ring-emerald-600"
                    : "border-gray-200 hover:bg-gray-50 text-gray-700"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Excel Workbook</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat("csv")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedFormat === "csv"
                    ? "border-blue-600 bg-blue-50/70 text-blue-700 shadow-xs ring-1 ring-blue-600"
                    : "border-gray-200 hover:bg-gray-50 text-gray-700"
                }`}
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>CSV Spreadsheet</span>
              </button>
            </div>
          </div>

          {/* Statement Period Options */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              2. Select Statement Period
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: "all", label: "All Time (Complete)", desc: "Lifetime history" },
                { id: "1m", label: "1 Month", desc: "Current month" },
                { id: "3m", label: "Last 3 Months", desc: "Quarterly" },
                { id: "6m", label: "Last 6 Months", desc: "Half-yearly" },
                { id: "12m", label: "Last 12 Months", desc: "Annual (1 Year)" },
                { id: "specific_month", label: "Specific Month", desc: "Select Month & Year" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriodOption(opt.id as StatementPeriodOption)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border transition-all ${
                    periodOption === opt.id
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-gray-200 hover:bg-gray-50 text-gray-800"
                  }`}
                >
                  <span className="text-xs font-bold leading-snug">{opt.label}</span>
                  <span
                    className={`text-[10px] mt-0.5 ${
                      periodOption === opt.id ? "text-slate-300" : "text-gray-500"
                    }`}
                  >
                    {opt.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Range Button */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setPeriodOption("custom")}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  periodOption === "custom"
                    ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                    : "border-gray-200 hover:bg-gray-50 text-gray-800"
                }`}
              >
                <span>Custom Date Range</span>
                <span
                  className={`text-[10px] font-normal ${
                    periodOption === "custom" ? "text-slate-300" : "text-gray-500"
                  }`}
                >
                  Choose specific From & To dates
                </span>
              </button>
            </div>
          </div>

          {/* Sub-Panel: Specific Month and Year */}
          {periodOption === "specific_month" && (
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Select Specific Month & Year</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Month
                  </label>
                  <select
                    value={specificMonth}
                    onChange={(e) => setSpecificMonth(Number(e.target.value))}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white font-medium focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <select
                    value={specificYear}
                    onChange={(e) => setSpecificYear(Number(e.target.value))}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white font-medium focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  >
                    {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Panel: Custom Date Range */}
          {periodOption === "custom" && (
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Specify Custom Period (From & To)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    Start Date (From)
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white font-medium focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 mb-1">
                    End Date (To)
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded-lg p-2 bg-white font-medium focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Period Summary & Accounting Rule Box */}
          <div
            className={`rounded-xl border p-4 space-y-1.5 transition-colors ${
              dateCalculation.isValid
                ? "border-emerald-200 bg-emerald-50/40 text-emerald-950"
                : "border-amber-200 bg-amber-50/50 text-amber-950"
            }`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                Effective Period:
              </span>
              <span className="font-bold font-mono text-emerald-900 bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                {dateCalculation.displayRange}
              </span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              {dateCalculation.accountingRule}
            </p>
          </div>

          {/* Validation Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!dateCalculation.isValid || isExporting}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
              selectedFormat === "pdf"
                ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                : selectedFormat === "excel"
                ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300"
                : "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating {selectedFormat.toUpperCase()}...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download {selectedFormat.toUpperCase()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
