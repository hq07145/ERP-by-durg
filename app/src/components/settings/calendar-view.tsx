"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sun,
  Moon,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isSameDay, isToday, addDays } from "date-fns";
import type { CalendarDay, CalendarDayFormValues } from "@/types/settings";

interface CalendarViewProps {
  initialStartDate?: string;
  initialEndDate?: string;
  onDateSelect?: (date: string) => void;
}

export function CalendarView({ initialStartDate, initialEndDate, onDateSelect }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, CalendarDay>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<string>("");
  const [modalValues, setModalValues] = useState<CalendarDayFormValues>({
    calendar_date: "",
    is_working_day: true,
    note: "",
  });
  const [isModalSaving, setIsModalSaving] = useState(false);

  const fetchCalendar = useCallback(async () => {
    setIsLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

      const response = await fetch(`/api/calendar?start_date=${start}&end_date=${end}`);
      if (response.ok) {
        const data = await response.json();
        const map: Record<string, CalendarDay> = {};
        for (const day of data) {
          map[day.calendar_date] = day;
        }
        setCalendarData(map);
      }
    } catch (error) {
      console.error("Failed to fetch calendar:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const getDayStatus = (date: Date): CalendarDay | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return calendarData[dateStr] || null;
  };

  const isWorkingDay = (date: Date): boolean => {
    const day = getDayStatus(date);
    if (day) return day.is_working_day;
    // Default: Mon-Fri
    const dow = date.getDay();
    return dow >= 1 && dow <= 5;
  };

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setSelectedDate(dateStr);
    if (onDateSelect) onDateSelect(dateStr);
  };

  const handleSetDay = (date: Date, isWorking: boolean, note?: string) => {
    setModalDate(format(date, "yyyy-MM-dd"));
    setModalValues({
      calendar_date: format(date, "yyyy-MM-dd"),
      is_working_day: isWorking,
      note: note || "",
    });
    setShowModal(true);
  };

  const handleRemoveDay = async (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    if (!confirm(`Remove calendar entry for ${format(date, "MMM d, yyyy")}? This will revert to default working day pattern.`)) {
      return;
    }

    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_day", date: dateStr }),
      });
      if (response.ok) {
        fetchCalendar();
      }
    } catch (error) {
      console.error("Failed to remove calendar day:", error);
    }
  };

  const handleModalSave = async () => {
    setIsModalSaving(true);
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_day", ...modalValues }),
      });
      if (response.ok) {
        setShowModal(false);
        fetchCalendar();
      }
    } catch (error) {
      console.error("Failed to save calendar day:", error);
    } finally {
      setIsModalSaving(false);
    }
  };

  // Generate calendar weeks
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const weeks: Date[][] = [];
  let week: Date[] = [];
  let day = calendarStart;

  while (day <= calendarEnd) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    day = addDays(day, 1);
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div className="space-y-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
          >
            Today
          </button>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
          <span>Working Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 border border-red-300" />
          <span>Non-Working Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
          <span>Has Note</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300 ring-2 ring-yellow-400" />
          <span>Today</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="p-3 text-center text-xs font-medium text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7">
          {weeks.map((week, wIndex) => (
            <div key={wIndex} className="contents">
              {week.map((day, dIndex) => {
                const dayData = getDayStatus(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isTodayDate = isToday(day);
                const working = isWorkingDay(day);
                const hasNote = dayData?.note;

                return (
                  <button
                    key={`${wIndex}-${dIndex}`}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={`
                      relative aspect-square p-2 text-xs transition-colors
                      ${!isCurrentMonth ? "text-gray-300 bg-gray-50" : "bg-white"}
                      ${isTodayDate ? "ring-2 ring-yellow-400" : ""}
                      hover:bg-gray-50
                      ${working ? "text-gray-900" : "text-red-600 line-through"}
                    `}
                    disabled={!isCurrentMonth}
                  >
                    <span className="font-medium">{format(day, "d")}</span>
                    {dayData?.is_override && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" title="Manual override" />
                    )}
                    {hasNote && (
                      <div className="absolute bottom-1 left-1 right-1 h-1 bg-blue-200 rounded" title={dayData.note ?? undefined} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleSetDay(new Date(), true)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Sun className="w-4 h-4 text-green-600" />
          Mark Today as Working
        </button>
        <button
          onClick={() => handleSetDay(new Date(), false, "Holiday")}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Moon className="w-4 h-4 text-red-600" />
          Mark Today as Holiday
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Set Calendar Day</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Date: <span className="font-medium">{format(modalDate, "EEEE, MMMM d, yyyy")}</span>
              </p>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="day_type"
                    value="working"
                    checked={modalValues.is_working_day}
                    onChange={e => setModalValues(prev => ({ ...prev, is_working_day: true }))}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Working Day</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer mt-2 block">
                  <input
                    type="radio"
                    name="day_type"
                    value="holiday"
                    checked={!modalValues.is_working_day}
                    onChange={e => setModalValues(prev => ({ ...prev, is_working_day: false }))}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Non-Working Day / Holiday</span>
                </label>
              </div>
              <div>
                <label htmlFor="note" className="block text-sm font-medium text-gray-700">
                  Note (optional)
                </label>
                <input
                  id="note"
                  type="text"
                  value={modalValues.note}
                  onChange={e => setModalValues(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g., Company Holiday, Maintenance"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  maxLength={200}
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                disabled={isModalSaving}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isModalSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}