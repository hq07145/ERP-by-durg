import { requireAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { WorkspaceNavClient } from "@/components/navigation/workspace-nav-client";

export default async function WorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAuthContext();
  const businessName = context.businessName || "SANKALP IRRIGATION";

  const permissions = {
    canManageUsers: hasPermission(
      { permissions: context.permissions },
      "users.manage",
    ),
    canViewProducts: hasPermission(
      { permissions: context.permissions },
      "products.view",
    ),
    canViewCustomers: hasPermission(
      { permissions: context.permissions },
      "customers.view",
    ),
    canViewRawMaterials: hasPermission(
      { permissions: context.permissions },
      "raw_materials.view",
    ),
    canViewInventory: hasPermission(
      { permissions: context.permissions },
      "inventory.view",
    ),
    canViewSuppliers: isProcurementAuthorized(context, "suppliers.view"),
    canViewPurchases: isProcurementAuthorized(context, "purchases.view"),
    canViewOrders: hasPermission(
      { permissions: context.permissions },
      "orders.view",
    ),
    canViewSales:
      context.roleKey === "admin" || context.roleKey === "super_admin",
    canViewProfit:
      context.roleKey === "admin" || context.roleKey === "super_admin",
    canViewProduction: hasPermission(
      { permissions: context.permissions },
      "production.view",
    ),
    canViewDeliveries: hasPermission(
      { permissions: context.permissions },
      "delivery.view",
    ),
    canViewPayments: hasPermission(
      { permissions: context.permissions },
      "payments.view",
    ),
    canViewExpenses: hasPermission(
      { permissions: context.permissions },
      "expenses.view",
    ),
    canViewDashboard:
      hasPermission({ permissions: context.permissions }, "reports.view") ||
      hasPermission({ permissions: context.permissions }, "orders.view") ||
      hasPermission({ permissions: context.permissions }, "production.view") ||
      hasPermission({ permissions: context.permissions }, "inventory.view") ||
      hasPermission({ permissions: context.permissions }, "delivery.view") ||
      hasPermission({ permissions: context.permissions }, "customers.view"),
    canViewReports: hasPermission(
      { permissions: context.permissions },
      "reports.view",
    ),
    canViewSettings: hasPermission(
      { permissions: context.permissions },
      "settings.view",
    ),
    canViewCalendar: hasPermission(
      { permissions: context.permissions },
      "calendar.view",
    ),
    canViewNotifications: hasPermission(
      { permissions: context.permissions },
      "notifications.view",
    ),
  };

  return (
    <WorkspaceNavClient
      user={context.user}
      role={context.role}
      businessName={businessName}
      permissions={permissions}
    >
      {children}
    </WorkspaceNavClient>
  );
}