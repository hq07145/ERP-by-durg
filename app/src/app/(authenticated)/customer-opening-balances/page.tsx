import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import {
  getAllCustomerOpeningBalancesAction,
  getActiveCustomersForOpeningBalanceAction,
  getOpeningBalanceAuditHistoryAction,
} from "@/lib/customers/opening-balance-actions";
import { CustomerOpeningBalancesClient } from "@/components/customers/opening-balances/opening-balances-client";

export const dynamic = "force-dynamic";

export default async function CustomerOpeningBalancesPage() {
  const context = await requireAuthContext();

  const isAdminOrSuper =
    context.roleKey === "admin" ||
    context.roleKey === "super_admin" ||
    hasPermission({ permissions: context.permissions }, "customers.edit") ||
    context.role?.name?.toLowerCase().includes("admin") ||
    context.role?.name?.toLowerCase().includes("super");

  if (!isAdminOrSuper) {
    redirect("/customers?error=forbidden");
  }

  const [initialBalances, customers, initialAuditLogs] = await Promise.all([
    getAllCustomerOpeningBalancesAction(),
    getActiveCustomersForOpeningBalanceAction(),
    getOpeningBalanceAuditHistoryAction(),
  ]);

  return (
    <CustomerOpeningBalancesClient
      user={context.user}
      businessName={context.businessName || "SANKALP IRRIGATION"}
      initialBalances={initialBalances}
      customers={customers}
      initialAuditLogs={initialAuditLogs}
    />
  );
}
