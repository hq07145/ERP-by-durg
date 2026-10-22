import { hasPermission } from "@/lib/permissions/authorization";

/**
 * Validates access to Procurement modules (Suppliers and Purchases).
 *
 * Requirements:
 * - Admin and Super Admin accounts maintain full access based on permissions.
 * - Manager accounts are restricted from the interface, direct routes, and server actions,
 *   even if role or historical granular records exist, unless explicitly authorized by the business.
 */
export function isProcurementAuthorized(
  context: {
    roleKey: string | null;
    role?: { name: string } | null;
    permissions: string[];
  } | null | undefined,
  requiredPermission: string = "suppliers.view",
): boolean {
  if (!context) return false;

  const roleKey = context.roleKey;
  const roleName = context.role?.name?.toLowerCase() ?? "";
  const isManager = roleKey === "manager" || roleName.includes("manager");

  // Manager accounts are strictly restricted from Suppliers and Purchases
  if (isManager) {
    return false;
  }

  // Admin / Super Admin maintain full access based on their existing permissions
  return (
    roleKey === "admin" ||
    roleKey === "super_admin" ||
    hasPermission({ permissions: context.permissions }, requiredPermission)
  );
}
