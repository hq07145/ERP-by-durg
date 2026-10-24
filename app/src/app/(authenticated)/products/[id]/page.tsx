import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { toggleProductStatusAction } from "@/lib/products/actions";
import ConfirmSubmit from "@/components/confirm-submit";
import ProductBomSection from "@/components/bom/product-bom-section";
import { getAuthContext } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProductQualityStandard, getProductQualityQuantity, type Product, type ProductCategory } from "@/types/product";

export const dynamic = "force-dynamic";

function currencyAmount(value: string | number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}

function dayRange(minimum: number, maximum: number): string {
  return minimum === maximum ? `${minimum} day${minimum === 1 ? "" : "s"}` : `${minimum}-${maximum} days`;
}

const notices: Record<string, string> = {
  product_created: "Product created.",
  product_updated: "Product updated.",
};

export default async function ProductDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; bom_notice?: string; bom_error?: string }>;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  await requirePermission(context, "products.view");
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return <p className="text-sm text-[var(--signal)]">Supabase is not configured.</p>;

  const [{ data: productData, error: productError }, { data: categories }, { data: businessData }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("business_id", context.user.business_id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, business_id, parent_id, name, status, created_at, updated_at")
      .eq("business_id", context.user.business_id)
      .limit(500),
    supabase
      .from("businesses")
      .select("currency")
      .eq("id", context.user.business_id)
      .maybeSingle(),
  ]);
  if (productError || !productData) notFound();

  const product = productData as Product;
  const categoryMap = new Map(((categories ?? []) as ProductCategory[]).map((category) => [category.id, category]));
  const category = product.category_id ? categoryMap.get(product.category_id) : undefined;
  const subcategory = product.subcategory_id ? categoryMap.get(product.subcategory_id) : undefined;
  const categoryName = category ? `${category.name}${subcategory ? ` / ${subcategory.name}` : ""}` : "Uncategorized";
  const currency = (businessData as { currency?: string } | null)?.currency ?? "INR";
  const canEdit = hasPermission({ permissions: context.permissions }, "products.edit");
  const canViewMaterials = hasPermission({ permissions: context.permissions }, "raw_materials.view");
  const paramsValue = await searchParams;
  const notice = paramsValue.notice ? notices[paramsValue.notice] : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <Link className="text-sm font-medium text-[var(--accent)] hover:underline" href="/products">Products</Link>
          <h1 className="mt-2 text-3xl font-semibold">{product.name}</h1>
          <p className="mt-2 font-mono text-sm text-[var(--muted)]">{product.sku}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`border px-2.5 py-1.5 text-xs font-semibold ${product.active ? "border-[#b8d7c7] bg-[#eef5f0] text-[var(--accent-strong)]" : "border-[#e6c5b9] bg-[#fbf0ec] text-[var(--signal)]"}`}>
            {product.active ? "Active" : "Inactive"}
          </span>
          {canEdit && <Link className="rounded-sm bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]" href={`/products/${product.id}/edit`}>Edit product</Link>}
          {canEdit && <ConfirmSubmit action={toggleProductStatusAction} fieldName="product_id" fieldValue={product.id} label={product.active ? "Deactivate" : "Activate"} confirmation={product.active ? `Deactivate ${product.name}? Historical references will remain.` : `Activate ${product.name}?`} className="rounded-sm border border-[var(--line)] px-3 py-2 text-sm font-medium hover:bg-white" />}
        </div>
      </div>

      {notice && <p className="mt-5 border-l-2 border-[var(--accent)] bg-[#eef5f0] px-3 py-2 text-sm text-[var(--accent-strong)]" role="status">{notice}</p>}

      <dl className="mt-8 grid gap-x-10 gap-y-7 border-b border-[var(--line)] pb-8 sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Quality / Grade</dt><dd className="mt-1 text-sm font-medium">{product.quality_grade || <span className="text-slate-400 font-normal">Quality not configured</span>}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Category</dt><dd className="mt-1 text-sm font-medium">{categoryName}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Unit</dt><dd className="mt-1 text-sm font-medium">{product.unit}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Selling price</dt><dd className="mt-1 text-sm font-medium tabular-nums">{currencyAmount(product.selling_price, currency)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Tax rate</dt><dd className="mt-1 text-sm font-medium">{product.tax_rate}%</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Daily production capacity</dt><dd className="mt-1 text-sm font-medium">{product.daily_capacity} {product.production_unit} per production day/slot</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Setup time</dt><dd className="mt-1 text-sm font-medium">{product.setup_minutes} minutes</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Production time</dt><dd className="mt-1 text-sm font-medium">{dayRange(product.production_min_days, product.production_max_days)}</dd><dd className="mt-1 text-xs text-[var(--muted)]">Used later to calculate the production schedule.</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Delivery time</dt><dd className="mt-1 text-sm font-medium">{dayRange(product.delivery_min_days, product.delivery_max_days)}</dd><dd className="mt-1 text-xs text-[var(--muted)]">Used later to calculate expected delivery dates.</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Inventory thresholds</dt><dd className="mt-1 text-sm font-medium">Minimum {product.min_stock} {product.unit}; reorder at {product.reorder_level} {product.unit}</dd></div>
        {product.description && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs font-semibold uppercase text-[var(--muted)]">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{product.description}</dd></div>}
      </dl>

      {(() => {
        const selectedStandard = getProductQualityStandard(product);
        const qualityQty = getProductQualityQuantity(product);
        return (
          <div className="mt-8 border-b border-[var(--line)] pb-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Quality Standard Quantities (IS Standards)</h2>
              {selectedStandard ? (
                <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
                  Selected Standard: {selectedStandard} ({qualityQty})
                </span>
              ) : (
                <span className="text-xs text-[var(--muted)]">No standard selected</span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className={`rounded-lg border p-3.5 ${selectedStandard === "IS:4985 PVC Pipe" ? "border-teal-500 bg-teal-50/50 shadow-sm" : "border-[var(--line)] bg-slate-50/50"}`}>
                <p className="text-xs font-medium text-[var(--muted)]">IS:4985 PVC Pipe</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800 tabular-nums">{Number(product.qty_is_4985 || 0)}</p>
              </div>
              <div className={`rounded-lg border p-3.5 ${selectedStandard === "IS:12786 Plain Lateral" ? "border-teal-500 bg-teal-50/50 shadow-sm" : "border-[var(--line)] bg-slate-50/50"}`}>
                <p className="text-xs font-medium text-[var(--muted)]">IS:12786 Plain Lateral</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800 tabular-nums">{Number(product.qty_is_12786 || 0)}</p>
              </div>
              <div className={`rounded-lg border p-3.5 ${selectedStandard === "IS:13487 Emitter" ? "border-teal-500 bg-teal-50/50 shadow-sm" : "border-[var(--line)] bg-slate-50/50"}`}>
                <p className="text-xs font-medium text-[var(--muted)]">IS:13487 Emitter</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800 tabular-nums">{Number(product.qty_is_13487 || 0)}</p>
              </div>
              <div className={`rounded-lg border p-3.5 ${selectedStandard === "IS:13488 Emitting Pipe" ? "border-teal-500 bg-teal-50/50 shadow-sm" : "border-[var(--line)] bg-slate-50/50"}`}>
                <p className="text-xs font-medium text-[var(--muted)]">IS:13488 Emitting Pipe</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800 tabular-nums">{Number(product.qty_is_13488 || 0)}</p>
              </div>
              <div className={`rounded-lg border p-3.5 ${selectedStandard === "IS:12785 Filters" ? "border-teal-500 bg-teal-50/50 shadow-sm" : "border-[var(--line)] bg-slate-50/50"}`}>
                <p className="text-xs font-medium text-[var(--muted)]">IS:12785 Filters</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800 tabular-nums">{Number(product.qty_is_12785 || 0)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      <ProductBomSection
        productId={product.id}
        businessId={context.user.business_id}
        canEdit={canEdit}
        canViewMaterials={canViewMaterials}
        notice={paramsValue.bom_notice}
        error={paramsValue.bom_error}
      />
    </div>
  );
}