"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CustomerActionState = {
  error?: string;
};

function emailIsValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeForm(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    companyName: String(formData.get("company_name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email,
    gstNumber: String(formData.get("gst_number") ?? "").trim().toUpperCase(),
    paymentTerms: String(formData.get("payment_terms") ?? "").trim(),
    creditLimit: String(formData.get("credit_limit") ?? "").trim(),
    addressId: String(formData.get("address_id") ?? ""),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    district: String(formData.get("district") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postalCode: String(formData.get("postal_code") ?? "").trim(),
  };

  if (!values.name || values.name.length > 160) return { error: "invalid_name" as const };
  if (values.companyName.length > 160) return { error: "invalid_company" as const };
  if (values.phone.length > 40) return { error: "invalid_phone" as const };
  if (values.email && (values.email.length > 254 || !emailIsValid(values.email))) {
    return { error: "invalid_email" as const };
  }
  if (values.gstNumber.length > 32) return { error: "invalid_gst" as const };
  if (values.paymentTerms.length > 100) return { error: "invalid_payment_terms" as const };
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(values.creditLimit)) {
    return { error: "invalid_credit_limit" as const };
  }
  if (values.address.length > 2000) return { error: "invalid_address" as const };
  if (values.city.length > 120 || values.district.length > 120 || values.state.length > 120) return { error: "invalid_location" as const };
  if (values.postalCode.length > 20) return { error: "invalid_postal_code" as const };
  return { values };
}

function getPermission(contextPermissions: string[], permission: string): boolean {
  return hasPermission({ permissions: contextPermissions }, permission);
}

export async function saveCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const customerId = String(formData.get("customer_id") ?? "");
  const permission = customerId ? "customers.edit" : "customers.create";
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!getPermission(context.permissions, permission)) redirect("/customers?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "auth_unconfigured" };

  const parsed = normalizeForm(formData);
  if ("error" in parsed) return parsed;
  const { values } = parsed;

  if (customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();
    if (customerError || !customer) return { error: "customer_not_found" };

    const { error } = await supabase.rpc("update_customer_with_address", {
      target_business_id: context.user.business_id,
      target_customer_id: customerId,
      target_address_id: values.addressId || null,
      target_name: values.name,
      target_company_name: values.companyName || null,
      target_phone: values.phone || null,
      target_email: values.email || null,
      target_gst_number: values.gstNumber || null,
      target_payment_terms: values.paymentTerms || null,
      target_credit_limit: values.creditLimit,
      target_address: values.address || null,
      target_city: values.city || null,
      target_state: values.state || null,
      target_postal_code: values.postalCode || null,
      target_district: values.district || null,
    });
    if (error) return { error: error.code === "42501" ? "forbidden" : "customer_save_failed" };

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?notice=customer_updated`);
  }

  const { data: createdId, error } = await supabase.rpc("create_customer_with_address", {
    target_business_id: context.user.business_id,
    target_name: values.name,
    target_company_name: values.companyName || null,
    target_phone: values.phone || null,
    target_email: values.email || null,
    target_gst_number: values.gstNumber || null,
    target_payment_terms: values.paymentTerms || null,
    target_credit_limit: values.creditLimit,
    target_address: values.address || null,
    target_city: values.city || null,
    target_state: values.state || null,
    target_postal_code: values.postalCode || null,
    target_district: values.district || null,
  });
  if (error || !createdId) {
    return { error: error?.code === "42501" ? "forbidden" : "customer_save_failed" };
  }

  revalidatePath("/customers");
  redirect(`/customers/${createdId}?notice=customer_created`);
}

import type { Customer } from "@/types/customer";

export async function getCustomers(): Promise<Customer[]> {
  const context = await getAuthContext();
  if (!context) return [];

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("status", "ACTIVE")
    .order("name");

  if (error) return [];
  return (data ?? []) as Customer[];
}

export async function setCustomerStatusAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const customerId = String(formData.get("customer_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const requiredPermission = status === "INACTIVE" ? "customers.delete" : "customers.edit";
  if ((status !== "ACTIVE" && status !== "INACTIVE") || !getPermission(context.permissions, requiredPermission)) {
    redirect("/customers?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/customers?error=auth_unconfigured");
  const { data: customer, error: lookupError } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", customerId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (lookupError || !customer) redirect("/customers?error=customer_not_found");
  if (customer.status === status) {
    redirect(`/customers/${customerId}?notice=${status === "INACTIVE" ? "customer_deactivated" : "customer_activated"}`);
  }

  const { error } = await supabase
    .from("customers")
    .update({ status })
    .eq("id", customerId)
    .eq("business_id", context.user.business_id);
  if (error) redirect("/customers?error=customer_status_failed");

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?notice=${status === "INACTIVE" ? "customer_deactivated" : "customer_activated"}`);
}