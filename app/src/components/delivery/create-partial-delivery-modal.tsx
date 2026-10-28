"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  X,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  Package,
  Clock,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import type {
  OrderDispatchSummaryItem,
  CreatePartialDeliveryInput,
  PartialDeliveryResult,
  CustomerDropdownItem,
  CustomerOrderForDelivery,
} from "@/types/delivery";
import {
  getOrderDispatchSummary,
  createPartialDelivery,
  getCustomerOrdersForDelivery,
} from "@/lib/delivery/actions";
import {
  validateAndNormalizeVehicleNumber,
  validateInvoiceNumber,
  validateDriverMobile,
} from "@/lib/delivery/validation";

interface CreatePartialDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  customers?: CustomerDropdownItem[];
  onSuccess: (result: PartialDeliveryResult) => void;
}

export function CreatePartialDeliveryModal({
  isOpen,
  onClose,
  orderId: initialOrderId,
  orderNumber: initialOrderNumber,
  customerName: initialCustomerName,
  customers = [],
  onSuccess,
}: CreatePartialDeliveryModalProps) {
  // Order selection state (when opened from /delivery without order preselected)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderForDelivery[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string>(initialOrderId || "");
  const [activeOrderNumber, setActiveOrderNumber] = useState<string>(initialOrderNumber || "");
  const [activeCustomerName, setActiveCustomerName] = useState<string>(initialCustomerName || "");

  // Dispatch items state
  const [summaryItems, setSummaryItems] = useState<OrderDispatchSummaryItem[]>([]);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  // Form Fields
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Override State
  const [allowOverride, setAllowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialOrderId) {
        setActiveOrderId(initialOrderId);
        setActiveOrderNumber(initialOrderNumber || "");
        setActiveCustomerName(initialCustomerName || "");
      }
      setDeliveryDate(new Date().toISOString().split("T")[0]);
      setVehicleNumber("");
      setDriverName("");
      setDriverPhone("");
      setInvoiceNumber("");
      setNotes("");
      setAllowOverride(false);
      setOverrideReason("");
      setErrorMessage(null);
    }
  }, [isOpen, initialOrderId, initialOrderNumber, initialCustomerName]);

  // Load customer orders if customer is selected
  useEffect(() => {
    if (!isOpen || initialOrderId || !selectedCustomerId) return;
    let isCancelled = false;
    setIsLoadingOrders(true);
    getCustomerOrdersForDelivery(selectedCustomerId)
      .then((orders) => {
        if (!isCancelled) {
          setCustomerOrders(orders);
          setIsLoadingOrders(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load customer orders:", err);
          setIsLoadingOrders(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialOrderId, selectedCustomerId]);

  // Load dispatch summary whenever activeOrderId changes
  useEffect(() => {
    if (!isOpen || !activeOrderId) {
      setSummaryItems([]);
      setDispatchQuantities({});
      return;
    }

    let isCancelled = false;
    setIsLoadingSummary(true);
    setErrorMessage(null);

    getOrderDispatchSummary(activeOrderId)
      .then((items) => {
        if (!isCancelled) {
          setSummaryItems(items);
          if (items.length > 0 && items[0].order_number) {
            setActiveOrderNumber(items[0].order_number);
          }
          // Default: populate remaining quantities
          const initialQtys: Record<string, number> = {};
          items.forEach((it) => {
            initialQtys[it.order_item_id] = it.remaining_quantity;
          });
          setDispatchQuantities(initialQtys);
          setIsLoadingSummary(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load order dispatch summary:", err);
          setErrorMessage(err instanceof Error ? err.message : "Failed to load dispatch summary.");
          setIsLoadingSummary(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activeOrderId]);

  // Check if any line has excess quantity
  const excessLines = useMemo(() => {
    const list: Array<{ name: string; current: number; remaining: number }> = [];
    summaryItems.forEach((it) => {
      const current = dispatchQuantities[it.order_item_id] || 0;
      if (current > it.remaining_quantity) {
        list.push({
          name: it.product_name,
          current,
          remaining: it.remaining_quantity,
        });
      }
    });
    return list;
  }, [summaryItems, dispatchQuantities]);

  const hasExcess = excessLines.length > 0;

  // Total dispatch count across all items
  const totalDispatchQuantity = useMemo(() => {
    return Object.values(dispatchQuantities).reduce((sum, q) => sum + (Number(q) || 0), 0);
  }, [dispatchQuantities]);

  // Handle quantity input
  const handleQuantityChange = (orderItemId: string, val: string) => {
    const num = parseFloat(val);
    setDispatchQuantities((prev) => ({
      ...prev,
      [orderItemId]: isNaN(num) || num < 0 ? 0 : num,
    }));
  };

  // Helper: Dispatch all remaining
  const handleDispatchAll = () => {
    const allQtys: Record<string, number> = {};
    summaryItems.forEach((it) => {
      allQtys[it.order_item_id] = it.remaining_quantity;
    });
    setDispatchQuantities(allQtys);
  };

  // Helper: Reset all to 0
  const handleResetToZero = () => {
    const zeroQtys: Record<string, number> = {};
    summaryItems.forEach((it) => {
      zeroQtys[it.order_item_id] = 0;
    });
    setDispatchQuantities(zeroQtys);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrderId) {
      setErrorMessage("Please select a sales order.");
      return;
    }

    if (totalDispatchQuantity <= 0) {
      setErrorMessage("Please enter a dispatch quantity greater than 0 for at least one item.");
      return;
    }

    if (hasExcess && !allowOverride) {
      setErrorMessage(
        "One or more items exceed the remaining quantity. Check 'Authorized Excess Override' and enter a valid reason to proceed."
      );
      return;
    }

    if (hasExcess && allowOverride && overrideReason.trim().length < 5) {
      setErrorMessage("An authorized override reason of at least 5 characters is required for excess dispatch.");
      return;
    }

    // Vehicle validation if entered
    if (vehicleNumber.trim()) {
      const vRes = validateAndNormalizeVehicleNumber(vehicleNumber);
      if (!vRes.isValid) {
        setErrorMessage(vRes.error || "Please enter a valid vehicle number.");
        return;
      }
    }

    // Invoice validation if entered
    if (invoiceNumber.trim()) {
      const iRes = validateInvoiceNumber(invoiceNumber);
      if (!iRes.isValid) {
        setErrorMessage(iRes.error || "Please enter a valid invoice number.");
        return;
      }
    }

    // Driver phone validation if entered
    if (driverPhone.trim()) {
      const pRes = validateDriverMobile(driverPhone);
      if (!pRes.isValid) {
        setErrorMessage(pRes.error || "Please enter a valid 10-digit mobile number.");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: CreatePartialDeliveryInput = {
        order_id: activeOrderId,
        delivery_date: deliveryDate,
        vehicle_number: vehicleNumber.trim() || undefined,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        invoice_number: invoiceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        allow_override: hasExcess ? allowOverride : false,
        override_reason: hasExcess ? overrideReason.trim() : undefined,
        items: summaryItems
          .map((it) => ({
            order_item_id: it.order_item_id,
            quantity: dispatchQuantities[it.order_item_id] || 0,
          }))
          .filter((it) => it.quantity > 0),
      };

      const result = await createPartialDelivery(payload);
      onSuccess(result);
      onClose();
    } catch (err) {
      console.error("Submission error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to record delivery.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partial-delivery-modal-title"
    >
      <div
        className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[92vh] sm:w-[94vw] lg:max-w-4xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/95">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-[#0F766E] border border-teal-200 uppercase tracking-wider">
                  Partial Dispatch System
                </span>
                {activeOrderNumber && (
                  <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    #{activeOrderNumber}
                  </span>
                )}
              </div>
              <h2
                id="partial-delivery-modal-title"
                className="text-base sm:text-lg font-bold text-[#142B3B] leading-tight"
              >
                Create Delivery Challan
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* SECTION: ORDER & CUSTOMER SELECTION (If not pre-selected) */}
          {!initialOrderId && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-[#0F766E]" />
                Customer &amp; Sales Order Selection
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Customer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      setActiveOrderId("");
                      setActiveOrderNumber("");
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    required
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company_name ? `(${c.company_name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Sales Order <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={activeOrderId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setActiveOrderId(id);
                      const found = customerOrders.find((o) => o.id === id);
                      if (found) {
                        setActiveOrderNumber(found.order_number);
                      }
                    }}
                    disabled={!selectedCustomerId || isLoadingOrders}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] disabled:bg-slate-100"
                    required
                  >
                    <option value="">
                      {isLoadingOrders ? "Loading orders..." : "-- Choose Order --"}
                    </option>
                    {customerOrders.map((ord) => (
                      <option key={ord.id} value={ord.id}>
                        {ord.order_number} ({format(new Date(ord.order_date), "dd-MMM-yy")}) - Status: {ord.delivery_status || ord.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: SUMMARY & AUTO DELIVERY NUMBER */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                  Target Sales Order
                </span>
                <p className="font-mono text-sm font-bold text-slate-900">
                  {activeOrderNumber ? `#${activeOrderNumber}` : "No order selected"}
                </p>
                {activeCustomerName && (
                  <p className="text-slate-600 font-medium">{activeCustomerName}</p>
                )}
              </div>
              <div className="space-y-1 sm:text-right bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                  Delivery Challan Number
                </span>
                <p className="font-mono font-bold text-[#0F766E] text-xs">
                  DEL-YYYY-000001 (Auto Sequential)
                </p>
                <span className="text-[10px] text-slate-500 block">
                  Generated atomically by database counter
                </span>
              </div>
            </div>
          </div>

          {/* SECTION: DISPATCH ITEMS & REAL-TIME QUANTITY CALCULATION */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#0F766E]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Order Items &amp; Dispatch Quantities
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDispatchAll}
                  className="inline-flex items-center gap-1 rounded bg-teal-50 border border-teal-200 px-2 py-1 text-[11px] font-semibold text-[#0F766E] hover:bg-teal-100 transition"
                >
                  <Check className="w-3 h-3" />
                  <span>Dispatch All Remaining</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetToZero}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {isLoadingSummary ? (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#0F766E]" />
                <span>Loading order items and remaining dispatch balance...</span>
              </div>
            ) : summaryItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {activeOrderId ? "No items found for this order." : "Please select an order to view items."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="px-3.5 py-2.5">Product Description</th>
                      <th className="px-3 py-2.5 text-right">Ordered Qty</th>
                      <th className="px-3 py-2.5 text-right">Prev Dispatched</th>
                      <th className="px-3 py-2.5 text-right text-emerald-700">Remaining Balance</th>
                      <th className="px-3 py-2.5 text-right w-36">Current Dispatch</th>
                      <th className="px-3 py-2.5 text-right text-slate-500">New Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {summaryItems.map((item) => {
                      const currentDisp = dispatchQuantities[item.order_item_id] ?? 0;
                      const isExcess = currentDisp > item.remaining_quantity;
                      const newRemaining = Math.max(0, item.remaining_quantity - currentDisp);

                      return (
                        <tr
                          key={item.order_item_id}
                          className={`hover:bg-slate-50/70 transition ${
                            isExcess ? "bg-rose-50/40" : ""
                          }`}
                        >
                          <td className="px-3.5 py-3">
                            <p className="font-semibold text-slate-900">{item.product_name}</p>
                            <span className="font-mono text-[10px] text-slate-500">
                              SKU: {item.product_sku || "—"} • {item.product_unit}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-medium">
                            {item.ordered_quantity}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-slate-600">
                            {item.previously_dispatched_quantity}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                            {item.remaining_quantity}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min="0"
                                max={allowOverride ? undefined : item.remaining_quantity}
                                step="any"
                                value={currentDisp === 0 ? "" : currentDisp}
                                placeholder="0"
                                onChange={(e) =>
                                  handleQuantityChange(item.order_item_id, e.target.value)
                                }
                                className={`w-28 text-right font-mono font-bold text-xs rounded-lg border p-1.5 focus:outline-none focus:ring-1 ${
                                  isExcess
                                    ? "border-rose-400 bg-rose-50 text-rose-800 focus:border-rose-500 focus:ring-rose-500"
                                    : "border-slate-300 bg-white text-slate-900 focus:border-[#0F766E] focus:ring-[#0F766E]"
                                }`}
                              />
                            </div>
                            {isExcess && (
                              <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">
                                Exceeds remaining ({item.remaining_quantity})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs text-slate-500">
                            {newRemaining}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/80 border-t border-slate-200 font-bold text-slate-900 text-xs">
                    <tr>
                      <td className="px-3.5 py-2.5">Total Dispatch</td>
                      <td colSpan={3} className="px-3 py-2.5 text-right text-slate-500 font-normal">
                        Total units for this shipment:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-[#0F766E]">
                        {totalDispatchQuantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* OVERRIDE WARNING / BOX (Shown if any line has excess quantity) */}
          {hasExcess && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-2xs space-y-3">
              <div className="flex items-start gap-2.5 text-amber-900">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Over-Dispatch Quantity Warning</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    The following items exceed their remaining ordered balance:{" "}
                    {excessLines.map((l) => `${l.name} (${l.current} > ${l.remaining})`).join(", ")}.
                    Dispatching excess quantity requires explicit authorization.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                <input
                  type="checkbox"
                  id="allow-override-check"
                  checked={allowOverride}
                  onChange={(e) => setAllowOverride(e.target.checked)}
                  className="rounded border-amber-300 text-[#0F766E] focus:ring-[#0F766E] h-4 w-4"
                />
                <label
                  htmlFor="allow-override-check"
                  className="text-xs font-bold text-amber-950 cursor-pointer"
                >
                  I authorize this excess quantity dispatch
                </label>
              </div>

              {allowOverride && (
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">
                    Authorization Reason &amp; Audit Justification <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Enter reason for excess dispatch (e.g., replacement for transit damage, authorized batch overrun)..."
                    className="w-full text-xs rounded-lg border border-amber-300 bg-white p-2 text-slate-800 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                    required
                  />
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    This override and reason will be permanently logged in the audit ledger.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION: LOGISTICS & TRANSPORT DETAILS */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-[#0F766E]" />
              Transport &amp; Challan Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Delivery Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. MH-04-AB-1234"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono uppercase focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Driver Name</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Driver Mobile</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 9876543210"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Manual Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-0042 (Optional)"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dispatch Notes / Remarks</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions or transit notes (Optional)"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>
            </div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-[11px] text-slate-500">
              {totalDispatchQuantity > 0 ? (
                <>
                  Ready to dispatch:{" "}
                  <strong className="text-slate-800">{totalDispatchQuantity} units</strong>
                </>
              ) : (
                "Enter quantities above to enable dispatch"
              )}
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || totalDispatchQuantity <= 0 || (hasExcess && !allowOverride)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Delivery...</span>
                  </>
                ) : (
                  <>
                    <Truck className="w-3.5 h-3.5" />
                    <span>Create Delivery Challan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
