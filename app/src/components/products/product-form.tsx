"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { saveProductAction } from "@/lib/products/actions";
import { PRODUCT_UNITS, type ProductCategory, type ProductFormValues } from "@/types/product";

const inputClass = "min-h-10 w-full rounded-sm border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--accent)]";
const selectClass = `${inputClass} py-2`;
const labelClass = "grid gap-1.5 text-sm font-medium";
const hintClass = "text-xs font-normal leading-5 text-[var(--muted)]";

const errors: Record<string, string> = {
  account_unavailable: "Your session has expired. Please sign in again.",
  auth_unconfigured: "Supabase is not configured for this environment.",
  forbidden: "You do not have permission to make this change.",
  invalid_name: "Enter a product name of 1 to 160 characters.",
  invalid_sku: "Enter a SKU of 1 to 64 characters.",
  duplicate_sku: "That SKU is already used in this business.",
  invalid_description: "Description must be 2,000 characters or fewer.",
  invalid_unit: "Choose one of the available product units.",
  invalid_production_unit: "Choose one of the available production units.",
  invalid_price: "Selling price must be a non-negative amount with up to two decimals.",
  invalid_tax_rate: "Tax rate must be between 0 and 100, with up to two decimals.",
  invalid_capacity: "Daily production capacity must be greater than zero.",
  invalid_production_range: "Maximum production time must be at least the minimum.",
  invalid_setup_time: "Setup time must be a non-negative whole number of minutes.",
  invalid_delivery_range: "Maximum delivery time must be at least the minimum.",
  invalid_min_stock: "Minimum stock must be non-negative, with up to three decimals.",
  invalid_reorder_level: "Reorder level must be non-negative, with up to three decimals.",
  invalid_category: "Choose an active category and a matching active subcategory.",
  invalid_status: "Choose a valid product status.",
  invalid_values: "One or more values violate valid constraints.",
  invalid_quality_standard: "Please select a quality standard.",
  invalid_quality_quantity: "Please enter a valid quantity for the selected quality standard.",
  price_permission_required: "You need products.change_price to change the selling price or tax rate.",
  capacity_permission_required: "You need products.change_capacity to change daily capacity.",
  production_permission_required: "You need products.change_production_time to change production settings.",
  delivery_permission_required: "You need products.change_delivery_time to change delivery settings.",
  field_permission_required: "You do not have permission to change one or more protected fields.",
  product_not_found: "This product is no longer available in your business.",
  product_save_failed: "The product could not be saved. Check the values and try again.",
};

type ProductFormProps = {
  productId?: string;
  initialValues: ProductFormValues;
  categories: ProductCategory[];
  canChangePrice: boolean;
  canChangeCapacity: boolean;
  canChangeProductionTime: boolean;
  canChangeDeliveryTime: boolean;
};

export default function ProductForm({
  productId,
  initialValues,
  categories,
  canChangePrice,
  canChangeCapacity,
  canChangeProductionTime,
  canChangeDeliveryTime,
}: ProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [values, setValues] = useState(initialValues);

  // Safety timer to prevent being stuck forever on network failure
  useEffect(() => {
    if (!isSubmitting) return;
    const timer = setTimeout(() => {
      setIsSubmitting(false);
      setErrorMessage("The save request is taking longer than expected. Please check if your changes were saved or try again.");
    }, 20000);
    return () => clearTimeout(timer);
  }, [isSubmitting]);

  const roots = categories.filter((category) =>
    !category.parent_id && (category.status === "ACTIVE" || category.id === initialValues.category_id),
  );
  const children = categories.filter((category) =>
    category.parent_id === values.category_id &&
    (category.status === "ACTIVE" || category.id === initialValues.subcategory_id),
  );

  function setValue(
    field: keyof ProductFormValues,
    value: string,
    event?: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    event?.currentTarget.setCustomValidity("");
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "category_id" ? { subcategory_id: "" } : {}),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (!values.quality_standard) {
      setErrorMessage("Please select a quality standard.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await saveProductAction({}, formData);

      if (result.error) {
        setErrorMessage(
          errors[result.error] ??
            (result.error ? `Save failed: ${result.error}` : "The product could not be saved. Check the values and try again.")
        );
        setIsSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (result.success && result.productId) {
        const targetUrl = productId
          ? `/products/${result.productId}?notice=product_updated`
          : `/products/${result.productId}?notice=product_created`;
        router.push(targetUrl);
        router.refresh();
      } else {
        setErrorMessage("Failed to save product. Please try again.");
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error("[ProductForm] Save error:", err);
      setErrorMessage(err?.message || "An unexpected error occurred while saving.");
      setIsSubmitting(false);
    }
  }

  const disabledByPermission = (allowed: boolean) => Boolean(productId) && !allowed;

  return (
    <form onSubmit={handleSubmit} className="space-y-9">
      {productId && <input type="hidden" name="product_id" value={productId} />}
      {errorMessage && (
        <p className="border-l-2 border-[var(--signal)] bg-[#fbf0ec] px-3 py-2 text-sm text-[var(--signal)]" role="alert">
          {errorMessage}
        </p>
      )}

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 md:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Basic information</legend>
        <label className={labelClass}>
          Product name <span className="text-[var(--signal)]">*</span>
          <input className={inputClass} autoComplete="off" maxLength={160} name="name" onChange={(event) => setValue("name", event.target.value, event)} required value={values.name} />
        </label>
        <label className={labelClass}>
          SKU <span className="text-[var(--signal)]">*</span>
          <input className={inputClass} autoComplete="off" maxLength={64} name="sku" onChange={(event) => setValue("sku", event.target.value, event)} required value={values.sku} />
          <span className={hintClass}>Saved in uppercase and unique within this business.</span>
        </label>
        <label className={labelClass}>
          Quality / Grade
          <input className={inputClass} autoComplete="off" maxLength={80} name="quality_grade" onChange={(event) => setValue("quality_grade", event.target.value, event)} value={values.quality_grade} placeholder="e.g. Class 2, Grade 100, ISO 200, Virgin" />
          <span className={hintClass}>Configured product quality, grade, or specification number.</span>
        </label>
        <label className={labelClass}>
          Category
          <select className={selectClass} name="category_id" onChange={(event) => setValue("category_id", event.target.value, event)} value={values.category_id}>
            <option value="">No category</option>
            {roots.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}{category.status === "INACTIVE" ? " (inactive existing)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Subcategory
          <select className={selectClass} name="subcategory_id" onChange={(event) => setValue("subcategory_id", event.target.value, event)} value={values.subcategory_id}>
            <option value="">No subcategory</option>
            {children.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}{category.status === "INACTIVE" ? " (inactive existing)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Description
          <textarea className={`${inputClass} min-h-24 py-2`} maxLength={2000} name="description" onChange={(event) => setValue("description", event.target.value, event)} value={values.description} />
        </label>
        <label className={labelClass}>
          Unit
        </label>
        <select className={selectClass} name="unit" onChange={(event) => setValue("unit", event.target.value, event)} value={values.unit}>
          {PRODUCT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-semibold col-span-full">Quality Standard Quantities (IS Standards)</legend>
        <p className="text-xs text-[var(--muted)] col-span-full -mt-3">
          Select a quality standard and configure the quantity for this product.
        </p>

        <label className={labelClass}>
          Quality Standard <span className="text-[var(--signal)]">*</span>
          <select
            className={selectClass}
            name="quality_standard"
            required
            onChange={(event) => {
              const newStd = event.target.value;
              setValue("quality_standard", newStd, event);
            }}
            value={values.quality_standard || ""}
          >
            <option value="">Select Quality Standard</option>
            <option value="IS:4985 PVC Pipe">IS:4985 PVC Pipe</option>
            <option value="IS:12786 Plain Lateral">IS:12786 Plain Lateral</option>
            <option value="IS:13487 Emitter">IS:13487 Emitter</option>
            <option value="IS:13488 Emitting Pipe">IS:13488 Emitting Pipe</option>
            <option value="IS:12785 Filters">IS:12785 Filters</option>
          </select>
          <span className={hintClass}>Required: choose one IS quality standard.</span>
        </label>

        {values.quality_standard === "IS:4985 PVC Pipe" && (
          <label className={labelClass}>
            IS:4985 PVC Pipe Qty <span className="text-[var(--signal)]">*</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              name="qty_is_4985"
              required
              onChange={(event) => setValue("qty_is_4985", event.target.value, event)}
              value={values.qty_is_4985 ?? ""}
              placeholder="0.00"
            />
            <span className={hintClass}>IS:4985 PVC Pipe quantity</span>
          </label>
        )}

        {values.quality_standard === "IS:12786 Plain Lateral" && (
          <label className={labelClass}>
            IS:12786 Plain Lateral Qty <span className="text-[var(--signal)]">*</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              name="qty_is_12786"
              required
              onChange={(event) => setValue("qty_is_12786", event.target.value, event)}
              value={values.qty_is_12786 ?? ""}
              placeholder="0.00"
            />
            <span className={hintClass}>IS:12786 Plain Lateral quantity</span>
          </label>
        )}

        {values.quality_standard === "IS:13487 Emitter" && (
          <label className={labelClass}>
            IS:13487 Emitter Qty <span className="text-[var(--signal)]">*</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              name="qty_is_13487"
              required
              onChange={(event) => setValue("qty_is_13487", event.target.value, event)}
              value={values.qty_is_13487 ?? ""}
              placeholder="0.00"
            />
            <span className={hintClass}>IS:13487 Emitter quantity</span>
          </label>
        )}

        {values.quality_standard === "IS:13488 Emitting Pipe" && (
          <label className={labelClass}>
            IS:13488 Emitting Pipe Qty <span className="text-[var(--signal)]">*</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              name="qty_is_13488"
              required
              onChange={(event) => setValue("qty_is_13488", event.target.value, event)}
              value={values.qty_is_13488 ?? ""}
              placeholder="0.00"
            />
            <span className={hintClass}>IS:13488 Emitting Pipe quantity</span>
          </label>
        )}

        {values.quality_standard === "IS:12785 Filters" && (
          <label className={labelClass}>
            IS:12785 Filters Qty <span className="text-[var(--signal)]">*</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.01"
              name="qty_is_12785"
              required
              onChange={(event) => setValue("qty_is_12785", event.target.value, event)}
              value={values.qty_is_12785 ?? ""}
              placeholder="0.00"
            />
            <span className={hintClass}>IS:12785 Filters quantity</span>
          </label>
        )}
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 md:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Pricing</legend>
        <label className={labelClass}>
          Selling price <span className="text-[var(--signal)]">*</span>
          <input className={inputClass} inputMode="decimal" max="999999999999.99" min="0" name="selling_price" onChange={(event) => setValue("selling_price", event.target.value, event)} readOnly={disabledByPermission(canChangePrice)} required step="0.01" type="number" value={values.selling_price} />
          {disabledByPermission(canChangePrice) && <span className={hintClass}>Requires products.change_price to edit.</span>}
        </label>
        <label className={labelClass}>
          GST Rate (%)
          <div className="flex gap-1.5 mt-1 mb-1">
            {[0, 5, 12, 18, 28].map((slab) => (
              <button
                key={slab}
                type="button"
                disabled={disabledByPermission(canChangePrice)}
                onClick={() => setValue("tax_rate", String(slab))}
                className={`px-2 py-0.5 text-xs font-semibold rounded border transition ${
                  Number(values.tax_rate) === slab
                    ? "bg-[#0F766E] text-white border-[#0F766E]"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {slab === 0 ? "0% (Exempt)" : `${slab}%`}
              </button>
            ))}
          </div>
          <input className={inputClass} inputMode="decimal" max="100" min="0" name="tax_rate" onChange={(event) => setValue("tax_rate", event.target.value, event)} readOnly={disabledByPermission(canChangePrice)} required step="0.01" type="number" value={values.tax_rate} placeholder="Enter applicable GST rate (0 to 100)" />
          {disabledByPermission(canChangePrice) && <span className={hintClass}>GST rate is part of pricing and requires products.change_price to edit.</span>}
        </label>
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 md:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Production</legend>
        <label className={labelClass}>
          Daily production capacity <span className="text-[var(--signal)]">*</span>
          <input className={inputClass} inputMode="numeric" max="2147483647" min="1" name="daily_capacity" onChange={(event) => setValue("daily_capacity", event.target.value, event)} readOnly={disabledByPermission(canChangeCapacity)} required step="1" type="number" value={values.daily_capacity} />
          <span className={hintClass}>Maximum quantity this product can normally be produced in one production day/slot.</span>
          {disabledByPermission(canChangeCapacity) && <span className={hintClass}>Requires products.change_capacity to edit.</span>}
        </label>
        <label className={labelClass}>
          Production unit
          <select className={selectClass} disabled={disabledByPermission(canChangeProductionTime)} name="production_unit" onChange={(event) => setValue("production_unit", event.target.value, event)} value={values.production_unit}>
            {PRODUCT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Minimum production time (days)
          <input className={inputClass} max="10000" min="0" name="production_min_days" onChange={(event) => setValue("production_min_days", event.target.value, event)} readOnly={disabledByPermission(canChangeProductionTime)} required step="1" type="number" value={values.production_min_days} />
        </label>
        <label className={labelClass}>
          Maximum production time (days)
          <input className={inputClass} max="10000" min="0" name="production_max_days" onChange={(event) => setValue("production_max_days", event.target.value, event)} readOnly={disabledByPermission(canChangeProductionTime)} required step="1" type="number" value={values.production_max_days} />
          <span className={hintClass}>Used later to calculate the production schedule.</span>
        </label>
        <label className={labelClass}>
          Setup time (minutes)
          <input className={inputClass} max="2147483647" min="0" name="setup_minutes" onChange={(event) => setValue("setup_minutes", event.target.value, event)} readOnly={disabledByPermission(canChangeProductionTime)} required step="1" type="number" value={values.setup_minutes} />
        </label>
        {disabledByPermission(canChangeProductionTime) && (
          <p className={`${hintClass} self-end`}>Production settings require products.change_production_time to edit.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 md:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Delivery</legend>
        <label className={labelClass}>
          Minimum delivery time (days)
          <input className={inputClass} max="10000" min="0" name="delivery_min_days" onChange={(event) => setValue("delivery_min_days", event.target.value, event)} readOnly={disabledByPermission(canChangeDeliveryTime)} required step="1" type="number" value={values.delivery_min_days} />
        </label>
        <label className={labelClass}>
          Maximum delivery time (days)
          <input className={inputClass} max="10000" min="0" name="delivery_max_days" onChange={(event) => setValue("delivery_max_days", event.target.value, event)} readOnly={disabledByPermission(canChangeDeliveryTime)} required step="1" type="number" value={values.delivery_max_days} />
          <span className={hintClass}>Used later to calculate expected delivery dates.</span>
        </label>
        {disabledByPermission(canChangeDeliveryTime) && (
          <p className={`${hintClass} self-end`}>Delivery settings require products.change_delivery_time to edit.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 md:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Inventory configuration</legend>
        <label className={labelClass}>
          Minimum stock
          <input className={inputClass} inputMode="decimal" min="0" name="min_stock" onChange={(event) => setValue("min_stock", event.target.value, event)} required step="0.001" type="number" value={values.min_stock} />
        </label>
        <label className={labelClass}>
          Reorder level
          <input className={inputClass} inputMode="decimal" min="0" name="reorder_level" onChange={(event) => setValue("reorder_level", event.target.value, event)} required step="0.001" type="number" value={values.reorder_level} />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
        <legend className="px-1 text-lg font-semibold">Status</legend>
        <label className={labelClass}>
          Product status
          <select className={selectClass} name="status" onChange={(event) => setValue("status", event.target.value, event)} value={values.status}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <span className={hintClass}>Inactive products remain available for historical records.</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <button className="min-h-10 rounded-sm bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : productId ? "Save changes" : "Create product"}
        </button>
        <Link className="rounded-sm px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[#eaf0eb]" href={productId ? `/products/${productId}` : "/products"}>
          Cancel
        </Link>
      </div>
    </form>
  );
}