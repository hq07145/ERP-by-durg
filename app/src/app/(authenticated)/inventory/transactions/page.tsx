import Link from "next/link";
import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InventoryTransaction } from "@/types/material";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

export default async function InventoryTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; item?: string; type?: string }>;
}) {
  const context = await requireAuthContext();
  await requirePermission(context, "inventory.view_history");
  await requirePermission(context, "inventory.view");
  const params = await searchParams;

  const typeFilter = params.type || "all";
  const pageValue = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <p className="text-sm text-[var(--signal)]">Supabase is not configured.</p>;

  let query = supabase
    .from("inventory_transactions")
    .select("*", { count: "exact" })
    .eq("business_id", context.user.business_id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (typeFilter === "finished_good" || typeFilter === "raw_material") {
    query = query.eq("item_type", typeFilter);
  }

  if (params.item) {
    query = query.eq("item_id", params.item);
  }

  const { data, error, count } = await query;
  if (error) return <p className="text-sm text-[var(--signal)]">Transaction history could not be loaded.</p>;

  const transactions = (data ?? []) as InventoryTransaction[];

  // Separate item IDs by type to fetch display names
  const rawMaterialIds = [
    ...new Set(
      transactions.filter((tx) => tx.item_type === "raw_material").map((tx) => tx.item_id)
    ),
  ];
  const finishedGoodIds = [
    ...new Set(
      transactions.filter((tx) => tx.item_type === "finished_good").map((tx) => tx.item_id)
    ),
  ];

  const [{ data: rawMaterialData }, { data: finishedGoodData }] = await Promise.all([
    rawMaterialIds.length > 0
      ? supabase
          .from("raw_materials")
          .select("id, name, code, unit")
          .eq("business_id", context.user.business_id)
          .in("id", rawMaterialIds)
      : Promise.resolve({ data: [] }),
    finishedGoodIds.length > 0
      ? supabase
          .from("products")
          .select("id, name, sku, unit")
          .eq("business_id", context.user.business_id)
          .in("id", finishedGoodIds)
      : Promise.resolve({ data: [] }),
  ]);

  const rawMaterials = new Map(
    (rawMaterialData ?? []).map((m: any) => [m.id, { name: m.name, code: m.code, unit: m.unit }])
  );
  const finishedGoods = new Map(
    (finishedGoodData ?? []).map((p: any) => [p.id, { name: p.name, code: p.sku, unit: p.unit }])
  );

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const filterQuery = `&type=${encodeURIComponent(typeFilter)}${params.item ? `&item=${encodeURIComponent(params.item)}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Link
            className="text-xs font-semibold text-[#0F766E] uppercase tracking-wider hover:underline"
            href={typeFilter === "finished_good" ? "/inventory?tab=ready-stock" : "/inventory"}
          >
            ← Back to Inventory
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">Inventory Transaction History</h1>
          <p className="mt-1 text-sm text-slate-500">
            Recorded stock movements, receipts, dispatches, production outputs, and manual adjustments.
          </p>
        </div>
        <p className="text-sm text-slate-500 font-medium">
          {count ?? 0} transaction{count === 1 ? "" : "s"}
        </p>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {[
          { id: "all", label: "All Movements" },
          { id: "finished_good", label: "Ready Stock (Finished Goods)" },
          { id: "raw_material", label: "Raw Materials" },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={`/inventory/transactions?type=${tab.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              typeFilter === tab.id
                ? "bg-[#0F766E] text-white shadow-2xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm" role="table">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-4 py-3.5">Date & Time</th>
              <th className="px-4 py-3.5">Item Name</th>
              <th className="px-3 py-3.5">Category</th>
              <th className="px-3 py-3.5">Type</th>
              <th className="px-3 py-3.5 text-right">Quantity</th>
              <th className="px-3 py-3.5">Batch Number</th>
              <th className="px-4 py-3.5">Movement Ref / Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {transactions.map((tx) => {
              const itemInfo =
                tx.item_type === "finished_good"
                  ? finishedGoods.get(tx.item_id)
                  : rawMaterials.get(tx.item_id);

              const qty = Number(tx.quantity);
              const isStockIn = tx.transaction_type === "STOCK_IN";
              const isStockOut = tx.transaction_type === "STOCK_OUT";

              return (
                <tr className="hover:bg-slate-50/60 transition" key={tx.id}>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                    {new Date(tx.created_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">
                      {itemInfo?.name || "Unknown item"}
                    </span>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">
                      {itemInfo?.code || "-"} · {itemInfo?.unit || ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        tx.item_type === "finished_good"
                          ? "bg-teal-50 text-teal-800 border border-teal-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {tx.item_type === "finished_good" ? "Finished Good" : "Raw Material"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        isStockIn
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : isStockOut
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {tx.transaction_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold">
                    <span
                      className={
                        isStockIn
                          ? "text-emerald-700"
                          : isStockOut
                          ? "text-rose-700"
                          : "text-slate-800"
                      }
                    >
                      {isStockIn ? "+" : isStockOut ? "-" : ""}
                      {Math.abs(qty).toLocaleString("en-IN", { maximumFractionDigits: 3 })}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        {itemInfo?.unit ?? ""}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs font-mono font-medium text-slate-700">
                    {tx.batch_number ? (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
                        {tx.batch_number}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={tx.notes || ""}>
                    {tx.reference_type && tx.reference_type !== "manual" && (
                      <span className="font-mono text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mr-1.5 border border-slate-200">
                        {tx.reference_type}
                      </span>
                    )}
                    <span>{tx.notes || "-"}</span>
                  </td>
                </tr>
              );
            })}
            {transactions.length === 0 && (
              <tr>
                <td className="px-4 py-12 text-center text-slate-500" colSpan={7}>
                  No stock transactions recorded for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {page > 1 && (
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            href={`/inventory/transactions?page=${page - 1}${filterQuery}`}
          >
            Previous
          </Link>
        )}
        {page < pages && (
          <Link
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            href={`/inventory/transactions?page=${page + 1}${filterQuery}`}
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}