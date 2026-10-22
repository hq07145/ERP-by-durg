import { requireAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { ProfitReportClient } from "@/components/reports/profit-report-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profit & Loss Report - Reports & Analytics",
  description: "Company profit and loss breakdown and margin report",
};

export default async function ProfitReportPage() {
  const context = await requireAuthContext();
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    redirect("/reports?error=forbidden");
  }

  return <ProfitReportClient />;
}