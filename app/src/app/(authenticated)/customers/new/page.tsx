import Link from "next/link";
import { redirect } from "next/navigation";
import CustomerForm from "@/components/customers/customer-form";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { EMPTY_CUSTOMER_FORM_VALUES } from "@/lib/customers/form-values";
import { Users, ChevronRight, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "customers.view")) redirect("/");
  if (!hasPermission({ permissions: context.permissions }, "customers.create")) redirect("/customers");

  return (
    <div className="space-y-6">
      {/* Header and Breadcrumbs */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <nav className="flex items-center gap-1.5 text-xs text-[#64748B] mb-2" aria-label="Breadcrumb">
          <Link href="/customers" className="hover:text-[#0F766E] transition-colors flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>Customers</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">New Account</span>
        </nav>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Create New Customer</h1>
            <p className="text-xs text-[#64748B]">Register a new client profile with commercial terms and address details.</p>
          </div>
        </div>
      </div>

      <CustomerForm initialValues={EMPTY_CUSTOMER_FORM_VALUES} />
    </div>
  );
}