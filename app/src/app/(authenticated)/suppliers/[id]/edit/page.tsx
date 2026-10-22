import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect, notFound } from "next/navigation";
import { SupplierForm } from "@/components/suppliers/supplier-form";

interface EditSupplierPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSupplierPage({ params }: EditSupplierPageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "suppliers.edit")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/suppliers?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/suppliers?error=auth_unconfigured");

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (!supplier) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Supplier</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <SupplierForm initialData={supplier} supplierId={supplier.id} />
      </div>
    </div>
  );
}