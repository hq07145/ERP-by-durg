"use client";

import { useState, useMemo, useEffect } from "react";
import type { ReportType, ReportRow } from "@/types/reports";
import { REPORT_CONFIGS } from "@/types/reports";
import { calculateReportTotals } from "@/lib/reports/totals";

interface ReportTableProps {
  reportType: ReportType;
  rows: ReportRow[];
  pageSize?: number;
  onPageChange?: (page: number) => void;
  totalCount?: number;
  currentPage?: number;
  isLoading?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export function ReportTable({
  reportType,
  rows,
  pageSize = 50,
  onPageChange,
  totalCount,
  currentPage = 1,
  isLoading,
}: ReportTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [localPage, setLocalPage] = useState(currentPage);
  const [localPageSize, setLocalPageSize] = useState(pageSize);

  useEffect(() => {
    setLocalPage(currentPage);
  }, [currentPage]);

  const config = REPORT_CONFIGS[reportType];

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      const aVal = (a as any)[sortConfig.key];
      const bVal = (b as any)[sortConfig.key];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortConfig.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [rows, sortConfig]);

  // When onPageChange is provided, pagination is server-side; do not double-slice
  const isServerPaginated = !!onPageChange;
  const paginatedRows = useMemo(() => {
    if (isServerPaginated) return sortedRows;
    const start = (localPage - 1) * localPageSize;
    return sortedRows.slice(start, start + localPageSize);
  }, [sortedRows, localPage, localPageSize, isServerPaginated]);

  const totalRecords = totalCount !== undefined ? totalCount : rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / localPageSize));

  const totals = useMemo(() => {
    return calculateReportTotals(reportType, rows);
  }, [reportType, rows]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setLocalPage(page);
    onPageChange?.(page);
  };

  const handlePageSizeChange = (size: number) => {
    setLocalPageSize(size);
    setLocalPage(1);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(val);

  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") {
      if (
        key.includes("amount") ||
        key.includes("price") ||
        key.includes("total") ||
        key.includes("paid") ||
        key.includes("due") ||
        key.includes("profit") ||
        key.includes("sales") ||
        key.includes("expenses") ||
        key.includes("purchases") ||
        key.includes("credit_limit") ||
        key.includes("balance") ||
        key.includes("receivable") ||
        key.includes("advance")
      ) {
        return formatCurrency(value);
      }
      return new Intl.NumberFormat("en-IN").format(value);
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value instanceof Date) return value.toLocaleDateString("en-IN");
    return String(value);
  };

  // Generate columns based on report type
  const columns: { key: string; header: string; align?: "left" | "right" }[] = (() => {
    switch (reportType) {
      case "sales":
        return [
          { key: "order_number", header: "Order #" },
          { key: "order_date", header: "Date" },
          { key: "customer_name", header: "Customer" },
          { key: "customer_district", header: "District" },
          { key: "product_name", header: "Product" },
          { key: "quality_standard", header: "Quality Standard" },
          { key: "quantity", header: "Qty", align: "right" },
          { key: "qty_is_4985", header: "IS:4985", align: "right" },
          { key: "qty_is_12786", header: "IS:12786", align: "right" },
          { key: "qty_is_13487", header: "IS:13487", align: "right" },
          { key: "qty_is_13488", header: "IS:13488", align: "right" },
          { key: "qty_is_12785", header: "IS:12785", align: "right" },
          { key: "unit_price", header: "Unit Price", align: "right" },
          { key: "cgst_amount", header: "CGST", align: "right" },
          { key: "sgst_amount", header: "SGST", align: "right" },
          { key: "igst_amount", header: "IGST", align: "right" },
          { key: "line_total", header: "Line Total", align: "right" },
          { key: "paid_amount", header: "Paid", align: "right" },
          { key: "outstanding_amount", header: "Outstanding", align: "right" },
          { key: "order_status", header: "Status" },
        ];
      case "orders":
        return [
          { key: "order_number", header: "Order #" },
          { key: "order_date", header: "Date" },
          { key: "customer_name", header: "Customer" },
          { key: "priority", header: "Priority" },
          { key: "status", header: "Status" },
          { key: "subtotal", header: "Subtotal", align: "right" },
          { key: "cgst_amount", header: "CGST", align: "right" },
          { key: "sgst_amount", header: "SGST", align: "right" },
          { key: "igst_amount", header: "IGST", align: "right" },
          { key: "total_amount", header: "Total", align: "right" },
          { key: "paid_amount", header: "Paid", align: "right" },
          { key: "due_amount", header: "Due", align: "right" },
          { key: "delivery_status", header: "Delivery" },
        ];
      case "payments":
        return [
          { key: "payment_number", header: "Payment #" },
          { key: "payment_date", header: "Date" },
          { key: "customer_name", header: "Customer" },
          { key: "order_number", header: "Order #" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "payment_method", header: "Method" },
          { key: "status", header: "Status" },
        ];
      case "customer_due":
        return [
          { key: "customer_name", header: "Customer" },
          { key: "customer_company", header: "Company" },
          { key: "opening_balance", header: "Opening Balance", align: "right" },
          { key: "period_sales", header: "Period Sales", align: "right" },
          { key: "period_payments", header: "Payments", align: "right" },
          { key: "closing_receivable", header: "Closing Receivable", align: "right" },
          { key: "closing_advance", header: "Advance Balance", align: "right" },
          { key: "last_payment_date", header: "Last Payment" },
          { key: "credit_limit", header: "Credit Limit", align: "right" },
        ];
      case "expenses":
        return [
          { key: "category", header: "Category" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "expense_date", header: "Date" },
          { key: "description", header: "Description" },
          { key: "status", header: "Status" },
        ];
      case "profit":
        return [
          { key: "period", header: "Period" },
          { key: "gross_sales", header: "Gross Sales", align: "right" },
          { key: "discounts", header: "Discounts", align: "right" },
          { key: "tax", header: "Tax", align: "right" },
          { key: "net_sales", header: "Net Sales", align: "right" },
          { key: "payments_received", header: "Received", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
          { key: "total_expenses", header: "Expenses", align: "right" },
          { key: "profit", header: "Estimated Profit", align: "right" },
        ];
      case "production":
        return [
          { key: "order_number", header: "Order #" },
          { key: "customer_name", header: "Customer" },
          { key: "product_name", header: "Product" },
          { key: "quantity", header: "Qty", align: "right" },
          { key: "status", header: "Status" },
          { key: "priority", header: "Priority" },
          { key: "scheduled_start_date", header: "Start Date" },
          { key: "scheduled_end_date", header: "End Date" },
        ];
      case "inventory":
        return [
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "unit", header: "Unit" },
          { key: "current_stock", header: "Current", align: "right" },
          { key: "reserved_stock", header: "Reserved", align: "right" },
          { key: "available_stock", header: "Available", align: "right" },
          { key: "reorder_level", header: "Reorder", align: "right" },
          { key: "is_low_stock", header: "Low Stock" },
        ];
      case "delivery":
        return [
          { key: "order_number", header: "Order #" },
          { key: "delivery_number", header: "Delivery #" },
          { key: "customer_name", header: "Customer" },
          { key: "delivery_date", header: "Delivery Date" },
          { key: "sku", header: "SKU" },
          { key: "product_name", header: "Product" },
          { key: "ordered_quantity", header: "Ordered Qty", align: "right" },
          { key: "dispatched_quantity", header: "Dispatched Qty", align: "right" },
          { key: "remaining_quantity", header: "Remaining Qty", align: "right" },
          { key: "status", header: "Status" },
          { key: "vehicle", header: "Vehicle" },
          { key: "driver", header: "Driver" },
        ];
      case "returns":
        return [
          { key: "return_number", header: "Return #" },
          { key: "return_date", header: "Return Date" },
          { key: "customer_name", header: "Customer" },
          { key: "order_number", header: "Order #" },
          { key: "delivery_number", header: "Delivery #" },
          { key: "sku", header: "SKU" },
          { key: "product_name", header: "Product" },
          { key: "returned_quantity", header: "Returned Qty", align: "right" },
          { key: "product_condition", header: "Condition" },
          { key: "status", header: "Status" },
          { key: "adjustment_type", header: "Adjustment" },
          { key: "adjustment_amount", header: "Amount", align: "right" },
          { key: "reason", header: "Reason" },
        ];
      default:
        return [];
    }
  })();

  const hasTotals = Object.keys(totals).length > 0;

  if (isLoading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-xs">
        <div className="h-1 w-full bg-teal-100 overflow-hidden">
          <div className="h-full bg-[#0F766E] animate-pulse w-full" />
        </div>
        <div className="p-10 text-center space-y-3">
          <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-[#0F766E] border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-2xl mb-3">
          📊
        </div>
        <h4 className="text-sm font-semibold text-gray-900">
          {reportType === "sales" ? "No sales data found" : "No records found"}
        </h4>
        <p className="mt-1 text-xs text-gray-500">
          {reportType === "sales"
            ? "No sales data matches the selected filters. Try selecting another district or broadening your filter range."
            : "No data matches the selected filters. Try broadening your filter range."}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white overflow-hidden shadow-xs relative transition-opacity duration-200 ${isLoading ? "opacity-75" : ""}`}>
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 z-20 h-1 bg-teal-100 overflow-hidden">
          <div className="h-full bg-[#0F766E] animate-pulse w-full" />
        </div>
      )}
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="grid">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : "justify-start"}`}>
                    {col.header}
                    {sortConfig?.key === col.key && (
                      <span className="text-[var(--accent)] font-bold">
                        {sortConfig.direction === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm font-medium text-gray-500"
                >
                  No sales data found
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 text-gray-900 whitespace-nowrap tabular-nums ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {formatValue((row as any)[col.key], col.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {hasTotals && (
            <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
              <tr>
                {columns.map((col, idx) => {
                  const val = totals[col.key];
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 text-xs text-gray-900 whitespace-nowrap tabular-nums ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {idx === 0 && !val ? (
                        <span className="text-xs uppercase font-bold text-gray-700">Totals:</span>
                      ) : val !== undefined ? (
                        formatValue(val, col.key)
                      ) : (
                        ""
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 px-4 py-3 gap-3">
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs sm:text-sm text-gray-600">Rows per page:</span>
          <select
            value={localPageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 text-xs sm:text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
            Page {localPage} of {totalPages} ({totalRecords} total)
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(localPage - 1)}
            disabled={localPage <= 1}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs sm:text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => handlePageChange(localPage + 1)}
            disabled={localPage >= totalPages}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs sm:text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}