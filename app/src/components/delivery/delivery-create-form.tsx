"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Package, Truck, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { createDeliveryFromOrder } from "@/lib/delivery/actions";
import type { EligibleDeliveryOrder } from "@/types/delivery";

interface DeliveryCreateFormProps {
  eligibleOrders: EligibleDeliveryOrder[];
  preselectedOrderId?: string;
}

export function DeliveryCreateForm({
  eligibleOrders,
  preselectedOrderId,
}: DeliveryCreateFormProps) {
  const router = useRouter();

  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    preselectedOrderId && eligibleOrders.some((o) => o.id === preselectedOrderId)
      ? preselectedOrderId
      : eligibleOrders[0]?.id || ""
  );

  const selectedOrder = eligibleOrders.find((o) => o.id === selectedOrderId);

  const [deliveryNumber, setDeliveryNumber] = useState<string>(() => {
    if (selectedOrder) {
      return `DEL-${selectedOrder.order_number}-${Date.now().toString(36).toUpperCase()}`;
    }
    return `DEL-${Date.now().toString(36).toUpperCase()}`;
  });

  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    const order = eligibleOrders.find((o) => o.id === orderId);
    if (order) {
      setDeliveryNumber(`DEL-${order.order_number}-${Date.now().toString(36).toUpperCase()}`);
    }
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) {
      setError("Please select an order for delivery.");
      return;
    }
    if (!deliveryNumber.trim()) {
      setError("Delivery number is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await createDeliveryFromOrder({
        order_id: selectedOrderId,
        delivery_number: deliveryNumber.trim(),
        notes: notes.trim() || undefined,
      });

      setSuccessMessage("Delivery created successfully! Redirecting...");
      setTimeout(() => {
        router.push(`/delivery/${res.delivery_id}`);
        router.refresh();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create delivery");
      setIsSubmitting(false);
    }
  };

  if (eligibleOrders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Truck className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">No Eligible Orders for Delivery</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
          Delivery creation is only permitted when an order is in <strong>CONFIRMED</strong> status and{" "}
          <strong>all required items are production-complete</strong>. Orders with existing active deliveries are also excluded.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Check Orders
          </Link>
          <Link
            href="/production"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0D655E] transition"
          >
            View Production Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      {/* Select Order Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
            Select Order to Deliver *
          </label>
          <select
            value={selectedOrderId}
            onChange={(e) => handleOrderChange(e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
          >
            {eligibleOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.order_number} — {order.customer_name ?? "No Customer"} (
                {order.items.length} item{order.items.length === 1 ? "" : "s"})
                {order.expected_delivery_date ? ` • Expected: ${order.expected_delivery_date}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Order Items Preview */}
        {selectedOrder && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
              Order Items Ready for Dispatch ({selectedOrder.items.length})
            </h4>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 font-semibold">SKU</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Quantity</th>
                      <th className="px-4 py-2.5 font-semibold">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{item.product_name}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{item.product_sku ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          {item.quantity.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delivery Details Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
            Delivery Number *
          </label>
          <input
            type="text"
            value={deliveryNumber}
            onChange={(e) => setDeliveryNumber(e.target.value)}
            disabled={isSubmitting}
            required
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            placeholder="DEL-ORD-001"
          />
          <p className="text-xs text-slate-500 mt-1">Unique identifier for tracking this delivery parcel</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
            Dispatch Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
            rows={3}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            placeholder="Delivery instructions, gate pass info, or packaging comments..."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/delivery"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting || !selectedOrderId || !deliveryNumber.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating Delivery...</span>
            </>
          ) : (
            <>
              <Package className="w-4 h-4" />
              <span>Create Delivery</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
