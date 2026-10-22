import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { redirect } from "next/navigation";
import { SupplierForm } from "@/components/suppliers/supplier-form";

export default async function NewSupplierPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "suppliers.create")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/suppliers?error=forbidden");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Supplier</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <SupplierForm />
      </div>
    </div>
  );
}