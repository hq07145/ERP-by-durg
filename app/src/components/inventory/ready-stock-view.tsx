"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Plus,
  SlidersHorizontal,
  Boxes,
  Lock,
} from "lucide-react";
import AddReadyStockModal from "./add-ready-stock-modal";

export interface ReadyStockProductItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  min_stock: number;
  reorder_level: number;
  current_stock: number | null;
  reserved_stock: number;
  available_stock: number;
  total_produced: number;
  is_recorded: boolean;
}

interface ReadyStockViewProps {
  items: ReadyStockProductItem[];
  canAdd: boolean;
  canAdjust: boolean;
  canViewHistory: boolean;
}

function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not recorded";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

export default function ReadyStockView({
  items,
  canAdd,
  canAdjust,
  canViewHistory,
}: ReadyStockViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalProductId, setModalProductId] = useState<string | null>(null);

  const openAddStockModal = (productId: string | null = null) => {
    setModalProductId(productId);
    setIsModalOpen(true);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        search.trim() === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
      const isLow = item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder;
      const isOut = item.is_recorded && item.available_stock <= 0;
      const isNotRecorded = !item.is_recorded;

      if (statusFilter === "LOW") return isLow;
      if (statusFilter === "OUT") return isOut;
      if (statusFilter === "HEALTHY") return item.is_recorded && !isLow && item.available_stock > 0;
      if (statusFilter === "NOT_RECORDED") return isNotRecorded;
      return true;
    });
  }, [items, search, statusFilter]);

  const kpis = useMemo(() => {
    let totalPhysical = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;

    items.forEach((item) => {
      if (item.current_stock !== null) {
        totalPhysical += item.current_stock;
      }
      totalReserved += item.reserved_stock;
      totalAvailable += item.available_stock;

      const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
      if (item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder) {
        lowStockCount++;
      }
    });

    return {
      totalProducts: items.length,
      totalPhysical,
      totalReserved,
      totalAvailable,
      lowStockCount,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tracked Products
            </span>
            <Boxes className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.totalProducts}</p>
          <p className="mt-1 text-xs text-slate-500">Finished goods catalog</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Physical Stock
            </span>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(kpis.totalPhysical)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Physically in warehouse</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Reservations
            </span>
            <Lock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(kpis.totalReserved)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Reserved for confirmed orders</p>
        </div>

        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
              Available Ready Stock
            </span>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-teal-900">
            {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(kpis.totalAvailable)}
          </p>
          <p className="mt-1 text-xs text-teal-700">Physical − reservations</p>
        </div>
      </div>

      {/* CONTROLS: PRIMARY CTA + SEARCH & STATUS FILTER */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-2xs placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
          {/* FILTER PILLS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "ALL", label: "All Items" },
              { id: "HEALTHY", label: "In Stock" },
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

          {/* PRIMARY ACTION BUTTON */}
          {canAdd && (
            <button
              type="button"
              onClick={() => openAddStockModal(null)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#0D655E] transition active:scale-98 shrink-0 min-h-[40px] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add Ready Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* MODAL FOR MANUAL READY STOCK ADDITION */}
      <AddReadyStockModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        products={items}
        initialProductId={modalProductId}
        canAdd={canAdd}
      />

      {/* MOBILE STACKED CARDS (< 768px) */}
      <div className="md:hidden space-y-3">
        {filteredItems.map((item) => {
          const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
          const isLow = item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder;
          const isOut = item.is_recorded && item.available_stock <= 0;

          return (
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
                  {!item.is_recorded ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                      Not Recorded
                    </span>
                  ) : isLow ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                      Low Stock
                    </span>
                  ) : isOut ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                      {item.current_stock && item.current_stock > 0 ? "Fully Reserved" : "Out of Stock"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                      In Stock
                    </span>
                  )}
                </div>
              </div>

              {/* 2x2 Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50/70 p-3 rounded-lg border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Total Produced</span>
                  <p className="font-bold text-slate-800 tabular-nums">
                    {formatQty(item.total_produced)} {item.unit}
                  </p>
                  <span className="text-[9px] text-slate-400">Quality accepted</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Physical Stock</span>
                  <p className="font-bold text-slate-800 tabular-nums">
                    {item.current_stock !== null ? `${formatQty(item.current_stock)} ${item.unit}` : "Not recorded"}
                  </p>
                  <span className="text-[9px] text-slate-400">In warehouse</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Reserved Orders</span>
                  <p className="font-bold text-amber-700 tabular-nums">
                    {formatQty(item.reserved_stock)} {item.unit}
                  </p>
                  <span className="text-[9px] text-slate-400">Confirmed orders</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-teal-800">Available Ready</span>
                  <p className="font-bold text-teal-700 tabular-nums text-sm">
                    {formatQty(item.available_stock)} {item.unit}
                  </p>
                  <span className="text-[9px] text-teal-600">Ready to sell</span>
                </div>
              </div>

              {effectiveReorder > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>Reorder threshold:</span>
                  <span className="font-mono font-medium">
                    {formatQty(effectiveReorder)} {item.unit}
                  </span>
                </div>
              )}

              {canAdd && (
                <div className="pt-1 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openAddStockModal(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-[38px] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#0F766E]" />
                    <span>Add Ready Stock</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
            No finished goods matched your search or filter.
          </div>
        )}
      </div>

      {/* DESKTOP/TABLET TABLE VIEW (>= 768px) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm" role="table">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-4 py-3.5">Finished Product</th>
              <th className="px-3 py-3.5 text-right">Total Produced</th>
              <th className="px-3 py-3.5 text-right">Physical Stock</th>
              <th className="px-3 py-3.5 text-right">Reserved (Orders)</th>
              <th className="px-3 py-3.5 text-right">Available Ready</th>
              <th className="px-3 py-3.5 text-right">Reorder Level</th>
              <th className="px-3 py-3.5 text-center">Status</th>
              <th className="px-4 py-3.5 text-right">Operations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredItems.map((item) => {
              const effectiveReorder = Math.max(item.reorder_level, item.min_stock);
              const isLow = item.is_recorded && effectiveReorder > 0 && item.available_stock <= effectiveReorder;
              const isOut = item.is_recorded && item.available_stock <= 0;

              return (
                <tr key={item.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="font-mono text-xs text-slate-500 mt-0.5">
                      {item.sku || "-"} · <span className="font-sans font-medium text-slate-600">{item.unit}</span>
                    </div>
                  </td>

                  {/* Total Produced (Recorded completions only) */}
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-700">
                    {formatQty(item.total_produced)}
                    <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                  </td>

                  {/* Physical Warehouse Stock */}
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-800">
                    {item.current_stock !== null ? (
                      <>
                        {formatQty(item.current_stock)}
                        <span className="text-xs text-slate-400 ml-1">{item.unit}</span>
                      </>
                    ) : (
                      <span className="text-xs italic text-slate-400">Not recorded</span>
                    )}
                  </td>

                  {/* Reserved for Confirmed Orders */}
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-amber-700">
                    {item.reserved_stock > 0 ? (
                      <>
                        {formatQty(item.reserved_stock)}
                        <span className="text-xs text-amber-500 ml-1">{item.unit}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  {/* Available Ready Stock (Current - Reserved) */}
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-teal-800 bg-teal-50/30">
                    {formatQty(item.available_stock)}
                    <span className="text-xs text-teal-600 ml-1">{item.unit}</span>
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
                        {item.current_stock && item.current_stock > 0 ? "Fully Reserved" : "Out of stock"}
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

            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">
                  No finished products found matching the criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
