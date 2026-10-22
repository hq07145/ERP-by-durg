import { requireManagerAuthContext } from "@/lib/auth/context";
import WorkspaceShell from "@/components/workspace-shell";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireManagerAuthContext();
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
