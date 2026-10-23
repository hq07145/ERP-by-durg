"use client";

import { useState, useTransition, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  AlertCircle,
  Loader2,
  FileText,
  MapPin,
  User,
  Plus,
  Search,
  Calendar,
} from "lucide-react";
import type {
  DeliveryListItem,
  DeliveryStatus,
  CustomerDropdownItem,
  DeliveryStatusCounts,
} from "@/types/delivery";
import {
  DELIVERY_STATUS_COLORS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TRANSITIONS,
} from "@/types/delivery";
import {
  packDelivery,
  dispatchDelivery,
  markDeliveryInTransit,
  completeDelivery,
  cancelDelivery,
} from "@/lib/delivery/actions";
import {
  validateAndNormalizeVehicleNumber,
  validateDriverMobile,
} from "@/lib/delivery/validation";
import { CreateDeliveryModal } from "./create-delivery-modal";

interface DeliveryListProps {
  deliveries: DeliveryListItem[];
  customers?: CustomerDropdownItem[];
  initialCreateModalOpen?: boolean;
  canCreate: boolean;
  canView: boolean;
  canPack?: boolean;
  canDispatch: boolean;
  canComplete: boolean;
  canCancel: boolean;
  currentStatus?: DeliveryStatus;
  statusCounts?: DeliveryStatusCounts;
  searchQuery?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  onStatusChange?: (status: DeliveryStatus | undefined) => void;
}

const STATUS_FILTER_ORDER: DeliveryStatus[] = [
  "READY",
  "PACKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
  "NOT_READY",
];

export function DeliveryList({
  deliveries,
  customers,
  initialCreateModalOpen = false,
  canCreate,
  canView,
  canPack = false,
  canDispatch,
  canComplete,
  canCancel,
  currentStatus,
  statusCounts,
  searchQuery = "",
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onStatusChange,
}: DeliveryListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialCreateModalOpen);

  // Maintain local state for optimistic updates
  const [itemsList, setItemsList] = useState<DeliveryListItem[]>(deliveries);
  useEffect(() => {
    setItemsList(deliveries);
  }, [deliveries]);

  const [localCounts, setLocalCounts] = useState<DeliveryStatusCounts | undefined>(statusCounts);
  useEffect(() => {
    setLocalCounts(statusCounts);
  }, [statusCounts]);

  const [searchText, setSearchText] = useState(searchQuery || "");
  useEffect(() => {
    setSearchText(searchQuery || "");
  }, [searchQuery]);

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
      return;
    }
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("page", newPage.toString());
    router.push(`/delivery?${sp.toString()}`);
  };

  const handleStatusChange = (newStatus: DeliveryStatus | undefined) => {
    if (onStatusChange) {
      onStatusChange(newStatus);
      return;
    }
    const sp = new URLSearchParams(searchParams?.toString() || "");
    if (newStatus) {
      sp.set("status", newStatus);
    } else {
      sp.delete("status");
    }
    sp.set("page", "1");
    router.push(`/delivery?${sp.toString()}`);
  };

  // Status Action Modals State
  const [activeDispatch, setActiveDispatch] = useState<DeliveryListItem | null>(null);
  const [dispatchVehicle, setDispatchVehicle] = useState("");
  const [dispatchDriver, setDispatchDriver] = useState("");
  const [dispatchDriverPhone, setDispatchDriverPhone] = useState("");
  const [dispatchDateTime, setDispatchDateTime] = useState("");
  const [dispatchTracking, setDispatchTracking] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [dispatchModalError, setDispatchModalError] = useState<string | null>(null);

  const [activeComplete, setActiveComplete] = useState<DeliveryListItem | null>(null);
  const [completeProofUrl, setCompleteProofUrl] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");

  const [activeCancel, setActiveCancel] = useState<DeliveryListItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [activePack, setActivePack] = useState<DeliveryListItem | null>(null);
  const [packNotes, setPackNotes] = useState("");

  const [activeInTransit, setActiveInTransit] = useState<DeliveryListItem | null>(null);
  const [inTransitNotes, setInTransitNotes] = useState("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Helper to determine next actions based on permissions
  const getAvailableActions = (delivery: DeliveryListItem) => {
    const valid = DELIVERY_STATUS_TRANSITIONS[delivery.status] || [];
    const actions: Array<{
      targetStatus: DeliveryStatus;
      label: string;
      color: string;
      handler: () => void;
    }> = [];

    // PACK action: eligible if status allows PACKED and user has permission
    if (valid.includes("PACKED") && (canPack || canDispatch || canCreate)) {
      actions.push({
        targetStatus: "PACKED",
        label: "Pack",
        color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200",
        handler: () => {
          setActivePack(delivery);
          setPackNotes("");
          setActionError(null);
        },
      });
    }

    // DISPATCH action: eligible if status allows DISPATCHED and user has canDispatch
    if (valid.includes("DISPATCHED") && canDispatch) {
      actions.push({
        targetStatus: "DISPATCHED",
        label: "Dispatch",
        color: "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200",
        handler: () => {
          setActiveDispatch(delivery);
          setDispatchVehicle(delivery.vehicle || "");
          setDispatchDriver(delivery.driver || "");
          setDispatchDriverPhone(delivery.driver_phone || "");
          setDispatchDateTime(
            delivery.dispatched_at
              ? format(new Date(delivery.dispatched_at), "yyyy-MM-dd'T'HH:mm")
              : format(new Date(), "yyyy-MM-dd'T'HH:mm")
          );
          setDispatchTracking(delivery.tracking_number || "");
          setDispatchNotes("");
          setDispatchModalError(null);
          setActionError(null);
        },
      });
    }

    // IN_TRANSIT action: eligible if status allows IN_TRANSIT
    if (valid.includes("IN_TRANSIT") && canDispatch) {
      actions.push({
        targetStatus: "IN_TRANSIT",
        label: "In Transit",
        color: "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200",
        handler: () => {
          setActiveInTransit(delivery);
          setInTransitNotes("");
          setActionError(null);
        },
      });
    }

    // DELIVERED action: eligible if status allows DELIVERED
    if (valid.includes("DELIVERED") && canComplete) {
      actions.push({
        targetStatus: "DELIVERED",
        label: "Mark Delivered",
        color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
        handler: () => {
          setActiveComplete(delivery);
          setCompleteProofUrl("");
          setCompleteNotes("");
          setActionError(null);
        },
      });
    }

    // CANCEL action: eligible if not already DELIVERED or CANCELLED
    if (
      canCancel &&
      delivery.status !== "DELIVERED" &&
      delivery.status !== "CANCELLED"
    ) {
      actions.push({
        targetStatus: "CANCELLED",
        label: "Cancel",
        color: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
        handler: () => {
          setActiveCancel(delivery);
          setCancelReason("");
          setActionError(null);
        },
      });
    }

    return actions;
  };

  // Dispatch action submission
  const handleConfirmDispatch = () => {
    if (!activeDispatch) return;
    setDispatchModalError(null);
    setActionError(null);

    const vehVal = validateAndNormalizeVehicleNumber(dispatchVehicle);
    if (!vehVal.isValid) {
      setDispatchModalError(vehVal.error || "Please enter a valid vehicle number.");
      return;
    }

    let normPhone: string | null = null;
    if (dispatchDriverPhone.trim()) {
      const phoneVal = validateDriverMobile(dispatchDriverPhone);
      if (!phoneVal.isValid) {
        setDispatchModalError(phoneVal.error || "Please enter a valid 10-digit driver mobile number.");
        return;
      }
      normPhone = phoneVal.normalized;
    }

    const deliveryId = activeDispatch.id;
    const deliveryNum = activeDispatch.delivery_number;
    const oldStatus = activeDispatch.status;
    const finalDispatchedAt = dispatchDateTime
      ? new Date(dispatchDateTime).toISOString()
      : new Date().toISOString();

    startTransition(async () => {
      try {
        await dispatchDelivery({
          delivery_id: deliveryId,
          vehicle: vehVal.normalized,
          driver: dispatchDriver.trim() || undefined,
          driver_phone: normPhone || undefined,
          dispatched_at: finalDispatchedAt,
          tracking_number: dispatchTracking.trim() || undefined,
          notes: dispatchNotes.trim() || undefined,
        });

        // Optimistic row update
        setItemsList((prev) =>
          prev.map((d) =>
            d.id === deliveryId
              ? {
                  ...d,
                  status: "DISPATCHED" as DeliveryStatus,
                  vehicle: vehVal.normalized,
                  driver: dispatchDriver.trim() || null,
                  driver_phone: normPhone,
                  tracking_number: dispatchTracking.trim() || null,
                  dispatched_at: finalDispatchedAt,
                }
              : d
          )
        );

        // Optimistic count update
        if (localCounts) {
          setLocalCounts((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (oldStatus in updated && updated[oldStatus as keyof DeliveryStatusCounts] > 0) {
              updated[oldStatus as keyof DeliveryStatusCounts]--;
            }
            updated.DISPATCHED++;
            return updated;
          });
        }

        setActiveDispatch(null);
        setActionSuccess(`Delivery ${deliveryNum} dispatched successfully!`);
        router.refresh();
      } catch (err) {
        setDispatchModalError(err instanceof Error ? err.message : "Failed to dispatch delivery");
      }
    });
  };

  // Complete action submission
  const handleConfirmComplete = () => {
    if (!activeComplete) return;
    setActionError(null);
    const deliveryId = activeComplete.id;
    const deliveryNum = activeComplete.delivery_number;
    const oldStatus = activeComplete.status;
    const now = new Date().toISOString();

    startTransition(async () => {
      try {
        await completeDelivery({
          delivery_id: deliveryId,
          proof_document_url: completeProofUrl.trim() || undefined,
          notes: completeNotes.trim() || undefined,
        });

        // Optimistic row update
        setItemsList((prev) =>
          prev.map((d) =>
            d.id === deliveryId
              ? {
                  ...d,
                  status: "DELIVERED" as DeliveryStatus,
                  delivered_at: now,
                }
              : d
          )
        );

        // Optimistic count update
        if (localCounts) {
          setLocalCounts((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (oldStatus in updated && updated[oldStatus as keyof DeliveryStatusCounts] > 0) {
              updated[oldStatus as keyof DeliveryStatusCounts]--;
            }
            updated.DELIVERED++;
            return updated;
          });
        }

        setActiveComplete(null);
        setActionSuccess(`Delivery ${deliveryNum} marked as DELIVERED!`);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to complete delivery");
      }
    });
  };

  // Cancel action submission
  const handleConfirmCancel = () => {
    if (!activeCancel) return;
    if (!cancelReason.trim()) {
      setActionError("Cancellation reason is required.");
      return;
    }
    setActionError(null);
    const deliveryId = activeCancel.id;
    const deliveryNum = activeCancel.delivery_number;
    const oldStatus = activeCancel.status;

    startTransition(async () => {
      try {
        await cancelDelivery({
          delivery_id: deliveryId,
          reason: cancelReason.trim(),
        });

        // Optimistic row update
        setItemsList((prev) =>
          prev.map((d) =>
            d.id === deliveryId
              ? {
                  ...d,
                  status: "CANCELLED" as DeliveryStatus,
                }
              : d
          )
        );

        // Optimistic count update
        if (localCounts) {
          setLocalCounts((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (oldStatus in updated && updated[oldStatus as keyof DeliveryStatusCounts] > 0) {
              updated[oldStatus as keyof DeliveryStatusCounts]--;
            }
            updated.CANCELLED++;
            return updated;
          });
        }

        setActiveCancel(null);
        setActionSuccess(`Delivery ${deliveryNum} cancelled.`);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to cancel delivery");
      }
    });
  };

  // Pack action submission
  const handleConfirmPack = () => {
    if (!activePack) return;
    setActionError(null);
    const deliveryId = activePack.id;
    const deliveryNum = activePack.delivery_number;

    startTransition(async () => {
      try {
        await packDelivery({
          delivery_id: deliveryId,
          notes: packNotes.trim() || undefined,
        });

        // Optimistic row update
        setItemsList((prev) =>
          prev.map((d) =>
            d.id === deliveryId
              ? {
                  ...d,
                  status: "PACKED" as DeliveryStatus,
                }
              : d
          )
        );

        // Optimistic count update
        if (localCounts) {
          setLocalCounts((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              READY: Math.max(0, prev.READY - 1),
              PACKED: prev.PACKED + 1,
            };
          });
        }

        setActivePack(null);
        setActionSuccess(`Delivery ${deliveryNum} marked as PACKED.`);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to pack delivery");
      }
    });
  };

  // In Transit action submission
  const handleConfirmInTransit = () => {
    if (!activeInTransit) return;
    setActionError(null);
    const deliveryId = activeInTransit.id;
    const deliveryNum = activeInTransit.delivery_number;

    startTransition(async () => {
      try {
        await markDeliveryInTransit({
          delivery_id: deliveryId,
          notes: inTransitNotes.trim() || undefined,
        });

        // Optimistic row update
        setItemsList((prev) =>
          prev.map((d) =>
            d.id === deliveryId
              ? {
                  ...d,
                  status: "IN_TRANSIT" as DeliveryStatus,
                }
              : d
          )
        );

        // Optimistic count update
        if (localCounts) {
          setLocalCounts((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              DISPATCHED: Math.max(0, prev.DISPATCHED - 1),
              IN_TRANSIT: prev.IN_TRANSIT + 1,
            };
          });
        }

        setActiveInTransit(null);
        setActionSuccess(`Delivery ${deliveryNum} marked as IN TRANSIT.`);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to mark delivery in transit");
      }
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">{actionError}</div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-800 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-3 shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <div className="flex-1">{actionSuccess}</div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Control Bar: Filters, Search & Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const sp = new URLSearchParams(searchParams?.toString() || "");
              if (searchText.trim()) {
                sp.set("q", searchText.trim());
              } else {
                sp.delete("q");
              }
              sp.set("page", "1");
              router.push(`/delivery?${sp.toString()}`);
            }}
            className="relative flex-1 max-w-md"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by delivery #, tracking, vehicle, driver..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => {
                  setSearchText("");
                  const sp = new URLSearchParams(searchParams?.toString() || "");
                  sp.delete("q");
                  sp.set("page", "1");
                  router.push(`/delivery?${sp.toString()}`);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ×
              </button>
            )}
          </form>

          {canCreate && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Delivery</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-2.5 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mr-1">Status:</span>
          <button
            onClick={() => handleStatusChange(undefined)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              !currentStatus
                ? "bg-[#0F766E] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All ({localCounts?.ALL ?? totalCount})
          </button>
          {STATUS_FILTER_ORDER.map((st) => (
            <button
              key={st}
              onClick={() => handleStatusChange(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                currentStatus === st
                  ? "bg-[#0F766E] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {DELIVERY_STATUS_LABELS[st]} ({localCounts?.[st] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Mobile View: Cards (< 768px) */}
      <div className="block md:hidden space-y-4">
        {itemsList.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
            <Package className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="font-semibold text-sm text-slate-700">No deliveries found</p>
            <p className="text-xs text-slate-500 mt-1">There are no deliveries matching the selected criteria.</p>
          </div>
        ) : (
          itemsList.map((delivery) => {
            const actions = getAvailableActions(delivery);
            return (
              <div
                key={delivery.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/delivery/${delivery.id}`}
                      className="font-mono text-sm font-bold text-[#142B3B] hover:text-[#0F766E] flex items-center gap-1.5"
                    >
                      <span>{delivery.delivery_number}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Order:{" "}
                      <Link
                        href={`/orders/${delivery.order_id}`}
                        className="font-mono text-slate-700 hover:text-[#0F766E] font-medium"
                      >
                        {delivery.order_number}
                      </Link>{" "}
                      • {delivery.customer_name ?? "No Customer"}
                      {delivery.invoice_number && (
                        <span className="block text-[11px] font-mono text-slate-600 mt-0.5">
                          Invoice: {delivery.invoice_number}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      DELIVERY_STATUS_COLORS[delivery.status]
                    }`}
                  >
                    {DELIVERY_STATUS_LABELS[delivery.status]}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Expected Date</span>
                    <span className="font-medium text-slate-800">
                      {delivery.expected_delivery_date
                        ? format(new Date(delivery.expected_delivery_date), "MMM d, yyyy")
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Tracking #</span>
                    <span className="font-mono font-medium text-slate-800">
                      {delivery.tracking_number ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Vehicle / Driver</span>
                    <span className="font-medium text-slate-800 truncate block">
                      {delivery.vehicle || delivery.driver ? (
                        <>
                          {delivery.vehicle ?? ""}{" "}
                          {delivery.driver ? `(${delivery.driver})` : ""}
                          {delivery.driver_phone ? ` • 📞 ${delivery.driver_phone}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Dispatched At</span>
                    <span className="font-medium text-slate-800">
                      {delivery.dispatched_at
                        ? format(new Date(delivery.dispatched_at), "MMM d, HH:mm")
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  {canView && (
                    <Link
                      href={`/delivery/${delivery.id}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      View
                    </Link>
                  )}
                  {actions.map((act) => (
                    <button
                      key={act.targetStatus}
                      onClick={act.handler}
                      disabled={isPending}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${act.color}`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop View: Table (>= 768px) */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" role="table">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Delivery #</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Expected Delivery</th>
                <th className="px-4 py-3 font-semibold">Tracking #</th>
                <th className="px-4 py-3 font-semibold">Vehicle / Driver</th>
                <th className="px-4 py-3 font-semibold">Dispatched</th>
                <th className="px-4 py-3 font-semibold">Delivered</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {itemsList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-700">No deliveries found</p>
                    <p className="text-xs text-slate-500 mt-0.5">Deliveries created for completed orders will appear here.</p>
                  </td>
                </tr>
              ) : (
                itemsList.map((delivery) => {
                  const actions = getAvailableActions(delivery);
                  return (
                    <tr key={delivery.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {canView ? (
                          <Link
                            href={`/delivery/${delivery.id}`}
                            className="hover:text-[#0F766E] transition hover:underline"
                          >
                            {delivery.delivery_number}
                          </Link>
                        ) : (
                          delivery.delivery_number
                        )}
                        {delivery.invoice_number && (
                          <span className="block text-[11px] font-mono font-normal text-slate-500">
                            Inv: {delivery.invoice_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">
                        <Link
                          href={`/orders/${delivery.order_id}`}
                          className="hover:text-[#0F766E] transition hover:underline"
                        >
                          {delivery.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{delivery.customer_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            DELIVERY_STATUS_COLORS[delivery.status]
                          }`}
                        >
                          {DELIVERY_STATUS_LABELS[delivery.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.expected_delivery_date
                          ? format(new Date(delivery.expected_delivery_date), "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{delivery.tracking_number ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.vehicle || delivery.driver ? (
                          <span>
                            {delivery.vehicle ?? ""} {delivery.driver ? `(${delivery.driver})` : ""}
                            {delivery.driver_phone && (
                              <span className="text-[11px] text-slate-400 block">📞 {delivery.driver_phone}</span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.dispatched_at
                          ? format(new Date(delivery.dispatched_at), "MMM d, yyyy HH:mm")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {delivery.delivered_at
                          ? format(new Date(delivery.delivered_at), "MMM d, yyyy HH:mm")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {canView && (
                            <Link
                              href={`/delivery/${delivery.id}`}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                              View
                            </Link>
                          )}
                          {actions.map((act) => (
                            <button
                              key={act.targetStatus}
                              onClick={act.handler}
                              disabled={isPending}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${act.color}`}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-xs text-slate-600">
          <p>
            Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> (
            <strong>{totalCount}</strong> total records)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isPending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isPending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {activeDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Truck className="w-5 h-5 text-purple-600" />
              <h3>Dispatch Delivery — {activeDispatch.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Enter vehicle, driver, and tracking details. Finished goods inventory will be deducted exactly once upon dispatch.
            </p>

            {dispatchModalError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="flex-1">{dispatchModalError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vehicle / Truck # <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={dispatchVehicle}
                  onChange={(e) => setDispatchVehicle(e.target.value)}
                  placeholder="e.g. MH12AB1234 or TRUCK-42"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none uppercase font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Driver Name</label>
                  <input
                    type="text"
                    value={dispatchDriver}
                    onChange={(e) => setDispatchDriver(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Driver Phone</label>
                  <input
                    type="tel"
                    value={dispatchDriverPhone}
                    onChange={(e) => setDispatchDriverPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Date & Time</label>
                  <input
                    type="datetime-local"
                    value={dispatchDateTime}
                    onChange={(e) => setDispatchDateTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    value={dispatchTracking}
                    onChange={(e) => setDispatchTracking(e.target.value)}
                    placeholder="e.g. TRK-987654321"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Notes</label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional gate-pass or departure notes..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveDispatch(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Truck className="w-3.5 h-3.5" />
                    <span>Confirm Dispatch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pack Modal */}
      {activePack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Pack Delivery — {activePack.delivery_number}
            </h3>
            <p className="text-xs text-slate-600">
              Confirm that items for this delivery are packed and prepared for dispatch.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Packaging Notes (Optional)</label>
              <textarea
                value={packNotes}
                onChange={(e) => setPackNotes(e.target.value)}
                rows={2}
                placeholder="Box count, seal numbers, etc..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setActivePack(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPack}
                disabled={isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {isPending ? "Packing..." : "Confirm Packed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In Transit Modal */}
      {activeInTransit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Mark In Transit — {activeInTransit.delivery_number}
            </h3>
            <p className="text-xs text-slate-600">
              Update shipment status to IN_TRANSIT to indicate it has departed and is en route.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transit Notes (Optional)</label>
              <textarea
                value={inTransitNotes}
                onChange={(e) => setInTransitNotes(e.target.value)}
                rows={2}
                placeholder="Location update or transit notes..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setActiveInTransit(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmInTransit}
                disabled={isPending}
                className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700"
              >
                {isPending ? "Updating..." : "Confirm In Transit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete (Mark Delivered) Modal */}
      {activeComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3>Confirm Delivery — {activeComplete.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Mark this shipment as DELIVERED. Timestamp will be saved. Inventory is not deducted again.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proof of Delivery URL (Optional)
                </label>
                <input
                  type="url"
                  value={completeProofUrl}
                  onChange={(e) => setCompleteProofUrl(e.target.value)}
                  placeholder="https://example.com/receipt-or-signature.pdf"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Delivery Notes (Optional)
                </label>
                <textarea
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  rows={2}
                  placeholder="Received by contact name, gate signature, etc..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveComplete(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Completing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Complete Delivery</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {activeCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-base">
              <XCircle className="w-5 h-5 text-rose-600" />
              <h3>Cancel Delivery — {activeCancel.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to cancel delivery <strong className="font-mono text-slate-800">{activeCancel.delivery_number}</strong>?
              {["DISPATCHED", "IN_TRANSIT"].includes(activeCancel.status)
                ? " Finished goods inventory will be returned to stock."
                : " Delivery has not departed; stock reservations will be maintained."}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cancellation Reason *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                required
                placeholder="Reason for cancelling this delivery..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveCancel(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isPending || !cancelReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Cancellation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create Delivery Modal */}
      {canCreate && (
        <CreateDeliveryModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          customers={customers || []}
          onSuccess={(res) => {
            setActionSuccess(res.message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}