export const RAW_MATERIAL_UNITS = [
  "kg",
  "gram",
  "litre",
  "millilitre",
  "meter",
  "piece",
  "bundle",
  "box",
  "set",
] as const;

export type RawMaterialUnit = (typeof RAW_MATERIAL_UNITS)[number];
export type RawMaterialStatus = "ACTIVE" | "INACTIVE";

export interface RawMaterial {
  id: string;
  business_id: string;
  code: string | null;
  name: string;
  unit: RawMaterialUnit;
  current_stock: string | number;
  min_stock: string | number;
  reorder_level: string | number;
  purchase_price: string | number;
  status: RawMaterialStatus;
  created_at: string;
  updated_at: string;
}

export interface RawMaterialFormValues {
  code: string;
  name: string;
  unit: string;
  min_stock: string;
  reorder_level: string;
  purchase_price: string;
}

export interface InventoryRecord {
  id: string;
  business_id: string;
  item_type: string;
  item_id: string;
  current_stock: string | number;
  reserved_stock: string | number;
  available_stock: string | number;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  business_id: string;
  item_type: string;
  item_id: string;
  transaction_type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  quantity: string | number;
  reference_type: string;
  reference_id: string | null;
  batch_number?: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface ProductBom {
  id: string;
  business_id: string;
  product_id: string;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BomItem {
  id: string;
  business_id: string;
  bom_id: string;
  raw_material_id: string;
  quantity_per_unit: string | number;
  created_at: string;
  updated_at: string;
}

export interface BomRequirement {
  raw_material_id: string;
  code: string | null;
  name: string;
  unit: RawMaterialUnit;
  quantity_per_unit: string | number;
  required_quantity: string | number;
}