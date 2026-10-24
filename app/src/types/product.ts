export const PRODUCT_UNITS = ["Piece", "Bundle", "Box", "Kg", "Meter", "Set"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export type CategoryStatus = "ACTIVE" | "INACTIVE";

export interface ProductCategory {
  id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  status: CategoryStatus;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  name: string;
  sku: string;
  description: string | null;
  unit: ProductUnit;
  selling_price: string | number;
  tax_rate: string | number;
  daily_capacity: number;
  production_unit: ProductUnit;
  production_min_days: number;
  production_max_days: number;
  setup_minutes: number;
  delivery_min_days: number;
  delivery_max_days: number;
  min_stock: string | number;
  reorder_level: string | number;
  quality_grade?: string | null;
  quality_standard?: string | null;
  qty_is_4985?: number | null;
  qty_is_12786?: number | null;
  qty_is_13487?: number | null;
  qty_is_13488?: number | null;
  qty_is_12785?: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const QUALITY_STANDARDS = [
  "IS:4985 PVC Pipe",
  "IS:12786 Plain Lateral",
  "IS:13487 Emitter",
  "IS:13488 Emitting Pipe",
  "IS:12785 Filters",
] as const;

export type QualityStandard = (typeof QUALITY_STANDARDS)[number];

export const QUALITY_STANDARD_MAP: Record<
  QualityStandard,
  { key: "qty_is_4985" | "qty_is_12786" | "qty_is_13487" | "qty_is_13488" | "qty_is_12785"; label: string; code: string }
> = {
  "IS:4985 PVC Pipe": { key: "qty_is_4985", label: "IS:4985 PVC Pipe", code: "IS:4985" },
  "IS:12786 Plain Lateral": { key: "qty_is_12786", label: "IS:12786 Plain Lateral", code: "IS:12786" },
  "IS:13487 Emitter": { key: "qty_is_13487", label: "IS:13487 Emitter", code: "IS:13487" },
  "IS:13488 Emitting Pipe": { key: "qty_is_13488", label: "IS:13488 Emitting Pipe", code: "IS:13488" },
  "IS:12785 Filters": { key: "qty_is_12785", label: "IS:12785 Filters", code: "IS:12785" },
};

export function getProductQualityStandard(product?: {
  quality_standard?: string | null;
  qty_is_4985?: number | null;
  qty_is_12786?: number | null;
  qty_is_13487?: number | null;
  qty_is_13488?: number | null;
  qty_is_12785?: number | null;
}): QualityStandard | "" {
  if (!product) return "";
  if (product.quality_standard && (QUALITY_STANDARDS as readonly string[]).includes(product.quality_standard)) {
    return product.quality_standard as QualityStandard;
  }
  if (Number(product.qty_is_4985 || 0) > 0) return "IS:4985 PVC Pipe";
  if (Number(product.qty_is_12786 || 0) > 0) return "IS:12786 Plain Lateral";
  if (Number(product.qty_is_13487 || 0) > 0) return "IS:13487 Emitter";
  if (Number(product.qty_is_13488 || 0) > 0) return "IS:13488 Emitting Pipe";
  if (Number(product.qty_is_12785 || 0) > 0) return "IS:12785 Filters";
  return "";
}

export function getProductQualityQuantity(product?: {
  quality_standard?: string | null;
  qty_is_4985?: number | null;
  qty_is_12786?: number | null;
  qty_is_13487?: number | null;
  qty_is_13488?: number | null;
  qty_is_12785?: number | null;
}): number {
  if (!product) return 0;
  const std = getProductQualityStandard(product);
  if (!std) return 0;
  const key = QUALITY_STANDARD_MAP[std]?.key;
  return key ? Number(product[key] || 0) : 0;
}

export interface ProductVariant {
  id: string;
  business_id: string;
  product_id: string;
  sku: string | null;
  name: string;
  quality_grade?: string | null;
  price: string | number | null;
  daily_capacity: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductFormValues {
  name: string;
  sku: string;
  quality_grade: string;
  quality_standard: string;
  qty_is_4985?: string;
  qty_is_12786?: string;
  qty_is_13487?: string;
  qty_is_13488?: string;
  qty_is_12785?: string;
  category_id: string;
  subcategory_id: string;
  description: string;
  unit: string;
  selling_price: string;
  tax_rate: string;
  daily_capacity: string;
  production_unit: string;
  production_min_days: string;
  production_max_days: string;
  setup_minutes: string;
  delivery_min_days: string;
  delivery_max_days: string;
  min_stock: string;
  reorder_level: string;
  status: string;
}