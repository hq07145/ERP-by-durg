import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ConfirmSubmit from "@/components/confirm-submit";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { setCustomerStatusAction } from "@/lib/customers/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Customer, CustomerAddress } from "@/types/customer";
import { getCustomerSummary, getCustomerLedger, getCustomerPayments, getCustomerAdvanceTransactions } from "@/lib/payments/actions";
import { CustomerLedger } from "@/components/payments/customer-ledger";
import { format } from "date-fns";
import {
  getOrderPaymentStatus,
  ORDER_PAYMENT_STATUS_COLORS,
  ORDER_PAYMENT_STATUS_LABELS,
} from "@/types/order";
import {
  Users,
  ChevronRight,
  Edit,
  Building2,
  Phone,
  Mail,
  Receipt,
  CreditCard,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Wallet,
  ShoppingBag,
  ArrowLeft,
  Clock,
  Plus,
} from "lucide-react";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  customer_created: "Customer account created successfully.",
  customer_updated: "Customer details updated successfully.",
  customer_deactivated: "Customer deactivated. Existing references remain intact.",
  customer_activated: "Customer activated successfully.",
  payment_recorded: "Payment transaction recorded and ledger updated successfully.",
};

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "customers.view")) redirect("/");
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <p className="text-sm text-rose-600">Database client unavailable.</p>;

  const canViewPayments = hasPermission({ permissions: context.permissions }, "payments.view");

  const [
    { data: customerData, error: customerError },
    { data: addressData, error: addressError },
    { data: customerOrdersData },
    summary,
    ledgerEntries,
    payments,
    advanceTransactions,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .eq("business_id", context.user.business_id)
      .maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", id)
      .order("created_at"),
    supabase
      .from("orders")
      .select("id, order_number, order_date, priority, status, total_amount, paid_amount, due_amount, created_at")
      .eq("business_id", context.user.business_id)
      .eq("customer_id", id)
      .order("order_date", { ascending: false }),
    canViewPayments ? getCustomerSummary(id) : Promise.resolve(null),
    canViewPayments ? getCustomerLedger(id, 20, 0) : Promise.resolve([]),
    canViewPayments ? getCustomerPayments(id, 10, 0) : Promise.resolve([]),
    canViewPayments ? getCustomerAdvanceTransactions(id) : Promise.resolve([]),
  ]);

  if (customerError || !customerData) notFound();
  if (addressError) return <p className="text-sm text-rose-600">Customer addresses could not be loaded.</p>;

  const customer = customerData as Customer;
  const addresses = (addressData ?? []) as CustomerAddress[];
  const customerOrders = customerOrdersData ?? [];

  const canEdit = hasPermission({ permissions: context.permissions }, "customers.edit");
  const canDeactivate = hasPermission({ permissions: context.permissions }, "customers.delete");
  const canAddPayment = hasPermission({ permissions: context.permissions }, "payments.add");

  const paramsValue = await searchParams;
  const notice = paramsValue.notice ? notices[paramsValue.notice] : null;

  const initials = (customer.name || "C")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. BREADCRUMBS & TOP HEADER                                    */}
      {/* ============================================================== */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <nav className="flex items-center gap-1.5 text-xs text-[#64748B] mb-2" aria-label="Breadcrumb">
          <Link href="/customers" className="hover:text-[#0F766E] transition-colors flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>Customers</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900 truncate max-w-[200px]">
            {customer.name}
          </span>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-1">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-bold text-sm text-[#142B3B] border border-slate-200 shadow-2xs">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">{customer.name}</h1>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    customer.status === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      customer.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  <span>{customer.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>{customer.company_name || "Individual Customer Account"}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/customers"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </Link>

            {canAddPayment && (
              <Link
                href={`/payments/new?customerId=${customer.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#0D655E] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </Link>
            )}

            {canEdit && (
              <Link
                href={`/customers/${customer.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </Link>
            )}

            {customer.status === "ACTIVE" && canDeactivate && (
              <ConfirmSubmit
                action={setCustomerStatusAction}
                fieldName="customer_id"
                fieldValue={customer.id}
                hiddenFields={{ status: "INACTIVE" }}
                label="Deactivate Account"
                confirmation={`Deactivate ${customer.name}? All historical orders and ledgers will be preserved.`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50/50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
              />
            )}

            {customer.status === "INACTIVE" && canEdit && (
              <ConfirmSubmit
                action={setCustomerStatusAction}
                fieldName="customer_id"
                fieldValue={customer.id}
                hiddenFields={{ status: "ACTIVE" }}
                label="Reactivate Account"
                confirmation={`Reactivate ${customer.name}?`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              />
            )}
          </div>
        </div>
      </div>

      {/* Notice Message */}
      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800" role="status">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-[#0F766E]" />
          <p className="font-medium">{notice}</p>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. EXECUTIVE FINANCIAL SUMMARY CARDS                           */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Invoiced (Purchases) */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Purchases / Invoiced
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[#142B3B]">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-[#0F172A]">
            ₹{Number(summary?.total_purchases ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">Lifetime gross purchases</p>
        </div>

        {/* Payments Received */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Payments Received
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-emerald-700">
            ₹{Number(summary?.total_paid ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">Cleared receipts to date</p>
        </div>

        {/* Outstanding Due (Never Negative) */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Outstanding Due
            </span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              Number(summary?.total_due ?? 0) > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
            }`}>
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className={`mt-2 text-xl font-bold tracking-tight ${
            Number(summary?.total_due ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"
          }`}>
            ₹{Math.max(0, Number(summary?.total_due ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            {Number(summary?.total_due ?? 0) > 0 ? "Unpaid invoice receivables" : "All orders settled in full"}
          </p>
        </div>

        {/* Available Customer Advance */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Available Advance
            </span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              Number(summary?.available_advance ?? 0) > 0 ? "bg-teal-50 text-[#0F766E]" : "bg-slate-100 text-slate-500"
            }`}>
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className={`mt-2 text-xl font-bold tracking-tight ${
            Number(summary?.available_advance ?? 0) > 0 ? "text-[#0F766E]" : "text-[#0F172A]"
          }`}>
            ₹{Math.max(0, Number(summary?.available_advance ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1">
            {Number(summary?.available_advance ?? 0) > 0
              ? "Unallocated credit balance"
              : "No unallocated advance"}
          </p>
        </div>
      </div>

      {/* Reconciliation Warning Notice */}
      {summary?.reconciliation_warning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-950">Financial Reconciliation Warning</p>
            <p className="text-xs text-amber-800 mt-0.5">{summary.reconciliation_warning}</p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. PROFILE DETAILS & ADDRESSES (2 Columns)                     */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Account Details (2 Cols) */}
        <div className="lg:col-span-2 rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-3 mb-4">
            Account Specifications
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">Account Name</dt>
              <dd className="mt-1 font-semibold text-[#0F172A]">{customer.name}</dd>
            </div>
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">Company Entity</dt>
              <dd className="mt-1 font-semibold text-[#0F172A]">{customer.company_name || "-"}</dd>
            </div>
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">Telephone</dt>
              <dd className="mt-1 font-semibold text-[#0F172A] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>{customer.phone || "-"}</span>
              </dd>
            </div>
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">Email Address</dt>
              <dd className="mt-1 font-semibold text-[#0F172A] break-all flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>{customer.email || "-"}</span>
              </dd>
            </div>
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">GSTIN Registration</dt>
              <dd className="mt-1 font-mono font-semibold text-[#0F172A]">{customer.gst_number || "-"}</dd>
            </div>
            <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <dt className="text-xs font-medium text-[#64748B]">Payment Terms</dt>
              <dd className="mt-1 font-semibold text-[#0F172A]">{customer.payment_terms || "None"}</dd>
            </div>
          </dl>
        </div>

        {/* Addresses Column (1 Col) */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs flex flex-col">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] pb-3 mb-4 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#0F766E]" />
            <span>Shipping / Billing Address</span>
          </h2>
          {addresses.length > 0 ? (
            <div className="space-y-3 flex-1">
              {addresses.map((address) => (
                <div key={address.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-[#0F172A] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200">
                      {address.address_type}
                    </span>
                  </div>
                  {address.address && <p className="font-medium pt-1 text-slate-700">{address.address}</p>}
                  <p className="text-slate-500 font-medium">
                    {[address.city, address.district, address.state, address.postal_code].filter(Boolean).join(", ") || "No city/state details"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs flex-1 flex flex-col items-center justify-center">
              <MapPin className="w-8 h-8 text-slate-300 mb-2" />
              <p>No address recorded for this client.</p>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. CUSTOMER ORDER HISTORY (Requirement 8)                      */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#0F766E]" />
              <span>Customer Order History ({customerOrders.length})</span>
            </h2>
            <p className="text-xs text-[#64748B]">Complete record of orders, fulfillment, and payment statuses</p>
          </div>
          {canAddPayment && customerOrders.some((o) => Number(o.due_amount) > 0) && (
            <Link
              href={`/payments/new?customerId=${customer.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D655E] transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Pay Outstanding Due</span>
            </Link>
          )}
        </div>

        {customerOrders.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-left text-sm" role="table">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                <tr>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Order Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-4 py-3">Order Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {customerOrders.map((ord) => {
                  const payStatus = getOrderPaymentStatus(ord.total_amount, ord.paid_amount, ord.due_amount);
                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${ord.id}`}
                          className="font-mono font-bold text-[#0F766E] hover:underline"
                        >
                          {ord.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#64748B]">
                        {format(new Date(ord.order_date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        ₹{Number(ord.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700">
                        ₹{Number(ord.paid_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                        ₹{Number(ord.due_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            ORDER_PAYMENT_STATUS_COLORS[payStatus]
                          }`}
                        >
                          {ORDER_PAYMENT_STATUS_LABELS[payStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            ord.status === "CONFIRMED"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : ord.status === "DRAFT"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/orders/${ord.id}`}
                            className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            View
                          </Link>
                          {Number(ord.due_amount) > 0 && ord.status !== "CANCELLED" && canAddPayment && (
                            <Link
                              href={`/payments/new?orderId=${ord.id}&customerId=${customer.id}`}
                              className="px-2 py-1 rounded bg-[#0F766E] text-white text-[11px] font-semibold hover:bg-[#0D655E] transition"
                            >
                              Pay
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#64748B] italic py-2">No customer orders recorded yet.</p>
        )}
      </div>

      {/* ============================================================== */}
      {/* 5. CUSTOMER ADVANCE HISTORY (Requirement 3)                    */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#E2E8F0] pb-3 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-base font-semibold text-[#0F172A]">
                Customer Advance Transaction History ({advanceTransactions.length})
              </h2>
            </div>
            <p className="text-xs text-[#64748B]">
              Chronological log of advance receipts, order allocations, and running available advance balance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B]">Available Advance Balance:</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-[#0F766E] border border-teal-200">
              ₹{Math.max(0, Number(summary?.available_advance ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {advanceTransactions.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-left text-sm" role="table">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Transaction Type</th>
                  <th className="px-4 py-3">Receipt / Ref #</th>
                  <th className="px-4 py-3">Order Allocated</th>
                  <th className="px-4 py-3 text-right">Received (+)</th>
                  <th className="px-4 py-3 text-right">Allocated (-)</th>
                  <th className="px-4 py-3 text-right">Running Advance</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {advanceTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-[#64748B]">
                      {format(new Date(tx.date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          tx.type === "RECEIPT"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : tx.type === "ALLOCATION"
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {tx.type === "RECEIPT" ? "Advance Received" : tx.type === "ALLOCATION" ? "Order Allocation" : tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.receipt_number ? (
                        <span className="font-mono font-bold text-slate-800">{tx.receipt_number}</span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">
                          {tx.reference || "Advance Adjustment"}
                        </span>
                      )}
                      {tx.notes && <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">{tx.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {tx.order_id ? (
                        <Link
                          href={`/orders/${tx.order_id}`}
                          className="font-mono font-bold text-[#0F766E] hover:underline"
                        >
                          {tx.order_number || "View Order"}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      {tx.amount_received > 0
                        ? `+₹${tx.amount_received.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sky-800">
                      {tx.amount_allocated > 0
                        ? `-₹${tx.amount_allocated.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      ₹{tx.running_advance_balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          tx.status === "SUCCESS" || tx.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#64748B] italic py-2">
            No customer advance transactions or allocations recorded.
          </p>
        )}
      </div>

      {/* ============================================================== */}
      {/* 5. CUSTOMER LEDGER SECTION                                     */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#0F766E]" />
              <span>Account Ledger & Financial Audit Trail</span>
            </h2>
            <p className="text-xs text-[#64748B]">Double-entry chronological record of invoices, credits, and receipts</p>
          </div>
        </div>
        <CustomerLedger
          customer={
            summary ?? {
              customer_id: id,
              customer_name: customer.name,
              customer_company: customer.company_name,
              total_purchases: 0,
              total_paid: 0,
              total_due: 0,
              last_payment_date: null,
              last_payment_amount: null,
            }
          }
          ledgerEntries={ledgerEntries}
          canView={true}
        />
      </div>

      {/* ============================================================== */}
      {/* 6. RECENT PAYMENTS LOG                                         */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#0F766E]" />
              <span>Payment Receipts History ({payments.length})</span>
            </h2>
            <p className="text-xs text-[#64748B]">Historical record of recorded payment transactions and reversals</p>
          </div>
          {canAddPayment && (
            <Link
              href={`/payments/new?customerId=${customer.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Receipt</span>
            </Link>
          )}
        </div>

        {payments.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-left text-sm" role="table">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/payments/${p.id}`} className="font-mono text-xs font-bold text-[#0F766E] hover:underline">
                        {p.payment_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {format(new Date(p.payment_date), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      ₹{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{p.payment_method}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          p.status === "SUCCESS"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : p.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/payments/${p.id}`}
                        className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#64748B] italic py-2">No cleared payment receipts on record.</p>
        )}
      </div>
    </div>
  );
}