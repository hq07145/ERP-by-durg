import Link from "next/link";
import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { addRawMaterialStockAction } from "@/lib/materials/actions";
import StockAdjustmentForm from "@/components/materials/stock-adjustment-form";
import ReadyStockView, { type ReadyStockProductItem } from "@/components/inventory/ready-stock-view";
import { InventoryTabsClient } from "@/components/inventory/inventory-tabs-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InventoryRecord, RawMaterial } from "@/types/material";

export const dynamic = "force-dynamic";

function quantity(value: string | number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(value));
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; page?: string; tab?: string }>;
}) {
  const context = await requireAuthContext();
  await requirePermission(context, "inventory.view");
  const params = await searchParams;
  const activeTab = params.tab === "raw-materials" ? "raw-materials" : "ready-stock";

  const supabase = await createServerSupabaseClient();
  if (!supabase) return <p className="text-sm text-[var(--signal)]">Supabase is not configured.</p>;

  const canAdd = hasPermission({ permissions: context.permissions }, "inventory.add_stock");
  const canAdjust = hasPermission({ permissions: context.permissions }, "inventory.adjust");
  const canViewHistory = hasPermission({ permissions: context.permissions }, "inventory.view_history");
  const canViewRawMaterials = hasPermission({ permissions: context.permissions }, "raw_materials.view");

  const messages: Record<string, string> = {
    stock_added: "Ready stock added successfully and recorded in transaction history.",
    stock_adjusted: "Adjustment recorded with reason, transaction, and audit log.",
    adjustment_recorded: "Finished goods stock adjustment successfully recorded and audited.",
    forbidden: "You do not have permission for that inventory action. Admin/Super Admin authorization required.",
    invalid_stock_entry: "Enter a positive stock quantity.",
    invalid_adjustment: "Enter a non-negative new stock level and a reason.",
    adjustment_below_reserved: "New stock level cannot be less than active reservations for confirmed orders.",
    removal_exceeds_physical: "Removal quantity cannot exceed current physical stock in warehouse.",
    removal_violates_reservation: "Cannot remove stock: Physical stock cannot be reduced below active reservations for confirmed orders.",
    invalid_quantity: "Quantity must be a positive number greater than zero.",
    missing_batch_number: "Batch number is required for all new ready stock entries.",
    invalid_batch_number: "Batch number cannot exceed 100 characters.",
    missing_reason: "A mandatory reason (at least 3 characters) is required for manual stock adjustments.",
    invalid_adjustment_type: "Invalid stock adjustment type specified.",
    invalid_direction: "Invalid stock adjustment direction.",
    auth_unconfigured: "Supabase is not configured for this environment.",
    stock_entry_failed: "Stock entry could not be recorded.",
    adjustment_failed: "Stock adjustment could not be recorded.",
    product_not_found: "Product was not found in your business workspace.",
  };
  const message = params.notice ? messages[params.notice] : params.error ? messages[params.error] : null;

  const pageNum = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize = 20;

  // =========================================================================
  // PARALLEL DATA FETCHING: Ready Stock & Raw Materials loaded concurrently
  // =========================================================================
  const [
    { data: productsData },
    { data: invData },
    { data: outputsData },
    rawMaterialsResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, unit, min_stock, reorder_level, selling_price, active")
      .eq("business_id", context.user.business_id)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory")
      .select("id, item_id, current_stock, reserved_stock, available_stock")
      .eq("business_id", context.user.business_id)
      .eq("item_type", "finished_good"),
    supabase
      .from("production_output")
      .select("product_id, quantity_produced")
      .eq("business_id", context.user.business_id),
    canViewRawMaterials
      ? supabase
          .from("inventory")
          .select("*", { count: "exact" })
          .eq("business_id", context.user.business_id)
          .eq("item_type", "raw_material")
          .order("updated_at", { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);

  // ============================================
  // TAB 1: READY STOCK (FINISHED GOODS INVENTORY)
  // ============================================
  const inventoryMap = new Map<string, { current: number; reserved: number; available: number }>();
  (invData ?? []).forEach((row: any) => {
    inventoryMap.set(row.item_id, {
      current: Number(row.current_stock) || 0,
      reserved: Number(row.reserved_stock) || 0,
      available: Number(row.available_stock) || 0,
    });
  });

  const totalProducedMap = new Map<string, number>();
  (outputsData ?? []).forEach((row: any) => {
    const pid = row.product_id;
    const qty = Number(row.quantity_produced) || 0;
    totalProducedMap.set(pid, (totalProducedMap.get(pid) || 0) + qty);
  });

  const readyStockItems: ReadyStockProductItem[] = (productsData ?? []).map((prod: any) => {
    const inv = inventoryMap.get(prod.id);
    const isRecorded = inv !== undefined;
    const current = isRecorded ? inv.current : null;
    const reserved = isRecorded ? inv.reserved : 0;
    const available = isRecorded ? Math.max(0, (current ?? 0) - reserved) : 0;
    const totalProduced = totalProducedMap.get(prod.id) || 0;

    return {
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      unit: prod.unit,
      min_stock: Number(prod.min_stock) || 0,
      reorder_level: Number(prod.reorder_level) || 0,
      current_stock: current,
      reserved_stock: reserved,
      available_stock: available,
      total_produced: totalProduced,
      is_recorded: isRecorded,
    };
  });

  // ============================================
  // TAB 2: RAW MATERIALS INVENTORY
  // ============================================
  let rawMaterialsContent: React.ReactNode = null;

  if (!canViewRawMaterials) {
    rawMaterialsContent = (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
        You do not have permission to view raw materials inventory. (Missing: raw_materials.view)
      </div>
    );
  } else {
    const { data: rawData, error: rawError, count } = rawMaterialsResult;
    if (rawError) {
      rawMaterialsContent = <p className="text-sm text-[var(--signal)]">Inventory could not be loaded.</p>;
    } else {
      const inventoryRows = (rawData ?? []) as InventoryRecord[];
      const materialIds = inventoryRows.map((row) => row.item_id);
      const { data: materialData, error: materialError } = materialIds.length
        ? await supabase
            .from("raw_materials")
            .select("*")
            .eq("business_id", context.user.business_id)
            .in("id", materialIds)
        : { data: [], error: null };

      if (materialError) {
        rawMaterialsContent = <p className="text-sm text-[var(--signal)]">Raw-material details could not be loaded.</p>;
      } else {
        const materials = new Map(
          ((materialData ?? []) as RawMaterial[]).map((material) => [material.id, material])
        );
        const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

        rawMaterialsContent = (
          <div>
            <div className="flex justify-between text-sm text-[var(--muted)] mb-3">
              <p>
                {count ?? 0} tracked material{count === 1 ? "" : "s"}
              </p>
              <p>
                Page {page} of {pages}
              </p>
            </div>
            <div className="overflow-x-auto border-y border-[var(--line)]">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[#eaf0eb] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Material</th>
                    <th className="px-3 py-3 font-semibold">Current</th>
                    <th className="px-3 py-3 font-semibold">Reserved</th>
                    <th className="px-3 py-3 font-semibold">Available</th>
                    <th className="px-3 py-3 font-semibold">Reorder level</th>
                    <th className="px-3 py-3 font-semibold">Stock status</th>
                    <th className="px-3 py-3 font-semibold">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {inventoryRows.map((row) => {
                    const material = materials.get(row.item_id);
                    if (!material) return null;
                    const lowStock = Number(row.current_stock) <= Number(material.reorder_level);
                    return (
                      <tr className="bg-white align-top" key={row.id}>
                        <td className="px-3 py-3">
                          <Link
                            className="font-semibold hover:text-[var(--accent)]"
                            href={`/raw-materials/${material.id}`}
                          >
                            {material.name}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                            {material.code || "-"} · {material.unit}
                          </p>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{quantity(row.current_stock)}</td>
                        <td className="px-3 py-3 tabular-nums">{quantity(row.reserved_stock)}</td>
                        <td className="px-3 py-3 tabular-nums">{quantity(row.available_stock)}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {quantity(material.reorder_level)} {material.unit}
                        </td>
                        <td className="px-3 py-3">
                          {lowStock ? (
                            <span className="border border-[#e6c5b9] bg-[#fbf0ec] px-2 py-1 text-xs font-semibold text-[var(--signal)]">
                              Low stock
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">In range</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {canAdd || canAdjust ? (
                            <details className="max-w-[480px]">
                              <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">
                                Stock actions
                              </summary>
                              <div className="mt-3 grid gap-4">
                                {canAdd && (
                                  <form
                                    action={addRawMaterialStockAction}
                                    className="grid gap-2 sm:grid-cols-[100px_minmax(120px,1fr)_auto]"
                                  >
                                    <input type="hidden" name="raw_material_id" value={material.id} />
                                    <label className="grid gap-1 text-[10px] font-semibold text-[var(--muted)]">
                                      Add {material.unit}
                                      <input
                                        className="min-h-9 rounded-sm border border-[var(--line)] bg-white px-2 text-xs font-normal"
                                        min="0.001"
                                        name="quantity"
                                        required
                                        step="0.001"
                                        type="number"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[10px] font-semibold text-[var(--muted)]">
                                      Notes
                                      <input
                                        className="min-h-9 rounded-sm border border-[var(--line)] bg-white px-2 text-xs font-normal"
                                        maxLength={500}
                                        name="notes"
                                      />
                                    </label>
                                    <div className="flex items-end">
                                      <button
                                        className="min-h-9 rounded-sm bg-[var(--accent)] px-3 text-xs font-semibold text-white cursor-pointer"
                                        type="submit"
                                      >
                                        Record
                                      </button>
                                    </div>
                                  </form>
                                )}
                                {canAdjust && (
                                  <StockAdjustmentForm
                                    compact
                                    materialId={material.id}
                                    materialName={material.name}
                                    currentStock={row.current_stock}
                                  />
                                )}
                              </div>
                            </details>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">View only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {inventoryRows.length === 0 && (
                    <tr>
                      <td className="px-3 py-12 text-center text-[var(--muted)]" colSpan={7}>
                        No raw-material stock is tracked yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {page > 1 && (
                <Link
                  className="rounded-sm border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium"
                  href={`/inventory?tab=raw-materials&page=${page - 1}`}
                >
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link
                  className="rounded-sm border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium"
                  href={`/inventory?tab=raw-materials&page=${page + 1}`}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* NOTIFICATION BANNER */}
      {message && (
        <p
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            params.error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {message}
        </p>
      )}

      {/* INSTANT TAB CONTAINER (0ms switching between Finished Goods and Raw Materials) */}
      <InventoryTabsClient
        initialTab={activeTab}
        readyStockContent={
          <ReadyStockView
            items={readyStockItems}
            canAdd={canAdd}
            canAdjust={canAdjust}
            canViewHistory={canViewHistory}
          />
        }
        rawMaterialsContent={rawMaterialsContent}
        transactionHistoryLink={
          canViewHistory && (
            <Link
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              href="/inventory/transactions"
            >
              Transaction History
            </Link>
          )
        }
      />
    </div>
  );
}