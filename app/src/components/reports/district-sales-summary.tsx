"use client";

import React from "react";
import type { DistrictSalesSummaryItem } from "@/types/reports";
import { MapPin, Filter, X } from "lucide-react";

interface DistrictSalesSummaryProps {
  summary: DistrictSalesSummaryItem[];
  totals: DistrictSalesSummaryItem | null;
  selectedDistrict?: string;
  onSelectDistrict: (district: string | undefined) => void;
  isLoading?: boolean;
  onExportReport?: (variant: "gst_paid_summary" | "sale_details_product_wise", format: "csv" | "excel" | "pdf") => void;
}

export function DistrictSalesSummary({
  summary,
  totals,
  selectedDistrict,
  onSelectDistrict,
  isLoading,
  onExportReport,
}: DistrictSalesSummaryProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);

  const formatNumber = (val: number) =>
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(val || 0);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs animate-pulse">
        <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded mb-4" />
        <div className="h-32 bg-gray-50 rounded" />
      </div>
    );
  }

  if (!summary || summary.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden transition-all">
        <div className="p-4 sm:p-5 border-b border-gray-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E] border border-teal-200/60">
                <MapPin className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                District-Wise Sales Summary
              </h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Consolidated order counts, tax breakdown, and receivables by customer district.
            </p>
          </div>

          {selectedDistrict && (
            <div className="flex items-center gap-2 self-start sm:self-auto bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg text-xs font-medium text-[#0F766E]">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtered: <strong>{selectedDistrict}</strong></span>
              <button
                type="button"
                onClick={() => onSelectDistrict(undefined)}
                title="Clear district filter"
                className="ml-1 text-teal-700 hover:text-teal-900 focus:outline-none"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="p-8 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-2">
            <MapPin className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-gray-800">No sales data found</p>
          <p className="mt-1 text-xs text-gray-500">
            {selectedDistrict
              ? `No sales records found for district "${selectedDistrict}".`
              : "No sales records found for the selected filter criteria."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-gray-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E] border border-teal-200/60">
              <MapPin className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-gray-900 tracking-tight">
              District-Wise Sales Summary
            </h2>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Consolidated order counts, tax breakdown, and receivables by customer district. Click any district to filter detailed transactions below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {selectedDistrict && (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg text-xs font-medium text-[#0F766E]">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtered: <strong>{selectedDistrict}</strong></span>
              <button
                type="button"
                onClick={() => onSelectDistrict(undefined)}
                title="Clear district filter"
                className="ml-1 text-teal-700 hover:text-teal-900 focus:outline-none"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {onExportReport && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-600">GST Paid:</span>
                <button
                  type="button"
                  onClick={() => onExportReport("gst_paid_summary", "csv")}
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                  title="Export GST Paid / Sales Summary as CSV"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport("gst_paid_summary", "excel")}
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                  title="Export GST Paid / Sales Summary as Excel"
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport("gst_paid_summary", "pdf")}
                  className="rounded bg-[#0F766E] px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-[#0D655E] transition"
                  title="Export GST Paid / Sales Summary as PDF"
                >
                  PDF
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-600">Sale Details:</span>
                <button
                  type="button"
                  onClick={() => onExportReport("sale_details_product_wise", "csv")}
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                  title="Export Sale Details / Product-wise as CSV"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport("sale_details_product_wise", "excel")}
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                  title="Export Sale Details / Product-wise as Excel"
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport("sale_details_product_wise", "pdf")}
                  className="rounded bg-[#0F766E] px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-[#0D655E] transition"
                  title="Export Sale Details / Product-wise as PDF"
                >
                  PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
              <th className="px-4 py-3">District Name</th>
              <th className="px-3 py-3 text-right">Total Orders</th>
              <th className="px-3 py-3 text-right">Qty Sold</th>
              <th className="px-3 py-3 text-right">Taxable Sales</th>
              <th className="px-3 py-3 text-right">CGST</th>
              <th className="px-3 py-3 text-right">SGST</th>
              <th className="px-3 py-3 text-right">IGST</th>
              <th className="px-3 py-3 text-right">Total Sales</th>
              <th className="px-3 py-3 text-right">Amount Received</th>
              <th className="px-4 py-3 text-right">Outstanding Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {summary.map((row) => {
              const isSelected = selectedDistrict === row.district;
              const isUnknown = row.district === "Unknown District";

              return (
                <tr
                  key={row.district}
                  onClick={() => onSelectDistrict(isSelected ? undefined : row.district)}
                  className={`cursor-pointer transition-colors group ${
                    isSelected
                      ? "bg-teal-50/80 font-medium text-[#0F766E]"
                      : "hover:bg-slate-50/90"
                  }`}
                  title={`Click to ${isSelected ? "clear filter" : `filter transactions by ${row.district}`}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-semibold ${
                          isSelected
                            ? "text-[#0F766E] underline decoration-2 underline-offset-2"
                            : isUnknown
                            ? "text-slate-500 italic"
                            : "text-gray-900 group-hover:text-[#0F766E]"
                        }`}
                      >
                        {row.district}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] bg-[#0F766E] text-white px-1.5 py-0.2 rounded font-semibold ml-1">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                    {formatNumber(row.total_orders)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {formatNumber(row.total_quantity)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-gray-800">
                    {formatCurrency(row.taxable_sales)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-gray-600">
                    {formatCurrency(row.cgst)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-gray-600">
                    {formatCurrency(row.sgst)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-gray-600">
                    {formatCurrency(row.igst)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono font-semibold text-gray-900">
                    {formatCurrency(row.total_sales)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-emerald-700 font-medium">
                    {formatCurrency(row.amount_received)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-medium">
                    <span
                      className={
                        row.outstanding_amount > 0 ? "text-amber-700 font-semibold" : "text-gray-500"
                      }
                    >
                      {formatCurrency(row.outstanding_amount)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Overall Total Row */}
          {totals && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-slate-100 font-bold text-gray-900">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>OVERALL TOTAL</span>
                    <span className="text-[11px] font-normal text-gray-500">
                      ({summary.length} {summary.length === 1 ? "district" : "districts"})
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {formatNumber(totals.total_orders)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {formatNumber(totals.total_quantity)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono">
                  {formatCurrency(totals.taxable_sales)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono">
                  {formatCurrency(totals.cgst)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono">
                  {formatCurrency(totals.sgst)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono">
                  {formatCurrency(totals.igst)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-[#0F766E]">
                  {formatCurrency(totals.total_sales)}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap font-mono text-emerald-800">
                  {formatCurrency(totals.amount_received)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-amber-800">
                  {formatCurrency(totals.outstanding_amount)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
