import { Suspense } from "react";
import WorkspaceShell from "@/components/workspace-shell";
import { RouteProgressBar } from "@/components/navigation/route-progress-bar";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <RouteProgressBar />
      </Suspense>
      <WorkspaceShell>{children}</WorkspaceShell>
    </>
  );
}
