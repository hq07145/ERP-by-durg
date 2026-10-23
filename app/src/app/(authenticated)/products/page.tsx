import Link from "next/link";
import ConfirmSubmit from "@/components/confirm-submit";
import { requireAuthContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { toggleProductStatusAction } from "@/lib/products/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product, ProductCategory } from "@/types/product";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const messages: Record<string, string> = {
  product_created: "Product created.",
  product_updated: "Product updated.",
  product_activated: "Product activated.",
  product_deactivated: "Product deactivated. Existing references remain intact.",
  product_not_found: "That product is not available in this business.",
  product_update_failed: "Product status could not be changed.",
  auth_unconfigured: "Supabase is not configured for this environment.",
  forbidden: "You do not have permission to manage products.",
};

function safeSearch(value: string | undefined): string {
  return (value ?? "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function money(value: string | number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}

function dayRange(minimum: number, maximum: number): string {
  return minimum === maximum ? `${minimum} day${minimum === 1 ? "" : "s"}` : `${minimum}-${maximum} days`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    page?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const context = await requireAuthContext();
  await requirePermission(context, "products.view");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const canCreate = hasPermission({ permissions: context.permissions }, "products.create");
  const canEdit = hasPermission({ permissions: context.permissions }, "products.edit");

  if (!supabase) return <p className="text-sm text-[var(--signal)]">Supabase is not configured.</p>;

  const search = safeSearch(params.q);
  const pageNumber = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const requestedCategory = params.category ?? "";
  const status = params.status === "active" || params.status === "inactive" ? params.status : "all";
  const [{ data: categoryData, error: categoryError }, { data: businessData }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, business_id, parent_id, name, status, created_at, updated_at")
      .eq("business_id", context.user.business_id)
      .order("name")
      .limit(500),
    supabase
      .from("businesses")
      .select("currency")
      .eq("id", context.user.business_id)
      .maybeSingle(),
  ]);
  if (categoryError) return <p className="text-sm text-[var(--signal)]">Categories could not be loaded.</p>;

  const categories = (categoryData ?? []) as ProductCategory[];
  const selectedCategory = categories.find((category) => category.id === requestedCategory);
  const offset = (page - 1) * PAGE_SIZE;
  let productQuery = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("business_id", context.user.business_id)
    .order("name")
    .range(offset, offset + PAGE_SIZE - 1);

  if (search) productQuery = productQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  if (selectedCategory) {
    productQuery = selectedCategory.parent_id
      ? productQuery.eq("subcategory_id", selectedCategory.id)
      : productQuery.eq("category_id", selectedCategory.id);
  }
  if (status !== "all") productQuery = productQuery.eq("active", status === "active");

  const [{ data: productData, error: productError, count }, { data: allCategoryData }] = await Promise.all([
    productQuery,
    supabase
      .from("categories")
      .select("id, business_id, parent_id, name, status, created_at, updated_at")
      .eq("business_id", context.user.business_id)
      .limit(500),
  ]);

  if (productError) return <p className="text-sm text-[var(--signal)]">Products could not be loaded.</p>;
  const products = (productData ?? []) as Product[];
  const categoryMap = new Map(((allCategoryData ?? []) as ProductCategory[]).map((category) => [category.id, category]));
  const currency = (businessData as { currency?: string } | null)?.currency ?? "INR";
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const notice = params.notice ? messages[params.notice] : params.error ? messages[params.error] : null;
  const isError = Boolean(params.error);
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (requestedCategory) query.set("category", requestedCategory);
    if (status !== "all") query.set("status", status);
    query.set("page", String(targetPage));
    return `/products?${query.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)]">Configuration</p>
          <h1 className="mt-2 text-3xl font-semibold">Products</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Product and production-day capacity settings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-sm border border-[var(--line)] px-3 py-2 text-sm font-medium hover:bg-white" href="/import?module=products">Bulk upload</Link>
          <Link className="rounded-sm border border-[var(--line)] px-3 py-2 text-sm font-medium hover:bg-white" href="/categories">Categories</Link>
          {canCreate && <Link className="rounded-sm bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]" href="/products/new">New product</Link>}
        </div>
      </div>

      {notice && <p className={`mt-5 border-l-2 px-3 py-2 text-sm ${isError ? "border-[var(--signal)] bg-[#fbf0ec] text-[var(--signal)]" : "border-[var(--accent)] bg-[#eef5f0] text-[var(--accent-strong)]"}`} role="status">{notice}</p>}

      <form action="/products" className="mt-6 grid gap-3 border-b border-[var(--line)] pb-6 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(170px,0.8fr)_150px_auto]">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
          Search name or SKU
          <input className="min-h-10 rounded-sm border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]" maxLength={80} name="q" defaultValue={search} />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
          Category
          <select className="min-h-10 rounded-sm border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]" name="category" defaultValue={requestedCategory}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parent_id ? `  ${categoryMap.get(category.parent_id)?.name ?? "Category"} / ` : ""}{category.name}{category.status === "INACTIVE" ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--muted)]">
          Status
          <select className="min-h-10 rounded-sm border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]" name="status" defaultValue={status}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="flex items-end">
          <button className="min-h-10 w-full rounded-sm border border-[var(--line)] bg-white px-4 text-sm font-semibold hover:bg-[#eaf0eb]" type="submit">Apply filters</button>
        </div>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm text-[var(--muted)]">
        <p>{count ?? 0} product{count === 1 ? "" : "s"}</p>
        <p>Page {page} of {totalPages}</p>
      </div>
      <div className="mt-3 overflow-x-auto border-y border-[var(--line)]">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="bg-[#eaf0eb] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 py-3 font-semibold">SKU</th>
              <th className="px-3 py-3 font-semibold">Category</th>
              <th className="px-3 py-3 font-semibold">Unit</th>
              <th className="px-3 py-3 font-semibold">Price</th>
              <th className="px-3 py-3 font-semibold">Daily capacity</th>
              <th className="px-3 py-3 font-semibold">Production</th>
              <th className="px-3 py-3 font-semibold">Delivery</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {products.map((product) => {
              const category = product.category_id ? categoryMap.get(product.category_id) : undefined;
              const subcategory = product.subcategory_id ? categoryMap.get(product.subcategory_id) : undefined;
              const categoryLabel = category ? `${category.name}${subcategory ? ` / ${subcategory.name}` : ""}` : "-";
              const hasQualityQuantities =
                Number(product.qty_is_4985 || 0) > 0 ||
                Number(product.qty_is_12786 || 0) > 0 ||
                Number(product.qty_is_13487 || 0) > 0 ||
                Number(product.qty_is_13488 || 0) > 0 ||
                Number(product.qty_is_12785 || 0) > 0;
              return (
                <tr key={product.id} className="bg-white align-middle">
                  <td className="px-3 py-3">
                    <Link className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]" href={`/products/${product.id}`}>{product.name}</Link>
                    {product.quality_grade ? (
                      <p className="text-xs font-medium text-teal-800">Quality: {product.quality_grade}</p>
                    ) : (
                      <p className="text-xs text-slate-400">Quality not configured</p>
                    )}
                    {hasQualityQuantities && (
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-[var(--muted)]">
                        {Number(product.qty_is_4985 || 0) > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">IS:4985 ({Number(product.qty_is_4985)})</span>}
                        {Number(product.qty_is_12786 || 0) > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">IS:12786 ({Number(product.qty_is_12786)})</span>}
                        {Number(product.qty_is_13487 || 0) > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">IS:13487 ({Number(product.qty_is_13487)})</span>}
                        {Number(product.qty_is_13488 || 0) > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">IS:13488 ({Number(product.qty_is_13488)})</span>}
                        {Number(product.qty_is_12785 || 0) > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">IS:12785 ({Number(product.qty_is_12785)})</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{product.sku}</td>
                  <td className="px-3 py-3 text-[var(--muted)]">{categoryLabel}</td>
                  <td className="px-3 py-3">{product.unit}</td>
                  <td className="px-3 py-3 tabular-nums">{money(product.selling_price, currency)}</td>
                  <td className="px-3 py-3 tabular-nums">{product.daily_capacity} {product.production_unit}</td>
                  <td className="px-3 py-3">{dayRange(product.production_min_days, product.production_max_days)}</td>
                  <td className="px-3 py-3">{dayRange(product.delivery_min_days, product.delivery_max_days)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex min-h-7 items-center border px-2 text-xs font-semibold ${product.active ? "border-[#b8d7c7] bg-[#eef5f0] text-[var(--accent-strong)]" : "border-[#e6c5b9] bg-[#fbf0ec] text-[var(--signal)]"}`}>
                      {product.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Link className="text-xs font-semibold text-[var(--accent)] hover:underline" href={`/products/${product.id}`}>View</Link>
                      {canEdit && <Link className="text-xs font-semibold text-[var(--accent)] hover:underline" href={`/products/${product.id}/edit`}>Edit</Link>}
                      {canEdit && (
                        <ConfirmSubmit
                          action={toggleProductStatusAction}
                          fieldName="product_id"
                          fieldValue={product.id}
                          label={product.active ? "Deactivate" : "Activate"}
                          confirmation={product.active ? `Deactivate ${product.name}? It will remain available for historical records.` : `Activate ${product.name}?`}
                          className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && <tr><td className="px-3 py-12 text-center text-[var(--muted)]" colSpan={10}>No products match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {page > 1 && <Link className="rounded-sm border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium" href={pageHref(page - 1)}>Previous</Link>}
        {page < totalPages && <Link className="rounded-sm border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium" href={pageHref(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}