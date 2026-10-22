"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ProfitSummary, ExpenseByCategory } from "@/types/expense";

interface ProfitDashboardProps {
  profitSummary: ProfitSummary | null;
  expensesByCategory: ExpenseByCategory[];
  canViewOrders: boolean;
  canViewExpenses: boolean;
  startDate?: string;
  endDate?: string;
  onDateChange?: (startDate: string | undefined, endDate: string | undefined) => void;
}

export function ProfitDashboard({
  profitSummary,
  expensesByCategory,
  canViewOrders,
  canViewExpenses,
  startDate,
  endDate,
  onDateChange,
}: ProfitDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleDateChange = (newStart?: string, newEnd?: string) => {
    if (onDateChange) {
      onDateChange(newStart, newEnd);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (newStart) params.set("startDate", newStart);
    else params.delete("startDate");
    if (newEnd) params.set("endDate", newEnd);
    else params.delete("endDate");
    router.push(`/profit?${params.toString()}`);
  };

  const handleResetFilters = () => {
    router.push("/profit");
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const profit = profitSummary?.profit ?? 0;
  const isProfitable = Number(profit) >= 0;

  return (
    <div className="space-y-6">
      {/* COGS & Estimated Profit Disclaimer (Requirement 8) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-amber-900">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <h4 className="font-semibold text-sm text-amber-950">Estimated Operating Profit Notice</h4>
            <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
              Profit is derived as <strong>Net Sales Revenue minus Operating Expenses</strong>. Direct production
              costs and raw-material COGS (Cost of Goods Sold) are not tracked on a per-order basis. This summary
              represents an <strong>estimated operating margin</strong> and not final net margin.
            </p>
          </div>
        </div>
      </div>

      {/* Date Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor="startDate" className="text-xs font-medium text-gray-600">From:</label>
              <input
                id="startDate"
                type="date"
                value={startDate ?? ""}
                onChange={(e) => handleDateChange(e.target.value || undefined, endDate)}
                className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="endDate" className="text-xs font-medium text-gray-600">To:</label>
              <input
                id="endDate"
                type="date"
                value={endDate ?? ""}
                onChange={(e) => handleDateChange(startDate, e.target.value || undefined)}
                className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>
          {(startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-gray-600 hover:text-gray-900 underline self-start sm:self-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Profit Summary Cards */}
      {profitSummary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Gross Sales</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(profitSummary.gross_sales)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Sum of order subtotals</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Discounts</p>
            <p className="text-2xl font-bold text-red-600 mt-1">-{formatCurrency(profitSummary.discounts)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Discounts given</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Tax</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">+{formatCurrency(profitSummary.tax)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Taxes collected</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Net Sales (Revenue)</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(profitSummary.net_sales)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Recognized revenue</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Total Expenses</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(profitSummary.total_expenses)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Posted expenses</p>
          </div>
          <div className={`rounded-lg border border-gray-200 bg-white p-4 ${isProfitable ? "border-green-300 bg-green-50/20" : "border-red-300 bg-red-50/20"}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500 uppercase">Estimated Profit</p>
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Est.</span>
            </div>
            <p className={`text-2xl font-bold mt-1 ${isProfitable ? "text-green-700" : "text-red-700"}`}>
              {isProfitable ? "+" : ""}{formatCurrency(profitSummary.profit)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Net Sales − OpEx</p>
          </div>
        </div>
      )}

      {/* Detailed Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales & Cash Collection Breakdown */}
        {profitSummary && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-3">Sales & Revenue Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">Gross Sales (Subtotal)</span>
                <span className="font-medium text-gray-900">{formatCurrency(profitSummary.gross_sales)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">Less: Discounts</span>
                <span className="font-medium text-red-600">-{formatCurrency(profitSummary.discounts)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">Add: Taxes</span>
                <span className="font-medium text-gray-900">+{formatCurrency(profitSummary.tax)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200 font-semibold text-sm">
                <span className="text-gray-900">Net Sales Revenue</span>
                <span className="text-green-700">{formatCurrency(profitSummary.net_sales)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">Payments Received (Cash Collection)</span>
                <span className="font-medium text-blue-700">{formatCurrency(profitSummary.payments_received)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">Outstanding Dues (Receivables)</span>
                <span className="font-medium text-orange-700">{formatCurrency(profitSummary.outstanding)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm text-gray-500">
                <span>Confirmed Orders Count</span>
                <span className="font-medium text-gray-700">{Number(profitSummary.order_count).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Expenses Breakdown */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-lg font-semibold text-gray-900">Expenses by Category</h3>
            {canViewExpenses && (
              <Link href="/expenses" className="text-xs text-[var(--accent)] hover:underline font-medium">
                Manage Expenses →
              </Link>
            )}
          </div>
          {expensesByCategory.length > 0 ? (
            <div className="space-y-3">
              {expensesByCategory.map((item) => (
                <div key={item.category} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{item.category}</span>
                    <p className="text-xs text-gray-500">{Number(item.expense_count).toLocaleString()} records</p>
                  </div>
                  <span className="font-semibold text-red-700">{formatCurrency(item.total_amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8 text-sm">No posted expenses in selected date range</p>
          )}
        </div>
      </div>
    </div>
  );
}