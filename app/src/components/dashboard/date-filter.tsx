"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DASHBOARD_DATE_RANGE_OPTIONS, type DashboardFilters, type DashboardDateRange } from "@/types/dashboard";

interface DateFilterProps {
  filters: DashboardFilters;
  onChange?: (filters: DashboardFilters) => void;
}

export function DateFilter({ filters, onChange }: DateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showCustom, setShowCustom] = useState(filters.dateRange === "custom");
  const [customStart, setCustomStart] = useState(filters.customStartDate || "");
  const [customEnd, setCustomEnd] = useState(filters.customEndDate || "");

  const applyNewFilters = (newFilters: DashboardFilters) => {
    if (onChange) {
      onChange(newFilters);
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("dateRange", newFilters.dateRange);
    if (newFilters.customStartDate) {
      params.set("customStartDate", newFilters.customStartDate);
    } else {
      params.delete("customStartDate");
    }
    if (newFilters.customEndDate) {
      params.set("customEndDate", newFilters.customEndDate);
    } else {
      params.delete("customEndDate");
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  const handleRangeChange = (range: DashboardDateRange) => {
    if (range === "custom") {
      setShowCustom(true);
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const start = customStart || filters.customStartDate || weekAgo;
      const end = customEnd || filters.customEndDate || today;
      setCustomStart(start);
      setCustomEnd(end);
      applyNewFilters({
        dateRange: "custom",
        customStartDate: start,
        customEndDate: end,
      });
    } else {
      setShowCustom(false);
      applyNewFilters({ dateRange: range });
    }
  };

  const handleCustomDateChange = () => {
    if (customStart && customEnd) {
      applyNewFilters({
        dateRange: "custom",
        customStartDate: customStart,
        customEndDate: customEnd,
      });
    }
  };

  const getRangeLabel = (range: DashboardDateRange) => {
    const option = DASHBOARD_DATE_RANGE_OPTIONS.find((o) => o.value === range);
    return option?.label || range;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">Period:</span>
          <div className="flex flex-wrap items-center gap-1 bg-gray-50 rounded p-1 border border-gray-100 max-w-full">
            {DASHBOARD_DATE_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRangeChange(option.value as DashboardDateRange)}
                className={`px-2.5 py-1 text-xs sm:text-sm font-medium rounded transition-colors whitespace-nowrap ${
                  filters.dateRange === option.value
                    ? "bg-white shadow-sm text-[var(--accent)] font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs sm:text-sm text-gray-500 self-end sm:self-center">
          Showing: <span className="font-semibold text-gray-900">{getRangeLabel(filters.dateRange)}</span>
        </div>
      </div>

      {showCustom && (
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
            className="rounded bg-[var(--accent)] px-3 py-1 text-xs sm:text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  );
}