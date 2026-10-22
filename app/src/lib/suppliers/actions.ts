"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { type SupplierFormValues } from "@/types/supplier";

export type SupplierActionState = { error?: string };

function emailIsValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function supplierValues(formData: FormData): SupplierFormValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    address: String(formData.get("address") ?? "").trim(),
    gst_number: String(formData.get("gst_number") ?? "").trim().toUpperCase(),
  };
}

function validateSupplier(values: SupplierFormValues): string | null {
  if (!values.name || values.name.length > 160) return "invalid_name";
  if (values.phone.length > 40) return "invalid_phone";
  if (values.email && (values.email.length > 254 || !emailIsValid(values.email))) {
    return "invalid_email";
  }
  if (values.address.length > 500) return "invalid_address";
  if (values.gst_number.length > 32) return "invalid_gst";
  return null;
}

async function authorized(permission: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, permission)) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/suppliers?error=forbidden");
  }
  const supabase = await createServerSupabaseClient();
  return supabase ? { context, supabase } : null;
}

export async function saveSupplierAction(
  _previousState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const supplierId = String(formData.get("supplier_id") ?? "");
  const actionContext = await authorized(supplierId ? "suppliers.edit" : "suppliers.create");
  if (!actionContext) return { error: "auth_unconfigured" };
  const { context, supabase } = actionContext;
  const values = supplierValues(formData);
  const validationError = validateSupplier(values);
  if (validationError) return { error: validationError };

  const payload = {
    business_id: context.user.business_id,
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    address: values.address || null,
    gst_number: values.gst_number || null,
  };

  const result = supplierId
    ? await supabase
        .from("suppliers")
        .update(payload)
        .eq("id", supplierId)
        .eq("business_id", context.user.business_id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("suppliers")
        .insert(payload)
        .select("id")
        .single();

  if (result.error) return { error: result.error.code === "23505" ? "duplicate_entry" : "save_failed" };
  if (!result.data?.id) return { error: "supplier_not_found" };
  revalidatePath("/suppliers");
  redirect(supplierId ? `/suppliers/${supplierId}?notice=supplier_updated` : `/suppliers/${result.data.id}?notice=supplier_created`);
}

export async function setSupplierStatusAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const permission = status === "INACTIVE" ? "suppliers.delete" : "suppliers.edit";
  if ((status !== "ACTIVE" && status !== "INACTIVE") || !isProcurementAuthorized(context, permission)) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/suppliers?error=forbidden");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/suppliers?error=auth_unconfigured");
  const { data: supplier, error: lookupError } = await supabase
    .from("suppliers")
    .select("id, status")
    .eq("id", supplierId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (lookupError || !supplier) redirect("/suppliers?error=supplier_not_found");
  if (supplier.status === status) redirect(`/suppliers/${supplierId}`);

  const { error } = await supabase
    .from("suppliers")
    .update({ status })
    .eq("id", supplierId)
    .eq("business_id", context.user.business_id);
  if (error) redirect("/suppliers?error=status_failed");
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  redirect(`/suppliers/${supplierId}?notice=${status === "INACTIVE" ? "supplier_deactivated" : "supplier_activated"}`);
}