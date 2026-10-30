"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  Search,
  Filter,
  Plus,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  PackageCheck,
  Calendar,
} from "lucide-react";
import { CreateReturnModal } from "@/components/returns/create-return-modal";
import {
  RETURN_STATUS_COLORS,
  RETURN_STATUS_LABELS,
  PRODUCT_CONDITION_COLORS,
  ADJUSTMENT_TYPE_LABELS,
  type ReturnStatus,
} from "@/types/returns";

interface ReturnListProps {
  returns: any[];
  customers: any[];
  statusCounts?: Record<string, number> | null;
  currentStatus?: string;
  searchQuery?: string;
  canCreate: boolean;
  canApprove: boolean;
  canPost: boolean;
  initialCreateOpen?: boolean;
}

export function ReturnList({
  returns,
  customers,
  statusCounts,
  currentStatus,
  searchQuery = "",
  canCreate,
  canApprove,
  canPost,
  initialCreateOpen = false,
}: ReturnListProps) {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialCreateOpen);
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestQueryRef = useRef(searchQuery);

  // Sync internal searchTerm if searchQuery prop changes externally (e.g. back/forward navigation)
  useEffect(() => {
    setSearchTerm(searchQuery);
    latestQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const triggerSearch = useCallback((query: string) => {
    const params = new URLSearchParams(window.location.search);
    const trimmed = query.trim();
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    params.delete("page");
    router.push(`/returns?${params.toString()}`);
  }, [router]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    latestQueryRef.current = value;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Immediate reset when clearing search
    if (!value.trim()) {
      if (searchQuery) {
        triggerSearch("");
      }
      return;
    }

    // Debounce 300ms for non-empty text input
    debounceTimerRef.current = setTimeout(() => {
      // Ensure older debounced update cannot override a newer one
      if (latestQueryRef.current === value) {
        triggerSearch(value);
      }
    }, 300);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    triggerSearch(searchTerm);
  };

  const handleStatusFilter = (status: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (status && status !== "ALL") {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.push(`/returns?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <button
          onClick={() => handleStatusFilter(null)}
          className={`p-4 rounded-2xl border text-left transition-all ${
            !currentStatus || currentStatus === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-80">All Returns</span>
            <RotateCcw className="w-4 h-4 opacity-75" />
          </div>
          <div className="text-2xl font-bold mt-2">{statusCounts ? (statusCounts.ALL ?? 0) : "—"}</div>
        </button>

        <button
          onClick={() => handleStatusFilter("PENDING_INSPECTION")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "PENDING_INSPECTION"
              ? "bg-amber-500 text-white border-amber-500 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-80">Pending Inspection</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-amber-600">
            {statusCounts ? (statusCounts.PENDING_INSPECTION ?? 0) : "—"}
          </div>
        </button>

        <button
          onClick={() => handleStatusFilter("APPROVED")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "APPROVED"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-80">Approved</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-blue-600">{statusCounts ? (statusCounts.APPROVED ?? 0) : "—"}</div>
        </button>

        <button
          onClick={() => handleStatusFilter("POSTED")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "POSTED"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-emerald-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-80">Posted (Adjusted)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-emerald-600">{statusCounts ? (statusCounts.POSTED ?? 0) : "—"}</div>
        </button>

        <button
          onClick={() => handleStatusFilter("REJECTED")}
          className={`p-4 rounded-2xl border text-left transition-all ${
            currentStatus === "REJECTED"
              ? "bg-rose-600 text-white border-rose-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-rose-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold opacity-80">Rejected</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-rose-600">{statusCounts ? (statusCounts.REJECTED ?? 0) : "—"}</div>
        </button>
      </div>

      {/* Control Bar: Search & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <form onSubmit={handleSearch} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by return #, customer, order #, SKU..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>

        {canCreate && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Return</span>
          </button>
        )}
      </div>

      {/* Returns Table / Empty State */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {returns.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Goods Returns Found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {currentStatus || searchQuery
                ? "Try clearing your filters or search terms."
                : "Log customer returns to inspect product condition and issue credit notes or replacements."}
            </p>
            {canCreate && !currentStatus && !searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4" />
                <span>Log First Return</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Return # & Date</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Product / SKU</th>
                    <th className="py-3.5 px-4 text-right">Returned Qty</th>
                    <th className="py-3.5 px-4">Condition</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Adjustment</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {returns.map((ret) => {
                    const statusColor =
                      RETURN_STATUS_COLORS[ret.status as ReturnStatus] ||
                      "bg-slate-100 text-slate-700 border-slate-200";
                    const condColor =
                      (PRODUCT_CONDITION_COLORS as any)[ret.product_condition] ||
                      "bg-slate-100 text-slate-700 border-slate-200";

                    return (
                      <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <Link
                            href={`/returns/${ret.id}`}
                            className="font-mono font-bold text-slate-900 hover:text-emerald-600"
                          >
                            {ret.return_number}
                          </Link>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {new Date(ret.return_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{ret.customer_name}</div>
                          {ret.order_number && (
                            <div className="text-xs text-slate-500">Order: {ret.order_number}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">
                            {ret.product_name || "Multiple Products"}
                          </div>
                          {ret.product_sku && (
                            <div className="text-xs text-slate-400 font-mono">{ret.product_sku}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          {ret.returned_quantity}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${condColor}`}
                          >
                            {ret.product_condition}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColor}`}
                          >
                            {RETURN_STATUS_LABELS[ret.status as ReturnStatus] || ret.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                          {ret.adjustment_type ? (
                            <span className="inline-block bg-slate-100 px-2 py-1 rounded-md text-slate-700">
                              {(ADJUSTMENT_TYPE_LABELS as any)[ret.adjustment_type] ||
                                ret.adjustment_type}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href={`/returns/${ret.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <span>View</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {returns.map((ret) => {
                const statusColor =
                  RETURN_STATUS_COLORS[ret.status as ReturnStatus] || "bg-slate-100 text-slate-700";
                const condColor =
                  (PRODUCT_CONDITION_COLORS as any)[ret.product_condition] || "bg-slate-100";

                return (
                  <Link
                    key={ret.id}
                    href={`/returns/${ret.id}`}
                    className="block p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-bold text-slate-900">{ret.return_number}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${statusColor}`}
                      >
                        {RETURN_STATUS_LABELS[ret.status as ReturnStatus] || ret.status}
                      </span>
                    </div>

                    <div className="font-semibold text-slate-800 text-sm">{ret.customer_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ret.product_name || "Product"} • Qty: {ret.returned_quantity}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${condColor}`}>
                        {ret.product_condition}
                      </span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <span>{new Date(ret.return_date).toLocaleDateString()}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <CreateReturnModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        customers={customers}
      />
    </div>
  );
}
