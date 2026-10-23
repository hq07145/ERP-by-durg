"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type {
  ProductionQueueItem,
  ProductionOrderStatus,
  QualityCheckStage,
  QualityCheckStatus,
} from "@/types/production";
import {
  startProduction,
  holdProduction,
  resumeProduction,
  recordProductionProgress,
  recordQualityCheck,
  completeProduction,
  runSchedulingEngine,
} from "@/lib/production/actions";
import { CheckCircle2 } from "lucide-react";

interface ProductionQueueProps {
  queue: ProductionQueueItem[];
  canCreate: boolean;
  canSchedule: boolean;
  canEdit?: boolean;
  canStart?: boolean;
  canQualityCheck?: boolean;
  canComplete?: boolean;
}

const PRIORITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  URGENT: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  HIGH: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  NORMAL: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  LOW: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
};

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  SCHEDULED: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  IN_PRODUCTION: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  IN_PROGRESS: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  QUALITY_CHECK: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  ON_HOLD: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  DELAYED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  COMPLETED: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  READY_FOR_DISPATCH: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
};

type ModalType = "start" | "hold" | "resume" | "progress" | "qc" | "complete" | null;

export function ProductionQueue({
  queue,
  canCreate,
  canSchedule,
  canEdit = true,
  canStart = true,
  canQualityCheck = true,
  canComplete = true,
}: ProductionQueueProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<string>("fifo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Scheduling state
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  // Modal Action state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedItem, setSelectedItem] = useState<ProductionQueueItem | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal Form Inputs
  const [notesInput, setNotesInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [quantityCompletedInput, setQuantityCompletedInput] = useState("");
  const [qcStageInput, setQcStageInput] = useState<QualityCheckStage>("IN_PROCESS");
  const [qcStatusInput, setQcStatusInput] = useState<QualityCheckStatus>("PASSED");
  const [quantityProducedInput, setQuantityProducedInput] = useState("");
  const [quantityRejectedInput, setQuantityRejectedInput] = useState("0");
  const [batchNumberInput, setBatchNumberInput] = useState("");

  // Unique products for filter dropdown
  const uniqueProducts = Array.from(
    new Set(queue.map((item) => item.product_name).filter(Boolean)),
  );

  // Filter & Search Logic
  const filteredQueue = queue.filter((item) => {
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchOrder = item.order_number.toLowerCase().includes(q);
      const matchCustomer = (item.customer_name || "").toLowerCase().includes(q);
      const matchProduct = item.product_name.toLowerCase().includes(q);
      const matchSku = (item.product_sku || "").toLowerCase().includes(q);
      if (!matchOrder && !matchCustomer && !matchProduct && !matchSku) return false;
    }

    // Status filter
    if (statusFilter !== "ALL") {
      const itemStatus = item.status || "PENDING";
      if (statusFilter === "DELAYED") {
        if (!item.is_delayed) return false;
      } else if (statusFilter === "CAPACITY_INSUFFICIENT") {
        if (!item.is_capacity_insufficient) return false;
      } else if (itemStatus !== statusFilter) {
        return false;
      }
    }

    // Priority filter
    if (priorityFilter !== "ALL" && item.priority !== priorityFilter) {
      return false;
    }

    // Product filter
    if (productFilter !== "ALL" && item.product_name !== productFilter) {
      return false;
    }

    // Date filters
    const dateToCompare = item.scheduled_start_date || item.order_date;
    if (startDateFilter && dateToCompare < startDateFilter) {
      return false;
    }
    if (endDateFilter && dateToCompare > endDateFilter) {
      return false;
    }

    return true;
  });

  // Sort logic
  const sortedQueue = [...filteredQueue].sort((a, b) => {
    const priorityWeight: Record<string, number> = { URGENT: 1, HIGH: 2, NORMAL: 3, LOW: 4 };

    if (sortKey === "fifo") {
      const posA = a.fifo_position ?? 999;
      const posB = b.fifo_position ?? 999;
      return sortDir === "asc" ? posA - posB : posB - posA;
    }
    if (sortKey === "priority") {
      const pA = priorityWeight[a.priority] ?? 5;
      const pB = priorityWeight[b.priority] ?? 5;
      return sortDir === "asc" ? pA - pB : pB - pA;
    }
    if (sortKey === "quantity") {
      return sortDir === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity;
    }
    if (sortKey === "order_date") {
      return sortDir === "asc"
        ? a.order_date.localeCompare(b.order_date)
        : b.order_date.localeCompare(a.order_date);
    }
    if (sortKey === "scheduled_start") {
      const dateA = a.scheduled_start_date || "9999-99-99";
      const dateB = b.scheduled_start_date || "9999-99-99";
      return sortDir === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    if (sortKey === "expected_delivery") {
      const dateA = a.expected_delivery_date || "9999-99-99";
      const dateB = b.expected_delivery_date || "9999-99-99";
      return sortDir === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }
    return 0;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setProductFilter("ALL");
    setStartDateFilter("");
    setEndDateFilter("");
    setSortKey("fifo");
    setSortDir("asc");
  };

  // Run Scheduling Engine Handler
  const handleRunScheduler = async () => {
    if (isScheduling) return;
    setIsScheduling(true);
    setScheduleNotice(null);
    try {
      const results = await runSchedulingEngine();
      setScheduleNotice(`Scheduling engine completed: ${results.length} order items evaluated.`);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setScheduleNotice(err instanceof Error ? err.message : "Failed to run scheduling engine");
    } finally {
      setIsScheduling(false);
    }
  };

  // Open Action Modal
  const openActionModal = (type: ModalType, item: ProductionQueueItem) => {
    setActiveModal(type);
    setSelectedItem(item);
    setModalError(null);
    setNotesInput("");
    setReasonInput("");
    const remainingQty =
      item.remaining_quantity !== undefined
        ? item.remaining_quantity
        : Math.max(0, Number(item.quantity) - (Number(item.completed_quantity) || 0));
    const defaultQty = remainingQty > 0 ? remainingQty : Number(item.quantity);
    setQuantityCompletedInput(String(defaultQty));
    setQuantityProducedInput(String(defaultQty));
    setQuantityRejectedInput("0");
    setBatchNumberInput("");
    setQcStageInput("IN_PROCESS");
    setQcStatusInput("PASSED");
  };

  const closeActionModal = () => {
    setActiveModal(null);
    setSelectedItem(null);
    setModalError(null);
    setModalSubmitting(false);
  };

  // Submit Modal Action
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || modalSubmitting) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      let result: { success: boolean; message: string | null } = { success: false, message: null };

      if (activeModal === "start") {
        result = await startProduction({
          production_order_id: selectedItem.production_order_id,
          notes: notesInput.trim() || undefined,
        });
      } else if (activeModal === "hold") {
        if (!reasonInput.trim()) {
          setModalError("Please provide a reason for holding production.");
          setModalSubmitting(false);
          return;
        }
        result = await holdProduction({
          production_order_id: selectedItem.production_order_id,
          reason: reasonInput.trim(),
        });
      } else if (activeModal === "resume") {
        result = await resumeProduction(selectedItem.production_order_id, reasonInput.trim() || undefined);
      } else if (activeModal === "progress") {
        if (!quantityCompletedInput || Number(quantityCompletedInput) <= 0) {
          setModalError("Please enter a valid completed quantity.");
          setModalSubmitting(false);
          return;
        }
        result = await recordProductionProgress({
          production_order_id: selectedItem.production_order_id,
          quantity_completed: quantityCompletedInput,
          notes: notesInput.trim() || undefined,
        });
      } else if (activeModal === "qc") {
        result = await recordQualityCheck({
          production_order_id: selectedItem.production_order_id,
          check_stage: qcStageInput,
          status: qcStatusInput,
          notes: notesInput.trim() || undefined,
        });
      } else if (activeModal === "complete") {
        if (!quantityProducedInput || Number(quantityProducedInput) <= 0) {
          setModalError("Please enter a valid produced quantity.");
          setModalSubmitting(false);
          return;
        }
        result = await completeProduction({
          production_order_id: selectedItem.production_order_id,
          quantity_produced: quantityProducedInput,
          quantity_rejected: quantityRejectedInput || "0",
          batch_number: batchNumberInput.trim() || undefined,
          notes: notesInput.trim() || undefined,
        });
      }

      if (!result.success) {
        setModalError(result.message || "Action could not be completed.");
      } else {
        closeActionModal();
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Unexpected error during operation.");
    } finally {
      setModalSubmitting(false);
    }
  };

  // Warning Counts
  const capacityInsufficientCount = queue.filter((i) => i.is_capacity_insufficient).length;
  const delayedCount = queue.filter((i) => i.is_delayed).length;

  return (
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Production Queue</h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                {queue.length} Total
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Orders enqueued in strict FIFO order respecting daily product capacity and calendar constraints.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canSchedule && (
              <button
                type="button"
                onClick={handleRunScheduler}
                disabled={isScheduling || isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isScheduling ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Running Scheduler...
                  </>
                ) : (
                  <>
                    <span>⚡</span> Run Scheduler
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Operational Notice */}
        {scheduleNotice && (
          <div className="mt-3 rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-center justify-between">
            <span>{scheduleNotice}</span>
            <button
              onClick={() => setScheduleNotice(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Warning Indicator Banners */}
        {(capacityInsufficientCount > 0 || delayedCount > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {capacityInsufficientCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("CAPACITY_INSUFFICIENT")}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 transition"
              >
                <span>⚠️</span>
                <span>{capacityInsufficientCount} Insufficient Capacity (No-Split)</span>
              </button>
            )}
            {delayedCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("DELAYED")}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 transition"
              >
                <span>⏰</span>
                <span>{delayedCount} Delayed Orders</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Controls */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Search */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order #, customer, product..."
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PRODUCTION">In Production</option>
              <option value="QUALITY_CHECK">Quality Check</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="DELAYED">Delayed</option>
              <option value="CAPACITY_INSUFFICIENT">Capacity Insufficient</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Product</label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="ALL">All Products</option>
              {uniqueProducts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Button */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Date Filter Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scheduled From</label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scheduled To</label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {sortedQueue.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="text-4xl mb-2 text-slate-300">📋</div>
          <h3 className="text-base font-medium text-slate-800">No production orders found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {queue.length === 0
              ? "Confirmed orders will appear here automatically when queued for production."
              : "No orders match the current filter criteria."}
          </p>
          {queue.length > 0 ? (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear Filters
            </button>
          ) : canCreate ? (
            <Link
              href="/orders"
              className="mt-4 inline-flex items-center rounded-md bg-[var(--accent)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent)]/90"
            >
              View Orders
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {/* Desktop/Tablet Table View (hidden on mobile < 768px) */}
          <div className="hidden md:block rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th
                      className="px-3 py-2.5 font-medium cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort("fifo")}
                    >
                      FIFO {sortKey === "fifo" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-3 py-2.5 font-medium cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort("priority")}
                    >
                      Priority {sortKey === "priority" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-3 py-2.5 font-medium">Order #</th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Product</th>
                    <th
                      className="px-3 py-2.5 font-medium text-right cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort("quantity")}
                    >
                      Qty {sortKey === "quantity" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-3 py-2.5 font-medium cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort("scheduled_start")}
                    >
                      Schedule {sortKey === "scheduled_start" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="px-3 py-2.5 font-medium cursor-pointer hover:bg-slate-100"
                      onClick={() => handleSort("expected_delivery")}
                    >
                      Delivery {sortKey === "expected_delivery" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-3 py-2.5 font-medium">Status & Alerts</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedQueue.map((item) => {
                    const statusStr = item.status || "PENDING";
                    const statusBadge = STATUS_BADGES[statusStr] || STATUS_BADGES.PENDING;
                    const priorityBadge = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES.NORMAL;

                    return (
                      <tr key={item.production_order_id} className="hover:bg-slate-50/80 transition">
                        {/* FIFO Position */}
                        <td className="px-3 py-3 font-semibold text-slate-800">
                          <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded bg-slate-100 px-1 text-[11px] font-bold text-slate-700">
                            #{item.fifo_position ?? "-"}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityBadge.bg} ${priorityBadge.text} ${priorityBadge.border}`}
                          >
                            {item.priority}
                          </span>
                        </td>

                        {/* Order Number */}
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {item.order_id ? (
                            <Link
                              href={`/orders/${item.order_id}`}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {item.order_number}
                            </Link>
                          ) : (
                            item.order_number
                          )}
                        </td>

                        {/* Customer */}
                        <td className="px-3 py-3 text-slate-700 max-w-[140px] truncate" title={item.customer_name || ""}>
                          {item.customer_name || "—"}
                        </td>

                        {/* Product & SKU */}
                        <td className="px-3 py-3 max-w-[160px]">
                          <div className="font-medium text-slate-800 truncate" title={item.product_name}>
                            {item.product_name}
                          </div>
                          {item.product_sku && (
                            <div className="text-[10px] text-slate-400 truncate">{item.product_sku}</div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="px-3 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                          {Number(item.quantity).toLocaleString()} <span className="text-[10px] text-slate-400">{item.product_unit}</span>
                        </td>

                        {/* Schedule Start - End */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {item.scheduled_start_date ? (
                            <div>
                              <div className="font-medium text-slate-800">
                                {format(new Date(item.scheduled_start_date), "MMM d")}
                                {item.scheduled_end_date && item.scheduled_end_date !== item.scheduled_start_date && (
                                  <> – {format(new Date(item.scheduled_end_date), "MMM d")}</>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Unscheduled</span>
                          )}
                        </td>

                        {/* Expected Delivery */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {item.expected_delivery_date ? (
                            <span className="font-medium text-slate-700">
                              {format(new Date(item.expected_delivery_date), "MMM d, yyyy")}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status & Warning Badges */}
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                            >
                              {statusStr.replace(/_/g, " ")}
                            </span>

                            {item.is_capacity_insufficient && (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 border border-amber-300"
                                title="Order quantity exceeds product daily capacity. No-split rule enforced."
                              >
                                ⚠️ Capacity Insufficient
                              </span>
                            )}

                            {item.is_delayed && (
                              <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800 border border-red-300">
                                ⏰ Delayed
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action Buttons */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Start Production */}
                            {canStart && (statusStr === "SCHEDULED" || statusStr === "PENDING") && (
                              <button
                                type="button"
                                onClick={() => openActionModal("start", item)}
                                className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 border border-blue-200"
                              >
                                Start
                              </button>
                            )}

                            {/* Hold */}
                            {canEdit && statusStr === "IN_PRODUCTION" && (
                              <button
                                type="button"
                                onClick={() => openActionModal("hold", item)}
                                className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 border border-amber-200"
                              >
                                Hold
                              </button>
                            )}

                            {/* Resume */}
                            {canEdit && statusStr === "ON_HOLD" && (
                              <button
                                type="button"
                                onClick={() => openActionModal("resume", item)}
                                className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              >
                                Resume
                              </button>
                            )}

                            {/* Update Progress */}
                            {canEdit && statusStr === "IN_PRODUCTION" && (
                              <button
                                type="button"
                                onClick={() => openActionModal("progress", item)}
                                className="rounded bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 border border-slate-200"
                              >
                                Progress
                              </button>
                            )}

                            {/* Quality Check */}
                            {canQualityCheck && (statusStr === "IN_PRODUCTION" || statusStr === "QUALITY_CHECK") && (
                              <button
                                type="button"
                                onClick={() => openActionModal("qc", item)}
                                className="rounded bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 border border-purple-200"
                              >
                                QC
                              </button>
                            )}

                            {/* Mark as Done - Direct completion without requiring Start first */}
                            {canComplete && statusStr !== "COMPLETED" && statusStr !== "CANCELLED" && (
                              <button
                                type="button"
                                onClick={() => openActionModal("complete", item)}
                                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                                title="Mark production as done directly and add finished goods to inventory"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Mark as Done
                              </button>
                            )}

                            {/* View Detail Link */}
                            <Link
                              href={`/production/queue/${item.production_order_id}`}
                              className="rounded px-2 py-1 text-[11px] font-medium text-[var(--accent)] hover:underline"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card-Based View (visible on mobile < 768px, no horizontal overflow) */}
          <div className="md:hidden space-y-3">
            {sortedQueue.map((item) => {
              const statusStr = item.status || "PENDING";
              const statusBadge = STATUS_BADGES[statusStr] || STATUS_BADGES.PENDING;
              const priorityBadge = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES.NORMAL;

              return (
                <div
                  key={item.production_order_id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                >
                  {/* Card Header: FIFO, Order #, Priority, Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-5 w-6 rounded bg-slate-100 text-xs font-bold text-slate-700">
                        #{item.fifo_position ?? "-"}
                      </span>
                      <div>
                        {item.order_id ? (
                          <Link
                            href={`/orders/${item.order_id}`}
                            className="font-bold text-slate-900 text-sm hover:underline"
                          >
                            {item.order_number}
                          </Link>
                        ) : (
                          <span className="font-bold text-slate-900 text-sm">{item.order_number}</span>
                        )}
                        <p className="text-[11px] text-slate-500">{item.customer_name || "Customer"}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityBadge.bg} ${priorityBadge.text} ${priorityBadge.border}`}
                      >
                        {item.priority}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                      >
                        {statusStr.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  {/* Warning Strip */}
                  {(item.is_capacity_insufficient || item.is_delayed) && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.is_capacity_insufficient && (
                        <div className="w-full rounded bg-amber-50 p-1.5 text-[11px] font-medium text-amber-900 border border-amber-200 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>Quantity exceeds daily capacity. No-split rule enforced.</span>
                        </div>
                      )}
                      {item.is_delayed && (
                        <div className="w-full rounded bg-red-50 p-1.5 text-[11px] font-medium text-red-800 border border-red-200 flex items-center gap-1.5">
                          <span>⏰</span>
                          <span>Production delayed beyond schedule.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product & Quantities */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-md">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-medium">Product</p>
                      <p className="font-semibold text-slate-800 truncate">{item.product_name}</p>
                      {item.product_sku && <p className="text-[10px] text-slate-500">{item.product_sku}</p>}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-medium">Quantity</p>
                      <p className="font-semibold text-slate-800">
                        {Number(item.quantity).toLocaleString()} {item.product_unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-medium">Schedule</p>
                      <p className="font-medium text-slate-800">
                        {item.scheduled_start_date ? format(new Date(item.scheduled_start_date), "MMM d") : "Pending"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-medium">Delivery</p>
                      <p className="font-medium text-slate-800">
                        {item.expected_delivery_date
                          ? format(new Date(item.expected_delivery_date), "MMM d")
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                    <Link
                      href={`/production/queue/${item.production_order_id}`}
                      className="text-xs text-[var(--accent)] font-medium hover:underline"
                    >
                      View Details →
                    </Link>

                    <div className="flex flex-wrap gap-1.5">
                      {/* Start Production */}
                      {canStart && (statusStr === "SCHEDULED" || statusStr === "PENDING") && (
                        <button
                          type="button"
                          onClick={() => openActionModal("start", item)}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Start
                        </button>
                      )}

                      {/* Hold */}
                      {canEdit && statusStr === "IN_PRODUCTION" && (
                        <button
                          type="button"
                          onClick={() => openActionModal("hold", item)}
                          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Hold
                        </button>
                      )}

                      {/* Resume */}
                      {canEdit && statusStr === "ON_HOLD" && (
                        <button
                          type="button"
                          onClick={() => openActionModal("resume", item)}
                          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          Resume
                        </button>
                      )}

                      {/* Update Progress */}
                      {canEdit && statusStr === "IN_PRODUCTION" && (
                        <button
                          type="button"
                          onClick={() => openActionModal("progress", item)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Progress
                        </button>
                      )}

                      {/* Quality Check */}
                      {canQualityCheck && (statusStr === "IN_PRODUCTION" || statusStr === "QUALITY_CHECK") && (
                        <button
                          type="button"
                          onClick={() => openActionModal("qc", item)}
                          className="rounded bg-purple-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-purple-700"
                        >
                          QC
                        </button>
                      )}

                      {/* Mark as Done - Direct completion on mobile without requiring Start first */}
                      {canComplete && statusStr !== "COMPLETED" && statusStr !== "CANCELLED" && (
                        <button
                          type="button"
                          onClick={() => openActionModal("complete", item)}
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark as Done
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* ACTION MODAL DIALOGS                                          */}
      {/* ============================================================ */}
      {activeModal && selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Title */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {activeModal === "start" && "Start Production"}
                  {activeModal === "hold" && "Put Production On Hold"}
                  {activeModal === "resume" && "Resume Production"}
                  {activeModal === "progress" && "Record Production Progress"}
                  {activeModal === "qc" && "Record Quality Check"}
                  {activeModal === "complete" && "Mark as Done — Confirmation"}
                </h3>
                <p className="text-xs text-slate-500">
                  Order #{selectedItem.order_number} • {selectedItem.product_name} ({selectedItem.quantity}{" "}
                  {selectedItem.product_unit})
                </p>
              </div>
              <button
                type="button"
                onClick={closeActionModal}
                disabled={modalSubmitting}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Error Message Alert */}
            {modalError && (
              <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                {modalError}
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleModalSubmit} className="space-y-3.5">
              {/* Start Production Form */}
              {activeModal === "start" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Operator name, machine/line assignment, notes..."
                    className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Hold Production Form */}
              {activeModal === "hold" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hold Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="Machine breakdown, material shortage, customer hold..."
                    className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Resume Production Form */}
              {activeModal === "resume" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Resumption Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="Issue resolved, restarted shift..."
                    className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Record Progress Form */}
              {activeModal === "progress" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Quantity Completed ({selectedItem.product_unit}) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.001"
                      value={quantityCompletedInput}
                      onChange={(e) => setQuantityCompletedInput(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Progress Notes</label>
                    <textarea
                      rows={2}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Shift output, status notes..."
                      className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Quality Check Form */}
              {activeModal === "qc" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Check Stage</label>
                      <select
                        value={qcStageInput}
                        onChange={(e) => setQcStageInput(e.target.value as QualityCheckStage)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:outline-none"
                      >
                        <option value="INITIAL">Initial</option>
                        <option value="IN_PROCESS">In-Process</option>
                        <option value="FINAL">Final</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Outcome</label>
                      <select
                        value={qcStatusInput}
                        onChange={(e) => setQcStatusInput(e.target.value as QualityCheckStatus)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:outline-none"
                      >
                        <option value="PASSED">Passed</option>
                        <option value="FAILED">Failed</option>
                        <option value="CONDITIONAL_PASS">Conditional Pass</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Inspection Notes</label>
                    <textarea
                      rows={2}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Measurements, visual inspect results..."
                      className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Complete Production / Mark as Done Form */}
              {activeModal === "complete" && (() => {
                const completedSoFar = Number(selectedItem.completed_quantity) || 0;
                const remQty =
                  selectedItem.remaining_quantity !== undefined
                    ? selectedItem.remaining_quantity
                    : Math.max(0, Number(selectedItem.quantity) - completedSoFar);

                return (
                  <>
                    {/* Order summary banner */}
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs space-y-1.5">
                      <div className="font-semibold text-emerald-950 flex items-center justify-between">
                        <span>Production Progress Summary</span>
                        <span className="font-mono text-[11px] bg-white border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-800">
                          Order #{selectedItem.order_number}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1 text-slate-700">
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-medium">Total Required</span>
                          <span className="font-bold text-slate-900">{selectedItem.quantity} {selectedItem.product_unit}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-medium">Already Done</span>
                          <span className="font-bold text-slate-900">{completedSoFar} {selectedItem.product_unit}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-medium">Remaining</span>
                          <span className="font-bold text-emerald-700">{remQty} {selectedItem.product_unit}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Good Quantity Produced <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          min="0.001"
                          max={remQty > 0 ? remQty : undefined}
                          value={quantityProducedInput}
                          onChange={(e) => setQuantityProducedInput(e.target.value)}
                          disabled={modalSubmitting}
                          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Max remaining: {remQty} {selectedItem.product_unit}
                        </span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Scrap / Rejected Qty</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={quantityRejectedInput}
                          onChange={(e) => setQuantityRejectedInput(e.target.value)}
                          disabled={modalSubmitting}
                          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Batch / Lot Number</label>
                      <input
                        type="text"
                        value={batchNumberInput}
                        onChange={(e) => setBatchNumberInput(e.target.value)}
                        disabled={modalSubmitting}
                        placeholder="e.g. LOT-2026-10-001"
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Completion Notes</label>
                      <textarea
                        rows={2}
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        disabled={modalSubmitting}
                        placeholder="Finished goods storage location, quality verification remarks..."
                        className="w-full rounded-md border border-slate-300 p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100"
                      />
                    </div>

                    <div className="rounded-md bg-amber-50 p-2.5 text-[11px] text-amber-800 border border-amber-200">
                      <strong>Confirmation:</strong> Submitting will record the produced quantity directly to finished-goods stock and update production history atomically.
                    </div>
                  </>
                );
              })()}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={closeActionModal}
                  disabled={modalSubmitting}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {modalSubmitting ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Marking as Done...
                    </>
                  ) : activeModal === "complete" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirm Mark as Done
                    </>
                  ) : (
                    "Confirm & Save"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}