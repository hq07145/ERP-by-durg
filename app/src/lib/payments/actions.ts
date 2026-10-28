"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import type {
  PaymentListItem,
  PaymentWithDetails,
  CustomerLedgerEntryWithDetails,
  CustomerSummary,
  CustomerAdvanceTransaction,
  CreatePaymentFormValues,
  CreatePaymentResult,
  UpdatePaymentFormValues,
  DeletePaymentFormValues,
  PaymentStatus,
  PaymentMethod,
} from "@/types/payment";
import { notifyPaymentReceived } from "@/lib/notifications/actions";

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "UPI",
  "CARD",
  "OTHER",
];

const VALID_PAYMENT_STATUSES: PaymentStatus[] = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "REFUNDED",
];

// Helper to keep order paid and due amounts mathematically authoritative:
// paid = sum(successful direct payments) + sum(active customer advance allocations)
// due = max(0, total - paid)
async function syncAuthoritativeOrderTotals(
  supabase: any,
  businessId: string,
  orderId: string
): Promise<{ paid: number; due: number; total: number }> {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (orderErr || !order) {
    throw new Error("Order not found or inaccessible for financial sync.");
  }

  const [payRes, allocRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount")
      .eq("business_id", businessId)
      .eq("order_id", orderId)
      .eq("status", "SUCCESS"),
    supabase
      .from("customer_advance_allocations")
      .select("allocated_amount")
      .eq("business_id", businessId)
      .eq("order_id", orderId)
      .eq("status", "ACTIVE"),
  ]);

  if (payRes.error) {
    throw new Error(`Failed to sum order payments: ${payRes.error.message}`);
  }

  const totalDirectPaid = (payRes.data ?? []).reduce(
    (acc: number, p: any) => acc + (Number(p.amount) || 0),
    0
  );
  const totalAdvanceApplied = (allocRes.data ?? []).reduce(
    (acc: number, a: any) => acc + (Number(a.allocated_amount) || 0),
    0
  );
  const totalPaid = totalDirectPaid + totalAdvanceApplied;
  const totalAmount = Number(order.total_amount) || 0;
  const totalDue = Math.max(0, totalAmount - totalPaid);

  await supabase
    .from("orders")
    .update({
      paid_amount: totalPaid,
      due_amount: totalDue,
      advance_applied: totalAdvanceApplied,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", businessId);

  return { paid: totalPaid, due: totalDue, total: totalAmount };
}

export interface CustomerAdvanceBalance {
  availableAdvance: number;
  totalAdvanceReceived: number;
  totalAdvanceAllocated: number;
}

export async function getCustomerAdvanceBalance(
  customerId: string
): Promise<CustomerAdvanceBalance> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!customerId || !uuidRegex.test(customerId)) {
    return { availableAdvance: 0, totalAdvanceReceived: 0, totalAdvanceAllocated: 0 };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { availableAdvance: 0, totalAdvanceReceived: 0, totalAdvanceAllocated: 0 };
  }

  try {
    const { data, error } = await supabase.rpc("get_customer_advance_balance", {
      p_business_id: context.user.business_id,
      p_customer_id: customerId,
    });

    if (error) {
      console.warn("get_customer_advance_balance RPC error:", error.message || error);
    } else if (data && data.length > 0) {
      return {
        availableAdvance: Math.max(0, Number(data[0].available_advance) || 0),
        totalAdvanceReceived: Math.max(0, Number(data[0].total_advance_received) || 0),
        totalAdvanceAllocated: Math.max(0, Number(data[0].total_advance_allocated) || 0),
      };
    }
  } catch (err) {
    console.warn("getCustomerAdvanceBalance RPC exception:", err);
  }

  // Authoritative fallback calculation using direct table queries
  try {
    const [paymentsRes, allocsRes] = await Promise.all([
      supabase
        .from("payments")
        .select("amount")
        .eq("business_id", context.user.business_id)
        .eq("customer_id", customerId)
        .is("order_id", null)
        .eq("status", "SUCCESS"),
      supabase
        .from("customer_advance_allocations")
        .select("allocated_amount")
        .eq("business_id", context.user.business_id)
        .eq("customer_id", customerId)
        .eq("status", "ACTIVE"),
    ]);

    const received = (paymentsRes.data ?? []).reduce(
      (sum: number, p: any) => sum + (Number(p.amount) || 0),
      0
    );
    const allocated = (allocsRes.data ?? []).reduce(
      (sum: number, a: any) => sum + (Number(a.allocated_amount) || 0),
      0
    );
    const available = Math.max(0, received - allocated);

    return {
      availableAdvance: available,
      totalAdvanceReceived: received,
      totalAdvanceAllocated: allocated,
    };
  } catch (fallbackErr) {
    console.error("getCustomerAdvanceBalance fallback exception:", fallbackErr);
    return { availableAdvance: 0, totalAdvanceReceived: 0, totalAdvanceAllocated: 0 };
  }
}


// ============================================
// PAYMENT QUERY FUNCTIONS
// ============================================

export async function listPayments(
  status?: PaymentStatus,
  customerId?: string,
  orderId?: string,
  limit = 50,
  offset = 0
): Promise<PaymentListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    throw new Error("Forbidden: payments.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("list_payments", {
    p_business_id: context.user.business_id,
    p_status: status || null,
    p_customer_id: customerId || null,
    p_order_id: orderId || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && data) return data as PaymentListItem[];

  // Fallback: direct table select with relation joins
  let fallbackQuery = supabase
    .from("payments")
    .select("id, business_id, customer_id, order_id, payment_number, amount, payment_date, payment_method, reference, notes, status, created_at, updated_at, customers(name, company_name), orders(order_number)")
    .eq("business_id", context.user.business_id)
    .order("payment_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) fallbackQuery = fallbackQuery.eq("status", status);
  if (customerId) fallbackQuery = fallbackQuery.eq("customer_id", customerId);
  if (orderId) fallbackQuery = fallbackQuery.eq("order_id", orderId);

  const { data: tableData } = await fallbackQuery;
  return ((tableData ?? []).map((row: any) => ({
    id: row.id,
    business_id: row.business_id,
    customer_id: row.customer_id,
    customer_name: row.customers?.name || "Customer",
    customer_company: row.customers?.company_name || null,
    order_id: row.order_id,
    order_number: row.orders?.order_number || null,
    payment_number: row.payment_number || "PAY",
    amount: row.amount,
    payment_date: row.payment_date,
    payment_method: row.payment_method,
    reference: row.reference,
    status: row.status,
    created_at: row.created_at,
  }))) as PaymentListItem[];
}

export async function getPaymentWithDetails(paymentId: string): Promise<PaymentWithDetails | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    throw new Error("Forbidden: payments.view");
  }

  // Handle invalid UUIDs safely without causing database syntax errors
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!paymentId || !uuidRegex.test(paymentId)) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let p: any = null;

  try {
    const { data, error } = await supabase.rpc("get_payment_with_details", {
      p_business_id: context.user.business_id,
      p_payment_id: paymentId,
    });

    if (error) {
      console.warn("get_payment_with_details RPC warning:", error.message || error);
    } else if (data && data.length > 0) {
      p = data[0];
    }
  } catch (rpcErr) {
    console.warn("get_payment_with_details RPC invocation exception:", rpcErr);
  }

  // Fallback: direct table select with relation joins
  if (!p) {
    const { data: row, error: tableErr } = await supabase
      .from("payments")
      .select(`
        id,
        business_id,
        customer_id,
        order_id,
        payment_number,
        amount,
        payment_date,
        payment_method,
        reference,
        notes,
        status,
        idempotency_key,
        transaction_id,
        utr_number,
        created_at,
        updated_at,
        customers(name, company_name),
        orders(order_number)
      `)
      .eq("id", paymentId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (tableErr) {
      console.error("Direct payment query error:", tableErr);
      return null;
    }

    if (!row) return null;

    p = {
      id: row.id,
      business_id: row.business_id,
      customer_id: row.customer_id,
      order_id: row.order_id,
      payment_number: row.payment_number,
      amount: row.amount,
      payment_date: row.payment_date,
      payment_method: row.payment_method,
      reference: row.reference,
      notes: row.notes,
      status: row.status,
      idempotency_key: row.idempotency_key,
      transaction_id: row.transaction_id,
      utr_number: row.utr_number,
      created_at: row.created_at,
      updated_at: row.updated_at,
      customer_name: (row.customers as any)?.name || "Customer",
      customer_company: (row.customers as any)?.company_name || null,
      order_number: (row.orders as any)?.order_number || null,
    };
  }

  return {
    id: p.id,
    business_id: p.business_id,
    customer_id: p.customer_id,
    order_id: p.order_id,
    payment_number: p.payment_number,
    amount: p.amount,
    payment_date: p.payment_date,
    payment_method: p.payment_method as PaymentMethod,
    reference: p.reference,
    notes: p.notes,
    status: p.status as PaymentStatus,
    idempotency_key: p.idempotency_key ?? null,
    transaction_id: p.transaction_id ?? null,
    utr_number: p.utr_number ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at,
    customer_name: p.customer_name,
    customer_company: p.customer_company,
    order_number: p.order_number,
  };
}

export async function getCustomerLedger(
  customerId: string,
  limit = 100,
  offset = 0
): Promise<CustomerLedgerEntryWithDetails[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  try {
    const [ledgerRes, cobRes, custRes] = await Promise.all([
      supabase.rpc("get_customer_ledger", {
        p_business_id: context.user.business_id,
        p_customer_id: customerId,
        p_limit: limit,
        p_offset: offset,
      }),
      supabase
        .from("customer_opening_balances")
        .select("id, amount, balance_type, as_on_date, created_at, created_by")
        .eq("business_id", context.user.business_id)
        .eq("customer_id", customerId)
        .order("as_on_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("name")
        .eq("id", customerId)
        .eq("business_id", context.user.business_id)
        .maybeSingle(),
    ]);

    if (ledgerRes.error) {
      console.warn("get_customer_ledger RPC error:", ledgerRes.error.message || ledgerRes.error);
      return [];
    }

    const rawEntries = (ledgerRes.data ?? []) as CustomerLedgerEntryWithDetails[];
    const cob = cobRes.data;
    const customerName = custRes.data?.name || rawEntries[0]?.customer_name || "";

    if (!cob) {
      return rawEntries;
    }

    // Customer has a configured opening balance
    const isRec = cob.balance_type === "RECEIVABLE";
    const obAmount = Number(cob.amount) || 0;
    const signedOb = isRec ? obAmount : -obAmount;

    const obEntry: CustomerLedgerEntryWithDetails = {
      id: `cob-${cob.id}`,
      business_id: context.user.business_id,
      customer_id: customerId,
      customer_name: customerName,
      order_id: null,
      order_number: null,
      payment_id: null,
      payment_number: null,
      entry_type: "OPENING_BALANCE",
      description: `Opening Balance (${cob.balance_type}) as of ${cob.as_on_date}`,
      debit: isRec ? obAmount : 0,
      credit: !isRec ? obAmount : 0,
      balance: signedOb,
      entry_date: cob.as_on_date,
      created_at: cob.created_at || `${cob.as_on_date}T00:00:00Z`,
      created_by: cob.created_by || "",
    };

    // Calculate dynamic running balances strictly starting from opening balance
    // Sort chronological (oldest first) to compute running balance forward
    const chronological = [...rawEntries].sort((a, b) => {
      const cmp = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime();
      if (cmp !== 0) return cmp;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    let running = signedOb;
    const updatedEntries = chronological.map((entry) => {
      if (entry.entry_date > cob.as_on_date) {
        running = running + Number(entry.debit || 0) - Number(entry.credit || 0);
        return {
          ...entry,
          balance: Math.round(running * 100) / 100,
        };
      }
      return entry;
    });

    // Combine with opening balance entry and return in descending order (most recent first)
    const combined = [obEntry, ...updatedEntries].sort((a, b) => {
      const cmp = new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime();
      if (cmp !== 0) return cmp;
      if (a.entry_type === "OPENING_BALANCE") return 1;
      if (b.entry_type === "OPENING_BALANCE") return -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return combined;
  } catch (err) {
    console.warn("getCustomerLedger exception:", err);
    return [];
  }
}

/**
 * Fetches the structured period balance statement for a customer.
 */
export async function getCustomerPeriodBalanceStatement(
  customerId: string,
  startDate?: string,
  endDate?: string
) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  try {
    const sDate = startDate || "2020-01-01";
    const eDate = endDate || new Date().toISOString().split("T")[0];

    const { data, error } = await supabase.rpc("get_customer_period_balance", {
      p_business_id: context.user.business_id,
      p_customer_id: customerId,
      p_start_date: sDate,
      p_end_date: eDate,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    const row = data[0];
    return {
      customerId: row.customer_id,
      startDate: row.period_start_date,
      endDate: row.period_end_date,
      dayBeforeStart: row.day_before_start,
      openingBalance: Number(row.opening_balance) || 0,
      openingBalanceType: row.opening_balance_type as "RECEIVABLE" | "PAYABLE",
      periodSales: Number(row.period_sales) || 0,
      periodPayments: Number(row.period_payments) || 0,
      periodCreditsAdjustments: Number(row.period_credits_adjustments) || 0,
      periodDebitsAdjustments: Number(row.period_debits_adjustments) || 0,
      periodNetChange: Number(row.period_net_change) || 0,
      closingBalance: Number(row.closing_balance) || 0,
      closingBalanceType: row.closing_balance_type as "RECEIVABLE" | "PAYABLE",
      closingDue: Number(row.closing_due) || 0,
      closingAdvance: Number(row.closing_advance) || 0,
    };
  } catch (err) {
    console.error("getCustomerPeriodBalanceStatement error:", err);
    return null;
  }
}

export async function getCustomerSummary(customerId: string): Promise<CustomerSummary | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc("get_customer_summary", {
      p_business_id: context.user.business_id,
      p_customer_id: customerId,
    });

    if (!error && data && data.length > 0) {
      const s = data[0];
      return {
        customer_id: s.customer_id,
        customer_name: s.customer_name,
        customer_company: s.customer_company,
        total_purchases: Number(s.total_purchases) || 0,
        total_paid: Number(s.total_paid) || 0,
        total_due: Math.max(0, Number(s.total_due) || 0),
        available_advance: Math.max(0, Number(s.available_advance) || 0),
        total_advance_received: Number(s.total_advance_received) || 0,
        total_advance_allocated: Number(s.total_advance_allocated) || 0,
        opening_balance_amount: s.opening_balance_amount != null ? Number(s.opening_balance_amount) : 0,
        opening_balance_type: s.opening_balance_type || null,
        opening_balance_date: s.opening_balance_date || null,
        reconciliation_warning: s.reconciliation_warning || null,
        last_payment_date: s.last_payment_date,
        last_payment_amount: s.last_payment_amount ? Number(s.last_payment_amount) : null,
      };
    }

    if (error) {
      console.warn("get_customer_summary RPC warning:", error.message || error);
    }

    // Direct fallback calculation
    const { data: customer } = await supabase
      .from("customers")
      .select("name, company_name")
      .eq("id", customerId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (!customer) return null;

    const [
      { data: ledger },
      advBal,
      { data: activeOrders },
      { data: payments }
    ] = await Promise.all([
      supabase
        .from("customer_ledger")
        .select("entry_type, debit, credit, entry_date")
        .eq("customer_id", customerId)
        .eq("business_id", context.user.business_id),
      getCustomerAdvanceBalance(customerId),
      supabase
        .from("orders")
        .select("total_amount, due_amount, status")
        .eq("customer_id", customerId)
        .eq("business_id", context.user.business_id)
        .not("status", "eq", "CANCELLED"),
      supabase
        .from("payments")
        .select("amount, status, payment_date")
        .eq("customer_id", customerId)
        .eq("business_id", context.user.business_id)
        .eq("status", "SUCCESS")
        .order("payment_date", { ascending: true })
    ]);

    const entries = ledger ?? [];
    const ledgerPurchases = entries
      .filter((e) => e.entry_type === "INVOICE")
      .reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
    const ordersTotal = (activeOrders ?? []).reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0
    );
    const total_purchases = Math.max(ledgerPurchases, ordersTotal);

    const clearedPayments = payments ?? [];
    const total_paid = clearedPayments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    const total_due = (activeOrders ?? []).reduce(
      (sum, o) => sum + Math.max(0, Number(o.due_amount) || 0),
      0
    );

    const lastPayment = clearedPayments[clearedPayments.length - 1];

    const netLedger = total_purchases - total_paid;
    const netDues = total_due - advBal.availableAdvance;
    const reconciliation_warning =
      Math.abs(netLedger - netDues) > 0.01
        ? `Reconciliation note: Lifetime purchases less payments differs from net receivables. Please review historical records.`
        : null;

    return {
      customer_id: customerId,
      customer_name: customer.name,
      customer_company: customer.company_name,
      total_purchases,
      total_paid,
      total_due: Math.max(0, total_due),
      available_advance: advBal.availableAdvance,
      total_advance_received: advBal.totalAdvanceReceived,
      total_advance_allocated: advBal.totalAdvanceAllocated,
      reconciliation_warning,
      last_payment_date: lastPayment?.payment_date ?? null,
      last_payment_amount: lastPayment ? Number(lastPayment.amount) || 0 : null,
    };
  } catch (err) {
    console.warn("getCustomerSummary exception:", err);
    return null;
  }
}

export async function getCustomerAdvanceTransactions(
  customerId: string
): Promise<CustomerAdvanceTransaction[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  try {
    // 1. Fetch advance receipts (order_id IS NULL)
    const { data: receipts } = await supabase
      .from("payments")
      .select("id, payment_number, payment_date, amount, reference, notes, status, created_at")
      .eq("business_id", context.user.business_id)
      .eq("customer_id", customerId)
      .is("order_id", null)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true });

    // 2. Fetch advance allocations linked to orders
    const { data: allocations } = await supabase
      .from("customer_advance_allocations")
      .select("id, payment_id, order_id, allocated_amount, allocation_date, status, notes, created_at, orders(order_number)")
      .eq("business_id", context.user.business_id)
      .eq("customer_id", customerId)
      .order("allocation_date", { ascending: true })
      .order("created_at", { ascending: true });

    type RawItem = {
      id: string;
      date: string;
      createdAt: string;
      type: "RECEIPT" | "ALLOCATION";
      receipt_number: string | null;
      reference: string | null;
      order_id: string | null;
      order_number: string | null;
      amount_received: number;
      amount_allocated: number;
      status: string;
      notes: string | null;
    };

    const combined: RawItem[] = [];

    for (const r of receipts ?? []) {
      combined.push({
        id: r.id,
        date: r.payment_date,
        createdAt: r.created_at,
        type: "RECEIPT",
        receipt_number: r.payment_number,
        reference: r.reference,
        order_id: null,
        order_number: null,
        amount_received: Number(r.amount) || 0,
        amount_allocated: 0,
        status: r.status,
        notes: r.notes,
      });
    }

    for (const a of allocations ?? []) {
      const ordNum = (a.orders as any)?.order_number || null;
      combined.push({
        id: a.id,
        date: a.allocation_date,
        createdAt: a.created_at,
        type: "ALLOCATION",
        receipt_number: null,
        reference: null,
        order_id: a.order_id,
        order_number: ordNum,
        amount_received: 0,
        amount_allocated: Number(a.allocated_amount) || 0,
        status: a.status,
        notes: a.notes,
      });
    }

    combined.sort((a, b) => {
      const d1 = new Date(a.date).getTime();
      const d2 = new Date(b.date).getTime();
      if (d1 !== d2) return d1 - d2;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let running = 0;
    const result: CustomerAdvanceTransaction[] = [];

    for (const item of combined) {
      if (item.type === "RECEIPT") {
        if (item.status === "SUCCESS") {
          running += item.amount_received;
        }
      } else if (item.type === "ALLOCATION") {
        if (item.status === "ACTIVE") {
          running = Math.max(0, running - item.amount_allocated);
        }
      }

      result.push({
        id: item.id,
        date: item.date,
        type: item.type,
        receipt_number: item.receipt_number,
        reference: item.reference,
        order_id: item.order_id,
        order_number: item.order_number,
        amount_received: item.amount_received,
        amount_allocated: item.amount_allocated,
        running_advance_balance: running,
        status: item.status,
        notes: item.notes,
      });
    }

    return result.reverse();
  } catch (err) {
    console.warn("getCustomerAdvanceTransactions exception:", err);
    return [];
  }
}

export async function getCustomerPayments(
  customerId: string,
  limit = 50,
  offset = 0
): Promise<PaymentListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc("list_payments", {
      p_business_id: context.user.business_id,
      p_customer_id: customerId,
      p_status: null,
      p_order_id: null,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.warn("list_payments RPC error:", error.message || error);
      return [];
    }
    return (data ?? []) as PaymentListItem[];
  } catch (err) {
    console.warn("getCustomerPayments exception:", err);
    return [];
  }
}

export async function getOrdersForCustomer(customerId: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) {
    throw new Error("Forbidden: orders.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_date, priority, status, total_amount, paid_amount, due_amount, created_at")
    .eq("business_id", context.user.business_id)
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getEligibleOrdersForPayment(customerId?: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) {
    throw new Error("Forbidden: orders.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("orders")
    .select("id, order_number, order_date, total_amount, paid_amount, due_amount, status, customer_id, customers(name, company_name)")
    .eq("business_id", context.user.business_id)
    .neq("status", "CANCELLED")
    .gt("due_amount", 0)
    .order("order_date", { ascending: false });

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ============================================
// PAYMENT MUTATION FUNCTIONS
// ============================================

export async function createPayment(
  values: CreatePaymentFormValues
): Promise<CreatePaymentResult> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.add")) {
    throw new Error("Forbidden: payments.add");
  }

  // 1. Validate Payment Amount
  const amountNum = Number(values.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // 2. Validate Payment Date
  if (!values.payment_date || isNaN(Date.parse(values.payment_date))) {
    throw new Error("Valid payment date is required.");
  }

  // 3. Validate Payment Method
  if (!VALID_PAYMENT_METHODS.includes(values.payment_method)) {
    throw new Error(`Invalid payment method: ${values.payment_method}`);
  }

  // 4. Validate Payment Status
  const status: PaymentStatus = values.status || "SUCCESS";
  if (!VALID_PAYMENT_STATUSES.includes(status)) {
    throw new Error(`Invalid payment status: ${status}`);
  }

  // 5. Validate Reference, Transaction ID and Notes
  const cleanRef = values.utr_number?.trim() || values.reference?.trim() || null;
  const cleanTxn = values.transaction_id?.trim() || null;
  const idempotencyKey = values.idempotency_key?.trim() || null;

  if (cleanRef && cleanRef.length > 128) {
    throw new Error("Payment reference / UTR must not exceed 128 characters.");
  }
  if (cleanTxn && cleanTxn.length > 128) {
    throw new Error("External transaction ID must not exceed 128 characters.");
  }
  if (values.notes && values.notes.length > 2000) {
    throw new Error("Payment notes must not exceed 2000 characters.");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // 6. Idempotency Check (Requirement 2 & 3)
  // If an idempotency key was supplied and already posted, return original payment immediately
  if (idempotencyKey) {
    const { data: existingIdemp } = await supabase
      .from("payments")
      .select("id, payment_number, status, amount")
      .eq("business_id", context.user.business_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingIdemp) {
      return {
        payment_id: existingIdemp.id,
        payment_number: existingIdemp.payment_number,
        already_processed: true,
        message: "Payment request already processed",
      };
    }
  }

  // 7. Validate Customer Exists and Belongs to Business
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name, status")
    .eq("id", values.customer_id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (custErr || !customer) {
    throw new Error("Selected customer not found or does not belong to your business.");
  }

  // 8. Validate Order Details & Prevent Overpayment
  if (values.order_id) {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, customer_id, total_amount, paid_amount, due_amount, status")
      .eq("id", values.order_id)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (orderErr || !order) {
      throw new Error("Linked order not found in your business records.");
    }
    if (order.customer_id !== values.customer_id) {
      throw new Error("Order does not belong to the selected customer.");
    }
    if (order.status === "CANCELLED") {
      throw new Error("Cannot record payment for a cancelled order.");
    }

    const currentDue = Number(order.due_amount) || 0;
    if (status === "SUCCESS" && amountNum > currentDue + 0.001) {
      throw new Error(
        `OVERPAYMENT_NOT_ALLOWED: Payment amount (₹${amountNum.toFixed(2)}) exceeds the order outstanding balance (₹${currentDue.toFixed(2)}).`
      );
    }
  }

  // 9. Duplicate Transaction ID Detection (Requirement 4)
  if (cleanTxn) {
    const { data: matchedTxn } = await supabase
      .from("payments")
      .select("id, payment_number")
      .eq("business_id", context.user.business_id)
      .eq("transaction_id", cleanTxn)
      .in("status", ["SUCCESS", "PENDING"])
      .maybeSingle();

    if (matchedTxn) {
      throw new Error(
        `DUPLICATE_TRANSACTION: External Transaction ID "${cleanTxn}" has already been recorded for payment ${matchedTxn.payment_number}.`
      );
    }
  }

  // 10. Electronic Bank UTR / Reference Duplicate Detection (Requirement 4 & 5)
  // CASH payments and empty references are exempted to allow genuine repeated cash payments
  if (values.payment_method !== "CASH" && cleanRef && !values.allow_duplicate_reference) {
    const { data: matchedUtr } = await supabase
      .from("payments")
      .select("id, payment_number, payment_date")
      .eq("business_id", context.user.business_id)
      .or(`utr_number.eq.${cleanRef},reference.eq.${cleanRef}`)
      .in("status", ["SUCCESS", "PENDING"])
      .maybeSingle();

    if (matchedUtr) {
      throw new Error(
        `DUPLICATE_REFERENCE: Bank UTR/Reference "${cleanRef}" has already been recorded for payment ${matchedUtr.payment_number} on ${matchedUtr.payment_date}.`
      );
    }
  }

  // 11. Execute Atomic Payment Creation via SQL RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc("create_payment", {
    p_business_id: context.user.business_id,
    p_customer_id: values.customer_id,
    p_amount: amountNum,
    p_payment_date: values.payment_date,
    p_payment_method: values.payment_method,
    p_order_id: values.order_id || null,
    p_reference: cleanRef,
    p_notes: values.notes?.trim() || null,
    p_status: status,
    p_idempotency_key: idempotencyKey,
    p_transaction_id: cleanTxn,
    p_utr_number: values.utr_number?.trim() || cleanRef,
    p_allow_duplicate_reference: values.allow_duplicate_reference || false,
    p_operator_id: context.user.id,
  });

  if (rpcErr) throw rpcErr;

  const result = typeof rpcData === "object" && rpcData !== null ? rpcData : { payment_id: rpcData };
  const paymentId: string = result.payment_id;
  const paymentNumber: string = result.payment_number;
  const alreadyProcessed: boolean = Boolean(result.already_processed);

  if (alreadyProcessed) {
    return {
      payment_id: paymentId,
      payment_number: paymentNumber,
      already_processed: true,
      message: "Payment request already processed",
    };
  }

  // 12. Guarantee Authoritative Totals Sync
  if (values.order_id) {
    await syncAuthoritativeOrderTotals(supabase, context.user.business_id, values.order_id);
  }

  // Recalculate customer ledger running balances to ensure 100% mathematical consistency
  try {
    await supabase.rpc("recalculate_customer_ledger", {
      p_business_id: context.user.business_id,
      p_customer_id: values.customer_id,
    });
  } catch (recalcErr) {
    console.error("Non-fatal: recalculate_customer_ledger notice", recalcErr);
  }

  try {
    await notifyPaymentReceived(
      context.user.business_id,
      paymentId,
      paymentNumber || "Payment",
      amountNum,
      context.user.id
    );
  } catch {
    // Non-fatal
  }

  return {
    payment_id: paymentId,
    payment_number: paymentNumber,
    already_processed: false,
    message: "Payment created successfully",
  };
}

export async function updatePayment(
  values: UpdatePaymentFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.edit")) {
    throw new Error("Forbidden: payments.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // 1. Fetch Existing Payment
  const { data: existing, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", values.payment_id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new Error("Payment record not found.");
  }

  const newAmount = values.amount !== undefined ? Number(values.amount) : Number(existing.amount);
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    throw new Error("Updated payment amount must be greater than zero.");
  }

  const newStatus = values.status || existing.status;
  if (!VALID_PAYMENT_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid target payment status: ${newStatus}`);
  }

  if (values.payment_method && !VALID_PAYMENT_METHODS.includes(values.payment_method)) {
    throw new Error(`Invalid payment method: ${values.payment_method}`);
  }

  // 2. Prevent Overpayment on Edit (Requirement 4)
  if (existing.order_id && newStatus === "SUCCESS") {
    const { data: order } = await supabase
      .from("orders")
      .select("total_amount, paid_amount, due_amount")
      .eq("id", existing.order_id)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (order) {
      const currentDue = Number(order.due_amount) || 0;
      const creditAvailable = currentDue + (existing.status === "SUCCESS" ? Number(existing.amount) : 0);
      if (newAmount > creditAvailable + 0.001) {
        throw new Error(
          `OVERPAYMENT_NOT_ALLOWED: Updated amount (₹${newAmount.toFixed(2)}) exceeds maximum allowable balance (₹${creditAvailable.toFixed(2)}).`
        );
      }
    }
  }

  // 3. Execute Update RPC
  const { error: rpcErr } = await supabase.rpc("update_payment", {
    p_business_id: context.user.business_id,
    p_payment_id: values.payment_id,
    p_amount: values.amount ? newAmount : null,
    p_payment_date: values.payment_date || null,
    p_payment_method: values.payment_method || null,
    p_reference: values.reference !== undefined ? values.reference.trim() || null : null,
    p_notes: values.notes !== undefined ? values.notes.trim() || null : null,
    p_status: values.status || null,
  });

  if (rpcErr) throw rpcErr;

  // 4. Guarantee Authoritative Totals & Ledger Sync
  if (existing.order_id) {
    await syncAuthoritativeOrderTotals(supabase, context.user.business_id, existing.order_id);
  }

  try {
    await supabase.rpc("recalculate_customer_ledger", {
      p_business_id: context.user.business_id,
      p_customer_id: existing.customer_id,
    });
  } catch (recalcErr) {
    console.error("Non-fatal: recalculate_customer_ledger notice", recalcErr);
  }

  return { success: true, message: "Payment updated successfully" };
}

export async function deletePayment(
  values: DeletePaymentFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.delete")) {
    throw new Error("Forbidden: payments.delete");
  }

  if (!values.reason || !values.reason.trim()) {
    throw new Error("A clear reason is required to delete or reverse a payment.");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // 1. Fetch Existing Payment
  const { data: existing, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", values.payment_id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new Error("Payment record not found.");
  }

  if (existing.status === "REFUNDED") {
    throw new Error("This payment has already been refunded/deleted.");
  }

  // 2. Execute Soft-Delete RPC (Sets status to REFUNDED, appends audit reason, reverses ledger credit)
  const { error: rpcErr } = await supabase.rpc("delete_payment", {
    p_business_id: context.user.business_id,
    p_payment_id: values.payment_id,
    p_reason: values.reason.trim(),
  });

  if (rpcErr) throw rpcErr;

  // 3. Guarantee Authoritative Totals & Ledger Sync
  if (existing.order_id) {
    await syncAuthoritativeOrderTotals(supabase, context.user.business_id, existing.order_id);
  }

  try {
    await supabase.rpc("recalculate_customer_ledger", {
      p_business_id: context.user.business_id,
      p_customer_id: existing.customer_id,
    });
  } catch (recalcErr) {
    console.error("Non-fatal: recalculate_customer_ledger notice", recalcErr);
  }

  return { success: true, message: "Payment successfully reversed and marked as refunded." };
}

export async function recalculateCustomerLedger(
  customerId: string
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.edit")) {
    throw new Error("Forbidden: payments.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("recalculate_customer_ledger", {
    p_business_id: context.user.business_id,
    p_customer_id: customerId,
  });

  if (error) throw error;
  return { success: true, message: "Customer ledger recalculated successfully" };
}

export async function recalculateOrderFinancials(
  orderId: string
): Promise<{ paid: number; due: number; total: number }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.edit")) {
    throw new Error("Forbidden: orders.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await syncAuthoritativeOrderTotals(supabase, context.user.business_id, orderId);
}