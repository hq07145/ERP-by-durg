"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCustomerAction } from "@/lib/customers/actions";
import type { CustomerFormValues } from "@/types/customer";
import {
  Building2,
  User,
  Phone,
  Mail,
  Receipt,
  CreditCard,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";

const errors: Record<string, string> = {
  auth_unconfigured: "Database service is unconfigured for this environment.",
  invalid_name: "Customer name is required (1 to 160 characters).",
  invalid_company: "Company name must be 160 characters or fewer.",
  invalid_phone: "Phone number must be 40 characters or fewer.",
  invalid_email: "Please enter a valid email address format.",
  invalid_gst: "GST number must be 32 characters or fewer.",
  invalid_payment_terms: "Payment terms must be 100 characters or fewer.",
  invalid_credit_limit: "Credit limit must be a valid positive amount.",
  invalid_address: "Street address must be 2,000 characters or fewer.",
  invalid_location: "City and state must be 120 characters or fewer.",
  invalid_postal_code: "Postal code must be 20 characters or fewer.",
  customer_not_found: "The requested customer profile could not be located.",
  forbidden: "You do not have permission to modify customer records.",
  customer_save_failed: "Failed to save customer details. Please check the values and retry.",
};

export default function CustomerForm({
  customerId,
  initialValues,
}: {
  customerId?: string;
  initialValues: CustomerFormValues;
}) {
  const [state, formAction, pending] = useActionState(saveCustomerAction, {});
  const [values, setValues] = useState(initialValues);

  function field(name: keyof CustomerFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  const isEditing = Boolean(customerId);

  return (
    <form action={formAction} className="space-y-6 max-w-4xl">
      {customerId && <input type="hidden" name="customer_id" value={customerId} />}
      {values.address_id && <input type="hidden" name="address_id" value={values.address_id} />}

      {/* Error Alert */}
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-rose-900">Validation Notice</h4>
            <p className="mt-0.5">{errors[state.error] ?? "Please review and correct the errors below."}</p>
          </div>
        </div>
      )}

      {/* Section 1: Business Identity & Contact */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Account & Identity</h3>
            <p className="text-xs text-[#64748B]">Primary legal entity name and organizational details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Customer Name */}
          <div className="space-y-1.5">
            <label htmlFor="customer-name" className="text-xs font-semibold text-[#0F172A] flex items-center gap-1">
              <span>Customer Name</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="customer-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={160}
              required
              value={values.name}
              onChange={(e) => field("name", e.target.value)}
              placeholder="e.g., Acme Industrial Supplies"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Company Name */}
          <div className="space-y-1.5">
            <label htmlFor="company-name" className="text-xs font-semibold text-[#0F172A]">
              Company / Legal Entity Name
            </label>
            <input
              id="company-name"
              name="company_name"
              type="text"
              autoComplete="organization"
              maxLength={160}
              value={values.company_name}
              onChange={(e) => field("company_name", e.target.value)}
              placeholder="e.g., Acme Corp Pvt. Ltd."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label htmlFor="customer-phone" className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Primary Phone</span>
            </label>
            <input
              id="customer-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={values.phone}
              onChange={(e) => field("phone", e.target.value)}
              placeholder="e.g., +91 98765 43210"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="customer-email" className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Billing / Contact Email</span>
            </label>
            <input
              id="customer-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={values.email}
              onChange={(e) => field("email", e.target.value)}
              placeholder="e.g., billing@acme.com"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Taxation & Credit Policies */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Taxation & Financial Terms</h3>
            <p className="text-xs text-[#64748B]">GST registration number, payment conditions and credit boundaries</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* GSTIN */}
          <div className="space-y-1.5">
            <label htmlFor="customer-gst" className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-[#64748B]" />
              <span>GSTIN Number</span>
            </label>
            <input
              id="customer-gst"
              name="gst_number"
              type="text"
              maxLength={32}
              value={values.gst_number}
              onChange={(e) => field("gst_number", e.target.value.toUpperCase())}
              placeholder="e.g., 27ABCDE1234F1Z5"
              className="w-full font-mono uppercase rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Payment Terms */}
          <div className="space-y-1.5">
            <label htmlFor="customer-payment-terms" className="text-xs font-semibold text-[#0F172A]">
              Payment Terms
            </label>
            <input
              id="customer-payment-terms"
              name="payment_terms"
              type="text"
              maxLength={100}
              value={values.payment_terms}
              onChange={(e) => field("payment_terms", e.target.value)}
              placeholder="e.g., Net 30 Days / Advance"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Credit Limit */}
          <div className="space-y-1.5">
            <label htmlFor="customer-credit-limit" className="text-xs font-semibold text-[#0F172A] flex items-center gap-1">
              <span>Credit Limit (INR ₹)</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              id="customer-credit-limit"
              name="credit_limit"
              type="number"
              inputMode="decimal"
              min="0"
              max="999999999999.99"
              step="0.01"
              required
              value={values.credit_limit}
              onChange={(e) => field("credit_limit", e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm font-medium text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Billing & Delivery Address */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#E2E8F0]">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F766E] flex items-center justify-center">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Primary Physical Address</h3>
            <p className="text-xs text-[#64748B]">Default delivery location and shipping destination</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* Street Address */}
          <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
            <label htmlFor="customer-address" className="text-xs font-semibold text-[#0F172A]">
              Street Address / Premises
            </label>
            <textarea
              id="customer-address"
              name="address"
              rows={3}
              maxLength={2000}
              value={values.address}
              onChange={(e) => field("address", e.target.value)}
              placeholder="Plot No., Industrial Area, Street address..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <label htmlFor="customer-city" className="text-xs font-semibold text-[#0F172A]">
              City
            </label>
            <input
              id="customer-city"
              name="city"
              type="text"
              autoComplete="address-level2"
              maxLength={120}
              value={values.city}
              onChange={(e) => field("city", e.target.value)}
              placeholder="e.g., Bengaluru"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* District */}
          <div className="space-y-1.5">
            <label htmlFor="customer-district" className="text-xs font-semibold text-[#0F172A]">
              District
            </label>
            <input
              id="customer-district"
              name="district"
              type="text"
              maxLength={120}
              value={values.district}
              onChange={(e) => field("district", e.target.value)}
              placeholder="e.g., Bengaluru Urban"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* State */}
          <div className="space-y-1.5">
            <label htmlFor="customer-state" className="text-xs font-semibold text-[#0F172A]">
              State
            </label>
            <input
              id="customer-state"
              name="state"
              type="text"
              autoComplete="address-level1"
              maxLength={120}
              value={values.state}
              onChange={(e) => field("state", e.target.value)}
              placeholder="e.g., Karnataka"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>

          {/* Postal Code */}
          <div className="space-y-1.5">
            <label htmlFor="customer-postal-code" className="text-xs font-semibold text-[#0F172A]">
              Postal Code (PIN)
            </label>
            <input
              id="customer-postal-code"
              name="postal_code"
              type="text"
              autoComplete="postal-code"
              maxLength={20}
              value={values.postal_code}
              onChange={(e) => field("postal_code", e.target.value)}
              placeholder="e.g., 560001"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] transition-colors focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>
        </div>
      </div>

      {/* Form Action Controls */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <Link
          href={isEditing ? `/customers/${customerId}` : "/customers"}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white border border-[#E2E8F0] rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Cancel</span>
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#0D655E] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving details...</span>
            </>
          ) : isEditing ? (
            <span>Save Changes</span>
          ) : (
            <span>Create Customer</span>
          )}
        </button>
      </div>
    </form>
  );
}