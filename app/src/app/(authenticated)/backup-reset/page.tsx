import { requireAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { BackupResetClient } from "@/components/backup-reset/backup-reset-client";
import { getSystemDataSummaryAction } from "@/lib/backup/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Data Backup & Reset - Super Admin Console",
  description: "Enterprise Data Backup and Controlled System Reset for SANKALP IRRIGATION ERP",
};

export default async function BackupResetPage() {
  const context = await requireAuthContext();

  const isSuperAdmin =
    context.roleKey === "super_admin" ||
    Boolean(context.role?.name?.toLowerCase().includes("super"));

  if (!isSuperAdmin) {
    redirect("/dashboard?error=super_admin_required");
  }

  const initialSummary = await getSystemDataSummaryAction();

  return (
    <BackupResetClient
      user={context.user}
      businessName={context.businessName || "SANKALP IRRIGATION"}
      initialSummary={initialSummary}
    />
  );
}
