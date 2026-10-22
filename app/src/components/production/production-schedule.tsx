"use client";

import { useState } from "react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import type { ProductionScheduleWithOrder } from "@/types/production";

interface ProductionScheduleProps {
  schedules: ProductionScheduleWithOrder[];
  startDate: string;
  endDate: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  SCHEDULED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export function ProductionSchedule({ schedules, startDate }: ProductionScheduleProps) {
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [selectedDate, setSelectedDate] = useState(new Date(startDate));

  const getWeekDays = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  };

  const weekDays = getWeekDays(selectedDate);

  const getSchedulesForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return schedules.filter((s) => s.schedule_date === dateStr);
  };

  const getTotalForDate = (date: Date) => {
    const daySchedules = getSchedulesForDate(date);
    return daySchedules.reduce((sum, s) => sum + Number(s.allocated_quantity), 0);
  };

  if (viewMode === "day") {
    const daySchedules = getSchedulesForDate(selectedDate);
    const totalQty = getTotalForDate(selectedDate);

    return (
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="p-2 rounded-sm hover:bg-gray-100"
              aria-label="Previous day"
            >
              ←
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </h2>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="p-2 rounded-sm hover:bg-gray-100"
              aria-label="Next day"
            >
              →
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Total allocated: <span className="font-medium">{totalQty.toLocaleString()}</span>
            </span>
            <button
              onClick={() => setViewMode("week")}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Week view
            </button>
          </div>
        </div>
        <div className="p-6">
          {daySchedules.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">📅</div>
              <p>No production scheduled for this day</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {daySchedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[s.production_order.status]}`}
                      >
                        {s.production_order.status}
                      </span>
                      <span className="font-medium text-gray-900 truncate">
                        {s.production_order.order_number}
                      </span>
                      <span className="text-sm text-gray-500">
                        {s.production_order.customer_name}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {s.production_order.product_name}
                      {s.production_order.product_sku && (
                        <> - {s.production_order.product_sku}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <span className="font-mono text-lg font-medium text-gray-900">
                      {Number(s.allocated_quantity).toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500">
                      {s.production_order.product_unit}
                    </span>
                    <span className="text-xs text-gray-400">Seq: {s.sequence_number}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
            className="p-2 rounded-sm hover:bg-gray-100"
            aria-label="Previous week"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            Week of {format(weekDays[0], "MMM d")} - {format(weekDays[6], "MMM d, yyyy")}
          </h2>
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            className="p-2 rounded-sm hover:bg-gray-100"
            aria-label="Next week"
          >
            →
          </button>
        </div>
        <button
          onClick={() => setViewMode("day")}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Day view
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" role="table">
          <thead className="bg-gray-50">
            <tr>
              {weekDays.map((day) => (
                <th key={day.toISOString()} scope="col" className="px-2 py-2 text-center">
                  <div className="text-xs font-medium text-gray-500 uppercase">{format(day, "EEE")}</div>
                  <div className="text-lg font-semibold text-gray-900">{format(day, "d")}</div>
                  <div className="text-xs text-gray-400">{format(day, "MMM")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {weekDays.map((day) => {
                const daySchedules = getSchedulesForDate(day);
                const totalQty = getTotalForDate(day);
                const isToday = isSameDay(day, new Date());
                const isPast = day < new Date() && !isToday;

                return (
                  <td
                    key={day.toISOString()}
                    className={`relative px-1 py-2 border-r border-gray-200 first:border-l last:border-r min-h-[120px] ${
                      isToday ? "bg-blue-50" : isPast ? "bg-gray-50" : ""
                    }`}
                    onClick={() => {
                      setSelectedDate(day);
                      setViewMode("day");
                    }}
                  >
                    {isToday && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full" aria-label="Today" />
                    )}
                    <div className="space-y-1">
                      {daySchedules.map((s) => (
                        <div
                          key={s.id}
                          className={`text-xs px-1.5 py-1 rounded truncate cursor-pointer ${
                            STATUS_COLORS[s.production_order.status]
                          }`}
                          title={`${s.production_order.order_number}: ${Number(s.allocated_quantity).toLocaleString()} ${s.production_order.product_unit}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {s.production_order.order_number} - {Number(s.allocated_quantity).toLocaleString()}
                        </div>
                      ))}
                      {daySchedules.length === 0 && totalQty === 0 && !isPast && (
                        <div className="text-xs text-gray-300 text-center py-4">—</div>
                      )}
                    </div>
                    <div className="absolute bottom-1 right-1 text-xs font-medium text-gray-500">
                      {totalQty > 0 ? totalQty.toLocaleString() : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}