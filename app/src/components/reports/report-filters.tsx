"use client";

import { useState, useEffect, useRef } from "react";
import type { ReportFilters, ReportType } from "@/types/reports";
import { getReportFilterLookups } from "@/lib/reports/actions";
import { DistrictSelect } from "@/components/reports/district-select";

interface ReportFiltersProps<T extends ReportFilters = ReportFilters> {
  reportType: ReportType;
  filters: T;
  onChange: (filters: T) => void;
  onExport?: (format: "csv" | "excel" | "pdf") => void;
  isExporting?: boolean;
}

type FilterKey =
  | "dateRange"
  | "startDate"
  | "endDate"
  | "district"
  | "customerId"
  | "productId"
  | "status"
  | "priority"
  | "orderId"
  | "paymentMethod"
  | "category"
  | "minDueAmount"
  | "rawMaterialId"
  | "lowStockOnly"
  | "productCondition";

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  order_status: [
    { value: "DRAFT", label: "Draft" },
    { value: "CONFIRMED", label: "Confirmed" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  payment_status: [
    { value: "PENDING", label: "Pending" },
    { value: "COMPLETED", label: "Completed" },
    { value: "FAILED", label: "Failed" },
    { value: "REFUNDED", label: "Refunded" },
  ],
  production_status: [
    { value: "PENDING", label: "Pending" },
    { value: "SCHEDULED", label: "Scheduled" },
    { value: "MATERIAL_READY", label: "Material Ready" },
    { value: "IN_PRODUCTION", label: "In Production" },
    { value: "QUALITY_CHECK", label: "Quality Check" },
    { value: "COMPLETED", label: "Completed" },
    { value: "READY_FOR_DISPATCH", label: "Ready for Dispatch" },
    { value: "ON_HOLD", label: "On Hold" },
    { value: "DELAYED", label: "Delayed" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  delivery_status: [
    { value: "READY", label: "Ready" },
    { value: "PACKED", label: "Packed" },
    { value: "DISPATCHED", label: "Dispatched" },
    { value: "IN_TRANSIT", label: "In Transit" },
    { value: "DELIVERED", label: "Delivered" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  min_due: [
    { value: "0", label: "> ₹0 (Any Due)" },
    { value: "1000", label: "> ₹1,000" },
    { value: "5000", label: "> ₹5,000" },
    { value: "10000", label: "> ₹10,000" },
    { value: "50000", label: "> ₹50,000" },
  ],
  return_status: [
    { value: "PENDING_INSPECTION", label: "Pending Inspection" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "POSTED", label: "Posted" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  product_condition: [
    { value: "SALEABLE", label: "Saleable" },
    { value: "DAMAGED", label: "Damaged" },
    { value: "REWORK", label: "Rework" },
    { value: "SCRAP", label: "Scrap" },
  ],
};

const BASE_FILTER_CONFIGS: Record<
  ReportType,
  { key: FilterKey; label: string; type: "select" | "date" | "checkbox"; options?: { value: string; label: string }[] }[]
> = {
  sales: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "district", label: "District", type: "select" },
    { key: "customerId", label: "Customer", type: "select" },
    { key: "productId", label: "Product", type: "select" },
    { key: "status", label: "Order Status", type: "select", options: STATUS_OPTIONS.order_status },
  ],
  orders: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "customerId", label: "Customer", type: "select" },
    { key: "status", label: "Order Status", type: "select", options: STATUS_OPTIONS.order_status },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "LOW", label: "Low" },
        { value: "NORMAL", label: "Normal" },
        { value: "HIGH", label: "High" },
        { value: "URGENT", label: "Urgent" },
      ],
    },
  ],
  payments: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "customerId", label: "Customer", type: "select" },
    { key: "orderId", label: "Order #", type: "select" },
    { key: "status", label: "Payment Status", type: "select", options: STATUS_OPTIONS.payment_status },
    {
      key: "paymentMethod",
      label: "Method",
      type: "select",
      options: [
        { value: "CASH", label: "Cash" },
        { value: "BANK_TRANSFER", label: "Bank Transfer" },
        { value: "CARD", label: "Card" },
        { value: "UPI", label: "UPI" },
        { value: "CHEQUE", label: "Cheque" },
        { value: "OTHER", label: "Other" },
      ],
    },
  ],
  customer_due: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "customerId", label: "Customer", type: "select" },
    { key: "minDueAmount", label: "Min Due", type: "select", options: STATUS_OPTIONS.min_due },
  ],
  expenses: [
    { key: "dateRange", label: "Period", type: "date" },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "MATERIALS", label: "Materials" },
        { value: "LABOR", label: "Labor" },
        { value: "UTILITIES", label: "Utilities" },
        { value: "RENT", label: "Rent" },
        { value: "TRANSPORT", label: "Transport" },
        { value: "MAINTENANCE", label: "Maintenance" },
        { value: "MARKETING", label: "Marketing" },
        { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
        { value: "OTHER", label: "Other" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "POSTED", label: "Posted" },
        { value: "DRAFT", label: "Draft" },
        { value: "PENDING", label: "Pending" },
        { value: "APPROVED", label: "Approved" },
        { value: "VOID", label: "Void" },
      ],
    },
  ],
  profit: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "customerId", label: "Customer", type: "select" },
  ],
  production: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "productId", label: "Product", type: "select" },
    { key: "status", label: "Production Status", type: "select", options: STATUS_OPTIONS.production_status },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "LOW", label: "Low" },
        { value: "NORMAL", label: "Normal" },
        { value: "HIGH", label: "High" },
        { value: "URGENT", label: "Urgent" },
      ],
    },
  ],
  inventory: [
    { key: "rawMaterialId", label: "Raw Material", type: "select" },
    { key: "lowStockOnly", label: "Low Stock Only", type: "checkbox" },
  ],
  delivery: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "orderId", label: "Order #", type: "select" },
    { key: "status", label: "Delivery Status", type: "select", options: STATUS_OPTIONS.delivery_status },
  ],
  returns: [
    { key: "dateRange", label: "Period", type: "date" },
    { key: "customerId", label: "Customer", type: "select" },
    { key: "orderId", label: "Order #", type: "select" },
    { key: "status", label: "Return Status", type: "select", options: STATUS_OPTIONS.return_status },
    { key: "productCondition", label: "Condition", type: "select", options: STATUS_OPTIONS.product_condition },
  ],
};

export function ReportFilters<T extends ReportFilters = ReportFilters>({
  reportType,
  filters,
  onChange,
  onExport,
  isExporting,
}: ReportFiltersProps<T>) {
  const [showCustomDate, setShowCustomDate] = useState(filters.dateRange === "custom");
  const [customStart, setCustomStart] = useState(filters.startDate || "");
  const [customEnd, setCustomEnd] = useState(filters.endDate || "");
  const [lookups, setLookups] = useState<{
    customers: { id: string; name: string }[];
    products: { id: string; name: string }[];
    rawMaterials: { id: string; name: string }[];
    orders: { id: string; order_number: string }[];
    districts: { value: string; label: string; state?: string }[];
  }>({
    customers: [],
    products: [],
    rawMaterials: [],
    orders: [],
    districts: [],
  });

  useEffect(() => {
    let isMounted = true;
    getReportFilterLookups()
      .then((data) => {
        if (isMounted) setLookups(data);
      })
      .catch((err) => console.error("Failed to load filter lookups:", err));
    return () => {
      isMounted = false;
    };
  }, []);

  const dateRangeOptions = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "this_month", label: "This Month" },
    { value: "custom", label: "Custom Range" },
  ];

  const handleRangeChange = (range: string) => {
    if (range === "custom") {
      setShowCustomDate(true);
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const start = customStart || filters.startDate || weekAgo;
      const end = customEnd || filters.endDate || today;
      setCustomStart(start);
      setCustomEnd(end);
      onChange({ ...filters, dateRange: "custom" as any, startDate: start, endDate: end });
    } else {
      setShowCustomDate(false);
      onChange({ ...filters, dateRange: range as any, startDate: undefined, endDate: undefined });
    }
  };

  const handleCustomDateChange = () => {
    if (customStart && customEnd) {
      onChange({ ...filters, dateRange: "custom" as any, startDate: customStart, endDate: customEnd });
    }
  };

  const handleSelectChange = (key: FilterKey, value: string) => {
    const newFilters = { ...filters } as Record<string, any>;
    newFilters[key] = value || undefined;
    onChange(newFilters as T);
  };

  const handleCheckboxChange = (key: FilterKey, checked: boolean) => {
    const newFilters = { ...filters } as Record<string, any>;
    newFilters[key] = checked;
    onChange(newFilters as T);
  };

  const getOptionsForField = (key: FilterKey, staticOptions?: { value: string; label: string }[]) => {
    if (staticOptions && staticOptions.length > 0) return staticOptions;
    if (key === "district") {
      return lookups.districts ?? [];
    }
    if (key === "customerId") {
      return lookups.customers.map((c) => ({ value: c.id, label: c.name }));
    }
    if (key === "productId") {
      return lookups.products.map((p) => ({ value: p.id, label: p.name }));
    }
    if (key === "rawMaterialId") {
      return lookups.rawMaterials.map((m) => ({ value: m.id, label: m.name }));
    }
    if (key === "orderId") {
      return lookups.orders.map((o) => ({ value: o.id, label: o.order_number }));
    }
    return [];
  };

  const baseConfig = BASE_FILTER_CONFIGS[reportType] || [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Dynamic Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {baseConfig.map((field) => (
            <div key={field.key} className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">{field.label}:</label>
              {field.type === "date" ? (
                <div className="flex flex-wrap items-center gap-1 bg-gray-50 rounded p-1 border border-gray-100">
                  {dateRangeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleRangeChange(option.value)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        (filters.dateRange || "this_month") === option.value
                          ? "bg-white shadow-xs text-[var(--accent)] font-semibold"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : field.type === "checkbox" ? (
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean((filters as Record<string, any>)[field.key])}
                    onChange={(e) => handleCheckboxChange(field.key, e.target.checked)}
                    className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <span>Show only below reorder level</span>
                </label>
              ) : field.key === "district" ? (
                <DistrictSelect
                  options={getOptionsForField("district") as any}
                  value={((filters as Record<string, any>).district as string) || ""}
                  onChange={(val) => handleSelectChange("district", val)}
                />
              ) : (
                <select
                  value={((filters as Record<string, any>)[field.key] as string) || ""}
                  onChange={(e) => handleSelectChange(field.key, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs sm:text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] max-w-[180px] truncate"
                >
                  <option value="">All {field.label}s</option>
                  {getOptionsForField(field.key, field.options).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Export Buttons */}
        {onExport && (
          <div className="flex items-center gap-2 self-start lg:self-center border-t lg:border-t-0 pt-3 lg:pt-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Export:</span>
            <button
              type="button"
              onClick={() => onExport("csv")}
              disabled={isExporting}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => onExport("excel")}
              disabled={isExporting}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-gray-50 disabled:opacity-50 transition shadow-2xs"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={() => onExport("pdf")}
              disabled={isExporting}
              className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
            >
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Custom Date Inputs */}
      {showCustomDate && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs sm:text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs sm:text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={handleCustomDateChange}
            disabled={!customStart || !customEnd}
            className="rounded bg-[var(--accent)] px-3 py-1 text-xs sm:text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            Apply Dates
          </button>
        </div>
      )}
    </div>
  );
}