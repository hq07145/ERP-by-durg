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
  active: boolean;
  created_at: string;
  updated_at: string;
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