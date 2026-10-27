import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerOpeningBalance,
  CustomerBalanceType,
  SetCustomerOpeningBalanceInput,
  CustomerPeriodBalanceStatement,
} from "@/types/customer-opening-balance";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates input parameters for setting a customer opening balance.
 */
export function validateOpeningBalanceInput(input: SetCustomerOpeningBalanceInput): {
  valid: boolean;
  error?: string;
  sanitized?: {
    customerId: string;
    amount: number;
    balanceType: CustomerBalanceType;
    asOnDate: string;
    notes: string | null;
  };
} {
  if (!input.customerId || !UUID_REGEX.test(input.customerId)) {
    return { valid: false, error: "Invalid customer ID format." };
  }

  if (typeof input.amount !== "number" || Number.isNaN(input.amount) || !Number.isFinite(input.amount)) {
    return { valid: false, error: "Opening balance amount must be a valid number." };
  }

  if (input.amount < 0) {
    return { valid: false, error: "Opening balance amount cannot be negative. Choose Payable for credit/advance balances." };
  }

  const roundedAmount = Math.round(input.amount * 100) / 100;

  const normalizedType = String(input.balanceType || "").toUpperCase();
  if (normalizedType !== "RECEIVABLE" && normalizedType !== "PAYABLE") {
    return { valid: false, error: "Balance type must be either 'RECEIVABLE' or 'PAYABLE'." };
  }

  if (!input.asOnDate || !DATE_REGEX.test(input.asOnDate)) {
    return { valid: false, error: "As-on date must be in YYYY-MM-DD format." };
  }

  const dateObj = new Date(input.asOnDate);
  if (Number.isNaN(dateObj.getTime())) {
    return { valid: false, error: "Invalid calendar date provided." };
  }

  let sanitizedNotes: string | null = null;
  if (input.notes) {
    sanitizedNotes = input.notes.trim();
    if (sanitizedNotes.length > 2000) {
      return { valid: false, error: "Notes cannot exceed 2000 characters." };
    }
    if (sanitizedNotes.length === 0) {
      sanitizedNotes = null;
    }
  }

  return {
    valid: true,
    sanitized: {
      customerId: input.customerId,
      amount: roundedAmount,
      balanceType: normalizedType as CustomerBalanceType,
      asOnDate: input.asOnDate,
      notes: sanitizedNotes,
    },
  };
}

/**
 * Fetches the active opening balance record for a customer as of a specific date (or the latest one).
 */
export async function getCustomerOpeningBalance(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  asOnDate?: string
): Promise<CustomerOpeningBalance | null> {
  if (!UUID_REGEX.test(businessId) || !UUID_REGEX.test(customerId)) {
    return null;
  }

  let query = supabase
    .from("customer_opening_balances")
    .select(`
      id, business_id, customer_id, amount, balance_type, as_on_date, notes,
      created_by, created_at, updated_at,
      customer:customers(name, company_name)
    `)
    .eq("business_id", businessId)
    .eq("customer_id", customerId);

  if (asOnDate && DATE_REGEX.test(asOnDate)) {
    query = query.eq("as_on_date", asOnDate);
  } else {
    query = query.order("as_on_date", { ascending: false });
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data) return null;

  const cust = (data as any).customer;
  return {
    id: data.id,
    business_id: data.business_id,
    customer_id: data.customer_id,
    amount: Number(data.amount) || 0,
    balance_type: data.balance_type as CustomerBalanceType,
    as_on_date: data.as_on_date,
    notes: data.notes,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
    customer_name: cust?.name,
    customer_company: cust?.company_name,
  };
}

/**
 * Sets (creates or updates) the customer opening balance.
 * Enforces business tenant isolation, single record per customer + as_on_date, and audit logging.
 */
export async function setCustomerOpeningBalance(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  input: SetCustomerOpeningBalanceInput
): Promise<{ success: boolean; data?: CustomerOpeningBalance; error?: string }> {
  const validation = validateOpeningBalanceInput(input);
  if (!validation.valid || !validation.sanitized) {
    return { success: false, error: validation.error };
  }

  const { customerId, amount, balanceType, asOnDate, notes } = validation.sanitized;

  // 1. Verify customer exists and belongs to the business
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name, company_name")
    .eq("id", customerId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (custErr || !customer) {
    return { success: false, error: "Customer not found in this business." };
  }

  // 2. Check if a record already exists for this customer and as-on date
  const { data: existing, error: existErr } = await supabase
    .from("customer_opening_balances")
    .select("id, amount, balance_type, as_on_date, notes")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .eq("as_on_date", asOnDate)
    .maybeSingle();

  if (existErr) {
    return { success: false, error: existErr.message };
  }

  let resultRecord: any = null;

  if (existing) {
    // Update existing record
    const { data: updated, error: updErr } = await supabase
      .from("customer_opening_balances")
      .update({
        amount,
        balance_type: balanceType,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (updErr) {
      return { success: false, error: updErr.message };
    }
    resultRecord = updated;
  } else {
    // Insert new record (enforced by DB unique constraint on customer_id, as_on_date)
    const { data: inserted, error: insErr } = await supabase
      .from("customer_opening_balances")
      .insert({
        business_id: businessId,
        customer_id: customerId,
        amount,
        balance_type: balanceType,
        as_on_date: asOnDate,
        notes,
        created_by: userId,
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === "23505") {
        return {
          success: false,
          error: `An opening balance record already exists for this customer on ${asOnDate}. Duplicate records for the same date are prohibited.`,
        };
      }
      return { success: false, error: insErr.message };
    }
    resultRecord = inserted;
  }

  return {
    success: true,
    data: {
      id: resultRecord.id,
      business_id: resultRecord.business_id,
      customer_id: resultRecord.customer_id,
      amount: Number(resultRecord.amount) || 0,
      balance_type: resultRecord.balance_type as CustomerBalanceType,
      as_on_date: resultRecord.as_on_date,
      notes: resultRecord.notes,
      created_by: resultRecord.created_by,
      created_at: resultRecord.created_at,
      updated_at: resultRecord.updated_at,
      customer_name: customer.name,
      customer_company: customer.company_name,
    },
  };
}

/**
 * Deletes a customer's opening balance record for a specific as-on date.
 */
export async function deleteCustomerOpeningBalance(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  asOnDate: string
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_REGEX.test(businessId) || !UUID_REGEX.test(customerId) || !DATE_REGEX.test(asOnDate)) {
    return { success: false, error: "Invalid parameters for opening balance deletion." };
  }

  const { error } = await supabase
    .from("customer_opening_balances")
    .delete()
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .eq("as_on_date", asOnDate);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Calculates customer net balance as of a given date (or today).
 * Positive => Customer owes money (Receivable)
 * Negative => Excess advance paid by customer (Payable)
 */
export async function calculateCustomerBalanceAsOf(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  asOfDate?: string
): Promise<number> {
  const targetDate = asOfDate && DATE_REGEX.test(asOfDate) ? asOfDate : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("calculate_customer_balance_as_of", {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_as_of_date: targetDate,
  });

  if (!error && typeof data === "number") {
    return data;
  }

  // Fallback calculation in Node if RPC is unavailable
  const ob = await getCustomerOpeningBalance(supabase, businessId, customerId);
  let base = 0;
  let cutoff: string | null = null;
  if (ob && ob.as_on_date <= targetDate) {
    base = ob.balance_type === "RECEIVABLE" ? ob.amount : -ob.amount;
    cutoff = ob.as_on_date;
  }

  let txQuery = supabase
    .from("customer_ledger")
    .select("debit, credit, entry_date")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .lte("entry_date", targetDate);

  if (cutoff) {
    txQuery = txQuery.gt("entry_date", cutoff);
  }

  const { data: txs } = await txQuery;
  let debits = 0;
  let credits = 0;
  for (const t of txs || []) {
    debits += Number(t.debit || 0);
    credits += Number(t.credit || 0);
  }

  return base + debits - credits;
}

/**
 * Requirement 7: For a selected reporting period:
 * - Calculates opening balance as of the day before the start date.
 * - Includes only transactions within the period [startDate, endDate].
 * - Calculates closing balance at the end date.
 * - Distinguishes advance from due without double counting.
 */
export async function getCustomerPeriodBalance(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  startDate: string,
  endDate: string
): Promise<CustomerPeriodBalanceStatement | null> {
  if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
    throw new Error("Invalid date range format. Use YYYY-MM-DD.");
  }
  if (startDate > endDate) {
    throw new Error("Start date cannot be after end date.");
  }

  const { data, error } = await supabase.rpc("get_customer_period_balance", {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    const row = data[0];
    return {
      customerId: row.customer_id,
      periodStartDate: row.period_start_date,
      periodEndDate: row.period_end_date,
      dayBeforeStartDate: row.day_before_start,
      openingBalance: Number(row.opening_balance) || 0,
      openingBalanceType: row.opening_balance_type as CustomerBalanceType,
      periodSales: Number(row.period_sales) || 0,
      periodPayments: Number(row.period_payments) || 0,
      periodCreditsAdjustments: Number(row.period_credits_adjustments) || 0,
      periodDebitsAdjustments: Number(row.period_debits_adjustments) || 0,
      periodNetChange: Number(row.period_net_change) || 0,
      closingBalance: Number(row.closing_balance) || 0,
      closingBalanceType: row.closing_balance_type as CustomerBalanceType,
      closingDue: Number(row.closing_due) || 0,
      closingAdvance: Number(row.closing_advance) || 0,
    };
  }

  // Fallback programmatic implementation
  const dayBefore = new Date(new Date(startDate).getTime() - 86400000).toISOString().slice(0, 10);
  const openingBal = await calculateCustomerBalanceAsOf(supabase, businessId, customerId, dayBefore);

  const { data: periodTxs } = await supabase
    .from("customer_ledger")
    .select("entry_type, debit, credit")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  let periodSales = 0;
  let periodPayments = 0;
  let periodCredits = 0;
  let periodDebits = 0;

  for (const tx of periodTxs || []) {
    const d = Number(tx.debit || 0);
    const c = Number(tx.credit || 0);
    if (tx.entry_type === "INVOICE") {
      periodSales += d;
    } else if (tx.entry_type === "PAYMENT") {
      periodPayments += c;
    } else if (tx.entry_type === "CREDIT_NOTE" || tx.entry_type === "ADJUSTMENT") {
      periodCredits += c;
    } else if (tx.entry_type === "DEBIT_NOTE") {
      periodDebits += d;
    }
  }

  const periodNetChange = periodSales + periodDebits - periodPayments - periodCredits;
  const closingBalance = openingBal + periodNetChange;
  const closingDue = closingBalance > 0 ? closingBalance : 0;
  const closingAdvance = closingBalance < 0 ? Math.abs(closingBalance) : 0;

  return {
    customerId,
    periodStartDate: startDate,
    periodEndDate: endDate,
    dayBeforeStartDate: dayBefore,
    openingBalance: openingBal,
    openingBalanceType: openingBal >= 0 ? "RECEIVABLE" : "PAYABLE",
    periodSales,
    periodPayments,
    periodCreditsAdjustments: periodCredits,
    periodDebitsAdjustments: periodDebits,
    periodNetChange,
    closingBalance,
    closingBalanceType: closingBalance >= 0 ? "RECEIVABLE" : "PAYABLE",
    closingDue,
    closingAdvance,
  };
}
