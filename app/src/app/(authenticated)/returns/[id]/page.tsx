import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReturnDetail } from "@/components/returns/return-detail";
import { getGoodsReturnById, getReturnAuditHistory } from "@/lib/returns/actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GoodsReturnDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const canView =
    hasPermission({ permissions: context.permissions }, "delivery.view") ||
    hasPermission({ permissions: context.permissions }, "orders.view") ||
    hasPermission({ permissions: context.permissions }, "inventory.view");

  if (!canView) redirect("/dashboard?error=forbidden");

  const [returnData, auditHistory] = await Promise.all([
    getGoodsReturnById(id),
    getReturnAuditHistory(id),
  ]);

  if (!returnData) redirect("/returns?error=not_found");

  const canApprove =
    hasPermission({ permissions: context.permissions }, "orders.approve") ||
    hasPermission({ permissions: context.permissions }, "delivery.update") ||
    hasPermission({ permissions: context.permissions }, "orders.edit") ||
    hasPermission({ permissions: context.permissions }, "inventory.adjust");

  const canPost =
    hasPermission({ permissions: context.permissions }, "inventory.adjust") ||
    hasPermission({ permissions: context.permissions }, "delivery.dispatch") ||
    hasPermission({ permissions: context.permissions }, "payments.edit");

  const canCancel =
    hasPermission({ permissions: context.permissions }, "delivery.cancel") ||
    hasPermission({ permissions: context.permissions }, "orders.cancel") ||
    hasPermission({ permissions: context.permissions }, "inventory.adjust");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/returns"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Goods Returns</span>
        </Link>
      </div>

      <ReturnDetail
        returnData={returnData}
        auditHistory={auditHistory}
        canApprove={canApprove}
        canPost={canPost}
        canCancel={canCancel}
      />
    </div>
  );
}
