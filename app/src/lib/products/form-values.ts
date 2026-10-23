import type { Product, ProductFormValues } from "@/types/product";

export const EMPTY_PRODUCT_FORM_VALUES: ProductFormValues = {
  name: "",
  sku: "",
  quality_grade: "",
  category_id: "",
  subcategory_id: "",
  description: "",
  unit: "Piece",
  selling_price: "0",
  tax_rate: "0",
  daily_capacity: "1",
  production_unit: "Piece",
  production_min_days: "1",
  production_max_days: "1",
  setup_minutes: "0",
  delivery_min_days: "0",
  delivery_max_days: "0",
  min_stock: "0",
  reorder_level: "0",
  status: "ACTIVE",
};

export function productToFormValues(product?: Product): ProductFormValues {
  if (!product) return { ...EMPTY_PRODUCT_FORM_VALUES };

  return {
    name: product.name,
    sku: product.sku,
    quality_grade: product.quality_grade ?? "",
    category_id: product.category_id ?? "",
    subcategory_id: product.subcategory_id ?? "",
    description: product.description ?? "",
    unit: product.unit,
    selling_price: String(product.selling_price),
    tax_rate: String(product.tax_rate),
    daily_capacity: String(product.daily_capacity),
    production_unit: product.production_unit,
    production_min_days: String(product.production_min_days),
    production_max_days: String(product.production_max_days),
    setup_minutes: String(product.setup_minutes),
    delivery_min_days: String(product.delivery_min_days),
    delivery_max_days: String(product.delivery_max_days),
    min_stock: String(product.min_stock),
    reorder_level: String(product.reorder_level),
    status: product.active ? "ACTIVE" : "INACTIVE",
  };
}