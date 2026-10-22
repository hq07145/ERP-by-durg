"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ShoppingCart } from "lucide-react";
import { OrderForm } from "./order-form";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: { id: string; name: string; company_name: string | null; gst_number?: string | null; state?: string | null; district?: string | null }[];
  products: any[];
  workingDays?: Record<string, boolean>;
  calendarOverrides?: Record<string, boolean>;
  returnTo?: string;
  businessDetails?: any;
}

export function CreateOrderModal({
  isOpen,
  onClose,
  customers,
  products,
  workingDays,
  calendarOverrides,
  returnTo,
  businessDetails,
}: CreateOrderModalProps) {
  const [isDirty, setIsDirty] = useState(false);

  const handleAttemptClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in this order. Are you sure you want to discard them?"
      );
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleAttemptClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleAttemptClose]);

  // Lock body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-order-modal-title"
      onClick={handleAttemptClose}
    >
      <div
        className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[94vw] lg:max-w-5xl rounded-none sm:rounded-2xl bg-white shadow-2xl border-0 sm:border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* STICKY HEADER */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200/80">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-[#0F766E] border border-teal-200 uppercase tracking-wider">
                  Commercial Operations
                </span>
              </div>
              <h2 id="create-order-modal-title" className="text-base sm:text-lg font-bold text-[#142B3B] leading-tight">
                Create Order
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Record customer sales order with real-time stock allocation and delivery calculation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* INTERNAL SCROLLABLE FORM & STICKY FOOTER */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <OrderForm
            isModal={true}
            onClose={onClose}
            onDirtyChange={setIsDirty}
            returnTo={returnTo ?? "orders"}
            customers={customers}
            products={products}
            workingDays={workingDays}
            calendarOverrides={calendarOverrides}
            businessDetails={businessDetails}
          />
        </div>
      </div>
    </div>
  );
}
