"use server";

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ExpenseListItem,
  ExpenseWithCreator,
  ExpenseByCategory,
  SalesSummary,
  ExpensesSummary,
  ProfitSummary,
  CreateExpenseFormValues,
  UpdateExpenseFormValues,
  DeleteExpenseFormValues,
  ExpenseStatus,
  OrderListItem,
} from "@/types/expense";

// ============================================
// EXPENSE QUERY FUNCTIONS
// ============================================

export async function listExpenses(
  category?: string,
  status?: ExpenseStatus,
  startDate?: string,
  endDate?: string,
  limit = 20,
  offset = 0
): Promise<ExpenseListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    throw new Error("Forbidden: expenses.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Optimized direct table query with specific indexed columns
  let query = supabase
    .from("expenses")
    .select("id, business_id, category, amount, description, reference, expense_date, status, created_at, users!created_by(name)")
    .eq("business_id", context.user.business_id)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (startDate) query = query.gte("expense_date", startDate);
  if (endDate) query = query.lte("expense_date", endDate);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    business_id: row.business_id,
    category: row.category,
    amount: row.amount,
    expense_date: row.expense_date,
    description: row.description ?? null,
    reference: row.reference ?? null,
    status: row.status as ExpenseStatus,
    created_at: row.created_at,
    created_by_name: (row.users as any)?.name ?? null,
  }));
}

export async function getExpenseCategories(): Promise<string[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    throw new Error("Forbidden: expenses.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("expenses")
    .select("category")
    .eq("business_id", context.user.business_id)
    .neq("status", "VOIDED");

  if (error || !data) return [];
  const categories = Array.from(new Set(data.map((r: any) => r.category).filter(Boolean)));
  return categories.sort();
}

export async function getTotalExpenseCount(
  category?: string,
  status?: ExpenseStatus,
  startDate?: string,
  endDate?: string
): Promise<number> {
  const context = await getAuthContext();
  if (!context) return 0;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return 0;

  let query = supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("business_id", context.user.business_id);

  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (startDate) query = query.gte("expense_date", startDate);
  if (endDate) query = query.lte("expense_date", endDate);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

import {
  getSalesFinancials,
  getExpensesFinancials,
  getExpensesByCategoryFinancials,
  getProfitFinancials,
  getSalesOrdersList,
  getTotalSalesOrdersCount,
} from "@/lib/financials/service";

// ============================================
// SALES & PROFIT QUERY FUNCTIONS
// ============================================

export async function getSalesSummary(
  startDate?: string,
  endDate?: string,
  customerId?: string,
  status?: string
): Promise<SalesSummary | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Sales summary is restricted to Admin and Super Admin");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await getSalesFinancials(supabase, context.user.business_id, {
    startDate,
    endDate,
    customerId,
    status,
  });
}

export async function getExpensesSummary(
  startDate?: string,
  endDate?: string,
  category?: string
): Promise<ExpensesSummary | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    throw new Error("Forbidden: expenses.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await getExpensesFinancials(supabase, context.user.business_id, {
    startDate,
    endDate,
    category,
  });
}

export async function getExpensesByCategory(
  startDate?: string,
  endDate?: string
): Promise<ExpenseByCategory[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    throw new Error("Forbidden: expenses.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await getExpensesByCategoryFinancials(supabase, context.user.business_id, {
    startDate,
    endDate,
  });
}

export async function getProfitSummary(
  startDate?: string,
  endDate?: string
): Promise<ProfitSummary | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Profit summary is restricted to Admin and Super Admin");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await getProfitFinancials(supabase, context.user.business_id, {
    startDate,
    endDate,
  });
}

export async function getExpenseById(expenseId: string): Promise<ExpenseWithCreator | null> {
  const context = await getAuthContext();
  if (!context) return null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("expenses")
    .select("*, users!created_by(name)")
    .eq("id", expenseId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  return {
    ...data,
    created_by_name: (data as { users?: { name: string } }).users?.name ?? null,
  } as ExpenseWithCreator;
}

export async function getTotalOrderCount(
  startDate?: string,
  endDate?: string,
  customerId?: string,
  status?: string
): Promise<number> {
  const context = await getAuthContext();
  if (!context) return 0;
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    return 0;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return 0;

  return await getTotalSalesOrdersCount(supabase, context.user.business_id, {
    startDate,
    endDate,
    customerId,
    status,
  });
}

export async function getSalesOrders(
  startDate?: string,
  endDate?: string,
  customerId?: string,
  status?: string,
  limit = 50,
  offset = 0
): Promise<OrderListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Company-wide sales transactions are restricted to Admin and Super Admin");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await getSalesOrdersList(supabase, context.user.business_id, {
    startDate,
    endDate,
    customerId,
    status,
    limit,
    offset,
  });
}

// ============================================
// EXPENSE MUTATION FUNCTIONS
// ============================================

export async function createExpense(
  values: CreateExpenseFormValues
): Promise<{ expense_id: string; message: string }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.create")) {
    throw new Error("Forbidden: expenses.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("create_expense", {
    p_business_id: context.user.business_id,
    p_category: values.category,
    p_amount: values.amount,
    p_expense_date: values.expense_date,
    p_description: values.description || null,
    p_reference: values.reference || null,
    p_status: values.status || "POSTED",
  });

  if (error) throw error;
  return { expense_id: data, message: "Expense created successfully" };
}

export async function updateExpense(
  values: UpdateExpenseFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.edit")) {
    throw new Error("Forbidden: expenses.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("update_expense", {
    p_business_id: context.user.business_id,
    p_expense_id: values.expense_id,
    p_category: values.category || null,
    p_amount: values.amount || null,
    p_expense_date: values.expense_date || null,
    p_description: values.description || null,
    p_reference: values.reference || null,
    p_status: values.status || null,
  });

  if (error) throw error;
  return { success: true, message: "Expense updated successfully" };
}

export async function deleteExpense(
  values: DeleteExpenseFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.delete")) {
    throw new Error("Forbidden: expenses.delete");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("delete_expense", {
    p_business_id: context.user.business_id,
    p_expense_id: values.expense_id,
    p_reason: values.reason,
  });

  if (error) throw error;
  return { success: true, message: "Expense voided successfully" };
}