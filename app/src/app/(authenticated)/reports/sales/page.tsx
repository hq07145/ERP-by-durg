import { requireAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { SalesReportClient } from "@/components/reports/sales-report-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Report - Reports & Analytics",
  description: "Detailed sales transactions and revenue audit report",
};

export default async function SalesReportPage() {
  const context = await requireAuthContext();
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    redirect("/reports?error=forbidden");
  }

  return <SalesReportClient />;
}