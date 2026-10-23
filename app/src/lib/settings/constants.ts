import type { TimezoneOption, SettingsKey, SettingsValue } from "@/types/settings";

// ============================================
// TIMEZONE OPTIONS
// ============================================

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Asia/Kolkata", label: "India (GMT+5:30)", offset: "+5:30" },
  { value: "UTC", label: "UTC (GMT+0)", offset: "+0:00" },
  { value: "America/New_York", label: "Eastern Time (GMT-5/-4)", offset: "-5:00" },
  { value: "America/Chicago", label: "Central Time (GMT-6/-5)", offset: "-6:00" },
  { value: "America/Denver", label: "Mountain Time (GMT-7/-6)", offset: "-7:00" },
  { value: "America/Los_Angeles", label: "Pacific Time (GMT-8/-7)", offset: "-8:00" },
  { value: "Europe/London", label: "London (GMT+0/+1)", offset: "+0:00" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)", offset: "+1:00" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)", offset: "+4:00" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)", offset: "+8:00" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)", offset: "+9:00" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)", offset: "+10:00" },
];

export function getTimezoneOptions(): TimezoneOption[] {
  return TIMEZONE_OPTIONS;
}

// ============================================
// DEFAULT SETTINGS
// ============================================

export const DEFAULT_SETTINGS: Record<SettingsKey, SettingsValue> = {
  business_details: {
    name: "SANKALP IRRIGATION",
    legal_name: "SANKALP IRRIGATION",
    tagline: "ISI CERTIFIED COMPANY",
    business_type: "INLINE-ONLINE DRIP MAKER",
    gst_number: "23AAMPQ5857F1ZE",
    state: "Madhya Pradesh",
    address: "Icchapur Road, Shahpur, Dist. Burhanpur (M.P.) 450-445",
    phone: "",
    email: "sankalpirrigation80@gmail.com",
  },
  currency: {
    code: "INR",
    symbol: "₹",
    locale: "en-IN",
  },
  timezone: {
    timezone: "Asia/Kolkata",
  },
  default_tax: {
    rate: 18,
    tax_type: "GST",
  },
  working_hours: {
    start_time: "09:00",
    end_time: "18:00",
    break_start: "13:00",
    break_end: "14:00",
  },
  working_days: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  },
  default_order_settings: {
    default_priority: "NORMAL",
    auto_confirm: false,
    require_payment: false,
  },
  default_delivery_settings: {
    default_lead_time_days: 3,
    delivery_window_start: "09:00",
    delivery_window_end: "18:00",
  },
};