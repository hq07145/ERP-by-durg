"use client";

import React, { useState, useTransition, useEffect } from "react";
import { User, Phone, X, AlertCircle, Loader2, Truck, CheckCircle2 } from "lucide-react";
import { updateDeliveryDriverDetails } from "@/lib/delivery/actions";
import { validateDriverName, validateRequiredDriverMobile } from "@/lib/delivery/validation";

interface EditDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  delivery: {
    id: string;
    delivery_number: string;
    driver?: string | null;
    driver_phone?: string | null;
    status: string;
  };
  onSuccess?: (updated: { id: string; driver: string; driver_phone: string }) => void;
}

export function EditDriverModal({
  isOpen,
  onClose,
  delivery,
  onSuccess,
}: EditDriverModalProps) {
  const [driverName, setDriverName] = useState(delivery.driver || "");
  const [driverMobile, setDriverMobile] = useState(delivery.driver_phone || "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset or pre-fill state when modal opens or delivery changes
  useEffect(() => {
    if (isOpen) {
      setDriverName(delivery.driver || "");
      setDriverMobile(delivery.driver_phone || "");
      setNameError(null);
      setMobileError(null);
      setServerError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, delivery.driver, delivery.driver_phone]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);

    // 1. Validate Driver Name
    const nameValidation = validateDriverName(driverName);
    if (!nameValidation.isValid) {
      setNameError(nameValidation.error || "Please enter a valid driver name.");
    } else {
      setNameError(null);
    }

    // 2. Validate Driver Mobile
    const mobileValidation = validateRequiredDriverMobile(driverMobile);
    if (!mobileValidation.isValid) {
      setMobileError(mobileValidation.error || "Please enter a valid 10-digit driver mobile number.");
    } else {
      setMobileError(null);
    }

    if (!nameValidation.isValid || !mobileValidation.isValid) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await updateDeliveryDriverDetails({
          delivery_id: delivery.id,
          driver_name: nameValidation.normalized,
          driver_mobile: mobileValidation.normalized,
        });

        if (res.success) {
          setSuccessMsg(res.message);
          if (onSuccess) {
            onSuccess(res.delivery);
          }
          // Close after short pause so user sees confirmation
          setTimeout(() => {
            onClose();
          }, 400);
        } else {
          setServerError(res.message || "Failed to update driver details.");
        }
      } catch (err: any) {
        console.error("Error updating driver details:", err);
        setServerError(err.message || "An unexpected error occurred while saving driver details.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-driver-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-[#0F766E]">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h3 id="edit-driver-modal-title" className="text-sm font-bold text-slate-900">
                Edit Driver Details
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Delivery #{delivery.delivery_number} • <span className="font-semibold text-orange-600">IN TRANSIT</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Information Notice */}
          <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            You can update the assigned driver and contact number for in-transit tracking.
            This update is audited and does not affect order quantities, invoice balances, or delivery numbers.
          </div>

          {/* Success Alert */}
          {successMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Server Error Alert */}
          {serverError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">{serverError}</div>
            </div>
          )}

          {/* Driver Name Input */}
          <div className="space-y-1.5">
            <label htmlFor="driver-name-input" className="block text-xs font-semibold text-slate-700">
              Driver Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User className="h-4 w-4" />
              </div>
              <input
                id="driver-name-input"
                type="text"
                value={driverName}
                onChange={(e) => {
                  setDriverName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                disabled={isPending}
                placeholder="e.g. Ramesh Patil"
                className={`w-full rounded-xl border pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                  nameError
                    ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200"
                    : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]/20"
                } disabled:bg-slate-50 disabled:text-slate-500`}
                autoFocus
              />
            </div>
            {nameError && (
              <p className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{nameError}</span>
              </p>
            )}
          </div>

          {/* Driver Mobile Input */}
          <div className="space-y-1.5">
            <label htmlFor="driver-mobile-input" className="block text-xs font-semibold text-slate-700">
              Driver Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Phone className="h-4 w-4" />
              </div>
              <input
                id="driver-mobile-input"
                type="tel"
                value={driverMobile}
                onChange={(e) => {
                  setDriverMobile(e.target.value);
                  if (mobileError) setMobileError(null);
                }}
                disabled={isPending}
                placeholder="10-digit mobile (e.g. 9876543210 or +919876543210)"
                className={`w-full rounded-xl border pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
                  mobileError
                    ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200"
                    : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]/20"
                } disabled:bg-slate-50 disabled:text-slate-500`}
              />
            </div>
            {mobileError ? (
              <p className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{mobileError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-400">
                Indian format (10 digits starting with 6, 7, 8, or 9). Optional +91 prefix accepted.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

