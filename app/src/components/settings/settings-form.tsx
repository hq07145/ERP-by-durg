"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import type {
  SettingsFormValues,
  BusinessDetails,
  CurrencySettings,
  TimezoneSettings,
  DefaultTaxSettings,
  WorkingHoursSettings,
  WorkingDaysSettings,
  DefaultOrderSettings,
  DefaultDeliverySettings,
  SettingsKey,
} from "@/types/settings";
import { INDIAN_STATES } from "@/lib/financials/gst";

interface SettingsFormProps {
  initialSettings: SettingsFormValues;
  onSave: (settings: SettingsFormValues) => Promise<void>;
}

export function SettingsForm({ initialSettings, onSave }: SettingsFormProps) {
  const [settings, setSettings] = useState<SettingsFormValues>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (initialSettings && Object.keys(initialSettings).length > 0) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleChange = <K extends SettingsKey>(key: K, value: SettingsFormValues[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleInputChange = (key: SettingsKey, field: string, value: string | boolean | number) => {
    setSettings(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      } as any,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMessage("");

    try {
      await onSave(settings);
      setSaveStatus("success");
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {saveStatus === "success" && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Settings saved successfully</span>
        </div>
      )}

      {saveStatus === "error" && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Business Details */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Business Details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="business_name" className="block text-sm font-medium text-gray-700">
              Business Name *
            </label>
            <input
              id="business_name"
              type="text"
              value={settings.business_details?.name || ""}
              onChange={e => handleInputChange("business_details", "name", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="legal_name" className="block text-sm font-medium text-gray-700">
              Legal Name
            </label>
            <input
              id="legal_name"
              type="text"
              value={settings.business_details?.legal_name || ""}
              onChange={e => handleInputChange("business_details", "legal_name", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="gst_number" className="block text-sm font-medium text-gray-700">
              GST Number (GSTIN)
            </label>
            <input
              id="gst_number"
              type="text"
              value={settings.business_details?.gst_number || ""}
              onChange={e => handleInputChange("business_details", "gst_number", e.target.value.toUpperCase())}
              placeholder="e.g. 27ABCDE1234F1Z5"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono uppercase"
            />
          </div>
          <div>
            <label htmlFor="business_state" className="block text-sm font-medium text-gray-700">
              Registered State (GST)
            </label>
            <select
              id="business_state"
              value={settings.business_details?.state || "Maharashtra"}
              onChange={e => handleInputChange("business_details", "state", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {INDIAN_STATES.map(s => (
                <option key={s.code} value={s.name}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={settings.business_details?.phone || ""}
              onChange={e => handleInputChange("business_details", "phone", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={settings.business_details?.email || ""}
              onChange={e => handleInputChange("business_details", "email", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">
              Address
            </label>
            <textarea
              id="address"
              value={settings.business_details?.address || ""}
              onChange={e => handleInputChange("business_details", "address", e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </section>

      {/* Currency & Timezone */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Currency & Timezone</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="currency_code" className="block text-sm font-medium text-gray-700">
              Currency Code
            </label>
            <input
              id="currency_code"
              type="text"
              value={settings.currency?.code || "INR"}
              onChange={e => handleInputChange("currency", "code", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="currency_symbol" className="block text-sm font-medium text-gray-700">
              Currency Symbol
            </label>
            <input
              id="currency_symbol"
              type="text"
              value={settings.currency?.symbol || "₹"}
              onChange={e => handleInputChange("currency", "symbol", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="currency_locale" className="block text-sm font-medium text-gray-700">
              Locale
            </label>
            <input
              id="currency_locale"
              type="text"
              value={settings.currency?.locale || "en-IN"}
              onChange={e => handleInputChange("currency", "locale", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
              Timezone *
            </label>
            <select
              id="timezone"
              value={settings.timezone?.timezone || "Asia/Kolkata"}
              onChange={e => handleInputChange("timezone", "timezone", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="Asia/Kolkata">India (GMT+5:30)</option>
              <option value="UTC">UTC (GMT+0)</option>
              <option value="America/New_York">Eastern Time (GMT-5/-4)</option>
              <option value="America/Chicago">Central Time (GMT-6/-5)</option>
              <option value="America/Denver">Mountain Time (GMT-7/-6)</option>
              <option value="America/Los_Angeles">Pacific Time (GMT-8/-7)</option>
              <option value="Europe/London">London (GMT+0/+1)</option>
              <option value="Europe/Paris">Paris (GMT+1/+2)</option>
              <option value="Asia/Dubai">Dubai (GMT+4)</option>
              <option value="Asia/Singapore">Singapore (GMT+8)</option>
              <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
              <option value="Australia/Sydney">Sydney (GMT+10/+11)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Default Tax */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Default Tax</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tax_rate" className="block text-sm font-medium text-gray-700">
              Tax Rate (%)
            </label>
            <input
              id="tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.default_tax?.rate || 18}
              onChange={e => handleInputChange("default_tax", "rate", parseFloat(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="tax_type" className="block text-sm font-medium text-gray-700">
              Tax Type
            </label>
            <input
              id="tax_type"
              type="text"
              value={settings.default_tax?.tax_type || "GST"}
              onChange={e => handleInputChange("default_tax", "tax_type", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </section>

      {/* Working Hours */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Working Hours</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="work_start" className="block text-sm font-medium text-gray-700">
              Start Time
            </label>
            <input
              id="work_start"
              type="time"
              value={settings.working_hours?.start_time || "09:00"}
              onChange={e => handleInputChange("working_hours", "start_time", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="work_end" className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              id="work_end"
              type="time"
              value={settings.working_hours?.end_time || "18:00"}
              onChange={e => handleInputChange("working_hours", "end_time", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="break_start" className="block text-sm font-medium text-gray-700">
              Break Start
            </label>
            <input
              id="break_start"
              type="time"
              value={settings.working_hours?.break_start || "13:00"}
              onChange={e => handleInputChange("working_hours", "break_start", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="break_end" className="block text-sm font-medium text-gray-700">
              Break End
            </label>
            <input
              id="break_end"
              type="time"
              value={settings.working_hours?.break_end || "14:00"}
              onChange={e => handleInputChange("working_hours", "break_end", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </section>

      {/* Working Days */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Working Days</h3>
        <div className="flex flex-wrap gap-4">
          {([
            { key: "mon", label: "Monday" },
            { key: "tue", label: "Tuesday" },
            { key: "wed", label: "Wednesday" },
            { key: "thu", label: "Thursday" },
            { key: "fri", label: "Friday" },
            { key: "sat", label: "Saturday" },
            { key: "sun", label: "Sunday" },
          ] as const).map(day => (
            <label key={day.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.working_days?.[day.key] ?? true}
                onChange={e => handleInputChange("working_days", day.key, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">{day.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Default Order Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Default Order Settings</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="default_priority" className="block text-sm font-medium text-gray-700">
              Default Priority
            </label>
            <select
              id="default_priority"
              value={settings.default_order_settings?.default_priority || "NORMAL"}
              onChange={e => handleInputChange("default_order_settings", "default_priority", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.default_order_settings?.auto_confirm ?? false}
                onChange={e => handleInputChange("default_order_settings", "auto_confirm", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Auto-confirm orders</span>
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.default_order_settings?.require_payment ?? false}
                onChange={e => handleInputChange("default_order_settings", "require_payment", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Require payment on creation</span>
            </label>
          </div>
        </div>
      </section>

      {/* Default Delivery Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Default Delivery Settings</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="lead_time" className="block text-sm font-medium text-gray-700">
              Default Lead Time (days)
            </label>
            <input
              id="lead_time"
              type="number"
              min="0"
              max="365"
              value={settings.default_delivery_settings?.default_lead_time_days || 3}
              onChange={e => handleInputChange("default_delivery_settings", "default_lead_time_days", parseInt(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="delivery_start" className="block text-sm font-medium text-gray-700">
              Delivery Window Start
            </label>
            <input
              id="delivery_start"
              type="time"
              value={settings.default_delivery_settings?.delivery_window_start || "09:00"}
              onChange={e => handleInputChange("default_delivery_settings", "delivery_window_start", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="delivery_end" className="block text-sm font-medium text-gray-700">
              Delivery Window End
            </label>
            <input
              id="delivery_end"
              type="time"
              value={settings.default_delivery_settings?.delivery_window_end || "18:00"}
              onChange={e => handleInputChange("default_delivery_settings", "delivery_window_end", e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </form>
  );
}