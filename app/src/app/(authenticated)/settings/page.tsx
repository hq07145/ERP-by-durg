"use client";

import { useState, useEffect } from "react";
import { Loader2, Settings, Calendar, AlertCircle, CheckCircle, FileSpreadsheet } from "lucide-react";
import { SettingsForm } from "@/components/settings/settings-form";
import { CalendarView } from "@/components/settings/calendar-view";
import type { SettingsFormValues } from "@/types/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsFormValues>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [activeTab, setActiveTab] = useState<"settings" | "calendar">("settings");

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Failed to load business settings");
      }
      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      console.error("Failed to fetch settings:", err);
      setError(err.message || "Failed to fetch business settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (values: SettingsFormValues) => {
    setSaveStatus("idle");
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save settings");
      }
      setSettings(values);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } catch (err: any) {
      setSaveStatus("error");
      setError(err.message || "Failed to save settings");
      throw err;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">Administration</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">Business Settings & Calendar</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Configure company details, currency (₹), timezone, tax defaults, and production calendar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <FileSpreadsheet className="h-4 w-4 text-[var(--accent)]" />
            <span>Import Data</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Settings className="w-4 h-4" />
          General & Defaults
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "calendar"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Working Calendar & Holidays
        </button>
      </div>

      {/* Status Notifications */}
      {saveStatus === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>Business settings saved successfully. Future production and delivery schedules updated.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          <p className="text-sm text-gray-500">Loading business configuration...</p>
        </div>
      ) : activeTab === "settings" ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-xs">
          <SettingsForm
            initialSettings={settings}
            onSave={handleSave}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-xs">
          <CalendarView />
        </div>
      )}
    </div>
  );
}