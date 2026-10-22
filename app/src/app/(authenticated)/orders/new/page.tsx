import { redirect } from "next/navigation";

export default async function NewOrderPage() {
  redirect("/orders?new=true");
}