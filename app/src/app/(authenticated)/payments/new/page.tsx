import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PaymentForm } from "@/components/payments/payment-form";
import { ChevronRight, CreditCard } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ orderId?: string; customerId?: string }>;
}

export default async function NewPaymentPage({ searchParams }: PageProps) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.add")) {
    redirect("/payments?error=forbidden");
  }

  const query = searchParams ? await searchParams : {};
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/payments?error=auth_unconfigured");

  // Fetch active customers and uncancelled orders with due balances
  const [{ data: customers }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, company_name")
      .eq("business_id", context.user.business_id)
      .eq("status", "ACTIVE")
      .order("name"),
    supabase
      .from("orders")
      .select("id, order_number, order_date, total_amount, paid_amount, due_amount, customer_id")
      .eq("business_id", context.user.business_id)
      .neq("status", "CANCELLED")
      .gt("due_amount", 0)
      .order("order_date", { ascending: false }),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb Header */}
      <div className="border-b border-slate-200 pb-4">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
          <Link href="/payments" className="hover:text-[#0F766E] transition-colors flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payments</span>
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">Record New Payment</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Record Customer Payment
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Record bank deposits, UPI transfers, cheques, or cash receipts and atomically update accounts.
        </p>
      </div>

      <PaymentForm
        customers={customers ?? []}
        orders={orders ?? []}
        initialCustomerId={query.customerId}
        initialOrderId={query.orderId}
      />
    </div>
  );
}
