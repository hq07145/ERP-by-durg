"use client";

import { useState, useTransition, useMemo } from "react";
import { format } from "date-fns";
import {
  Calendar,
  Filter,
  Download,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import type { CustomerLedgerEntryWithDetails, CustomerSummary } from "@/types/payment";
import { LEDGER_ENTRY_TYPE_COLORS, LEDGER_ENTRY_TYPE_LABELS } from "@/types/payment";
import { getCustomerPeriodBalanceStatement } from "@/lib/payments/actions";
import { exportReport } from "@/lib/reports/actions";
import { triggerDownload } from "@/lib/reports/export-client";

interface CustomerLedgerProps {
  customer: CustomerSummary;
  ledgerEntries: CustomerLedgerEntryWithDetails[];
  canView: boolean;
}

type DatePreset = "all" | "this_month" | "this_fiscal_year" | "last_30_days" | "custom";

export function CustomerLedger({ customer, ledgerEntries, canView }: CustomerLedgerProps) {
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [activePreset, setActivePreset] = useState<DatePreset>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Server-computed period statement when custom date filter is active
  const [periodStatement, setPeriodStatement] = useState<{
    openingBalance: number;
    openingBalanceType: "RECEIVABLE" | "PAYABLE";
    periodSales: number;
    periodPayments: number;
    periodCreditsAdjustments: number;
    periodDebitsAdjustments: number;
    closingBalance: number;
    closingBalanceType: "RECEIVABLE" | "PAYABLE";
    closingDue: number;
    closingAdvance: number;
  } | null>(null);

  // Helper to get date strings for presets
  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    let start = "";
    let end = todayStr;

    if (preset === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = firstDay.toISOString().split("T")[0];
    } else if (preset === "this_fiscal_year") {
      // Indian Financial Year: April 1 to March 31
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-indexed, 3 is April
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      start = `${fyStartYear}-04-01`;
      end = `${fyStartYear + 1}-03-31`;
    } else if (preset === "last_30_days") {
      const past30 = new Date(today);
      past30.setDate(today.getDate() - 30);
      start = past30.toISOString().split("T")[0];
    } else if (preset === "all") {
      start = "";
      end = "";
    }

    setStartDate(start);
    setEndDate(end);

    if (start && end) {
      startTransition(async () => {
        try {
          const res = await getCustomerPeriodBalanceStatement(customer.customer_id, start, end);
          if (res) {
            setPeriodStatement({
              openingBalance: res.openingBalance,
              openingBalanceType: res.openingBalanceType,
              periodSales: res.periodSales,
              periodPayments: res.periodPayments,
              periodCreditsAdjustments: res.periodCreditsAdjustments,
              periodDebitsAdjustments: res.periodDebitsAdjustments,
              closingBalance: res.closingBalance,
              closingBalanceType: res.closingBalanceType,
              closingDue: res.closingDue,
              closingAdvance: res.closingAdvance,
            });
          } else {
            setPeriodStatement(null);
          }
        } catch {
          setPeriodStatement(null);
        }
      });
    } else {
      setPeriodStatement(null);
    }
  };

  const handleCustomFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;
    setActivePreset("custom");

    const eDate = endDate || new Date().toISOString().split("T")[0];
    startTransition(async () => {
      try {
        const res = await getCustomerPeriodBalanceStatement(customer.customer_id, startDate, eDate);
        if (res) {
          setPeriodStatement({
            openingBalance: res.openingBalance,
            openingBalanceType: res.openingBalanceType,
            periodSales: res.periodSales,
            periodPayments: res.periodPayments,
            periodCreditsAdjustments: res.periodCreditsAdjustments,
            periodDebitsAdjustments: res.periodDebitsAdjustments,
            closingBalance: res.closingBalance,
            closingBalanceType: res.closingBalanceType,
            closingDue: res.closingDue,
            closingAdvance: res.closingAdvance,
          });
        }
      } catch (err) {
        console.error("Failed to load period balance:", err);
      }
    });
  };

  const handleExport = async (formatType: "csv" | "excel" | "pdf") => {
    setIsExporting(true);
    try {
      const { content, contentType, filename } = await exportReport(
        "customer_due",
        {
          customerId: customer.customer_id,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
        formatType
      );
      triggerDownload(content, contentType, filename);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert(err.message || "Failed to export customer ledger statement.");
    } finally {
      setIsExporting(false);
    }
  };

  // Find base opening balance record if present in raw entries
  const baseCobEntry = useMemo(
    () => ledgerEntries.find((e) => e.entry_type === "OPENING_BALANCE"),
    [ledgerEntries]
  );

  // Compute filtered ledger entries & dynamic running balance
  const displayData = useMemo(() => {
    // 1. Determine opening balance base
    let opBal = 0;
    let opType: "RECEIVABLE" | "PAYABLE" | "NONE" = "NONE";
    let signedOp = 0;
    let openingDate: string | null = null;

    if (!startDate && !endDate) {
      // All time view: base opening balance if configured
      if (baseCobEntry) {
        signedOp = Number(baseCobEntry.balance || 0);
        opBal = Math.abs(signedOp);
        opType = signedOp >= 0 ? "RECEIVABLE" : "PAYABLE";
        openingDate = baseCobEntry.entry_date;
      }
    } else {
      // Filtered period view
      if (periodStatement) {
        opBal = periodStatement.openingBalance;
        opType = periodStatement.openingBalanceType;
        signedOp = opType === "RECEIVABLE" ? Math.abs(opBal) : -Math.abs(opBal);
        openingDate = startDate || null;
      } else if (startDate) {
        let preDebit = 0;
        let preCredit = 0;
        for (const e of ledgerEntries) {
          if (e.entry_type === "OPENING_BALANCE") continue;
          if (e.entry_date < startDate) {
            preDebit += Number(e.debit || 0);
            preCredit += Number(e.credit || 0);
          }
        }
        const baseOb = baseCobEntry ? Number(baseCobEntry.balance || 0) : 0;
        signedOp = baseOb + preDebit - preCredit;
        opBal = Math.abs(signedOp);
        opType = signedOp >= 0 ? "RECEIVABLE" : "PAYABLE";
        openingDate = startDate;
      }
    }

    // 2. Filter transactions (excluding opening balance entry itself)
    const filteredTx = ledgerEntries.filter((e) => {
      if (e.entry_type === "OPENING_BALANCE") return false;
      if (startDate && e.entry_date < startDate) return false;
      if (endDate && e.entry_date > endDate) return false;
      return true;
    });

    // 3. Chronological order (oldest first) with stable secondary & tertiary sort keys
    const chronological = [...filteredTx].sort((a, b) => {
      const cmpDate = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime();
      if (cmpDate !== 0) return cmpDate;
      const cmpCreated = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (cmpCreated !== 0) return cmpCreated;
      return (a.id || "").localeCompare(b.id || "");
    });

    // 4. Calculate chronological running balance forward
    let running = signedOp;
    let periodSales = 0;
    let periodPayments = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const entriesWithRunning = chronological.map((e) => {
      const d = Number(e.debit || 0);
      const c = Number(e.credit || 0);
      totalDebit += d;
      totalCredit += c;
      if (e.entry_type === "INVOICE") periodSales += d;
      if (e.entry_type === "PAYMENT") periodPayments += c;

      running = Math.round((running + d - c) * 100) / 100;
      return {
        ...e,
        balance: running,
      };
    });

    // 5. Stable newest-first display (preserves chronologically calculated row balances)
    const displayEntries = [...entriesWithRunning].reverse();

    const closingBalance = Math.round(running * 100) / 100;
    const closingDue = closingBalance > 0 ? closingBalance : 0;
    const closingAdvance = closingBalance < 0 ? Math.abs(closingBalance) : 0;

    const finalSales = (!startDate && !endDate)
      ? Math.max(periodSales, Number(customer.total_purchases || 0))
      : (periodStatement ? periodStatement.periodSales : periodSales);

    const finalPayments = (!startDate && !endDate)
      ? Math.max(periodPayments, Number(customer.total_paid || 0))
      : (periodStatement ? periodStatement.periodPayments : periodPayments);

    return {
      entries: displayEntries,
      openingBalance: opBal,
      openingBalanceType: opType,
      openingDate,
      periodSales: finalSales,
      periodPayments: finalPayments,
      totalDebit,
      totalCredit,
      closingBalance: periodStatement ? periodStatement.closingBalance : closingBalance,
      closingDue: periodStatement ? periodStatement.closingDue : closingDue,
      closingAdvance: periodStatement ? periodStatement.closingAdvance : closingAdvance,
    };
  }, [ledgerEntries, startDate, endDate, periodStatement, customer, baseCobEntry]);

  return (
    <div className="space-y-6">
      {/* Date Range Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              Period:
            </span>
            <button
              type="button"
              onClick={() => applyPreset("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePreset === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => applyPreset("this_month")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePreset === "this_month"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset("this_fiscal_year")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePreset === "this_fiscal_year"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              This Fiscal Year (FY)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("last_30_days")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activePreset === "last_30_days"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Last 30 Days
            </button>
          </div>

          {/* Custom Date Form */}
          <form onSubmit={handleCustomFilterSubmit} className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                placeholder="From date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                placeholder="To date"
              />
            </div>
            <button
              type="submit"
              disabled={!startDate || isPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              <Filter className="w-3 h-3" />
              Apply
            </button>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => applyPreset("all")}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                title="Reset to All Time"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Statement Export Dropdown */}
          <div className="flex items-center gap-1.5 border-t lg:border-t-0 pt-3 lg:pt-0">
            <span className="text-xs text-gray-500 font-medium">Export:</span>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50"
            >
              <FileText className="w-3 h-3" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => handleExport("excel")}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3 h-3" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Accounting Reconciled Period Cards (Requirement 1 & 2 & 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Opening Balance */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-medium text-amber-800 mb-1">
            <span>Opening Balance</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                displayData.openingBalanceType === "RECEIVABLE"
                  ? "bg-amber-200 text-amber-900"
                  : displayData.openingBalanceType === "PAYABLE"
                  ? "bg-teal-200 text-teal-900"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {displayData.openingBalanceType === "RECEIVABLE"
                ? "DUE"
                : displayData.openingBalanceType === "PAYABLE"
                ? "ADVANCE"
                : "NIL"}
            </span>
          </div>
          <p className="text-xl font-bold text-amber-950 font-mono">
            ₹{displayData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-amber-700/80 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {displayData.openingDate ? `As of ${displayData.openingDate}` : "Initial Setup"}
          </p>
        </div>

        {/* 2. Period Sales */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-blue-800 mb-1">
            <span>Period Sales / Invoices</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-blue-950 font-mono">
            ₹{displayData.periodSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-blue-600/80 mt-1">+ Debits to account</p>
        </div>

        {/* 3. Period Payments */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-800 mb-1">
            <span>Payments Received</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-emerald-950 font-mono">
            ₹{displayData.periodPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-emerald-600/80 mt-1">− Credits to account</p>
        </div>

        {/* 4. Closing Receivable (Strictly separate from advance) */}
        <div
          className={`rounded-xl border p-4 ${
            displayData.closingDue > 0
              ? "border-red-200 bg-red-50/50"
              : "border-gray-200 bg-gray-50/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-gray-700 mb-1">
            <span className={displayData.closingDue > 0 ? "text-red-800 font-semibold" : ""}>
              Closing Receivable
            </span>
            {displayData.closingDue > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
            )}
          </div>
          <p
            className={`text-xl font-bold font-mono ${
              displayData.closingDue > 0 ? "text-red-700" : "text-gray-500"
            }`}
          >
            ₹{displayData.closingDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p
            className={`text-[11px] mt-1 ${
              displayData.closingDue > 0 ? "text-red-600/80 font-medium" : "text-gray-400"
            }`}
          >
            {displayData.closingDue > 0 ? "Customer owes company" : "No pending dues"}
          </p>
        </div>

        {/* 5. Customer Advance Balance (Separately displayed, never negative) */}
        <div
          className={`rounded-xl border p-4 ${
            displayData.closingAdvance > 0
              ? "border-teal-200 bg-teal-50/50"
              : "border-gray-200 bg-gray-50/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-gray-700 mb-1">
            <span className={displayData.closingAdvance > 0 ? "text-teal-800 font-semibold" : ""}>
              Advance Balance
            </span>
            <Wallet
              className={`w-3.5 h-3.5 ${
                displayData.closingAdvance > 0 ? "text-teal-600" : "text-gray-400"
              }`}
            />
          </div>
          <p
            className={`text-xl font-bold font-mono ${
              displayData.closingAdvance > 0 ? "text-teal-700" : "text-gray-500"
            }`}
          >
            ₹{displayData.closingAdvance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p
            className={`text-[11px] mt-1 ${
              displayData.closingAdvance > 0 ? "text-teal-600/80 font-medium" : "text-gray-400"
            }`}
          >
            {displayData.closingAdvance > 0 ? "Available unallocated credit" : "Nil customer advance"}
          </p>
        </div>
      </div>

      {/* Ledger Entries Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50/50">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span>Financial Ledger Entries</span>
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-mono">
                {displayData.entries.length} records
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Opening balance + period debits − period credits = running closing balance
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200">
              Total Dr: ₹{displayData.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              Total Cr: ₹{displayData.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" role="table">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Particulars / Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Debit (Dr ₹)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Credit (Cr ₹)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Running Balance (₹)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ref #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {/* If filtered by date and opening balance exists, display opening balance row */}
              {startDate && (
                <tr className="bg-amber-50/40 font-medium">
                  <td className="px-4 py-3 text-amber-900 whitespace-nowrap text-xs">
                    {format(new Date(startDate), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                      OPENING BALANCE
                    </span>
                  </td>
                  <td className="px-4 py-3 text-amber-900 text-xs">
                    Balance brought forward as of {format(new Date(startDate), "MMM d, yyyy")} ({displayData.openingBalanceType})
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-900">
                    {displayData.openingBalanceType === "RECEIVABLE" && displayData.openingBalance > 0
                      ? displayData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-amber-900">
                    {displayData.openingBalanceType === "PAYABLE" && displayData.openingBalance > 0
                      ? displayData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    <span
                      className={
                        displayData.openingBalanceType === "RECEIVABLE"
                          ? "text-red-700"
                          : displayData.openingBalanceType === "PAYABLE"
                          ? "text-teal-700"
                          : "text-gray-700"
                      }
                    >
                      {displayData.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-[10px] ml-1 font-normal uppercase">
                        {displayData.openingBalanceType === "RECEIVABLE" ? "Dr" : "Cr"}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-amber-700/70 font-mono">B/F</td>
                </tr>
              )}

              {displayData.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <div className="text-3xl mb-2">📋</div>
                    <p className="font-medium text-gray-700">No ledger transactions in this period</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {startDate ? "Try broadening the date range or select All Time" : "No orders or payments recorded yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                displayData.entries.map((entry) => {
                  const bal = Number(entry.balance || 0);
                  const isOb = entry.entry_type === "OPENING_BALANCE";
                  return (
                    <tr
                      key={entry.id}
                      className={isOb ? "bg-amber-50/50 font-medium" : "hover:bg-gray-50/80 transition-colors"}
                    >
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {format(new Date(entry.entry_date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            LEDGER_ENTRY_TYPE_COLORS[entry.entry_type] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {LEDGER_ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-900 max-w-sm truncate" title={entry.description}>
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-blue-900 font-medium">
                        {Number(entry.debit) > 0
                          ? Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-emerald-900 font-medium">
                        {Number(entry.credit) > 0
                          ? Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                        <span className={bal >= 0 ? "text-red-700" : "text-teal-700"}>
                          {Math.abs(bal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-[10px] ml-1 font-normal uppercase">
                            {bal >= 0 ? "Dr" : "Cr"}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {entry.order_number ? (
                          <a
                            href={`/orders/${entry.order_id}`}
                            className="text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {entry.order_number}
                          </a>
                        ) : entry.payment_number ? (
                          <a
                            href={`/payments/${entry.payment_id}`}
                            className="text-slate-900 hover:text-emerald-600 hover:underline"
                          >
                            {entry.payment_number}
                          </a>
                        ) : entry.entry_type === "PAYMENT" ? (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200"
                            title="Legitimate legacy payment record preserved in ledger"
                          >
                            LEGACY-PAY
                          </span>
                        ) : entry.entry_type === "INVOICE" ? (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200"
                            title="Legitimate legacy invoice record preserved in ledger"
                          >
                            LEGACY-INV
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer with Closing Balance Reconciled */}
            <tfoot className="bg-gray-100/80 border-t-2 border-gray-300 font-semibold text-xs text-gray-900">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-700">
                  CLOSING RECONCILIATION SUMMARY
                  {endDate && ` (As of ${format(new Date(endDate), "MMM d, yyyy")})`}
                </td>
                <td className="px-4 py-3 text-right font-mono text-blue-900">
                  ₹{displayData.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-emerald-900">
                  ₹{displayData.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  {displayData.closingDue > 0 ? (
                    <span className="text-red-700">
                      ₹{displayData.closingDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      <span className="text-[10px] uppercase font-normal">(Receivable)</span>
                    </span>
                  ) : displayData.closingAdvance > 0 ? (
                    <span className="text-teal-700">
                      ₹{displayData.closingAdvance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      <span className="text-[10px] uppercase font-normal">(Advance)</span>
                    </span>
                  ) : (
                    <span className="text-gray-500">₹0.00 (Nil Balance)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}