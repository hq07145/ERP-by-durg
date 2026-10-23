"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrderListItem, OrderPriority, OrderStatus, DeliveryStatus } from "@/types/order";
import {
  getOrderPaymentStatus,
  ORDER_PAYMENT_STATUS_COLORS,
  ORDER_PAYMENT_STATUS_LABELS,
} from "@/types/order";
import { CancelOrderModal } from "@/components/orders/cancel-order-modal";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { DeleteOrderModal } from "@/components/orders/delete-order-modal";
import { confirmOrderAction } from "@/lib/orders/actions";
import {
  Search,
  Filter,
  RotateCcw,
  Plus,
  Eye,
  Edit,
  Check,
  XCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  DollarSign,
  ArrowUpDown,
  Loader2,
  Trash2,
} from "lucide-react";

interface OrdersListProps {
  orders: OrderListItem[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  filters: {
    q: string;
    status: string;
    priority: string;
    payment: string;
    startDate: string;
    endDate: string;
    sort: string;
  };
  counts: {
    total: number;
    confirmed: number;
    draft: number;
  };
  permissions: {
    canCreate: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canCancel: boolean;
    canViewPayments?: boolean;
  };
  queryError?: string | null;
  notice?: string;
  orderFormData?: {
    customers: { id: string; name: string; company_name: string | null; gst_number?: string | null; state?: string | null; district?: string | null }[];
    products: any[];
    workingDays?: Record<string, boolean>;
    calendarOverrides?: Record<string, boolean>;
    businessDetails?: any;
  };
  isNewModalRequested?: boolean;
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OrdersList({
  orders,
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  filters,
  counts,
  permissions,
  queryError,
  notice,
  orderFormData,
  isNewModalRequested = false,
}: OrdersListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(Boolean(isNewModalRequested));

  useEffect(() => {
    if (isNewModalRequested) {
      setIsCreateModalOpen(true);
    }
  }, [isNewModalRequested]);

  // Persist current orders list URL (including search query, filters, sorting, and pagination)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const current = window.location.pathname + window.location.search;
      sessionStorage.setItem("last_orders_list_url", current);
      sessionStorage.setItem("current_route", current);
    }
  }, [filters, currentPage]);

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    if (typeof window !== "undefined") {
      const currentParams = new URLSearchParams(window.location.search);
      if (currentParams.has("new")) {
        currentParams.delete("new");
        const query = currentParams.toString();
        const newPath = query ? `${window.location.pathname}?${query}` : window.location.pathname;
        window.history.replaceState(null, "", newPath);
      }
    }
  };

  const [searchInput, setSearchInput] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<OrderListItem | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<OrderListItem | null>(null);
  const [confirmingOrderIds, setConfirmingOrderIds] = useState<Record<string, boolean>>({});
  const confirmingRefs = useRef<Set<string>>(new Set());
  const [displayOrders, setDisplayOrders] = useState(orders);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDisplayOrders(orders);
  }, [orders]);

  // Helper to build URL preserving all search and filter params
  const updateFilters = (newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v === null || v === "" || v === "all") {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });

    // Reset to page 1 unless page itself is being set
    if (!newParams.page) {
      params.delete("page");
    }

    startTransition(() => {
      router.push(`/orders?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput.trim() });
  };

  const resetAllFilters = () => {
    setSearchInput("");
    startTransition(() => {
      router.push("/orders");
    });
  };

  const createPageUrl = (pageNumber: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (pageNumber <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(pageNumber));
    }
    return `/orders?${params.toString()}`;
  };

  const handleConfirmOrder = async (orderId: string) => {
    if (confirmingRefs.current.has(orderId)) return;
    confirmingRefs.current.add(orderId);
    setConfirmingOrderIds((prev) => ({ ...prev, [orderId]: true }));
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await confirmOrderAction(orderId);
      if (!res.success) {
        setActionError(res.message || res.error || "Failed to confirm order.");
      } else {
        setActionSuccess(res.message || "Order confirmed successfully and production scheduled.");
        setDisplayOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "CONFIRMED" as const } : o))
        );
        router.refresh();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error confirming order.");
    } finally {
      confirmingRefs.current.delete(orderId);
      setConfirmingOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "CONFIRMED":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "CANCELLED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "LOW":
        return "bg-slate-100 text-slate-600 border-slate-200";
      case "NORMAL":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "HIGH":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "URGENT":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const hasActiveFilters =
    Boolean(filters.q) ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.payment !== "all" ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  return (
    <div className="space-y-6">
      {/* Notice & Error Banners */}
      {notice === "order_created" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">Order created successfully.</span>
        </div>
      )}
      {notice === "order_cancelled" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">Order cancelled successfully and schedules updated.</span>
        </div>
      )}
      {notice === "order_deleted" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">Draft order permanently deleted.</span>
        </div>
      )}
      {notice === "order_status_updated" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">Order Status updated successfully.</span>
        </div>
      )}
      {notice === "priority_changed" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center gap-3 shadow-sm" role="status">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">Order priority changed and manufacturing queue recalculated.</span>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 flex items-center justify-between shadow-sm animate-in fade-in" role="status">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium">{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {(queryError || actionError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-center justify-between shadow-sm" role="alert">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-sm font-medium">{actionError || queryError}</span>
          </div>
          {actionError && (
            <button
              onClick={() => setActionError(null)}
              className="text-xs text-rose-700 hover:text-rose-900 font-semibold underline"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Header and CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-[#0F766E] border border-teal-200 uppercase tracking-wider">
              Commercial Operations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#142B3B] tracking-tight mt-1">Orders</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage customer manufacturing sales orders, status workflows, and deliveries.
          </p>
        </div>

        {permissions.canCreate && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2 transition min-h-10 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Total Orders</span>
          <p className="text-2xl font-bold text-[#142B3B] mt-1">{counts.total.toLocaleString()}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Lifetime customer bookings</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Confirmed Orders</span>
          <p className="text-2xl font-bold text-sky-700 mt-1">{counts.confirmed.toLocaleString()}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Ready for production & dispatch</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Draft Orders</span>
          <p className="text-2xl font-bold text-slate-700 mt-1">{counts.draft.toLocaleString()}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Awaiting customer approval</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <input
              type="text"
              placeholder="Search by order number or customer name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-10 transition"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </form>

          {/* Quick Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-10"
            >
              <option value="all">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => updateFilters({ priority: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-10"
            >
              <option value="all">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>

            <select
              value={filters.sort}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-10"
            >
              <option value="date_desc">Newest Date</option>
              <option value="date_asc">Oldest Date</option>
              <option value="amount_desc">Highest Total</option>
              <option value="amount_asc">Lowest Total</option>
              <option value="number_asc">Order Number (A-Z)</option>
            </select>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold min-h-10 transition ${
                showFilters || hasActiveFilters
                  ? "border-[#0F766E] bg-teal-50 text-[#0F766E]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>More Filters</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition min-h-10"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Extended Filters (Payment & Date Range) */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {permissions.canViewPayments && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Payment Status</label>
                <select
                  value={filters.payment}
                  onChange={(e) => updateFilters({ payment: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-9"
                >
                  <option value="all">All Payment Statuses</option>
                  <option value="UNPAID">Unpaid (Zero Paid)</option>
                  <option value="PARTIAL">Partially Paid</option>
                  <option value="PAID">Fully Paid (Zero Due)</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">From Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilters({ startDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-9"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">To Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilters({ endDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-9"
              />
            </div>
          </div>
        )}
      </div>

      {/* Orders Table (Desktop / Tablet) */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left" role="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Order #</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Items</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Total</th>
                {permissions.canViewPayments && (
                  <>
                    <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Paid</th>
                    <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Due</th>
                  </>
                )}
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">Delivery Target</th>
                <th className="px-4 py-3.5 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm">
              {displayOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                    <Link href={`/orders/${o.id}`} className="hover:text-[#0F766E] transition">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{o.customer_name || "Unknown"}</p>
                    {o.company_name && <p className="text-xs text-slate-500">{o.company_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {formatDate(o.order_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">
                    {o.item_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                    {formatCurrency(o.total_amount)}
                  </td>
                  {permissions.canViewPayments && (
                    <>
                      <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                        {formatCurrency(o.paid_amount)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold whitespace-nowrap ${Number(o.due_amount) > 0 ? "text-rose-600" : "text-slate-700"}`}>
                        <div>{formatCurrency(o.due_amount)}</div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border mt-0.5 ${ORDER_PAYMENT_STATUS_COLORS[getOrderPaymentStatus(o.total_amount, o.paid_amount, o.due_amount)]}`}>
                          {ORDER_PAYMENT_STATUS_LABELS[getOrderPaymentStatus(o.total_amount, o.paid_amount, o.due_amount)]}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(o.priority)}`}>
                      {o.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {o.expected_delivery_date ? (
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-800">{formatDate(o.expected_delivery_date)}</div>
                        {o.status === "DRAFT" || o.delivery_status === "PENDING" ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                            Predicted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            Scheduled
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/orders/${o.id}`}
                        className="px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        View
                      </Link>

                      {permissions.canEdit && o.status === "DRAFT" && (
                        <Link
                          href={`/orders/${o.id}/edit`}
                          className="px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Edit
                        </Link>
                      )}

                      {permissions.canApprove && o.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => handleConfirmOrder(o.id)}
                          disabled={Boolean(confirmingOrderIds[o.id])}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0F766E] text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50 transition"
                        >
                          {confirmingOrderIds[o.id] ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Confirming...</span>
                            </>
                          ) : (
                            <span>Confirm</span>
                          )}
                        </button>
                      )}

                      {permissions.canCancel && (o.status === "DRAFT" || o.status === "CONFIRMED") && (
                        <button
                          type="button"
                          onClick={() => setOrderToCancel(o)}
                          className="px-2.5 py-1.5 rounded-md border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition"
                        >
                          Cancel
                        </button>
                      )}

                      {permissions.canEdit && o.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => setOrderToDelete(o)}
                          className="px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition"
                          title="Delete draft order"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Orders Cards View (Mobile < 768px - Prevents horizontal scroll) */}
      <div className="md:hidden space-y-3">
        {displayOrders.map((o) => (
          <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-slate-900">{o.order_number}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getPriorityBadge(o.priority)}`}>
                  {o.priority}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadge(o.status)}`}>
                  {o.status}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ORDER_PAYMENT_STATUS_COLORS[getOrderPaymentStatus(o.total_amount, o.paid_amount, o.due_amount)]}`}>
                  {ORDER_PAYMENT_STATUS_LABELS[getOrderPaymentStatus(o.total_amount, o.paid_amount, o.due_amount)]}
                </span>
              </div>
            </div>

            <div>
              <p className="font-semibold text-slate-900 text-sm">{o.customer_name || "Unknown"}</p>
              {o.company_name && <p className="text-xs text-slate-500">{o.company_name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Order Date</span>
                <span className="text-slate-800 font-medium">{formatDate(o.order_date)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Line Items</span>
                <span className="text-slate-800 font-medium">{o.item_count} items</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Delivery Target</span>
                {o.expected_delivery_date ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-slate-800 font-semibold">{formatDate(o.expected_delivery_date)}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold border ${
                      o.status === "DRAFT" || o.delivery_status === "PENDING"
                        ? "bg-teal-50 text-teal-700 border-teal-200"
                        : "bg-sky-50 text-sky-700 border-sky-200"
                    }`}>
                      {o.status === "DRAFT" || o.delivery_status === "PENDING" ? "Predicted" : "Scheduled"}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400 font-medium">—</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Total</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(o.total_amount)}</span>
              </div>
              {permissions.canViewPayments && (
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Balance Due</span>
                  <span className={`font-mono font-bold ${Number(o.due_amount) > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {formatCurrency(o.due_amount)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Link
                href={`/orders/${o.id}`}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View
              </Link>

              {permissions.canEdit && o.status === "DRAFT" && (
                <Link
                  href={`/orders/${o.id}/edit`}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </Link>
              )}

              {permissions.canApprove && o.status === "DRAFT" && (
                <button
                  type="button"
                  onClick={() => handleConfirmOrder(o.id)}
                  disabled={Boolean(confirmingOrderIds[o.id])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F766E] text-xs font-semibold text-white hover:bg-[#0D655E] disabled:opacity-50 transition"
                >
                  {confirmingOrderIds[o.id] ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <span>Confirm</span>
                  )}
                </button>
              )}

              {permissions.canCancel && (o.status === "DRAFT" || o.status === "CONFIRMED") && (
                <button
                  type="button"
                  onClick={() => setOrderToCancel(o)}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition"
                >
                  Cancel
                </button>
              )}

              {permissions.canEdit && o.status === "DRAFT" && (
                <button
                  type="button"
                  onClick={() => setOrderToDelete(o)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Layers className="w-6 h-6" />
          </div>
          {hasActiveFilters ? (
            <>
              <h3 className="text-sm font-semibold text-slate-900">No orders match your filter criteria</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Try adjusting your search terms, status, priority, or date ranges.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-slate-900">No orders registered yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Get started by creating your first sales order for a customer.
              </p>
              {permissions.canCreate && (
                <Link
                  href="/orders/new"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Order</span>
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Showing <strong className="text-slate-800">{(currentPage - 1) * pageSize + 1}</strong> to{" "}
            <strong className="text-slate-800">{Math.min(currentPage * pageSize, totalCount)}</strong> of{" "}
            <strong className="text-slate-800">{totalCount}</strong> orders
          </p>

          <div className="flex items-center gap-1.5">
            <Link
              href={createPageUrl(currentPage - 1)}
              aria-disabled={currentPage <= 1}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                currentPage <= 1
                  ? "pointer-events-none opacity-40 border-slate-200 text-slate-400"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </Link>

            <span className="text-xs font-medium text-slate-600 px-2">
              Page {currentPage} of {totalPages}
            </span>

            <Link
              href={createPageUrl(currentPage + 1)}
              aria-disabled={currentPage >= totalPages}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                currentPage >= totalPages
                  ? "pointer-events-none opacity-40 border-slate-200 text-slate-400"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {orderToCancel && (
        <CancelOrderModal
          isOpen={!!orderToCancel}
          onClose={() => setOrderToCancel(null)}
          order={{
            id: orderToCancel.id,
            order_number: orderToCancel.order_number,
            customer_name: orderToCancel.customer_name,
            total_amount: orderToCancel.total_amount,
            status: orderToCancel.status,
          }}
          onSuccess={() => {
            const num = orderToCancel.order_number;
            setOrderToCancel(null);
            setActionSuccess(`Order #${num} has been cancelled successfully.`);
            router.refresh();
          }}
        />
      )}

      {/* Delete Draft Order Modal */}
      {orderToDelete && (
        <DeleteOrderModal
          isOpen={!!orderToDelete}
          onClose={() => setOrderToDelete(null)}
          order={{
            id: orderToDelete.id,
            order_number: orderToDelete.order_number,
            customer_name: orderToDelete.customer_name,
          }}
          onSuccess={() => {
            const num = orderToDelete.order_number;
            setOrderToDelete(null);
            setActionSuccess(`Order #${num} has been deleted successfully.`);
            router.refresh();
          }}
        />
      )}

      {/* Create Order Modal */}
      {permissions.canCreate && orderFormData && (
        <CreateOrderModal
          isOpen={isCreateModalOpen}
          onClose={handleCloseCreateModal}
          customers={orderFormData.customers}
          products={orderFormData.products}
          workingDays={orderFormData.workingDays}
          calendarOverrides={orderFormData.calendarOverrides}
          businessDetails={orderFormData.businessDetails}
        />
      )}
    </div>
  );
}