"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPayment } from "@/lib/payments/actions";
import type { PaymentMethod, PaymentStatus } from "@/types/payment";
import { PAYMENT_METHOD_LABELS } from "@/types/payment";
import {
  CreditCard,
  DollarSign,
  Calendar,
  FileText,
  User,
  ShoppingBag,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

interface CustomerOption {
  id: string;
  name: string;
  company_name: string | null;
}

interface OrderOption {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number | string;
  paid_amount: number | string;
  due_amount: number | string;
  customer_id: string;
}

interface PaymentFormProps {
  customers: CustomerOption[];
  orders: OrderOption[];
  initialCustomerId?: string;
  initialOrderId?: string;
}

export function PaymentForm({
  customers,
  orders,
  initialCustomerId,
  initialOrderId,
}: PaymentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState<string>(initialCustomerId || "");
  const [orderId, setOrderId] = useState<string>(initialOrderId || "");
  const [amount, setAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState<string>("");
  const [transactionId, setTransactionId] = useState<string>("");
  const [utrNumber, setUtrNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<PaymentStatus>("SUCCESS");

  // Client-side idempotency key generated per form instance
  const [idempotencyKey] = useState<string>(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "pay-idem-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter orders by currently selected customer (or show all eligible orders)
  const availableOrders = orders.filter((o) =>
    customerId ? o.customer_id === customerId : true
  );

  const selectedOrder = orders.find((o) => o.id === orderId);

  // When customer changes, if current order doesn't match new customer, clear order
  const handleCustomerChange = (newCustId: string) => {
    setCustomerId(newCustId);
    if (orderId) {
      const match = orders.find((o) => o.id === orderId);
      if (match && match.customer_id !== newCustId) {
        setOrderId("");
        setAmount("");
      }
    }
  };

  // When order changes, auto-select customer and provide quick due fill
  const handleOrderChange = (newOrderId: string) => {
    setOrderId(newOrderId);
    if (newOrderId) {
      const o = orders.find((x) => x.id === newOrderId);
      if (o) {
        setCustomerId(o.customer_id);
        const due = Number(o.due_amount) || 0;
        if (due > 0 && !amount) {
          setAmount(due.toFixed(2));
        }
      }
    }
  };

  const handleFillFullDue = () => {
    if (selectedOrder) {
      setAmount(Number(selectedOrder.due_amount).toFixed(2));
    }
  };

  // Overpayment check for linked orders
  const enteredAmount = Number(amount) || 0;
  const maxDue = selectedOrder ? Number(selectedOrder.due_amount) : Infinity;
  const isOverpaying = selectedOrder && status === "SUCCESS" && enteredAmount > maxDue + 0.001;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!customerId) {
      setErrorMessage("Please select a customer.");
      return;
    }
    if (enteredAmount <= 0) {
      setErrorMessage("Payment amount must be greater than zero.");
      return;
    }
    if (isOverpaying) {
      setErrorMessage(
        `Overpayment is not allowed. The payment amount (₹${enteredAmount.toFixed(2)}) exceeds the order balance due (₹${maxDue.toFixed(2)}).`
      );
      return;
    }

    startTransition(async () => {
      try {
        const res = await createPayment({
          customer_id: customerId,
          order_id: orderId || undefined,
          amount: String(enteredAmount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference: reference.trim() || undefined,
          transaction_id: transactionId.trim() || undefined,
          utr_number: utrNumber.trim() || undefined,
          idempotency_key: idempotencyKey,
          notes: notes.trim() || undefined,
          status: status,
        });

        if (res.already_processed) {
          setSuccessMessage(
            `Existing payment verified: ${res.payment_number || "Payment"} was already recorded. (Duplicate request blocked safely).`
          );
        } else {
          setSuccessMessage(res.message || "Payment recorded successfully!");
        }

        setTimeout(() => {
          if (orderId) {
            router.push(`/orders/${orderId}?notice=payment_recorded`);
          } else {
            router.push(`/customers/${customerId}?notice=payment_recorded`);
          }
        }, 800);
      } catch (err: any) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to record payment.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Alert Messages */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-bold">Transaction Blocked</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold">Payment Verified & Saved</p>
            <p className="mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Main Form Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#0F766E]" />
            <span>Payment Specifications</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Record cleared receipt or advance payment against customer accounts and orders.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. Customer Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Customer <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              >
                <option value="">Select Customer Account</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company_name ? `(${c.company_name})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Order Select (Optional) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Link to Order <span className="text-slate-400 font-normal">(Optional - leave blank for unallocated advance)</span>
            </label>
            <select
              value={orderId}
              onChange={(e) => handleOrderChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="">No Order Linked (General Customer Credit/Advance)</option>
              {availableOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — Due: ₹{Number(o.due_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Order Summary Card */}
        {selectedOrder && (
          <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-900 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Selected Order #{selectedOrder.order_number}</span>
              </span>
              <button
                type="button"
                onClick={handleFillFullDue}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0F766E] text-white text-[11px] font-semibold hover:bg-[#0D655E] transition"
              >
                <Sparkles className="w-3 h-3" />
                <span>Pay Full Due (₹{Number(selectedOrder.due_amount).toFixed(2)})</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 text-slate-700 border-t border-teal-200/50">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Order Total</span>
                <span className="font-bold text-slate-900">
                  ₹{Number(selectedOrder.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Already Paid</span>
                <span className="font-bold text-emerald-700">
                  ₹{Number(selectedOrder.paid_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Balance Due</span>
                <span className="font-bold text-rose-700">
                  ₹{Number(selectedOrder.due_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 3. Payment Amount */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className={`w-full rounded-lg border px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 ${
                  isOverpaying
                    ? "border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-500"
                    : "border-slate-300 bg-white focus:border-[#0F766E] focus:ring-[#0F766E]"
                }`}
              />
            </div>
            {isOverpaying && (
              <p className="text-[11px] text-rose-600 font-semibold mt-1">
                Amount exceeds order balance due of ₹{maxDue.toFixed(2)}. Overpayment is blocked.
              </p>
            )}
          </div>

          {/* 4. Payment Date */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>

          {/* 5. Payment Method */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Method <span className="text-rose-500">*</span>
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 6. Reference / Cheque # */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Reference / Cheque #
            </label>
            <input
              type="text"
              placeholder="e.g. CHQ-00123 / Draft"
              maxLength={128}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>

          {/* 7. Bank UTR Number */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Bank UTR Number
            </label>
            <input
              type="text"
              placeholder="e.g. UTR-982341209"
              maxLength={128}
              value={utrNumber}
              onChange={(e) => setUtrNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>

          {/* 8. External Transaction ID */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              External Gateway / Trans ID
            </label>
            <input
              type="text"
              placeholder="e.g. TXN-10934812"
              maxLength={128}
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 9. Status */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Status <span className="text-rose-500">*</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PaymentStatus)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="SUCCESS">Success (Immediate Credit & Ledger Posting)</option>
              <option value="PENDING">Pending (Awaiting Bank Clearance)</option>
            </select>
          </div>

          {/* 10. Protection Notice */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>Duplicate Payment Protection Active</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              Client idempotency protects against rapid double-clicks. Unique sequences generate <code className="text-[#0F766E] font-bold">PAY-YYYY-XXXXXX</code> automatically.
            </p>
          </div>
        </div>

        {/* 8. Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Internal Notes & Remarks
          </label>
          <textarea
            rows={3}
            placeholder="Optional context, bank details, or authorization remarks..."
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
          />
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href={orderId ? `/orders/${orderId}` : "/payments"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Cancel</span>
        </Link>

        <button
          type="submit"
          disabled={isPending || isOverpaying || !customerId || enteredAmount <= 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0D655E] disabled:opacity-50 transition"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying & Recording...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Payment</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
