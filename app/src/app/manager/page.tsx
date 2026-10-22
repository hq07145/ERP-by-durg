import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function ManagerRootPage() {
  const context = await getAuthContext();
  if (context?.roleKey === "manager") {
    redirect("/manager/dashboard");
  }
  redirect("/manager/login");
}
