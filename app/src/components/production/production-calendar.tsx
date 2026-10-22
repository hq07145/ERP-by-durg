"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, isSameDay, isSameMonth } from "date-fns";
import type { CalendarDay } from "@/types/production";
import { upsertCalendarDay } from "@/lib/production/actions";

interface ProductionCalendarProps {
  calendarDays: CalendarDay[];
  onUpdate?: (date: string, isWorkingDay: boolean, note: string) => Promise<void>;
  canEdit: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function ProductionCalendar({ calendarDays, onUpdate, canEdit }: ProductionCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editIsWorking, setEditIsWorking] = useState(true);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getDayStatus = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const calDay = calendarDays.find((d) => d.calendar_date === dateStr);
    if (calDay) return { isWorkingDay: calDay.is_working_day, note: calDay.note, isSet: true };
    // Default: Mon-Fri working
    const dow = date.getDay();
    return { isWorkingDay: dow >= 1 && dow <= 5, note: null, isSet: false };
  };

  const handleDayClick = (date: Date) => {
    if (!canEdit) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const status = getDayStatus(date);
    setEditingDate(dateStr);
    setEditIsWorking(status.isWorkingDay);
    setEditNote(status.note || "");
  };

  const handleSave = async () => {
    if (!editingDate) return;
    if (onUpdate) {
      await onUpdate(editingDate, editIsWorking, editNote);
    } else {
      await upsertCalendarDay({ calendar_date: editingDate, is_working_day: editIsWorking, note: editNote });
    }
    setEditingDate(null);
  };

  const handleCancel = () => {
    setEditingDate(null);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-sm hover:bg-gray-100"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-sm hover:bg-gray-100"
            aria-label="Next month"
          >
            →
          </button>
        </div>
        {canEdit && (
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-500"></span> Working
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-500"></span> Holiday
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-gray-200 border"></span> Default
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 gap-0.5 mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, new Date());
            const status = getDayStatus(day);
            const isEditing = editingDate === format(day, "yyyy-MM-dd");

            if (isEditing) {
              return (
                <div
                  key={day.toISOString()}
                  className="col-span-7 relative z-10 bg-white border-2 border-[var(--accent)] rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">
                      Editing {format(day, "EEEE, MMMM d, yyyy")}
                    </h3>
                    <button
                      onClick={handleCancel}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsWorking}
                        onChange={(e) => setEditIsWorking(e.target.checked)}
                        className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                      />
                      <span className="text-sm text-gray-700">Working day</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-[200px]">
                      <span className="text-sm text-gray-700">Note:</span>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Optional note"
                        className="flex-1 rounded-sm border border-gray-300 px-2 py-1 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <button
                      onClick={handleSave}
                      className="rounded-sm bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                disabled={!canEdit || !isCurrentMonth}
                className={`aspect-square relative p-1.5 text-left transition-colors ${
                  !isCurrentMonth ? "bg-gray-50 text-gray-300" : ""
                } ${isToday ? "ring-2 ring-[var(--accent)]" : ""} ${
                  canEdit && isCurrentMonth ? "hover:bg-gray-100" : ""
                } ${status.isWorkingDay ? "" : "bg-red-50"} ${
                  status.isSet ? "border border-gray-200" : "border border-dashed border-gray-200"
                } ${!status.isWorkingDay && isCurrentMonth ? "bg-red-50" : ""}`}
              >
                <span
                  className={`text-sm font-medium ${
                    !isCurrentMonth ? "text-gray-300" : isToday ? "text-[var(--accent)]" : "text-gray-900"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {status.note && (
                  <div className="mt-1 text-xs text-gray-500 truncate" title={status.note}>
                    {status.note}
                  </div>
                )}
                {!status.isWorkingDay && isCurrentMonth && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" title="Holiday" />
                )}
                {status.isSet && status.isWorkingDay && isCurrentMonth && (
                  <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full" title="Set as working" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}