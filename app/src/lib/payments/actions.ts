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
  CreatePaymentFormValues,
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
// paid = sum(successful payments), due = max(0, total - paid)
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

  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("amount")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .eq("status", "SUCCESS");

  if (payErr) {
    throw new Error(`Failed to sum order payments: ${payErr.message}`);
  }

  const totalPaid = (payments ?? []).reduce(
    (acc: number, p: any) => acc + (Number(p.amount) || 0),
    0
  );
  const totalAmount = Number(order.total_amount) || 0;
  const totalDue = Math.max(0, totalAmount - totalPaid);

  await supabase
    .from("orders")
    .update({
      paid_amount: totalPaid,
      due_amount: totalDue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", businessId);

  return { paid: totalPaid, due: totalDue, total: totalAmount };
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
    throw new Error("Forbidden: payments.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("get_customer_ledger", {
    p_business_id: context.user.business_id,
    p_customer_id: customerId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  return (data ?? []) as CustomerLedgerEntryWithDetails[];
}

export async function getCustomerSummary(customerId: string): Promise<CustomerSummary | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    throw new Error("Forbidden: payments.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("get_customer_summary", {
    p_business_id: context.user.business_id,
    p_customer_id: customerId,
  });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const s = data[0];
  return {
    customer_id: s.customer_id,
    customer_name: s.customer_name,
    customer_company: s.customer_company,
    total_purchases: Number(s.total_purchases) || 0,
    total_paid: Number(s.total_paid) || 0,
    total_due: Number(s.total_due) || 0,
    last_payment_date: s.last_payment_date,
    last_payment_amount: s.last_payment_amount ? Number(s.last_payment_amount) : null,
  };
}

export async function getCustomerPayments(
  customerId: string,
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
    p_customer_id: customerId,
    p_status: null,
    p_order_id: null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  return (data ?? []) as PaymentListItem[];
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
): Promise<{ payment_id: string; message: string }> {
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

  // 5. Validate Reference and Notes
  if (values.reference && values.reference.length > 128) {
    throw new Error("Payment reference must not exceed 128 characters.");
  }
  if (values.notes && values.notes.length > 2000) {
    throw new Error("Payment notes must not exceed 2000 characters.");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // 6. Validate Customer Exists and Belongs to Business
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name, status")
    .eq("id", values.customer_id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (custErr || !customer) {
    throw new Error("Selected customer not found or does not belong to your business.");
  }

  // 7. Validate Order Details & Prevent Overpayment (Requirement 4)
  let linkedOrder: any = null;
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

    linkedOrder = order;
    const currentDue = Number(order.due_amount) || 0;

    // Strict overpayment rejection for order payments
    if (status === "SUCCESS" && amountNum > currentDue + 0.001) {
      throw new Error(
        `OVERPAYMENT_NOT_ALLOWED: Payment amount (₹${amountNum.toFixed(2)}) exceeds the order outstanding balance (₹${currentDue.toFixed(2)}).`
      );
    }
  }

  // 8. Idempotency Guard (Requirement 6) - Prevent duplicate payment submissions on retries
  const idempotencyWindow = new Date(Date.now() - 15000).toISOString();
  let duplicateCheck = supabase
    .from("payments")
    .select("id, payment_number")
    .eq("business_id", context.user.business_id)
    .eq("customer_id", values.customer_id)
    .eq("amount", amountNum)
    .eq("payment_method", values.payment_method)
    .gte("created_at", idempotencyWindow);

  if (values.order_id) {
    duplicateCheck = duplicateCheck.eq("order_id", values.order_id);
  }
  if (values.reference?.trim()) {
    duplicateCheck = duplicateCheck.eq("reference", values.reference.trim());
  }

  const { data: existingDupes } = await duplicateCheck;
  if (existingDupes && existingDupes.length > 0) {
    throw new Error(
      `DUPLICATE_PAYMENT: A payment with identical details (${existingDupes[0].payment_number}) was just submitted. Please wait before retrying.`
    );
  }

  // 9. Execute Atomic Payment Creation via SQL RPC
  const { data: paymentId, error: rpcErr } = await supabase.rpc("create_payment", {
    p_business_id: context.user.business_id,
    p_customer_id: values.customer_id,
    p_amount: amountNum,
    p_payment_date: values.payment_date,
    p_payment_method: values.payment_method,
    p_order_id: values.order_id || null,
    p_reference: values.reference?.trim() || null,
    p_notes: values.notes?.trim() || null,
    p_status: status,
  });

  if (rpcErr) throw rpcErr;

  // 10. Guarantee Authoritative Totals Sync (Requirement 1 & 5)
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
    const { data: pData } = await supabase
      .from("payments")
      .select("payment_number")
      .eq("id", paymentId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    await notifyPaymentReceived(
      context.user.business_id,
      paymentId,
      pData?.payment_number || "Payment",
      amountNum,
      context.user.id
    );
  } catch {
    // Non-fatal
  }

  return { payment_id: paymentId, message: "Payment created successfully" };
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