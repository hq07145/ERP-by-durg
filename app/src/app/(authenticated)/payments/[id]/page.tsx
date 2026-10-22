import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PaymentDetail } from "@/components/payments/payment-detail";
import { getPaymentWithDetails } from "@/lib/payments/actions";
import type { PaymentWithDetails } from "@/types/payment";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) redirect("/payments?error=forbidden");

  const payment = await getPaymentWithDetails(id);

  if (!payment) redirect("/payments?error=not_found");

  const canEdit = hasPermission({ permissions: context.permissions }, "payments.edit");
  const canDelete = hasPermission({ permissions: context.permissions }, "payments.delete");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/payments" className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Back to Payments
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Details</h1>
            <p className="text-gray-500">{payment.payment_number} - {payment.customer_name}</p>
          </div>
        </div>
      </div>

      <PaymentDetail
        payment={payment}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}