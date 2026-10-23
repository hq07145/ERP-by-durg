import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { scheduleProductionQueue } from "@/lib/production/scheduler";
import type {
  BusinessDetails,
  BusinessSetting,
  SettingsKey,
  SettingsValue,
  SettingsFormValues,
  WorkingDaysSettings,
  CalendarDay,
  CalendarDayFormValues,
} from "@/types/settings";
import { TIMEZONE_OPTIONS, DEFAULT_SETTINGS, getTimezoneOptions } from "./constants";

// ============================================
// SHARED SERVICE FUNCTIONS (no "use server")
// ============================================

export async function getBusinessSettingsService(): Promise<Record<SettingsKey, SettingsValue>> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "settings.view")) {
    throw new Error("Forbidden: settings.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("business_settings")
    .select("key, value")
    .eq("business_id", context.user.business_id);

  if (error) throw error;

  const settings: Record<string, SettingsValue> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value as SettingsValue;
  }

  return settings as Record<SettingsKey, SettingsValue>;
}

export async function getSettingService<T extends SettingsValue>(key: SettingsKey): Promise<T | null> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "settings.view")) {
    throw new Error("Forbidden: settings.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("business_settings")
    .select("value")
    .eq("business_id", context.user.business_id)
    .eq("key", key)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data?.value as T | null;
}

export async function updateSettingService(key: SettingsKey, value: SettingsValue): Promise<BusinessSetting> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "settings.edit")) {
    throw new Error("Forbidden: settings.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Special handling for working_days to sync with calendar
  if (key === "working_days") {
    await syncWorkingDaysToCalendar(context.user.business_id, value as WorkingDaysSettings);
  }

  // Sync business_details with businesses table
  if (key === "business_details" && value) {
    const bd = value as Partial<BusinessDetails>;
    const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };
    if (bd.name) updateObj.name = bd.name;
    if (bd.legal_name) updateObj.legal_name = bd.legal_name;
    if (bd.gst_number) updateObj.gst_number = bd.gst_number;
    if (bd.address) updateObj.address = bd.address;
    if (bd.phone !== undefined) updateObj.phone = bd.phone;
    if (bd.email) updateObj.email = bd.email;
    await supabase.from("businesses").update(updateObj).eq("id", context.user.business_id);
  }

  const { data, error } = await supabase
    .from("business_settings")
    .upsert(
      {
        business_id: context.user.business_id,
        key,
        value,
      },
      { onConflict: "business_id,key" }
    )
    .select()
    .single();

  if (error) throw error;

  // Recalculate eligible future production schedules if working schedule changed
  if (key === "working_days" || key === "working_hours") {
    try {
      await scheduleProductionQueue(supabase, context.user.business_id);
    } catch {
      // Non-fatal
    }
  }

  return data as BusinessSetting;
}

export async function updateSettingsService(values: SettingsFormValues): Promise<BusinessSetting[]> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "settings.edit")) {
    throw new Error("Forbidden: settings.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const results: BusinessSetting[] = [];
  let calendarAffected = false;

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      if (key === "working_days") {
        await syncWorkingDaysToCalendar(context.user.business_id, value as WorkingDaysSettings);
        calendarAffected = true;
      }
      if (key === "working_hours") {
        calendarAffected = true;
      }
      if (key === "business_details" && value) {
        const bd = value as Partial<BusinessDetails>;
        const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };
        if (bd.name) updateObj.name = bd.name;
        if (bd.legal_name) updateObj.legal_name = bd.legal_name;
        if (bd.gst_number) updateObj.gst_number = bd.gst_number;
        if (bd.address) updateObj.address = bd.address;
        if (bd.phone !== undefined) updateObj.phone = bd.phone;
        if (bd.email) updateObj.email = bd.email;
        await supabase.from("businesses").update(updateObj).eq("id", context.user.business_id);
      }

      const { data, error } = await supabase
        .from("business_settings")
        .upsert(
          {
            business_id: context.user.business_id,
            key: key as SettingsKey,
            value,
          },
          { onConflict: "business_id,key" }
        )
        .select()
        .single();

      if (error) throw error;
      results.push(data as BusinessSetting);
    }
  }

  // Recalculate eligible future schedules if calendar/working days were modified
  if (calendarAffected) {
    try {
      await scheduleProductionQueue(supabase, context.user.business_id);
    } catch {
      // Non-fatal
    }
  }

  return results;
}

async function syncWorkingDaysToCalendar(businessId: string, workingDays: WorkingDaysSettings): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
  const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  try {
    await supabase.rpc("initialize_business_calendar", {
      p_business_id: businessId,
      p_start_date: startStr,
      p_end_date: endStr,
    });
  } catch (err) {
    console.warn("Could not call initialize_business_calendar RPC, skipping sync", err);
  }
}

// ============================================
// CALENDAR SERVICE FUNCTIONS
// ============================================

export async function getBusinessCalendarService(
  startDate: string,
  endDate: string
): Promise<CalendarDay[]> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "calendar.view")) {
    throw new Error("Forbidden: calendar.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("get_business_calendar", {
    p_business_id: context.user.business_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (!error && data) {
    return data as CalendarDay[];
  }

  // Fallback direct query on business_calendar
  const { data: directData, error: directErr } = await supabase
    .from("business_calendar")
    .select("*")
    .eq("business_id", context.user.business_id)
    .gte("calendar_date", startDate)
    .lte("calendar_date", endDate)
    .order("calendar_date");

  if (directErr) throw directErr;
  return (directData ?? []) as CalendarDay[];
}

export async function setCalendarDayService(values: CalendarDayFormValues): Promise<CalendarDay> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "calendar.edit")) {
    throw new Error("Forbidden: calendar.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Upsert directly into business_calendar to ensure returned row and override flag
  const { data, error } = await supabase
    .from("business_calendar")
    .upsert(
      {
        business_id: context.user.business_id,
        calendar_date: values.calendar_date,
        is_working_day: values.is_working_day,
        note: values.note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,calendar_date" }
    )
    .select()
    .single();

  if (error) throw error;

  // Recalculate eligible future schedules only; never alters completed/delivered records
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return data as CalendarDay;
}

export async function bulkSetCalendarDaysService(values: CalendarDayFormValues[]): Promise<CalendarDay[]> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "calendar.edit")) {
    throw new Error("Forbidden: calendar.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const results: CalendarDay[] = [];

  for (const v of values) {
    const { data, error } = await supabase
      .from("business_calendar")
      .upsert(
        {
          business_id: context.user.business_id,
          calendar_date: v.calendar_date,
          is_working_day: v.is_working_day,
          note: v.note || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,calendar_date" }
      )
      .select()
      .single();

    if (error) throw error;
    results.push(data as CalendarDay);
  }

  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return results;
}

export async function removeCalendarDayService(date: string): Promise<void> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "calendar.edit")) {
    throw new Error("Forbidden: calendar.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Try RPC or delete
  const { error: rpcErr } = await supabase.rpc("remove_calendar_day", {
    p_business_id: context.user.business_id,
    p_date: date,
  });

  if (rpcErr) {
    const { error: delErr } = await supabase
      .from("business_calendar")
      .delete()
      .eq("business_id", context.user.business_id)
      .eq("calendar_date", date);

    if (delErr) throw delErr;
  }

  // Recalculate eligible future schedules
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }
}

export async function initializeCalendarService(
  startDate: string,
  endDate: string
): Promise<void> {
  const context = await getAuthContext();
  if (!context) throw new Error("Not authenticated");
  if (!hasPermission({ permissions: context.permissions }, "calendar.edit")) {
    throw new Error("Forbidden: calendar.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("initialize_business_calendar", {
    p_business_id: context.user.business_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw error;

  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }
}

// Export constants
export { TIMEZONE_OPTIONS, DEFAULT_SETTINGS, getTimezoneOptions } from "./constants";