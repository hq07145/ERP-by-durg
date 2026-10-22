"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ExternalLink,
} from "lucide-react";
import type {
  DeliveryWithDetails,
  DeliveryItem,
  DeliveryStatusHistory,
  DeliveryStatus,
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

interface DeliveryDetailProps {
  delivery: DeliveryWithDetails;
  statusHistory: DeliveryStatusHistory[];
  canEdit: boolean;
  canDispatch: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canPack: boolean;
}

export function DeliveryDetail({
  delivery,
  statusHistory,
  canEdit,
  canDispatch,
  canComplete,
  canCancel,
  canPack,
}: DeliveryDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Action Modals State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchVehicle, setDispatchVehicle] = useState(delivery.vehicle || "");
  const [dispatchDriver, setDispatchDriver] = useState(delivery.driver || "");
  const [dispatchTracking, setDispatchTracking] = useState(delivery.tracking_number || "");
  const [dispatchNotes, setDispatchNotes] = useState("");

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [proofUrl, setProofUrl] = useState(delivery.proof_document_url || "");
  const [completeNotes, setCompleteNotes] = useState("");

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showPackModal, setShowPackModal] = useState(false);
  const [packNotes, setPackNotes] = useState("");

  const [showInTransitModal, setShowInTransitModal] = useState(false);
  const [inTransitNotes, setInTransitNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Determine allowed transitions
  const validTransitions = DELIVERY_STATUS_TRANSITIONS[delivery.status] || [];

  const handleConfirmDispatch = () => {
    setError(null);
    startTransition(async () => {
      try {
        await dispatchDelivery({
          delivery_id: delivery.id,
          vehicle: dispatchVehicle.trim() || undefined,
          driver: dispatchDriver.trim() || undefined,
          tracking_number: dispatchTracking.trim() || undefined,
          notes: dispatchNotes.trim() || undefined,
        });
        setShowDispatchModal(false);
        setSuccessMessage("Delivery dispatched successfully! Finished goods inventory deducted.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to dispatch delivery");
      }
    });
  };

  const handleConfirmComplete = () => {
    setError(null);
    startTransition(async () => {
      try {
        await completeDelivery({
          delivery_id: delivery.id,
          proof_document_url: proofUrl.trim() || undefined,
          notes: completeNotes.trim() || undefined,
        });
        setShowCompleteModal(false);
        setSuccessMessage("Delivery marked as DELIVERED!");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete delivery");
      }
    });
  };

  const handleConfirmCancel = () => {
    if (!cancelReason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await cancelDelivery({
          delivery_id: delivery.id,
          reason: cancelReason.trim(),
        });
        setShowCancelModal(false);
        setSuccessMessage("Delivery cancelled successfully.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cancel delivery");
      }
    });
  };

  const handleConfirmPack = () => {
    setError(null);
    startTransition(async () => {
      try {
        await packDelivery({
          delivery_id: delivery.id,
          notes: packNotes.trim() || undefined,
        });
        setShowPackModal(false);
        setSuccessMessage("Delivery status updated to PACKED.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pack delivery");
      }
    });
  };

  const handleConfirmInTransit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await markDeliveryInTransit({
          delivery_id: delivery.id,
          notes: inTransitNotes.trim() || undefined,
        });
        setShowInTransitModal(false);
        setSuccessMessage("Delivery marked as IN TRANSIT.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mark in transit");
      }
    });
  };

  const totalOrdered = delivery.items.reduce((sum, it) => sum + Number(it.ordered_quantity), 0);
  const totalDelivered = delivery.items.reduce((sum, it) => sum + Number(it.delivered_quantity), 0);
  const progressPercent = totalOrdered > 0 ? Math.min(100, Math.round((totalDelivered / totalOrdered) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-3 shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <div className="flex-1">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Delivery Info Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-2xl font-bold text-[#142B3B]">{delivery.delivery_number}</span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                  DELIVERY_STATUS_COLORS[delivery.status]
                }`}
              >
                {DELIVERY_STATUS_LABELS[delivery.status]}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Order:{" "}
              <Link
                href={`/orders/${delivery.order_id}`}
                className="font-mono font-semibold text-[#0F766E] hover:underline"
              >
                {delivery.order_number}
              </Link>{" "}
              • Customer: <strong className="text-slate-700">{delivery.customer_name ?? "No Customer"}</strong>
            </p>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold font-mono text-slate-900">
              {totalDelivered.toLocaleString()} / {totalOrdered.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">Items Fulfilled</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
            <span>Fulfillment Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0F766E] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Shipment Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-lg">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Expected Delivery
            </span>
            <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
              {delivery.expected_delivery_date
                ? format(new Date(delivery.expected_delivery_date), "MMM d, yyyy")
                : "—"}
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Tracking Number
            </span>
            <span className="font-mono font-semibold text-slate-800 text-sm mt-0.5 block">
              {delivery.tracking_number ?? "—"}
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Vehicle
            </span>
            <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
              {delivery.vehicle ?? "—"}
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Driver
            </span>
            <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
              {delivery.driver ?? "—"}
            </span>
          </div>
        </div>

        {/* Timestamps & Proof Documents */}
        {(delivery.dispatched_at || delivery.delivered_at || delivery.proof_document_url) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Dispatched Timestamp
              </span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {delivery.dispatched_at
                  ? format(new Date(delivery.dispatched_at), "MMM d, yyyy HH:mm")
                  : "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Delivered Timestamp
              </span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {delivery.delivered_at
                  ? format(new Date(delivery.delivered_at), "MMM d, yyyy HH:mm")
                  : "—"}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Proof of Delivery
              </span>
              {delivery.proof_document_url ? (
                <a
                  href={delivery.proof_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#0F766E] hover:underline flex items-center gap-1 mt-0.5"
                >
                  <span>View Document</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-slate-500 mt-0.5 block">—</span>
              )}
            </div>
          </div>
        )}

        {delivery.notes && (
          <div className="p-3.5 bg-slate-50 rounded-lg text-xs border border-slate-100">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
              Delivery Notes
            </span>
            <p className="text-slate-700">{delivery.notes}</p>
          </div>
        )}

        {/* Permitted Action Buttons */}
        {validTransitions.length > 0 && (
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Status Actions:
            </span>
            <div className="flex flex-wrap gap-2">
              {validTransitions.includes("PACKED") && (canDispatch || canPack) && (
                <button
                  type="button"
                  onClick={() => setShowPackModal(true)}
                  disabled={isPending}
                  className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-50"
                >
                  Mark as Packed
                </button>
              )}

              {validTransitions.includes("DISPATCHED") && canDispatch && (
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition disabled:opacity-50"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Dispatch Shipment</span>
                </button>
              )}

              {validTransitions.includes("IN_TRANSIT") && canDispatch && (
                <button
                  type="button"
                  onClick={() => setShowInTransitModal(true)}
                  disabled={isPending}
                  className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
                >
                  Mark In Transit
                </button>
              )}

              {validTransitions.includes("DELIVERED") && canComplete && (
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete Delivery</span>
                </button>
              )}

              {validTransitions.includes("CANCELLED") && canCancel && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  disabled={isPending}
                  className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                >
                  Cancel Delivery
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delivery Items Section */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            Delivery Items ({delivery.items.length})
          </h3>
        </div>

        {/* Mobile items view (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {delivery.items.map((item) => {
            const ordered = Number(item.ordered_quantity);
            const delivered = Number(item.delivered_quantity);
            const isComplete = delivered >= ordered;
            return (
              <div key={item.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-xs text-slate-900">{item.product_name}</p>
                    <p className="text-[10px] font-mono text-slate-500">SKU: {item.product_sku ?? "—"}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isComplete ? "Fulfilled" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded">
                  <span>Ordered: <strong className="font-mono">{ordered.toLocaleString()}</strong> {item.unit}</span>
                  <span>Delivered: <strong className="font-mono text-emerald-700">{delivered.toLocaleString()}</strong> {item.unit}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop items table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs" role="table">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold text-right">Ordered</th>
                <th className="px-4 py-3 font-semibold text-right">Delivered</th>
                <th className="px-4 py-3 font-semibold">Unit</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {delivery.items.map((item) => {
                const ordered = Number(item.ordered_quantity);
                const delivered = Number(item.delivered_quantity);
                const isComplete = delivered >= ordered;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.product_name}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{item.product_sku ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{ordered.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{delivered.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          isComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isComplete ? "Fulfilled" : "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status History Audit Trail */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800">
            Delivery Status History ({statusHistory.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {statusHistory.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No status updates recorded yet.</div>
          ) : (
            statusHistory.map((entry) => (
              <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      DELIVERY_STATUS_COLORS[entry.new_status as DeliveryStatus]
                    }`}
                  >
                    {DELIVERY_STATUS_LABELS[entry.new_status as DeliveryStatus]}
                  </span>
                  {entry.old_status && (
                    <span className="text-xs text-slate-400">
                      from {DELIVERY_STATUS_LABELS[entry.old_status as DeliveryStatus]}
                    </span>
                  )}
                  {entry.reason && (
                    <span className="text-xs text-slate-600 italic">"{entry.reason}"</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-purple-700 font-bold text-base">
              <Truck className="w-5 h-5" />
              <h3>Dispatch Delivery — {delivery.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Deducts finished goods inventory and sets dispatch timestamp.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle / Truck #</label>
                <input
                  type="text"
                  value={dispatchVehicle}
                  onChange={(e) => setDispatchVehicle(e.target.value)}
                  placeholder="e.g. TRUCK-42 or Van #3"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>

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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={dispatchTracking}
                  onChange={(e) => setDispatchTracking(e.target.value)}
                  placeholder="e.g. TRK-987654321"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  rows={2}
                  placeholder="Dispatch instructions or driver notes..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isPending ? "Dispatching..." : "Confirm Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-base">
              <CheckCircle2 className="w-5 h-5" />
              <h3>Complete Delivery — {delivery.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Mark shipment as DELIVERED and record delivery timestamp.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proof of Delivery URL (Optional)
                </label>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://example.com/proof.pdf"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Completion Notes (Optional)
                </label>
                <textarea
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  rows={2}
                  placeholder="Recipient notes or remarks..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isPending ? "Completing..." : "Complete Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
              <XCircle className="w-5 h-5" />
              <h3>Cancel Delivery — {delivery.delivery_number}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Provide reason for cancelling. If dispatched, inventory will be restored.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                required
                placeholder="Reason for cancellation..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isPending || !cancelReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isPending ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pack Modal */}
      {showPackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Pack Delivery — {delivery.delivery_number}
            </h3>
            <p className="text-xs text-slate-600">Confirm items are packed.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <textarea
                value={packNotes}
                onChange={(e) => setPackNotes(e.target.value)}
                rows={2}
                placeholder="Packaging notes..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowPackModal(false)}
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
      {showInTransitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              Mark In Transit — {delivery.delivery_number}
            </h3>
            <p className="text-xs text-slate-600">Mark shipment as in transit.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <textarea
                value={inTransitNotes}
                onChange={(e) => setInTransitNotes(e.target.value)}
                rows={2}
                placeholder="Transit updates..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowInTransitModal(false)}
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
    </div>
  );
}