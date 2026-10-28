import Link from "next/link";
import ConfirmSubmit from "@/components/confirm-submit";
import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { setCustomerStatusAction } from "@/lib/customers/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/customer";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Receipt,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Power,
  RefreshCw,
  Wallet,
} from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

const messages: Record<string, { text: string; type: "success" | "error" }> = {
  customer_created: { text: "Customer account created successfully.", type: "success" },
  customer_updated: { text: "Customer details updated successfully.", type: "success" },
  customer_deactivated: {
    text: "Customer account deactivated. Existing orders and ledger history remain intact.",
    type: "success",
  },
  customer_activated: { text: "Customer account reactivated successfully.", type: "success" },
  customer_status_failed: { text: "Unable to change customer status. Please try again.", type: "error" },
  customer_not_found: { text: "Customer not found in this business workspace.", type: "error" },
  forbidden: { text: "You do not have permission to perform this action.", type: "error" },
  auth_unconfigured: { text: "Database service is unconfigured for this workspace.", type: "error" },
};

function safeSearch(value: string | undefined): string {
  return (value ?? "")
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return "₹0.00";
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num);
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const context = await requireAuthContext();
  await requirePermission(context, "customers.view");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold text-sm">Database connection not available.</p>
        <p className="text-xs mt-1 text-rose-600">Please verify your workspace environment configuration.</p>
      </div>
    );
  }

  const search = safeSearch(params.q);
  const pageNumber = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const status =
    params.status === "ACTIVE" || params.status === "INACTIVE"
      ? params.status
      : "ALL";

  const canCreate = hasPermission({ permissions: context.permissions }, "customers.create");
  const canEdit = hasPermission({ permissions: context.permissions }, "customers.edit");
  const canDeactivate = hasPermission({ permissions: context.permissions }, "customers.delete");

  // Build Filtered Paginated Query
  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .eq("business_id", context.user.business_id)
    .order("name", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,gst_number.ilike.%${search}%`,
    );
  }
  if (status !== "ALL") {
    query = query.eq("status", status);
  }

  // Fetch KPI status summary and paginated data in parallel (1 roundtrip instead of 4)
  const [statusRes, dataRes] = await Promise.all([
    supabase
      .from("customers")
      .select("status")
      .eq("business_id", context.user.business_id),
    query,
  ]);

  const statusRows = (statusRes.data ?? []) as { status: string }[];
  const totalCustomers = statusRows.length;
  const activeCustomers = statusRows.filter((r) => r.status === "ACTIVE").length;
  const inactiveCustomers = totalCustomers - activeCustomers;

  const { data, error, count } = dataRes;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold text-sm">Failed to load customers.</p>
        <p className="text-xs mt-1 text-rose-600">{error.message}</p>
      </div>
    );
  }

  const customers = (data ?? []) as Customer[];
  const totalFiltered = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));

  const noticeKey = params.notice ?? params.error;
  const alertInfo = noticeKey ? messages[noticeKey] : null;

  const pageHref = (targetPage: number) => {
    const qp = new URLSearchParams();
    if (search) qp.set("q", search);
    if (status !== "ALL") qp.set("status", status);
    qp.set("page", String(targetPage));
    return `/customers?${qp.toString()}`;
  };

  const hasActiveFilters = Boolean(search || status !== "ALL");

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. PAGE HEADER                                                */}
      {/* ============================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-[#0F766E] border border-teal-200 mb-2">
            <Users className="w-3 h-3" />
            <span>Commercial Accounts</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F172A]">
            Customers
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Manage client profiles, credit allowances, tax registration and customer ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {canEdit && (
            <Link
              href="/customer-opening-balances"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              <Wallet className="w-4 h-4 text-teal-700" />
              <span>Opening Balances</span>
            </Link>
          )}
          {canCreate && (
            <Link
              href="/customers/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#0D655E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Customer</span>
            </Link>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. FEEDBACK BANNER (Notice / Error)                            */}
      {/* ============================================================== */}
      {alertInfo && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            alertInfo.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-teal-200 bg-teal-50 text-teal-800"
          }`}
        >
          {alertInfo.type === "error" ? (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#0F766E] mt-0.5" />
          )}
          <p className="font-medium">{alertInfo.text}</p>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. METRIC SUMMARY CARDS                                        */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Customers */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Customers
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[#142B3B]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#0F172A]">
              {totalCustomers}
            </span>
            <span className="text-xs text-[#64748B]">registered accounts</span>
          </div>
        </div>

        {/* Active Customers */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Active Accounts
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-[#059669]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#059669]">
              {activeCustomers}
            </span>
            <span className="text-xs text-[#64748B]">
              {totalCustomers > 0
                ? `${Math.round((activeCustomers / totalCustomers) * 100)}% of total`
                : "0%"}
            </span>
          </div>
        </div>

        {/* Inactive Customers */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs transition-shadow hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Inactive / Archived
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#64748B]">
              {inactiveCustomers}
            </span>
            <span className="text-xs text-[#64748B]">deactivated</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. FILTER PANEL                                               */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-2xs">
        <form
          action="/customers"
          method="GET"
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_auto] items-end"
        >
          {/* Search Box */}
          <div className="space-y-1.5">
            <label
              htmlFor="customer-search-input"
              className="text-xs font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>Search Customers</span>
            </label>
            <div className="relative">
              <input
                id="customer-search-input"
                name="q"
                type="text"
                defaultValue={search}
                maxLength={80}
                placeholder="Search by customer name, company, phone, email, or GSTIN..."
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label
              htmlFor="customer-status-filter"
              className="text-xs font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>Account Status</span>
            </label>
            <select
              id="customer-status-filter"
              name="status"
              defaultValue={status}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            >
              <option value="ALL">All Statuses ({totalCustomers})</option>
              <option value="ACTIVE">Active Only ({activeCustomers})</option>
              <option value="INACTIVE">Inactive Only ({inactiveCustomers})</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#142B3B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E1F2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#142B3B]"
            >
              <span>Apply</span>
            </button>
            {hasActiveFilters && (
              <Link
                href="/customers"
                className="inline-flex items-center justify-center p-2.5 rounded-lg border border-[#E2E8F0] text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                title="Reset filters"
                aria-label="Reset filters"
              >
                <RotateCcw className="w-4 h-4" />
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* 5. CUSTOMER TABLE & EMPTY STATES                               */}
      {/* ============================================================== */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-2xs overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-slate-50/70 px-5 py-3">
          <p className="text-xs font-semibold text-[#64748B]">
            Showing {totalFiltered > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(page * PAGE_SIZE, totalFiltered)} of {totalFiltered} customer
            {totalFiltered === 1 ? "" : "s"}
          </p>
          {hasActiveFilters && (
            <span className="text-xs text-[#0F766E] font-medium bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
              Filtered View
            </span>
          )}
        </div>

        {/* Desktop View Table (hidden on mobile, visible on sm and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th scope="col" className="px-5 py-3.5">Customer / Company</th>
                <th scope="col" className="px-5 py-3.5">Contact Details</th>
                <th scope="col" className="px-5 py-3.5">GSTIN</th>
                <th scope="col" className="px-5 py-3.5">Credit Limit</th>
                <th scope="col" className="px-5 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5">Created</th>
                <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {customers.map((c) => {
                const initials = (c.name || "C")
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-slate-50/70 group"
                  >
                    {/* Name & Company */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-xs text-[#142B3B] border border-slate-200">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/customers/${c.id}`}
                            className="font-semibold text-[#0F172A] hover:text-[#0F766E] transition-colors truncate block"
                          >
                            {c.name}
                          </Link>
                          {c.company_name ? (
                            <p className="text-xs text-[#64748B] truncate flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span>{c.company_name}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-[#94A3B8] italic mt-0.5">
                              Individual account
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact Details */}
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5 text-xs">
                        {c.phone ? (
                          <p className="flex items-center gap-1.5 text-[#0F172A]">
                            <Phone className="w-3 h-3 text-[#64748B] shrink-0" />
                            <span>{c.phone}</span>
                          </p>
                        ) : null}
                        {c.email ? (
                          <p className="flex items-center gap-1.5 text-[#64748B]">
                            <Mail className="w-3 h-3 text-[#94A3B8] shrink-0" />
                            <span className="truncate max-w-[180px]">{c.email}</span>
                          </p>
                        ) : null}
                        {!c.phone && !c.email && (
                          <span className="text-[#94A3B8] italic">-</span>
                        )}
                      </div>
                    </td>

                    {/* GSTIN */}
                    <td className="px-5 py-3.5">
                      {c.gst_number ? (
                        <span className="font-mono text-xs text-[#0F172A] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {c.gst_number}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] text-xs">-</span>
                      )}
                    </td>

                    {/* Credit Limit */}
                    <td className="px-5 py-3.5 font-medium text-slate-800 text-xs sm:text-sm">
                      {formatCurrency(c.credit_limit)}
                    </td>

                    {/* Status Badge */}
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        <span>{c.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="px-5 py-3.5 text-xs text-[#64748B] whitespace-nowrap">
                      {formatDate(c.created_at)}
                    </td>

                    {/* Actions Menu */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/customers/${c.id}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-[#0F766E] hover:bg-teal-50 transition-colors"
                          title="View Customer Profile"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        {canEdit && (
                          <Link
                            href={`/customers/${c.id}/edit`}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Customer"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                        )}

                        {c.status === "ACTIVE" && canDeactivate && (
                          <ConfirmSubmit
                            action={setCustomerStatusAction}
                            fieldName="customer_id"
                            fieldValue={c.id}
                            hiddenFields={{ status: "INACTIVE" }}
                            label="Deactivate"
                            confirmation={`Deactivate ${c.name}? Existing orders and ledger history will be retained.`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors text-xs font-medium"
                          />
                        )}

                        {c.status === "INACTIVE" && canEdit && (
                          <ConfirmSubmit
                            action={setCustomerStatusAction}
                            fieldName="customer_id"
                            fieldValue={c.id}
                            hiddenFields={{ status: "ACTIVE" }}
                            label="Reactivate"
                            confirmation={`Reactivate ${c.name}?`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors text-xs font-medium"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View Customer Cards (md:hidden) */}
        <div className="md:hidden divide-y divide-[#E2E8F0]">
          {customers.map((c) => (
            <div key={c.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-semibold text-base text-[#0F172A] hover:text-[#0F766E] block truncate"
                  >
                    {c.name}
                  </Link>
                  {c.company_name ? (
                    <p className="text-xs text-[#64748B] truncate mt-0.5">
                      {c.company_name}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                    c.status === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      c.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  <span>{c.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-[#64748B] pt-1">
                <div>
                  <span className="text-[#94A3B8] block text-[10px] uppercase font-medium">Contact</span>
                  <span className="text-[#0F172A] font-medium truncate block">
                    {c.phone || c.email || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[#94A3B8] block text-[10px] uppercase font-medium">Credit Limit</span>
                  <span className="text-[#0F172A] font-medium block">
                    {formatCurrency(c.credit_limit)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Link
                  href={`/customers/${c.id}`}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View
                </Link>
                {canEdit && (
                  <Link
                    href={`/customers/${c.id}/edit`}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                )}
                {c.status === "ACTIVE" && canDeactivate && (
                  <ConfirmSubmit
                    action={setCustomerStatusAction}
                    fieldName="customer_id"
                    fieldValue={c.id}
                    hiddenFields={{ status: "INACTIVE" }}
                    label="Deactivate"
                    confirmation={`Deactivate ${c.name}?`}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {customers.length === 0 && (
          <div className="py-14 px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-[#0F766E] border border-slate-200 mb-4">
              <Users className="w-7 h-7 text-[#0F766E]" />
            </div>
            <h3 className="text-base font-semibold text-[#0F172A]">
              {hasActiveFilters ? "No matching customers found" : "No customers registered yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#64748B]">
              {hasActiveFilters
                ? "Try adjusting your search terms or filter criteria to find customer records."
                : "Create your first customer profile to start tracking orders, deliveries, and payment balances."}
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              {hasActiveFilters ? (
                <Link
                  href="/customers"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Clear Filters</span>
                </Link>
              ) : canCreate ? (
                <Link
                  href="/customers/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0D655E]"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add First Customer</span>
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-5 py-4 bg-white">
            <p className="text-xs text-[#64748B]">
              Page <span className="font-semibold text-slate-900">{page}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-xs font-medium text-slate-400 cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </span>
              )}

              {page < totalPages ? (
                <Link
                  href={pageHref(page + 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-xs font-medium text-slate-400 cursor-not-allowed">
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}