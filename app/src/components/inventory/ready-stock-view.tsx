"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  Boxes,
  Truck,
  ShoppingCart,
  ExternalLink,
  Layers,
  ChevronDown,
  Info,
} from "lucide-react";
import AddReadyStockModal from "./add-ready-stock-modal";

export interface ReadyStockProductItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  quality_standard?: string | null;
  min_stock: number;
  reorder_level: number;
  current_stock: number | null;
  reserved_stock: number;
  available_stock: number;
  remaining_order_qty: number;
  orders_breakdown?: Array<{
    order_id: string;
    order_number: string;
    ordered_quantity: number;
    dispatched_quantity: number;
    remaining_quantity: number;
  }>;
  is_recorded: boolean;
}

export interface ReadyForDispatchItem {
  production_order_id: string;
  business_id: string;
  order_id: string | null;
  order_number: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  quality_standard: string;
  completed_quantity: number;
  completion_date: string | null;
  dispatched_quantity: number;
  dispatch_status: "READY_TO_DISPATCH" | "PARTIALLY_DISPATCHED" | "FULLY_DISPATCHED" | "UNASSIGNED_STOCK";
  delivery_id: string | null;
  delivery_number: string | null;
}

interface ReadyStockViewProps {
  items: ReadyStockProductItem[];
  readyForDispatchItems: ReadyForDispatchItem[];
  canAdd: boolean;
  canAdjust: boolean;
  canViewHistory: boolean;
}

function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

export default function ReadyStockView({
  items,
  readyForDispatchItems = [],
  canAdd,
  canAdjust,
  canViewHistory,
}: ReadyStockViewProps) {
  const [activeSubSection, setActiveSubSection] = useState<"READY_STOCK" | "READY_FOR_DISPATCH">("READY_STOCK");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dispatchFilter, setDispatchFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalProductId, setModalProductId] = useState<string | null>(null);
  const [expandedOrdersProductId, setExpandedOrdersProductId] = useState<string | null>(null);

  const openAddStockModal = (productId: string | null = null) => {
    setModalProductId(productId);
    setIsModalOpen(true);
  };

  // Warehouse Ready Stock Filter
  const filteredStockItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        search.trim() === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
      const isLow = item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder;
      const isOut = item.is_recorded && item.available_stock <= 0;
      const isPendingOrders = item.remaining_order_qty > 0;
      const isNotRecorded = !item.is_recorded;

      if (statusFilter === "LOW") return isLow;
      if (statusFilter === "OUT") return isOut;
      if (statusFilter === "PENDING_ORDERS") return isPendingOrders;
      if (statusFilter === "HEALTHY") return item.is_recorded && !isLow && item.available_stock > 0;
      if (statusFilter === "NOT_RECORDED") return isNotRecorded;
      return true;
    });
  }, [items, search, statusFilter]);

  // Ready for Dispatch Filter
  const filteredDispatchItems = useMemo(() => {
    return readyForDispatchItems.filter((item) => {
      const matchSearch =
        search.trim() === "" ||
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        item.order_number.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(search.toLowerCase())) ||
        (item.quality_standard && item.quality_standard.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (dispatchFilter === "ALL") return true;
      return item.dispatch_status === dispatchFilter;
    });
  }, [readyForDispatchItems, search, dispatchFilter]);

  // High-Level KPIs
  const kpis = useMemo(() => {
    // 1. Available Ready Stock grouped strictly by UOM
    const availableUomMap = new Map<string, number>();
    // 2. Remaining Orders grouped strictly by UOM
    const remainingUomMap = new Map<string, number>();

    items.forEach((item) => {
      const uom = item.unit || "Unit";
      if (item.available_stock > 0) {
        availableUomMap.set(uom, (availableUomMap.get(uom) || 0) + item.available_stock);
      }
      if (item.remaining_order_qty > 0) {
        remainingUomMap.set(uom, (remainingUomMap.get(uom) || 0) + item.remaining_order_qty);
      }
    });

    const readyToDispatchCount = readyForDispatchItems.filter(
      (i) => i.dispatch_status === "READY_TO_DISPATCH" || i.dispatch_status === "PARTIALLY_DISPATCHED"
    ).length;

    return {
      totalProducts: items.length,
      availableUoms: Array.from(availableUomMap.entries()),
      remainingUoms: Array.from(remainingUomMap.entries()),
      readyToDispatchCount,
      totalCompletedBatches: readyForDispatchItems.length,
    };
  }, [items, readyForDispatchItems]);

  return (
    <div className="space-y-6">
      {/* 4 SUMMARY CARDS — REPLACED ACTIVE RESERVATIONS WITH TOTAL REMAINING ORDERS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Tracked Finished Goods */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tracked Finished Goods
            </span>
            <Boxes className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.totalProducts}</p>
          <p className="mt-1 text-xs text-slate-500">Active finished goods catalog</p>
        </div>

        {/* Card 2: Available Ready Stock (Warehouse Manual Finished Goods) */}
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
              Available Ready Stock
            </span>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 min-h-[32px] flex items-baseline">
            {kpis.availableUoms.length > 0 ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {kpis.availableUoms.map(([uom, qty], idx) => (
                  <span key={uom} className="text-lg font-bold text-teal-900">
                    {formatQty(qty)} <span className="text-xs font-semibold text-teal-700">{uom}</span>
                    {idx < kpis.availableUoms.length - 1 && <span className="text-teal-400 ml-2">·</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-bold text-teal-900">0</p>
            )}
          </div>
          <p className="mt-1 text-xs text-teal-700">Commercial warehouse stock</p>
        </div>

        {/* Card 3: TOTAL REMAINING ORDERS (Replaces Active Reservations) */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Total Remaining Orders
            </span>
            <ShoppingCart className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 min-h-[32px] flex items-baseline">
            {kpis.remainingUoms.length > 0 ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {kpis.remainingUoms.map(([uom, qty], idx) => (
                  <span key={uom} className="text-lg font-bold text-amber-900">
                    {formatQty(qty)} <span className="text-xs font-semibold text-amber-700">{uom}</span>
                    {idx < kpis.remainingUoms.length - 1 && <span className="text-amber-400 ml-2">·</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-bold text-amber-900">0</p>
            )}
          </div>
          <p className="mt-1 text-xs text-amber-700">Confirmed orders pending delivery</p>
        </div>

        {/* Card 4: Ready for Dispatch */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
              Ready for Dispatch
            </span>
            <Truck className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 min-h-[32px] flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-indigo-900">{kpis.readyToDispatchCount}</span>
            <span className="text-xs font-medium text-indigo-700">
              order batch{kpis.readyToDispatchCount === 1 ? "" : "es"} pending
            </span>
          </div>
          <p className="mt-1 text-xs text-indigo-700">Factory production completed</p>
        </div>
      </div>

      {/* SECTION NAVIGATOR PILLS: Warehouse Ready Stock vs. Ready for Dispatch */}
      <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveSubSection("READY_STOCK");
              setSearch("");
            }}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeSubSection === "READY_STOCK"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package className="h-4 w-4 text-[#0F766E]" />
            <span>Warehouse Ready Stock</span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubSection("READY_FOR_DISPATCH");
              setSearch("");
            }}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeSubSection === "READY_FOR_DISPATCH"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Truck className="h-4 w-4 text-indigo-600" />
            <span>Ready for Dispatch</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-800 font-semibold">
              {readyForDispatchItems.length}
            </span>
          </button>
        </div>

        {/* PRIMARY CTA FOR ADD READY STOCK */}
        {activeSubSection === "READY_STOCK" && canAdd && (
          <button
            type="button"
            onClick={() => openAddStockModal(null)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#0D655E] transition active:scale-98 shrink-0 min-h-[40px] cursor-pointer self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Add Ready Stock</span>
          </button>
        )}
      </div>

      {/* MODAL FOR MANUAL READY STOCK ADDITION */}
      <AddReadyStockModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        products={items}
        initialProductId={modalProductId}
        canAdd={canAdd}
      />

      {/* ========================================================================= */}
      {/* SECTION 1: WAREHOUSE READY STOCK TABLE                                    */}
      {/* ========================================================================= */}
      {activeSubSection === "READY_STOCK" && (
        <div className="space-y-4">
          {/* SEARCH & STATUS FILTER */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search warehouse ready stock by product name or SKU..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-2xs placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "ALL", label: "All Items" },
                { id: "HEALTHY", label: "In Stock" },
                { id: "PENDING_ORDERS", label: "Pending Orders" },
                { id: "LOW", label: "Low Stock" },
                { id: "OUT", label: "Out of Stock" },
                { id: "NOT_RECORDED", label: "Not Recorded" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    statusFilter === pill.id
                      ? "bg-[#0F766E] text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm" role="table">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3.5">Finished Product</th>
                  <th className="px-3 py-3.5 text-right">Available Ready Stock</th>
                  <th className="px-3 py-3.5 text-right">Total Remaining Orders</th>
                  <th className="px-3 py-3.5 text-right">Reorder Level</th>
                  <th className="px-3 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredStockItems.map((item) => {
                  const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
                  const isLow = item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder;
                  const isOut = item.is_recorded && item.available_stock <= 0;
                  const hasRemainingOrders = item.remaining_order_qty > 0;
                  const isExpanded = expandedOrdersProductId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition group">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">
                          {item.sku || "-"} ·{" "}
                          <span className="font-sans font-medium text-slate-600">{item.unit}</span>
                          {item.quality_standard && (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-sans text-slate-600 border border-slate-200">
                              {item.quality_standard}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Available Ready Stock (Warehouse manual stock) */}
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-teal-800 bg-teal-50/20">
                        {item.current_stock !== null ? (
                          <>
                            {formatQty(item.available_stock)}
                            <span className="text-xs text-teal-600 ml-1 font-semibold">{item.unit}</span>
                          </>
                        ) : (
                          <span className="text-xs italic text-slate-400">Not recorded</span>
                        )}
                      </td>

                      {/* Total Remaining Orders (Live pending customer demand) */}
                      <td className="px-3 py-3 text-right tabular-nums">
                        {hasRemainingOrders ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => setExpandedOrdersProductId(isExpanded ? null : item.id)}
                              className="inline-flex items-center gap-1 font-bold text-amber-800 hover:text-amber-900 underline decoration-dotted decoration-amber-400 cursor-pointer"
                              title="Click to view pending orders breakdown"
                            >
                              <span>{formatQty(item.remaining_order_qty)}</span>
                              <span className="text-xs font-semibold text-amber-600">{item.unit}</span>
                              <ChevronDown className={`h-3 w-3 text-amber-600 transition ${isExpanded ? "rotate-180" : ""}`} />
                            </button>

                            {/* Orders breakdown popover */}
                            {isExpanded && item.orders_breakdown && item.orders_breakdown.length > 0 && (
                              <div className="mt-2 text-left rounded-lg border border-amber-200 bg-amber-50/90 p-2 text-xs space-y-1 shadow-sm">
                                <p className="font-semibold text-[10px] uppercase text-amber-800">
                                  Pending Orders Breakdown:
                                </p>
                                {item.orders_breakdown.map((ob) => (
                                  <div key={ob.order_id} className="flex justify-between items-center gap-2 border-b border-amber-100 pb-0.5">
                                    <Link
                                      href={`/orders/${ob.order_id}`}
                                      className="font-mono text-amber-900 font-semibold hover:underline flex items-center gap-0.5"
                                    >
                                      <span>{ob.order_number}</span>
                                      <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                                    </Link>
                                    <span className="font-mono text-amber-800">
                                      {formatQty(ob.remaining_quantity)} / {formatQty(ob.ordered_quantity)} {item.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">0</span>
                        )}
                      </td>

                      {/* Reorder Level */}
                      <td className="px-3 py-3 text-right font-mono text-xs text-slate-500">
                        {effectiveReorder > 0 ? `${formatQty(effectiveReorder)} ${item.unit}` : "-"}
                      </td>

                      {/* Stock Status Badge */}
                      <td className="px-3 py-3 text-center">
                        {!item.is_recorded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                            <HelpCircle className="w-3 h-3 text-slate-400" />
                            Not recorded
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            Low stock
                          </span>
                        ) : isOut ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-500" />
                            Out of stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            In stock
                          </span>
                        )}
                      </td>

                      {/* Operations */}
                      <td className="px-4 py-3 text-right">
                        {canAdd ? (
                          <button
                            type="button"
                            onClick={() => openAddStockModal(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5 text-[#0F766E]" />
                            <span>Add Ready Stock</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredStockItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-sm">
                      No finished products found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE STACKED CARDS (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredStockItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900">{item.name}</h4>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">
                      {item.sku || "No SKU"} · {item.unit}
                    </p>
                  </div>
                  <div>
                    {item.available_stock > 0 ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        In Stock
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50/70 p-3 rounded-lg border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-teal-800">Available Ready</span>
                    <p className="font-bold text-teal-700 tabular-nums text-sm">
                      {formatQty(item.available_stock)} {item.unit}
                    </p>
                    <span className="text-[9px] text-teal-600">Warehouse stock</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-amber-800">Remaining Orders</span>
                    <p className="font-bold text-amber-700 tabular-nums text-sm">
                      {formatQty(item.remaining_order_qty)} {item.unit}
                    </p>
                    <span className="text-[9px] text-amber-600">Pending customer orders</span>
                  </div>
                </div>

                {canAdd && (
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => openAddStockModal(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#0F766E]" />
                      <span>Add Ready Stock</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: READY FOR DISPATCH SECTION                                     */}
      {/* ========================================================================= */}
      {activeSubSection === "READY_FOR_DISPATCH" && (
        <div className="space-y-4">
          {/* SEARCH & DISPATCH STATUS FILTER */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by order number, product name, or quality standard..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-2xs placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "ALL", label: "All Completed Batches" },
                { id: "READY_TO_DISPATCH", label: "Ready to Dispatch" },
                { id: "PARTIALLY_DISPATCHED", label: "Partially Dispatched" },
                { id: "FULLY_DISPATCHED", label: "Fully Dispatched" },
                { id: "UNASSIGNED_STOCK", label: "Unassigned Stock" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setDispatchFilter(pill.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    dispatchFilter === pill.id
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm" role="table">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3.5">Order #</th>
                  <th className="px-3 py-3.5">Finished Product</th>
                  <th className="px-3 py-3.5">Quality Standard</th>
                  <th className="px-3 py-3.5 text-right">Completed Qty</th>
                  <th className="px-3 py-3.5">Completion Date</th>
                  <th className="px-3 py-3.5 text-center">Dispatch Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDispatchItems.map((item) => {
                  return (
                    <tr key={item.production_order_id} className="hover:bg-slate-50/60 transition">
                      {/* Order # */}
                      <td className="px-4 py-3 font-semibold">
                        {item.order_id ? (
                          <Link
                            href={`/orders/${item.order_id}`}
                            className="font-mono text-indigo-700 hover:text-indigo-900 hover:underline inline-flex items-center gap-1"
                          >
                            <span>{item.order_number}</span>
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </Link>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600 border border-slate-200">
                            UNASSIGNED
                          </span>
                        )}
                      </td>

                      {/* Product Name & SKU */}
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{item.product_name}</div>
                        <div className="font-mono text-xs text-slate-500 mt-0.5">
                          {item.sku || "-"}
                        </div>
                      </td>

                      {/* Quality Standard */}
                      <td className="px-3 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-sans text-slate-700 border border-slate-200 font-medium">
                          {item.quality_standard || "Standard"}
                        </span>
                      </td>

                      {/* Completed Quantity & UOM */}
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">
                        {formatQty(item.completed_quantity)}
                        <span className="text-xs text-slate-500 ml-1 font-semibold">{item.unit}</span>
                      </td>

                      {/* Completion Date */}
                      <td className="px-3 py-3 text-xs text-slate-600 font-mono">
                        {item.completion_date
                          ? format(new Date(item.completion_date), "dd MMM yyyy")
                          : "—"}
                      </td>

                      {/* Dispatch Status */}
                      <td className="px-3 py-3 text-center">
                        {item.dispatch_status === "READY_TO_DISPATCH" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Ready to Dispatch
                          </span>
                        ) : item.dispatch_status === "PARTIALLY_DISPATCHED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-500" />
                            Partially Dispatched
                          </span>
                        ) : item.dispatch_status === "FULLY_DISPATCHED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                            <CheckCircle2 className="w-3 h-3 text-slate-500" />
                            Fully Dispatched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
                            <Layers className="w-3 h-3 text-purple-500" />
                            Unassigned Stock
                          </span>
                        )}
                      </td>

                      {/* Operations */}
                      <td className="px-4 py-3 text-right space-x-2">
                        {item.order_id && (item.dispatch_status === "READY_TO_DISPATCH" || item.dispatch_status === "PARTIALLY_DISPATCHED") ? (
                          <Link
                            href={`/delivery?action=create&order_id=${item.order_id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-[#0F766E] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0D655E] transition shadow-2xs"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>Create Delivery</span>
                          </Link>
                        ) : item.delivery_id ? (
                          <Link
                            href={`/delivery/${item.delivery_id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            <span>View Challan</span>
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">Archived</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredDispatchItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                      No completed production batches found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE STACKED CARDS FOR READY FOR DISPATCH (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredDispatchItems.map((item) => (
              <div
                key={item.production_order_id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900">{item.product_name}</h4>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">
                      {item.sku || "No SKU"} · {item.unit}
                    </p>
                    <p className="font-sans text-xs text-slate-600 mt-1">
                      Standard: <span className="font-semibold">{item.quality_standard || "Standard"}</span>
                    </p>
                  </div>
                  <div>
                    {item.order_id ? (
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {item.order_number}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        UNASSIGNED
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500">Completed Qty</span>
                    <p className="font-bold text-slate-900 tabular-nums">
                      {formatQty(item.completed_quantity)} {item.unit}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500">Status</span>
                    <p className="font-semibold text-slate-800">
                      {item.dispatch_status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-end">
                  {item.order_id && (item.dispatch_status === "READY_TO_DISPATCH" || item.dispatch_status === "PARTIALLY_DISPATCHED") ? (
                    <Link
                      href={`/delivery?action=create&order_id=${item.order_id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0F766E] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Create Delivery</span>
                    </Link>
                  ) : item.delivery_id ? (
                    <Link
                      href={`/delivery/${item.delivery_id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      <span>View Challan</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
