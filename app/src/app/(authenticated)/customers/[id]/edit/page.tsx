import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CustomerForm from "@/components/customers/customer-form";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { customerToFormValues } from "@/lib/customers/form-values";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Customer, CustomerAddress } from "@/types/customer";
import { Users, ChevronRight, Edit3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "customers.view")) redirect("/");
  if (!hasPermission({ permissions: context.permissions }, "customers.edit")) redirect("/customers");
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <p className="text-sm text-rose-600">Database client unavailable.</p>;

  const [{ data: customerData, error: customerError }, { data: addressData, error: addressError }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .eq("business_id", context.user.business_id)
      .maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (customerError || !customerData) notFound();
  if (addressError) return <p className="text-sm text-rose-600">Customer address could not be loaded.</p>;

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
          <Link href={`/customers/${id}`} className="hover:text-[#0F766E] transition-colors truncate max-w-[200px]">
            {customerData.name}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">Edit Profile</span>
        </nav>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-[#0F766E] flex items-center justify-center">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Edit Customer: {customerData.name}</h1>
            <p className="text-xs text-[#64748B]">Update client specifications, payment boundaries, and shipping destinations.</p>
          </div>
        </div>
      </div>

      <CustomerForm
        customerId={id}
        initialValues={customerToFormValues(customerData as Customer, addressData as CustomerAddress | undefined)}
      />
    </div>
  );
}