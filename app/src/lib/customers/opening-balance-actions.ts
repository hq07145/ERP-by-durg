"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  setCustomerOpeningBalance,
  getCustomerOpeningBalance,
  getCustomerPeriodBalance,
  deleteCustomerOpeningBalance,
} from "./opening-balance-service";
import type {
  CustomerOpeningBalance,
  SetCustomerOpeningBalanceInput,
  CustomerPeriodBalanceStatement,
  CustomerOpeningBalanceAuditItem,
  CustomerOption,
} from "@/types/customer-opening-balance";

export interface OpeningBalanceActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Get all customer opening balances for the business.
 * Requires `customers.view` or `payments.view` or Admin/Super Admin.
 */
export async function getAllCustomerOpeningBalancesAction(): Promise<CustomerOpeningBalance[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canView =
    hasPermission({ permissions: context.permissions }, "customers.view") ||
    hasPermission({ permissions: context.permissions }, "payments.view") ||
    context.roleKey === "admin" ||
    context.roleKey === "super_admin";

  if (!canView) return [];

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("customer_opening_balances")
    .select(`
      id, business_id, customer_id, amount, balance_type, as_on_date, notes,
      created_by, created_at, updated_at,
      customer:customers(id, name, company_name, phone, email),
      creator:users!created_by(id, name, email)
    `)
    .eq("business_id", context.user.business_id)
    .order("as_on_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Failed to fetch customer opening balances:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    business_id: row.business_id,
    customer_id: row.customer_id,
    amount: Number(row.amount) || 0,
    balance_type: row.balance_type,
    as_on_date: row.as_on_date,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer_name: row.customer?.name || "Customer",
    customer_company: row.customer?.company_name || null,
    customer_phone: row.customer?.phone || null,
    customer_email: row.customer?.email || null,
    creator_name: row.creator?.name || row.creator?.email || "System Admin",
  }));
}

/**
 * Server Action: Get active customers for the opening balance dropdown.
 */
export async function getActiveCustomersForOpeningBalanceAction(): Promise<CustomerOption[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const [{ data: customers }, { data: existingBalances }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, company_name, phone, email")
      .eq("business_id", context.user.business_id)
      .eq("status", "ACTIVE")
      .order("name", { ascending: true }),
    supabase
      .from("customer_opening_balances")
      .select("customer_id")
      .eq("business_id", context.user.business_id),
  ]);

  const existingSet = new Set((existingBalances || []).map((b: any) => b.customer_id));

  return (customers || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    company_name: c.company_name || null,
    phone: c.phone || null,
    email: c.email || null,
    hasOpeningBalance: existingSet.has(c.id),
  }));
}

/**
 * Server Action: Get audit history for customer opening balances.
 */
export async function getOpeningBalanceAuditHistoryAction(
  customerId?: string
): Promise<CustomerOpeningBalanceAuditItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canView =
    hasPermission({ permissions: context.permissions }, "customers.view") ||
    context.roleKey === "admin" ||
    context.roleKey === "super_admin";

  if (!canView) return [];

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("audit_logs")
    .select(`
      id, action, entity_type, entity_id, old_data, new_data, created_at,
      user:users(id, name, email)
    `)
    .eq("business_id", context.user.business_id)
    .eq("entity_type", "customer_opening_balances")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data, error } = await query;
  if (error || !data) return [];

  const items = (data || []).map((log: any) => ({
    id: log.id,
    action: log.action,
    entity_id: log.entity_id,
    created_at: log.created_at,
    user_name: log.user?.name || null,
    user_email: log.user?.email || null,
    old_data: log.old_data,
    new_data: log.new_data,
  }));

  if (customerId) {
    return items.filter(
      (item) =>
        item.new_data?.customer_id === customerId ||
        item.old_data?.customer_id === customerId
    );
  }

  return items;
}

/**
 * Server Action: Set (create or update) a customer opening balance.
 * Requires `customers.edit` or `payments.create` permission or Admin/Super Admin.
 */
export async function setCustomerOpeningBalanceAction(
  input: SetCustomerOpeningBalanceInput
): Promise<OpeningBalanceActionResult<CustomerOpeningBalance>> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canEdit =
    hasPermission({ permissions: context.permissions }, "customers.edit") ||
    hasPermission({ permissions: context.permissions }, "payments.create") ||
    context.roleKey === "admin" ||
    context.roleKey === "super_admin";

  if (!canEdit) {
    return { success: false, error: "Forbidden: You do not have permission to manage opening balances." };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database service unavailable." };
  }

  const res = await setCustomerOpeningBalance(
    supabase,
    context.user.business_id,
    context.user.id,
    input
  );

  if (res.success) {
    revalidatePath("/customer-opening-balances");
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath("/payments");
  }

  return res;
}

/**
 * Server Action: Get the active opening balance for a customer.
 * Requires `customers.view` or `payments.view`.
 */
export async function getCustomerOpeningBalanceAction(
  customerId: string,
  asOnDate?: string
): Promise<CustomerOpeningBalance | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canView =
    hasPermission({ permissions: context.permissions }, "customers.view") ||
    hasPermission({ permissions: context.permissions }, "payments.view");

  if (!canView) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  return getCustomerOpeningBalance(supabase, context.user.business_id, customerId, asOnDate);
}

/**
 * Server Action: Delete a customer opening balance for a specific date.
 * Requires `customers.edit` permission or Admin/Super Admin.
 */
export async function deleteCustomerOpeningBalanceAction(
  customerId: string,
  asOnDate: string
): Promise<OpeningBalanceActionResult<void>> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canEdit =
    hasPermission({ permissions: context.permissions }, "customers.edit") ||
    context.roleKey === "admin" ||
    context.roleKey === "super_admin";

  if (!canEdit) {
    return { success: false, error: "Forbidden: You do not have permission to delete opening balances." };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database service unavailable." };
  }

  const res = await deleteCustomerOpeningBalance(
    supabase,
    context.user.business_id,
    customerId,
    asOnDate
  );

  if (res.success) {
    revalidatePath("/customer-opening-balances");
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
  }

  return res;
}

/**
 * Server Action: Calculate customer period statement with opening balance as of day before start date.
 * Requires `customers.view` or `payments.view`.
 */
export async function getCustomerPeriodBalanceAction(
  customerId: string,
  startDate: string,
  endDate: string
): Promise<CustomerPeriodBalanceStatement | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canView =
    hasPermission({ permissions: context.permissions }, "customers.view") ||
    hasPermission({ permissions: context.permissions }, "payments.view");

  if (!canView) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  return getCustomerPeriodBalance(
    supabase,
    context.user.business_id,
    customerId,
    startDate,
    endDate
  );
}
