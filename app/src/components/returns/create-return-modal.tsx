"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  RotateCcw,
  AlertCircle,
  Package,
  PackageCheck,
  PackageX,
  Wrench,
  Trash2,
  FileText,
  Truck,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { createGoodsReturnAction, getCustomerDeliveredOrders, getReturnProducts } from "@/lib/returns/actions";
import type { ProductCondition, AdjustmentType } from "@/types/returns";

interface CustomerOption {
  id: string;
  name: string;
  company_name: string | null;
}

interface CreateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerOption[];
  preselectedOrderId?: string;
  preselectedCustomerId?: string;
}

export function CreateReturnModal({
  isOpen,
  onClose,
  customers,
  preselectedOrderId,
  preselectedCustomerId,
}: CreateReturnModalProps) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [orderId, setOrderId] = useState(preselectedOrderId || "");
  const [deliveryId, setDeliveryId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [productId, setProductId] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [returnedQuantity, setReturnedQuantity] = useState<number | "">("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [productCondition, setProductCondition] = useState<ProductCondition>("SALEABLE");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("CREDIT_NOTE");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | "">("");
  const [allowOverride, setAllowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [selectedOrderItem, setSelectedOrderItem] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load customer orders when customer changes
  useEffect(() => {
    if (!customerId) {
      setCustomerOrders([]);
      return;
    }

    setLoadingOrders(true);
    getCustomerDeliveredOrders(customerId)
      .then((orders) => {
        setCustomerOrders(orders);
        if (preselectedOrderId) {
          const match = orders.find((o: any) => o.id === preselectedOrderId);
          if (match) {
            setOrderId(match.id);
            if (match.deliveries?.length > 0) {
              setDeliveryId(match.deliveries[0].id);
              setInvoiceNumber(match.deliveries[0].invoice_number || "");
            }
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load customer orders:", err);
      })
      .finally(() => {
        setLoadingOrders(false);
      });
  }, [customerId, preselectedOrderId]);

  // Load product catalog for direct product selection
  useEffect(() => {
    getReturnProducts().then(setAllProducts).catch(console.error);
  }, []);

  // When order selection changes
  const handleOrderChange = (newOrderId: string) => {
    setOrderId(newOrderId);
    setOrderItemId("");
    setSelectedOrderItem(null);

    const ord = customerOrders.find((o) => o.id === newOrderId);
    if (ord && ord.deliveries?.length > 0) {
      setDeliveryId(ord.deliveries[0].id);
      setInvoiceNumber(ord.deliveries[0].invoice_number || "");
    } else {
      setDeliveryId("");
      setInvoiceNumber("");
    }
  };

  // Dynamically compute effective delivered, returned, and maximum eligible returnable quantity
  const getDynamicReturnLimits = () => {
    if (!selectedOrderItem) {
      return { delivered: 0, returned: 0, pending: 0, max: 0, unit: "units" };
    }

    const ord = customerOrders.find((o) => o.id === orderId);
    if (deliveryId && ord) {
      const del = ord.deliveries?.find((d: any) => d.id === deliveryId);
      const delItem = del?.items?.find((di: any) => di.order_item_id === orderItemId);
      if (delItem) {
        return {
          delivered: Number(delItem.delivered_quantity || 0),
          returned: Number(delItem.already_returned_quantity || 0),
          pending: Number(delItem.pending_returned_quantity || 0),
          max: Number(delItem.max_return_quantity || 0),
          unit: selectedOrderItem.unit || "units",
        };
      }
    }

    // Fallback to order item totals across all valid deliveries
    return {
      delivered: Number(selectedOrderItem.delivered_quantity || 0),
      returned: Number(selectedOrderItem.already_returned_quantity || 0),
      pending: Number(selectedOrderItem.pending_returned_quantity || 0),
      max: Number(selectedOrderItem.max_return_quantity || 0),
      unit: selectedOrderItem.unit || "units",
    };
  };

  const returnLimits = getDynamicReturnLimits();

  // When order item selection changes
  const handleOrderItemChange = (newOrderItemId: string) => {
    setOrderItemId(newOrderItemId);
    const ord = customerOrders.find((o) => o.id === orderId);
    const item = ord?.items?.find((it: any) => it.id === newOrderItemId);
    setSelectedOrderItem(item || null);

    if (item) {
      setProductId(item.product_id);
      let calculatedMax = item.max_return_quantity;
      if (deliveryId) {
        const del = ord?.deliveries?.find((d: any) => d.id === deliveryId);
        const delItem = del?.items?.find((di: any) => di.order_item_id === newOrderItemId);
        if (delItem) {
          calculatedMax = delItem.max_return_quantity;
        }
      }
      if (!returnedQuantity || Number(returnedQuantity) <= 0) {
        setReturnedQuantity(calculatedMax > 0 ? calculatedMax : 1);
      }
      if (item.unit_price) {
        const qty = Number(returnedQuantity) || (calculatedMax > 0 ? calculatedMax : 1);
        setAdjustmentAmount(Number((qty * item.unit_price).toFixed(2)));
      }
    }
  };

  // Auto-calculate adjustment amount when quantity or item changes
  useEffect(() => {
    if (selectedOrderItem && typeof returnedQuantity === "number") {
      setAdjustmentAmount(Number((returnedQuantity * (selectedOrderItem.unit_price || 0)).toFixed(2)));
    }
  }, [returnedQuantity, selectedOrderItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!customerId) {
      setError("Please select a customer.");
      return;
    }
    if (!productId) {
      setError("Please select a product/SKU to return.");
      return;
    }
    if (!returnedQuantity || Number(returnedQuantity) <= 0) {
      setError("Return quantity must be greater than zero.");
      return;
    }
    if (selectedOrderItem && Number(returnedQuantity) > returnLimits.max) {
      if (!allowOverride) {
        setError(
          `Returned quantity (${returnedQuantity} ${returnLimits.unit}) exceeds eligible returnable quantity (${returnLimits.max} ${returnLimits.unit}) for this item. Delivered: ${returnLimits.delivered}, posted returned: ${returnLimits.returned}${returnLimits.pending > 0 ? `, pending approval: ${returnLimits.pending}` : ""}. Enable Authorized Override to proceed.`
        );
        return;
      }
      if (!overrideReason.trim()) {
        setError("Authorized override reason is required when return quantity exceeds eligible returnable quantity.");
        return;
      }
    }
    if (!reason.trim()) {
      setError("Please specify the return reason.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createGoodsReturnAction({
        customer_id: customerId,
        order_id: orderId || null,
        delivery_id: deliveryId || null,
        invoice_number: invoiceNumber || null,
        product_id: productId,
        order_item_id: orderItemId || null,
        returned_quantity: Number(returnedQuantity),
        product_condition: productCondition,
        reason: reason.trim(),
        notes: notes.trim() || null,
        adjustment_type: adjustmentType,
        adjustment_amount: typeof adjustmentAmount === "number" ? adjustmentAmount : 0,
        return_date: returnDate,
        allow_override: allowOverride,
        override_reason: allowOverride ? overrideReason.trim() : null,
      });

      setSuccessMsg(`Return ${(result as any)?.return_number || ""} created successfully!`);
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err?.message || "Failed to create return record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentOrder = customerOrders.find((o) => o.id === orderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Create Goods Return</h2>
              <p className="text-xs text-slate-400">
                Log a customer return for physical inspection and credit adjustments
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Return Number Preview & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Return Number (Auto-Generated)
              </label>
              <div className="font-mono text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 select-none">
                RET-{currentYear}-XXXXXX
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Return Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer <span className="text-rose-500">*</span>
            </label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name ? `${c.company_name} (${c.name})` : c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Linked Order & Delivery (Optional Context) */}
          {customerId && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Order & Delivery Reference (Optional)
                </span>
                {loadingOrders && <span className="text-xs text-slate-400">Loading orders...</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Original Order</label>
                  <select
                    value={orderId}
                    onChange={(e) => handleOrderChange(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Standalone / Unlinked --</option>
                    {customerOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_number} ({new Date(o.order_date).toLocaleDateString()}) - ₹
                        {Number(o.total_amount).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Invoice / Delivery #</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Invoice #"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-1/2 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    {currentOrder?.deliveries?.length > 0 ? (
                      <select
                        value={deliveryId}
                        onChange={(e) => setDeliveryId(e.target.value)}
                        className="w-1/2 text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select Delivery</option>
                        {currentOrder.deliveries.map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.delivery_number}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Delivery Ref"
                        value={deliveryId ? "Linked" : ""}
                        disabled
                        className="w-1/2 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-400"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Order Line Items if order selected */}
              {currentOrder && currentOrder.items?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Delivered Line Item
                  </label>
                  <select
                    value={orderItemId}
                    onChange={(e) => handleOrderItemChange(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Order Item --</option>
                    {currentOrder.items.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.product_name} ({it.sku || "No SKU"}) | Delivered: {it.delivered_quantity} {it.unit} | Max Return: {it.max_return_quantity} {it.unit} | ₹{it.unit_price}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* SKU Quantity Breakdown Card */}
          {selectedOrderItem && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-teal-900">
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-teal-700" />
                  <span>Item Return Availability — {selectedOrderItem.product_name}</span>
                </span>
                <span className="font-mono text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-bold border border-teal-200">
                  Max Eligible: {returnLimits.max.toLocaleString()} {returnLimits.unit}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                <div className="bg-white p-2 rounded-lg border border-teal-100/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Ordered</span>
                  <span className="font-mono font-semibold text-slate-800">{Number(selectedOrderItem.ordered_quantity).toLocaleString()} {returnLimits.unit}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-teal-100/80 shadow-2xs">
                  <span className="text-[10px] text-slate-500 block uppercase font-medium">Delivered</span>
                  <span className="font-mono font-bold text-teal-700">{returnLimits.delivered.toLocaleString()} {returnLimits.unit}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-teal-100/80 shadow-2xs">
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Prev Returned</span>
                  <span className={`font-mono font-semibold ${returnLimits.returned > 0 ? "text-rose-600" : "text-slate-400"}`}>
                    {returnLimits.returned.toLocaleString()} {returnLimits.unit}
                  </span>
                  {returnLimits.pending > 0 && (
                    <span className="text-[9px] text-amber-600 font-medium block">
                      +{returnLimits.pending.toLocaleString()} pending
                    </span>
                  )}
                </div>
                <div className="bg-white p-2 rounded-lg border border-teal-200 shadow-2xs">
                  <span className="text-[10px] text-teal-700 block uppercase font-bold">Max Returnable</span>
                  <span className="font-mono font-bold text-teal-800">{returnLimits.max.toLocaleString()} {returnLimits.unit}</span>
                </div>
              </div>
            </div>
          )}

          {/* Product and Quantity Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product / SKU <span className="text-rose-500">*</span>
              </label>
              {orderItemId && selectedOrderItem ? (
                <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-800">
                  {selectedOrderItem.product_name} ({selectedOrderItem.sku || "SKU"})
                </div>
              ) : (
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  <option value="">-- Choose Product --</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku || "SKU"}) - ₹{p.selling_price}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Return Quantity <span className="text-rose-500">*</span>
                </label>
                {selectedOrderItem && (
                  <span className="text-xs text-slate-500 font-mono">
                    Max: <strong>{returnLimits.max.toLocaleString()}</strong> {returnLimits.unit}
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0.001"
                step="any"
                value={returnedQuantity}
                onChange={(e) =>
                  setReturnedQuantity(e.target.value === "" ? "" : parseFloat(e.target.value))
                }
                placeholder={`Max: ${returnLimits.max}`}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          {/* Authorized Override Section if excess quantity */}
          {selectedOrderItem &&
            typeof returnedQuantity === "number" &&
            returnedQuantity > returnLimits.max && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Excess Return Quantity Warning
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5">
                      The return quantity ({returnedQuantity} {returnLimits.unit}) exceeds eligible returnable quantity (
                      {returnLimits.max} {returnLimits.unit}) for this item. Previously delivered: {returnLimits.delivered} {returnLimits.unit}, already returned: {(returnLimits.returned + returnLimits.pending)} {returnLimits.unit}. An authorized override with audit trail is required to proceed.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowOverride}
                      onChange={(e) => setAllowOverride(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Grant Explicit Authorized Override for Excess Return</span>
                  </label>

                  {allowOverride && (
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                        Override Authorization Reason <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Document supervisor approval, replacement batch ref, or reason..."
                        className="w-full text-xs border border-amber-300 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Product Condition Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Product Condition on Return <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                {
                  id: "SALEABLE" as ProductCondition,
                  label: "Saleable",
                  desc: "Restock to inventory",
                  icon: PackageCheck,
                  color: "border-emerald-300 bg-emerald-50/60 text-emerald-800",
                },
                {
                  id: "DAMAGED" as ProductCondition,
                  label: "Damaged",
                  desc: "Quarantine / write-off",
                  icon: PackageX,
                  color: "border-rose-300 bg-rose-50/60 text-rose-800",
                },
                {
                  id: "REWORK" as ProductCondition,
                  label: "Rework",
                  desc: "Needs factory repair",
                  icon: Wrench,
                  color: "border-purple-300 bg-purple-50/60 text-purple-800",
                },
                {
                  id: "SCRAP" as ProductCondition,
                  label: "Scrap",
                  desc: "Unusable waste",
                  icon: Trash2,
                  color: "border-slate-300 bg-slate-100 text-slate-700",
                },
              ].map((cond) => {
                const Icon = cond.icon;
                const isSelected = productCondition === cond.id;
                return (
                  <button
                    key={cond.id}
                    type="button"
                    onClick={() => setProductCondition(cond.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? `${cond.color} ring-2 ring-emerald-500 shadow-sm font-semibold`
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <div className="text-xs font-bold leading-tight">{cond.label}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">{cond.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason & Adjustment Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Return Reason <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                list="reason-suggestions"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wrong diameter received"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
              <datalist id="reason-suggestions">
                <option value="Damaged in transit" />
                <option value="Wrong product ordered" />
                <option value="Defective / Leakage" />
                <option value="Specification mismatch" />
                <option value="Customer order cancellation" />
                <option value="Excess quantity delivered" />
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Adjustment Type
              </label>
              <select
                value={adjustmentType}
                onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CREDIT_NOTE">Credit Note (Credit to Customer Ledger)</option>
                <option value="REPLACEMENT">Replacement (Issue New Delivery)</option>
                <option value="REFUND">Refund</option>
                <option value="OTHER_ADJUSTMENT">Other Adjustment</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Remarks</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Inspection findings, bundle tags, driver observations..."
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Notice Banner */}
          <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Workflow Rule:</span> Creating this return logs it in{" "}
            <span className="font-bold underline">Pending Inspection</span>. Neither inventory stock nor customer
            balances will change until an authorized manager approves and posts it.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Logging Return...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Log Return</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
