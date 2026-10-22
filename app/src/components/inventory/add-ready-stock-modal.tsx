"use client";

import { useState, useMemo, useEffect, useTransition, useRef } from "react";
import {
  X,
  AlertTriangle,
  PlusCircle,
  Package,
  Layers,
  CheckCircle2,
  Lock,
  Loader2,
} from "lucide-react";
import { addReadyStockAction } from "@/lib/products/ready-stock-actions";
import type { ReadyStockProductItem } from "./ready-stock-view";

interface AddReadyStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ReadyStockProductItem[];
  initialProductId: string | null;
  canAdd: boolean;
}

function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

export default function AddReadyStockModal({
  isOpen,
  onClose,
  products,
  initialProductId,
  canAdd,
}: AddReadyStockModalProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef<boolean>(false);

  // Reset or initialize state when opening modal
  useEffect(() => {
    if (isOpen) {
      const defaultId = initialProductId || (products.length > 0 ? products[0].id : "");
      setSelectedProductId(defaultId);
      setBatchNumber("");
      setQuantity("");
      setNotes("");
      setClientError(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isOpen, initialProductId, products]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const currentPhysical = selectedProduct?.current_stock ?? 0;
  const reservedStock = selectedProduct?.reserved_stock ?? 0;
  const currentAvailable = selectedProduct?.available_stock ?? 0;
  const unit = selectedProduct?.unit || "Unit";

  const numQty = parseFloat(quantity) || 0;
  const isPositiveQty = !isNaN(numQty) && numQty > 0;
  const projectedPhysical = Number((currentPhysical + (isPositiveQty ? numQty : 0)).toFixed(4));
  const projectedAvailable = Math.max(0, Number((projectedPhysical - reservedStock).toFixed(4)));

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting || isPending) return;
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Prevent double submission if already in flight
    if (isSubmittingRef.current || isSubmitting || isPending) {
      e.preventDefault();
      return;
    }

    if (!canAdd) {
      e.preventDefault();
      setClientError("You do not have permission to add stock. Admin authorization is required.");
      return;
    }

    if (!selectedProduct) {
      e.preventDefault();
      setClientError("Please select a finished product.");
      return;
    }

    const trimmedBatch = batchNumber.trim();
    if (!trimmedBatch) {
      e.preventDefault();
      setClientError("Please enter a valid batch number.");
      return;
    }

    const trimmedQty = quantity.trim();
    if (!trimmedQty || isNaN(Number(trimmedQty)) || Number(trimmedQty) <= 0) {
      e.preventDefault();
      setClientError("Please enter a valid positive quantity greater than 0.");
      return;
    }

    // Set lock to disable button immediately and prevent duplicate clicks
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setClientError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-ready-stock-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-[#0F766E]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 id="add-ready-stock-title" className="text-base font-bold text-slate-900">
                Add Ready Stock
              </h2>
              <p className="text-xs text-slate-500">
                Manually record incoming or verified finished goods stock.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting || isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* FORM */}
        <form action={addReadyStockAction} onSubmit={handleSubmit} className="p-6 space-y-4">
          {clientError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{clientError}</span>
            </div>
          )}

          {/* 1. FINISHED PRODUCT */}
          <div>
            <label htmlFor="ready_stock_product_id" className="block text-xs font-semibold text-slate-700 mb-1">
              Finished Product <span className="text-rose-500">*</span>
            </label>
            <select
              id="ready_stock_product_id"
              name="product_id"
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setClientError(null);
              }}
              required
              disabled={isSubmitting || isPending}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px] disabled:bg-slate-100"
            >
              <option value="">Select finished product</option>
              {products.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} {prod.sku ? `(${prod.sku})` : ""} · Current Physical: {formatQty(prod.current_stock)} {prod.unit}
                </option>
              ))}
            </select>
          </div>

          {/* 2. BATCH NUMBER */}
          <div>
            <label htmlFor="ready_stock_batch_number" className="block text-xs font-semibold text-slate-700 mb-1">
              Batch Number <span className="text-rose-500">*</span>
            </label>
            <input
              id="ready_stock_batch_number"
              name="batch_number"
              type="text"
              required
              value={batchNumber}
              onChange={(e) => {
                setBatchNumber(e.target.value);
                setClientError(null);
              }}
              disabled={isSubmitting || isPending}
              placeholder="Enter batch number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px] disabled:bg-slate-100"
            />
          </div>

          {/* CURRENT PRODUCT SNAPSHOT */}
          {selectedProduct && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Current Warehouse Status</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 border border-teal-200">
                  Unit: {unit}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white p-2 border border-slate-200">
                  <span className="block text-[10px] uppercase font-bold text-slate-500">Physical Stock</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatQty(currentPhysical)}
                  </span>
                  <span className="block text-[9px] text-slate-400">{unit}</span>
                </div>
                <div className="rounded-lg bg-white p-2 border border-amber-200">
                  <span className="block text-[10px] uppercase font-bold text-amber-600 flex items-center justify-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Reserved
                  </span>
                  <span className="text-sm font-bold text-amber-700 tabular-nums">
                    {formatQty(reservedStock)}
                  </span>
                  <span className="block text-[9px] text-amber-600/70">{unit}</span>
                </div>
                <div className="rounded-lg bg-teal-50 p-2 border border-teal-200">
                  <span className="block text-[10px] uppercase font-bold text-teal-800">Available Ready</span>
                  <span className="text-sm font-bold text-teal-700 tabular-nums">
                    {formatQty(currentAvailable)}
                  </span>
                  <span className="block text-[9px] text-teal-600">{unit}</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. QUANTITY TO ADD & AUTOMATIC UNIT */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="ready_stock_quantity" className="block text-xs font-semibold text-slate-700">
                Quantity to Add <span className="text-rose-500">*</span>
              </label>
              {selectedProduct && (
                <span className="text-[11px] font-medium text-slate-500">
                  Product unit: <span className="font-semibold text-teal-700">{unit}</span>
                </span>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                id="ready_stock_quantity"
                name="quantity"
                type="number"
                step="0.001"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setClientError(null);
                }}
                disabled={isSubmitting || isPending}
                placeholder="0.000"
                className="w-full rounded-lg border border-slate-300 bg-white pl-3 pr-20 py-2 text-sm font-mono shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[42px] disabled:bg-slate-100"
              />
              <span className="absolute right-3 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 pointer-events-none">
                {unit}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Must be a positive quantity. Unit is automatically taken from the finished product.
            </p>
          </div>

          {/* 3. REASON / NOTES (OPTIONAL) */}
          <div>
            <label htmlFor="ready_stock_notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Reason / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="ready_stock_notes"
              name="notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting || isPending}
              placeholder="e.g., Physical stock count addition, manual receipt, etc."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[60px] disabled:bg-slate-100"
            />
          </div>

          {/* 4. LIVE STOCK CALCULATION PREVIEW */}
          {selectedProduct && isPositiveQty && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span>Projected Stock Calculation</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="rounded-lg bg-white p-2.5 border border-teal-100 shadow-2xs">
                  <span className="block text-[10px] uppercase font-bold text-slate-500">
                    New Physical Stock
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
                    {formatQty(projectedPhysical)}{" "}
                    <span className="text-xs font-normal text-slate-500">{unit}</span>
                  </p>
                  <p className="text-[10px] text-emerald-600 font-medium">
                    +{formatQty(numQty)} {unit} added
                  </p>
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-teal-100 shadow-2xs">
                  <span className="block text-[10px] uppercase font-bold text-teal-800">
                    New Available Ready
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-teal-700 tabular-nums">
                    {formatQty(projectedAvailable)}{" "}
                    <span className="text-xs font-normal text-teal-600">{unit}</span>
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {reservedStock > 0 ? `(${formatQty(reservedStock)} reserved)` : "0 reserved"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting || isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer min-h-[40px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPending || !isPositiveQty || !selectedProduct || !batchNumber.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-5 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-[#0D655E] transition active:scale-98 min-h-[40px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding Ready Stock...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" />
                  <span>Add Ready Stock</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
