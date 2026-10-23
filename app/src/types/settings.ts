export interface BusinessDetails {
  name: string;
  legal_name?: string;
  tagline?: string;
  business_type?: string;
  gst_number?: string;
  state?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface CurrencySettings {
  code: string;
  symbol: string;
  locale: string;
}

export interface TimezoneSettings {
  timezone: string;
}

export interface DefaultTaxSettings {
  rate: number;
  tax_type: string;
}

export interface WorkingHoursSettings {
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
}

export interface WorkingDaysSettings {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
}

export interface DefaultOrderSettings {
  default_priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  auto_confirm: boolean;
  require_payment: boolean;
}

export interface DefaultDeliverySettings {
  default_lead_time_days: number;
  delivery_window_start: string;
  delivery_window_end: string;
}

export type SettingsKey =
  | 'business_details'
  | 'currency'
  | 'timezone'
  | 'default_tax'
  | 'working_hours'
  | 'working_days'
  | 'default_order_settings'
  | 'default_delivery_settings';

export type SettingsValue =
  | BusinessDetails
  | CurrencySettings
  | TimezoneSettings
  | DefaultTaxSettings
  | WorkingHoursSettings
  | WorkingDaysSettings
  | DefaultOrderSettings
  | DefaultDeliverySettings;

export interface BusinessSetting {
  id: string;
  business_id: string;
  key: SettingsKey;
  value: SettingsValue;
  created_at: string;
  updated_at: string;
}

export interface CalendarDay {
  id: string;
  business_id: string;
  calendar_date: string;
  is_working_day: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  is_override?: boolean;
}

export interface CalendarDayFormValues {
  calendar_date: string;
  is_working_day: boolean;
  note?: string;
}

export interface SettingsFormValues {
  business_details?: Partial<BusinessDetails>;
  currency?: Partial<CurrencySettings>;
  timezone?: Partial<TimezoneSettings>;
  default_tax?: Partial<DefaultTaxSettings>;
  working_hours?: Partial<WorkingHoursSettings>;
  working_days?: Partial<WorkingDaysSettings>;
  default_order_settings?: Partial<DefaultOrderSettings>;
  default_delivery_settings?: Partial<DefaultDeliverySettings>;
}

export interface TimezoneOption {
  value: string;
  label: string;
  offset: string;
}