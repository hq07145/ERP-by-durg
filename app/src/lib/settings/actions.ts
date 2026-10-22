"use server";

import { redirect } from "next/navigation";
import {
  getBusinessSettingsService,
  getSettingService,
  updateSettingService,
  updateSettingsService,
  getBusinessCalendarService,
  setCalendarDayService,
  bulkSetCalendarDaysService,
  removeCalendarDayService,
  initializeCalendarService,
} from "./service";
import type {
  BusinessSetting,
  SettingsKey,
  SettingsValue,
  SettingsFormValues,
  WorkingDaysSettings,
  CalendarDay,
  CalendarDayFormValues,
} from "@/types/settings";

// ============================================
// SETTINGS SERVER ACTIONS
// ============================================

export async function getBusinessSettings(): Promise<Record<SettingsKey, SettingsValue>> {
  try {
    return await getBusinessSettingsService();
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function getSetting<T extends SettingsValue>(key: SettingsKey): Promise<T | null> {
  try {
    return await getSettingService(key);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function updateSetting(key: SettingsKey, value: SettingsValue): Promise<BusinessSetting> {
  try {
    return await updateSettingService(key, value);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function updateSettings(values: SettingsFormValues): Promise<BusinessSetting[]> {
  try {
    return await updateSettingsService(values);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

// ============================================
// CALENDAR SERVER ACTIONS
// ============================================

export async function getBusinessCalendar(
  startDate: string,
  endDate: string
): Promise<CalendarDay[]> {
  try {
    return await getBusinessCalendarService(startDate, endDate);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function setCalendarDay(values: CalendarDayFormValues): Promise<CalendarDay> {
  try {
    return await setCalendarDayService(values);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function bulkSetCalendarDays(values: CalendarDayFormValues[]): Promise<CalendarDay[]> {
  try {
    return await bulkSetCalendarDaysService(values);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function removeCalendarDay(date: string): Promise<void> {
  try {
    await removeCalendarDayService(date);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}

export async function initializeCalendar(
  startDate: string,
  endDate: string
): Promise<void> {
  try {
    await initializeCalendarService(startDate, endDate);
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      redirect("/login?error=account_unavailable");
    }
    throw error;
  }
}