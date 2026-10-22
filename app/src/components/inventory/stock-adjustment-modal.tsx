"use client";

import { useState, useMemo, useEffect } from "react";
import {
  X,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Package,
  Layers,
  Info,
  SlidersHorizontal,
  PlusCircle,
  MinusCircle,
  FileText,
  ShieldCheck,
} from "lucide-react";
import {
  recordReadyStockAdjustmentAction,
  type ReadyStockAdjustmentType,
  type ReadyStockDirection,
} from "@/lib/products/ready-stock-actions";
import type { ReadyStockProductItem } from "./ready-stock-view";

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ReadyStockProductItem[];
  initialProductId: string | null;
  canAdd: boolean;
  canAdjust: boolean;
}

export default function StockAdjustmentModal({
  isOpen,
  onClose,
  products,
  initialProductId,
  canAdd,
  canAdjust,
}: StockAdjustmentModalProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [adjustmentType, setAdjustmentType] = useState<ReadyStockAdjustmentType>("OPENING_STOCK");
  const [direction, setDirection] = useState<ReadyStockDirection>("ADD");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // Initialize or reset when modal opens or initialProductId changes
  useEffect(() => {
    if (isOpen) {
      const defaultId = initialProductId || (products.length > 0 ? products[0].id : "");
      setSelectedProductId(defaultId);
      const prod = products.find((p) => p.id === defaultId);
      if (prod && !prod.is_recorded) {
        setAdjustmentType("OPENING_STOCK");
        setDirection("ADD");
      } else {
        setAdjustmentType("STOCK_ADDITION");
        setDirection("ADD");
      }
      setQuantity("");
      setReason("");
      setReference("");
      setIsConfirming(false);
      setClientError(null);
    }
  }, [isOpen, initialProductId, products]);

  // Adjust direction automatically based on adjustment type
  const handleAdjustmentTypeChange = (type: ReadyStockAdjustmentType) => {
    setAdjustmentType(type);
    setClientError(null);
    if (type === "OPENING_STOCK" || type === "STOCK_ADDITION") {
      setDirection("ADD");
    } else if (type === "DAMAGED_STOCK") {
      setDirection("REMOVE");
    }
  };

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const currentPhysical = selectedProduct?.current_stock ?? 0;
  const reservedStock = selectedProduct?.reserved_stock ?? 0;
  const currentAvailable = selectedProduct?.available_stock ?? 0;
  const numQty = parseFloat(quantity) || 0;

  // Real-time calculated projected levels
  const projectedPhysical = useMemo(() => {
    if (direction === "ADD") {
      return Number((currentPhysical + numQty).toFixed(4));
    } else {
      return Math.max(0, Number((currentPhysical - numQty).toFixed(4)));
    }
  }, [currentPhysical, numQty, direction]);

  const projectedAvailable = useMemo(() => {
    return Math.max(0, Number((projectedPhysical - reservedStock).toFixed(4)));
  }, [projectedPhysical, reservedStock]);

  // Real-time validation checks
  const validation = useMemo(() => {
    if (!selectedProduct) return { isValid: false, message: "Please select a product." };
    if (!quantity || numQty <= 0 || isNaN(numQty)) {
      return { isValid: false, message: "Quantity must be greater than zero." };
    }
    if (direction === "REMOVE") {
      if (numQty > currentPhysical) {
        return {
          isValid: false,
          message: `Removal quantity (${numQty} ${selectedProduct.unit}) exceeds current physical stock (${currentPhysical} ${selectedProduct.unit}).`,
        };
      }
      if (currentPhysical - numQty < reservedStock) {
        return {
          isValid: false,
          message: `Cannot reduce physical stock below ${reservedStock} ${selectedProduct.unit} because that quantity is reserved for confirmed orders.`,
        };
      }
      if (!canAdjust) {
        return {
          isValid: false,
          message: "You do not have permission to remove finished goods stock (inventory.adjust required).",
        };
      }
    }
    if (!reason.trim() || reason.trim().length < 3) {
      return { isValid: false, message: "A mandatory reason (at least 3 characters) is required." };
    }
    return { isValid: true, message: null };
  }, [selectedProduct, quantity, numQty, direction, currentPhysical, reservedStock, reason, canAdjust]);

  if (!isOpen) return null;

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) {
      setClientError(validation.message);
      return;
    }
    setClientError(null);
    setIsConfirming(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-[#0F766E]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isConfirming ? "Confirm Stock Adjustment" : "Finished Goods Stock Entry"}
              </h2>
              <p className="text-xs text-slate-500">
                {isConfirming
                  ? "Verify adjustments before committing to inventory"
                  : "Record opening balance, manual additions, or write-offs"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* STEP 1: CONFIGURE FORM */}
        {!isConfirming && (
          <form onSubmit={handleProceedToConfirm} className="p-6 space-y-4">
            {clientError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{clientError}</span>
              </div>
            )}

            {/* PRODUCT SELECTOR */}
            <div>
              <label htmlFor="modal_product_id" className="block text-xs font-semibold text-slate-700 mb-1">
                Finished Product <span className="text-rose-500">*</span>
              </label>
              <select
                id="modal_product_id"
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setClientError(null);
                }}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px]"
              >
                <option value="">Select a finished product</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} {prod.sku ? `(${prod.sku})` : ""} ·{" "}
                    {prod.current_stock !== null ? `${prod.current_stock} ${prod.unit}` : "Unrecorded"}
                  </option>
                ))}
              </select>
            </div>

            {/* CURRENT STOCK OVERVIEW CARD */}
            {selectedProduct && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Current Physical Status</span>
                  <span className="font-mono text-slate-500">Unit: {selectedProduct.unit}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2 border border-slate-200">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Physical Stock</span>
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      {selectedProduct.current_stock !== null ? selectedProduct.current_stock : 0}
                    </span>
                    <span className="block text-[9px] text-slate-400">in warehouse</span>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-amber-200">
                    <span className="block text-[10px] uppercase font-bold text-amber-600 flex items-center justify-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Reserved
                    </span>
                    <span className="text-sm font-bold text-amber-700 tabular-nums">
                      {selectedProduct.reserved_stock}
                    </span>
                    <span className="block text-[9px] text-amber-600/70">confirmed orders</span>
                  </div>
                  <div className="rounded-lg bg-teal-50 p-2 border border-teal-200">
                    <span className="block text-[10px] uppercase font-bold text-teal-800">Available Ready</span>
                    <span className="text-sm font-bold text-teal-700 tabular-nums">
                      {selectedProduct.available_stock}
                    </span>
                    <span className="block text-[9px] text-teal-600">ready to sell</span>
                  </div>
                </div>
                {!selectedProduct.is_recorded && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-md p-1.5 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>No stock is recorded yet for this product. Use <strong>Opening Stock</strong> to set initial balance.</span>
                  </p>
                )}
              </div>
            )}

            {/* ADJUSTMENT TYPE */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Adjustment Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "OPENING_STOCK",
                    label: "Opening Stock",
                    desc: "Initial baseline balance",
                  },
                  {
                    id: "STOCK_ADDITION",
                    label: "Stock Addition",
                    desc: "Add surplus physical units",
                  },
                  {
                    id: "STOCK_CORRECTION",
                    label: "Stock Correction",
                    desc: "Audit count reconciliation",
                  },
                  {
                    id: "DAMAGED_STOCK",
                    label: "Damaged Stock",
                    desc: "Write-off defective units",
                  },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleAdjustmentTypeChange(t.id as ReadyStockAdjustmentType)}
                    className={`rounded-lg border p-2.5 text-left transition cursor-pointer ${
                      adjustmentType === t.id
                        ? "border-[#0F766E] bg-teal-50/60 ring-1 ring-[#0F766E]"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-xs font-bold text-slate-800">{t.label}</span>
                    <span className="block text-[10px] text-slate-500">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DIRECTION TOGGLE (FOR STOCK_CORRECTION) */}
            {adjustmentType === "STOCK_CORRECTION" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Correction Direction <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection("ADD")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      direction === "ADD"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Add to Stock (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("REMOVE")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      direction === "REMOVE"
                        ? "bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-300"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Remove from Stock (-)</span>
                  </button>
                </div>
              </div>
            )}

            {/* QUANTITY INPUT */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="modal_quantity" className="block text-xs font-semibold text-slate-700">
                  {direction === "ADD" ? "Quantity to Add" : "Quantity to Remove"}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  {selectedProduct?.unit || "Units"}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  id="modal_quantity"
                  required
                  step="0.001"
                  min="0.001"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setClientError(null);
                  }}
                  placeholder="e.g. 10"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px] pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase pointer-events-none">
                  {selectedProduct?.unit || "Unit"}
                </span>
              </div>
            </div>

            {/* REAL-TIME IMPACT PREVIEW */}
            {selectedProduct && numQty > 0 && (
              <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-teal-900">
                  <span>Projected Stock Impact:</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      direction === "ADD" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {direction === "ADD" ? `+${numQty}` : `-${numQty}`} {selectedProduct.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Physical Warehouse Stock:</span>
                  <span className="font-mono font-medium">
                    {currentPhysical} →{" "}
                    <strong className="text-slate-900 font-bold">{projectedPhysical}</strong> {selectedProduct.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Reserved Stock (Locked):</span>
                  <span className="font-mono font-medium text-amber-700">
                    {reservedStock} {selectedProduct.unit} (No change)
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700 font-semibold border-t border-teal-100 pt-1">
                  <span>Projected Available Ready:</span>
                  <span className="font-mono text-teal-800 font-bold text-sm">
                    {projectedAvailable} {selectedProduct.unit}
                  </span>
                </div>
              </div>
            )}

            {/* REASON & REFERENCE */}
            <div>
              <label htmlFor="modal_reason" className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="modal_reason"
                required
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setClientError(null);
                }}
                placeholder="Specify reason (e.g. Opening stock count, damaged write-off, cycle count variance)..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] resize-none"
              />
            </div>

            <div>
              <label htmlFor="modal_reference" className="block text-xs font-semibold text-slate-700 mb-1">
                Reference / Notes (Optional)
              </label>
              <input
                type="text"
                id="modal_reference"
                maxLength={100}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Audit ref #2026-Q4, Batch #B452, Physical sheet A"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-[40px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!validation.isValid}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#0D655E] transition min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Review Adjustment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: CONFIRMATION DIALOG */}
        {isConfirming && selectedProduct && (
          <form action={recordReadyStockAdjustmentAction} className="p-6 space-y-4">
            <input type="hidden" name="product_id" value={selectedProductId} />
            <input type="hidden" name="adjustment_type" value={adjustmentType} />
            <input type="hidden" name="direction" value={direction} />
            <input type="hidden" name="quantity" value={quantity} />
            <input type="hidden" name="reason" value={reason} />
            <input type="hidden" name="reference" value={reference} />

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Please confirm stock adjustment details:</span>
              </div>
              <p className="text-[11px] text-amber-800">
                This operation will update the finished goods inventory balance and record an immutable transaction log.
              </p>
            </div>

            {/* CONFIRMATION SUMMARY TABLE */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
              <table className="w-full divide-y divide-slate-100">
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-500 w-36">Product</td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">
                      {selectedProduct.name} {selectedProduct.sku ? `(${selectedProduct.sku})` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-500">Adjustment Type</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                        {adjustmentType.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-500">Adjustment Change</td>
                    <td className="px-4 py-2.5 font-bold tabular-nums">
                      <span className={direction === "ADD" ? "text-emerald-700" : "text-rose-700"}>
                        {direction === "ADD" ? `+${numQty}` : `-${numQty}`} {selectedProduct.unit}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-500">Physical Stock</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 tabular-nums">
                      {currentPhysical} → <strong className="font-bold text-slate-900">{projectedPhysical}</strong> {selectedProduct.unit}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-500">Reserved (Orders)</td>
                    <td className="px-4 py-2.5 font-medium text-amber-700 tabular-nums">
                      {reservedStock} {selectedProduct.unit} (Preserved strictly)
                    </td>
                  </tr>
                  <tr className="bg-teal-50/30">
                    <td className="px-4 py-2.5 font-bold text-teal-900">New Ready Available</td>
                    <td className="px-4 py-2.5 font-bold text-teal-800 text-sm tabular-nums">
                      {projectedAvailable} {selectedProduct.unit}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-slate-500">Mandatory Reason</td>
                    <td className="px-4 py-2.5 text-slate-800 italic">"{reason}"</td>
                  </tr>
                  {reference && (
                    <tr>
                      <td className="px-4 py-2.5 font-semibold text-slate-500">Reference</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{reference}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Secured by server-side authorization and business RLS boundaries.</span>
            </div>

            {/* CONFIRMATION ACTION BUTTONS */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-[40px] cursor-pointer"
              >
                ← Back to Edit
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#0D655E] transition min-h-[40px] cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Confirm & Save Stock Adjustment</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
