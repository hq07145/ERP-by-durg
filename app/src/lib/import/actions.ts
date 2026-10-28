"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  ImportModule,
  ImportJobRecord,
  ImportExecutionResponse,
  RowValidationError,
  RowClassificationStatus,
  ClassifiedImportRow,
  ImportClassificationResult,
  ImportJobRowRecord,
  RetryImportResponse,
} from "@/types/import";
import { classifyImportRowsInternal } from "./classification";
import { parseDateRobust, parseNumberRobust } from "./file-parser";
import { PRODUCT_UNITS, type ProductUnit, normalizeProductUnit } from "@/types/product";

function normalizeRawMaterialUnit(u?: string): "kg" | "gram" | "litre" | "millilitre" | "meter" | "piece" | "bundle" | "box" | "set" {
  if (!u) return "kg";
  const lower = u.trim().toLowerCase();
  if (lower.startsWith("kg") || lower.startsWith("kilo")) return "kg";
  if (lower.startsWith("gram") || lower === "gm" || lower === "g") return "gram";
  if (lower.startsWith("litre") || lower.startsWith("liter") || lower === "l" || lower === "ltr") return "litre";
  if (lower.startsWith("milli") || lower === "ml") return "millilitre";
  if (lower.startsWith("meter") || lower.startsWith("mtr") || lower === "m") return "meter";
  if (lower.startsWith("piece") || lower.startsWith("pc") || lower === "nos") return "piece";
  if (lower.startsWith("bundle")) return "bundle";
  if (lower.startsWith("box")) return "box";
  if (lower.startsWith("set")) return "set";
  return "kg";
}

function normalizePaymentMethod(method?: string): "CASH" | "BANK_TRANSFER" | "CHEQUE" | "UPI" | "CARD" | "OTHER" {
  if (!method) return "BANK_TRANSFER";
  const m = method.trim().toUpperCase();
  if (m === "CASH") return "CASH";
  if (m === "CHEQUE" || m === "CHECK") return "CHEQUE";
  if (m === "UPI" || m === "GPAY" || m === "PHONEPE" || m === "PAYTM") return "UPI";
  if (m === "CARD" || m === "CREDIT_CARD" || m === "DEBIT_CARD") return "CARD";
  if (m === "BANK_TRANSFER" || m === "NEFT" || m === "RTGS" || m === "IMPS" || m === "WIRE" || m === "NETBANKING") return "BANK_TRANSFER";
  return "OTHER";
}

/**
 * Ensures caller is an authenticated Admin or Super Admin
 */
async function requireAdminAuth() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const isAdminOrSuper =
    context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Bulk Data Import requires Admin or Super Admin privileges.");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client is not available.");

  const adminClient = createAdminSupabaseClient();
  const db = adminClient || supabase;

  return { context, supabase, db };
}

/**
 * Marks a specific row in import_job_rows as imported
 */
async function markRowSuccess(supabase: any, jobId: string, rowNumber: number, recordId?: string | null) {
  try {
    await supabase
      .from("import_job_rows")
      .update({
        status: "IMPORTED",
        imported_record_id: recordId || null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .eq("row_number", rowNumber);
  } catch (e) {
    console.warn("Failed to markRowSuccess:", e);
  }
}

/**
 * Marks a specific row in import_job_rows as failed
 */
async function markRowFailed(supabase: any, jobId: string, rowNumber: number, errorMsg: string) {
  try {
    await supabase
      .from("import_job_rows")
      .update({
        status: "FAILED",
        error_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .eq("row_number", rowNumber);
  } catch (e) {
    console.warn("Failed to markRowFailed:", e);
  }
}

/**
 * Fetches recent import jobs for the business
 */
export async function getRecentImportJobs(
  moduleFilter?: ImportModule
): Promise<ImportJobRecord[]> {
  const { context, supabase } = await requireAdminAuth();

  let query = supabase
    .from("import_jobs")
    .select("*, users!created_by(name)")
    .eq("business_id", context.user.business_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (moduleFilter) {
    query = query.eq("module", moduleFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching import jobs:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    business_id: row.business_id,
    module: row.module as ImportModule,
    filename: row.filename,
    file_hash: row.file_hash,
    total_rows: row.total_rows,
    imported_rows: row.imported_rows,
    failed_rows: row.failed_rows,
    status: row.status,
    error_summary: row.error_summary,
    errors: row.errors || [],
    metadata: row.metadata || {},
    created_by: row.created_by,
    created_at: row.created_at,
    completed_at: row.completed_at,
    creator_name: row.users?.name,
  }));
}

/**
 * Checks if a file with the given SHA-256 hash has already been imported
 */
export async function checkDuplicateFileHash(
  fileHash: string,
  module: ImportModule
): Promise<{
  isDuplicate: boolean;
  previousJob?: ImportJobRecord;
}> {
  const { context, supabase } = await requireAdminAuth();

  const { data } = await supabase
    .from("import_jobs")
    .select("*, users!created_by(name)")
    .eq("business_id", context.user.business_id)
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { isDuplicate: false };
  }

  return {
    isDuplicate: true,
    previousJob: {
      id: data.id,
      business_id: data.business_id,
      module: data.module as ImportModule,
      filename: data.filename,
      file_hash: data.file_hash,
      total_rows: data.total_rows,
      imported_rows: data.imported_rows,
      failed_rows: data.failed_rows,
      status: data.status,
      error_summary: data.error_summary,
      errors: data.errors || [],
      metadata: data.metadata || {},
      created_by: data.created_by,
      created_at: data.created_at,
      completed_at: data.completed_at,
      creator_name: data.users?.name,
    },
  };
}

/**
 * Classifies import records before execution, providing New, Duplicate, Invalid, Rejected breakdown
 */
export async function classifyImportAction(payload: {
  module: ImportModule;
  records: any[];
}): Promise<ImportClassificationResult> {
  const { context, db } = await requireAdminAuth();
  const businessId = context.user.business_id;
  return await classifyImportRowsInternal(db, businessId, payload.module, payload.records);
}

/**
 * Internal processor to execute rows for a specific module
 */
async function processModuleImportRows(
  supabase: any,
  businessId: string,
  userId: string,
  jobId: string,
  module: ImportModule,
  records: any[],
  addError: (rowNumber: number, identifier: string | undefined, errorMsg: string, rawData?: any) => void
): Promise<number> {
  let importedCount = 0;

  switch (module) {
    // -------------------------------------------------------------
    // 1. CUSTOMERS
    // -------------------------------------------------------------
    case "customers": {
      const { data: dbCustomers } = await supabase
        .from("customers")
        .select("id, name, phone, customer_addresses(id)")
        .eq("business_id", businessId);

      const phoneMap = new Map<string, { id: string; addressId: string | null }>();
      const nameMap = new Map<string, { id: string; addressId: string | null }>();

      (dbCustomers || []).forEach((c: any) => {
        const addrId = (c as any).customer_addresses?.[0]?.id || null;
        if (c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, "");
          if (digits.length >= 7) phoneMap.set(digits.slice(-10), { id: c.id, addressId: addrId });
        }
        if (c.name) {
          nameMap.set(c.name.trim().toLowerCase(), { id: c.id, addressId: addrId });
        }
      });

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const name = String(row.name || "").trim();
          if (!name) {
            addError(rowNum, undefined, "Customer Name is required", row);
            await markRowFailed(supabase, jobId, rowNum, "Customer Name is required");
            continue;
          }

          let existingCustomerId: string | null = null;
          let existingAddressId: string | null = null;

          if (row.phone) {
            const rawPhoneDigits = String(row.phone).replace(/[^0-9]/g, "");
            if (rawPhoneDigits.length >= 7) {
              const match = phoneMap.get(rawPhoneDigits.slice(-10));
              if (match) {
                existingCustomerId = match.id;
                existingAddressId = match.addressId;
              }
            }
          }

          if (!existingCustomerId) {
            const match = nameMap.get(name.toLowerCase());
            if (match) {
              existingCustomerId = match.id;
              existingAddressId = match.addressId;
            }
          }

          const creditLimitVal = parseNumberRobust(row.credit_limit) ?? 0;

          if (existingCustomerId) {
            const { error: updErr } = await supabase
              .from("customers")
              .update({
                name,
                company_name: row.company_name || null,
                phone: row.phone || null,
                email: row.email ? String(row.email).toLowerCase().trim() : null,
                gst_number: row.gst_number ? String(row.gst_number).toUpperCase().trim() : null,
                payment_terms: row.payment_terms || null,
                credit_limit: creditLimitVal,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingCustomerId);
            if (updErr) throw updErr;

            if (existingAddressId) {
              await supabase
                .from("customer_addresses")
                .update({
                  address: row.address || null,
                  city: row.city || null,
                  state: row.state || null,
                  postal_code: row.postal_code || null,
                  district: row.district || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingAddressId);
            } else if (row.address || row.city || row.state || row.postal_code || row.district) {
              const { data: newAddr } = await supabase
                .from("customer_addresses")
                .insert({
                  customer_id: existingCustomerId,
                  address_type: "PRIMARY",
                  address: row.address || null,
                  city: row.city || null,
                  state: row.state || null,
                  postal_code: row.postal_code || null,
                  district: row.district || null,
                })
                .select("id")
                .single();
              if (newAddr) existingAddressId = newAddr.id;
            }
            await markRowSuccess(supabase, jobId, rowNum, existingCustomerId);
          } else {
            const { data: newCust, error: insErr } = await supabase
              .from("customers")
              .insert({
                business_id: businessId,
                name,
                company_name: row.company_name || null,
                phone: row.phone || null,
                email: row.email ? String(row.email).toLowerCase().trim() : null,
                gst_number: row.gst_number ? String(row.gst_number).toUpperCase().trim() : null,
                payment_terms: row.payment_terms || "NET_30",
                credit_limit: creditLimitVal,
                status: "ACTIVE",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            existingCustomerId = newCust.id;

            if (row.address || row.city || row.state || row.postal_code || row.district) {
              const { data: newAddr } = await supabase
                .from("customer_addresses")
                .insert({
                  customer_id: newCust.id,
                  address_type: "PRIMARY",
                  address: row.address || null,
                  city: row.city || null,
                  state: row.state || null,
                  postal_code: row.postal_code || null,
                  district: row.district || null,
                })
                .select("id")
                .single();
              if (newAddr) existingAddressId = newAddr.id;
            }
            await markRowSuccess(supabase, jobId, rowNum, newCust.id);
          }

          if (existingCustomerId) {
            nameMap.set(name.toLowerCase(), { id: existingCustomerId, addressId: existingAddressId });
            if (row.phone) {
              const digits = String(row.phone).replace(/[^0-9]/g, "");
              if (digits.length >= 7) phoneMap.set(digits.slice(-10), { id: existingCustomerId, addressId: existingAddressId });
            }
          }
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.name, err.message || "Failed to save customer", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to save customer");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 2. SUPPLIERS
    // -------------------------------------------------------------
    case "suppliers": {
      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const name = String(row.name || "").trim();
          if (!name) {
            addError(rowNum, undefined, "Supplier Name is required", row);
            await markRowFailed(supabase, jobId, rowNum, "Supplier Name is required");
            continue;
          }

          const { data: existing } = await supabase
            .from("suppliers")
            .select("id")
            .eq("business_id", businessId)
            .ilike("name", name)
            .maybeSingle();

          let supplierId: string;
          if (existing) {
            const { error: updErr } = await supabase
              .from("suppliers")
              .update({
                phone: row.phone || null,
                email: row.email || null,
                address: row.address || null,
                gst_number: row.gst_number || null,
                status: row.status || "ACTIVE",
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
            if (updErr) throw updErr;
            supplierId = existing.id;
          } else {
            const { data: insData, error } = await supabase
              .from("suppliers")
              .insert({
                business_id: businessId,
                name,
                phone: row.phone || null,
                email: row.email || null,
                address: row.address || null,
                gst_number: row.gst_number || null,
                status: row.status || "ACTIVE",
              })
              .select("id")
              .single();
            if (error) throw error;
            supplierId = insData.id;
          }
          await markRowSuccess(supabase, jobId, rowNum, supplierId);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.name, err.message || "Failed to save supplier", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to save supplier");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 3. PRODUCTS & CATEGORIES
    // -------------------------------------------------------------
    case "products": {
      const { data: existingCats } = await supabase
        .from("categories")
        .select("id, name")
        .eq("business_id", businessId);

      const categoryMap = new Map<string, string>();
      existingCats?.forEach((c: any) => categoryMap.set(c.name.trim().toLowerCase(), c.id));

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const sku = String(row.sku || "").trim();
          const name = String(row.name || "").trim();
          if (!sku || !name) {
            addError(rowNum, sku, "SKU and Product Name are required", row);
            await markRowFailed(supabase, jobId, rowNum, "SKU and Product Name are required");
            continue;
          }

          let categoryId: string | null = null;
          const categoryName = String(row.category || "").trim();
          if (categoryName) {
            const catKey = categoryName.toLowerCase();
            if (categoryMap.has(catKey)) {
              categoryId = categoryMap.get(catKey)!;
            } else {
              const { data: newCat, error: catErr } = await supabase
                .from("categories")
                .insert({
                  business_id: businessId,
                  name: categoryName,
                  status: "ACTIVE",
                })
                .select("id")
                .single();
              if (!catErr && newCat) {
                categoryId = newCat.id;
                categoryMap.set(catKey, newCat.id);
              }
            }
          }

          const sellingPrice = parseNumberRobust(row.selling_price) ?? 0;
          const taxRate = parseNumberRobust(row.tax_rate) ?? 18;
          const minStock = parseNumberRobust(row.min_stock) ?? 0;
          const dailyCapacity = parseNumberRobust(row.daily_capacity) ?? 100;

          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("business_id", businessId)
            .eq("sku", sku)
            .maybeSingle();

          const parseQty = (val: any) => {
            const n = parseNumberRobust(val);
            return n === null ? 0 : Math.max(0, n);
          };

          const resolveQualityData = () => {
            let stdRaw = String(row.quality_standard || row.standard || "").trim().toLowerCase();
            let explicitQty =
              row.quality_quantity !== undefined && row.quality_quantity !== null && String(row.quality_quantity).trim() !== ""
                ? parseQty(row.quality_quantity)
                : row.quality_qty !== undefined && row.quality_qty !== null && String(row.quality_qty).trim() !== ""
                ? parseQty(row.quality_qty)
                : null;

            let standard: string | null = null;
            let q4985 = parseQty(row.qty_is_4985);
            let q12786 = parseQty(row.qty_is_12786);
            let q13487 = parseQty(row.qty_is_13487);
            let q13488 = parseQty(row.qty_is_13488);
            let q12785 = parseQty(row.qty_is_12785);

            if (stdRaw.includes("4985") || stdRaw.includes("pvc")) {
              standard = "IS:4985 PVC Pipe";
              q4985 = explicitQty !== null ? explicitQty : (q4985 || 0);
            } else if (stdRaw.includes("12786") || stdRaw.includes("lateral")) {
              standard = "IS:12786 Plain Lateral";
              q12786 = explicitQty !== null ? explicitQty : (q12786 || 0);
            } else if (stdRaw.includes("13487") || (stdRaw.includes("emitter") && !stdRaw.includes("pipe"))) {
              standard = "IS:13487 Emitter";
              q13487 = explicitQty !== null ? explicitQty : (q13487 || 0);
            } else if (stdRaw.includes("13488") || stdRaw.includes("emitting")) {
              standard = "IS:13488 Emitting Pipe";
              q13488 = explicitQty !== null ? explicitQty : (q13488 || 0);
            } else if (stdRaw.includes("12785") || stdRaw.includes("filter")) {
              standard = "IS:12785 Filters";
              q12785 = explicitQty !== null ? explicitQty : (q12785 || 0);
            } else if (q4985 > 0) {
              standard = "IS:4985 PVC Pipe";
            } else if (q12786 > 0) {
              standard = "IS:12786 Plain Lateral";
            } else if (q13487 > 0) {
              standard = "IS:13487 Emitter";
            } else if (q13488 > 0) {
              standard = "IS:13488 Emitting Pipe";
            } else if (q12785 > 0) {
              standard = "IS:12785 Filters";
            }

            return {
              standard,
              q4985,
              q12786,
              q13487,
              q13488,
              q12785,
            };
          };

          const quality = resolveQualityData();
          let productId: string;

          if (existingProduct) {
            const { error: updErr } = await supabase
              .from("products")
              .update({
                name,
                category_id: categoryId,
                unit: normalizeProductUnit(row.unit),
                production_unit: normalizeProductUnit(row.production_unit || row.unit),
                selling_price: sellingPrice,
                tax_rate: taxRate,
                min_stock: minStock,
                daily_capacity: dailyCapacity,
                quality_standard: quality.standard,
                qty_is_4985: quality.q4985,
                qty_is_12786: quality.q12786,
                qty_is_13487: quality.q13487,
                qty_is_13488: quality.q13488,
                qty_is_12785: quality.q12785,
                description: row.description || null,
                active: row.active === false ? false : true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingProduct.id);
            if (updErr) throw updErr;
            productId = existingProduct.id;
          } else {
            const { data: newProd, error: insErr } = await supabase
              .from("products")
              .insert({
                business_id: businessId,
                sku,
                name,
                category_id: categoryId,
                unit: normalizeProductUnit(row.unit),
                production_unit: normalizeProductUnit(row.production_unit || row.unit),
                selling_price: sellingPrice,
                tax_rate: taxRate,
                min_stock: minStock,
                daily_capacity: dailyCapacity,
                quality_standard: quality.standard,
                qty_is_4985: quality.q4985,
                qty_is_12786: quality.q12786,
                qty_is_13487: quality.q13487,
                qty_is_13488: quality.q13488,
                qty_is_12785: quality.q12785,
                description: row.description || null,
                active: row.active === false ? false : true,
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            productId = newProd.id;
          }

          await markRowSuccess(supabase, jobId, rowNum, productId);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.sku, err.message || "Failed to save product", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to save product");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 4. OPENING FINISHED-GOODS STOCK
    // -------------------------------------------------------------
    case "opening_finished_goods": {
      const { data: products } = await supabase
        .from("products")
        .select("id, sku, name")
        .eq("business_id", businessId);

      const productBySku = new Map<string, string>();
      products?.forEach((p: any) => productBySku.set(p.sku.trim().toLowerCase(), p.id));

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const sku = String(row.sku || "").trim().toLowerCase();
          const productId = productBySku.get(sku);
          if (!productId) {
            addError(rowNum, row.sku, `Product SKU "${row.sku}" not found in catalog. Create the product first.`, row);
            await markRowFailed(supabase, jobId, rowNum, `Product SKU "${row.sku}" not found in catalog.`);
            continue;
          }

          const qty = parseNumberRobust(row.quantity) ?? 0;
          if (qty <= 0) {
            addError(rowNum, row.sku, "Opening quantity must be greater than 0", row);
            await markRowFailed(supabase, jobId, rowNum, "Opening quantity must be greater than 0");
            continue;
          }

          const { data: inv } = await supabase
            .from("inventory")
            .select("id, current_stock, reserved_stock, available_stock")
            .eq("business_id", businessId)
            .eq("item_type", "finished_good")
            .eq("item_id", productId)
            .maybeSingle();

          const newCurrent = Number(((inv?.current_stock || 0) + qty).toFixed(4));
          const reserved = inv?.reserved_stock || 0;
          const newAvailable = Math.max(0, Number((newCurrent - reserved).toFixed(4)));

          let inventoryId = inv?.id;
          if (inv) {
            await supabase
              .from("inventory")
              .update({
                current_stock: newCurrent,
                available_stock: newAvailable,
                updated_at: new Date().toISOString(),
              })
              .eq("id", inv.id);
          } else {
            const { data: newInv, error: invErr } = await supabase
              .from("inventory")
              .insert({
                business_id: businessId,
                item_type: "finished_good",
                item_id: productId,
                current_stock: newCurrent,
                reserved_stock: 0,
                available_stock: newAvailable,
              })
              .select("id")
              .single();
            if (invErr) throw invErr;
            inventoryId = newInv.id;
          }

          const parsedDate = parseDateRobust(row.date);
          await supabase.from("inventory_transactions").insert({
            business_id: businessId,
            item_type: "finished_good",
            item_id: productId,
            transaction_type: "STOCK_IN",
            quantity: qty,
            reference_type: "opening_stock",
            reference_id: inventoryId || null,
            notes: `Opening stock import: ${row.reference || "Opening Balance"} ${row.notes || ""}`.trim(),
            created_by: userId,
            created_at: parsedDate ? new Date(parsedDate).toISOString() : new Date().toISOString(),
          });

          await markRowSuccess(supabase, jobId, rowNum, inventoryId);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.sku, err.message || "Failed to set opening stock", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to set opening stock");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 5. OPENING RAW-MATERIAL STOCK
    // -------------------------------------------------------------
    case "opening_raw_materials": {
      const { data: materials } = await supabase
        .from("raw_materials")
        .select("id, name")
        .eq("business_id", businessId);

      const materialMap = new Map<string, string>();
      materials?.forEach((m: any) => materialMap.set(m.name.trim().toLowerCase(), m.id));

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const name = String(row.material_name || "").trim();
          if (!name) {
            addError(rowNum, undefined, "Material name is required", row);
            await markRowFailed(supabase, jobId, rowNum, "Material name is required");
            continue;
          }

          let materialId = materialMap.get(name.toLowerCase());
          if (!materialId) {
            const { data: newMat, error: matErr } = await supabase
              .from("raw_materials")
              .insert({
                business_id: businessId,
                name,
                unit: normalizeRawMaterialUnit(row.unit),
                purchase_price: parseNumberRobust(row.unit_cost) ?? 0,
                min_stock: parseNumberRobust(row.min_stock) ?? 0,
                current_stock: 0,
                reorder_level: parseNumberRobust(row.min_stock) ?? 0,
                status: "ACTIVE",
              })
              .select("id")
              .single();
            if (matErr) throw matErr;
            materialId = newMat.id;
            materialMap.set(name.toLowerCase(), newMat.id);
          }

          const qty = parseNumberRobust(row.quantity) ?? 0;
          if (qty <= 0) {
            addError(rowNum, name, "Quantity must be greater than 0", row);
            await markRowFailed(supabase, jobId, rowNum, "Quantity must be greater than 0");
            continue;
          }

          const { data: inv } = await supabase
            .from("inventory")
            .select("id, current_stock, reserved_stock, available_stock")
            .eq("business_id", businessId)
            .eq("item_type", "raw_material")
            .eq("item_id", materialId)
            .maybeSingle();

          const newCurrent = Number(((inv?.current_stock || 0) + qty).toFixed(4));
          const reserved = inv?.reserved_stock || 0;
          const newAvailable = Math.max(0, Number((newCurrent - reserved).toFixed(4)));

          let inventoryId = inv?.id;
          if (inv) {
            await supabase
              .from("inventory")
              .update({
                current_stock: newCurrent,
                available_stock: newAvailable,
                updated_at: new Date().toISOString(),
              })
              .eq("id", inv.id);
          } else {
            const { data: newInv, error: invErr } = await supabase
              .from("inventory")
              .insert({
                business_id: businessId,
                item_type: "raw_material",
                item_id: materialId,
                current_stock: newCurrent,
                reserved_stock: 0,
                available_stock: newAvailable,
              })
              .select("id")
              .single();
            if (invErr) throw invErr;
            inventoryId = newInv.id;
          }

          await supabase.from("inventory_transactions").insert({
            business_id: businessId,
            item_type: "raw_material",
            item_id: materialId,
            transaction_type: "STOCK_IN",
            quantity: qty,
            reference_type: "opening_stock",
            reference_id: inventoryId || null,
            notes: `Opening raw material import: ${row.notes || "Initial Count"}`.trim(),
            created_by: userId,
          });

          await markRowSuccess(supabase, jobId, rowNum, inventoryId);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.material_name, err.message || "Failed to set opening material stock", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to set opening material stock");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 6. HISTORICAL SALES ORDERS & ITEMS
    // -------------------------------------------------------------
    case "historical_orders": {
      const orderGroups = new Map<string, any[]>();
      records.forEach((r) => {
        const num = String(r.order_number || "").trim().toUpperCase();
        if (!num) return;
        if (!orderGroups.has(num)) orderGroups.set(num, []);
        orderGroups.get(num)!.push(r);
      });

      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone, customer_addresses(state, district)")
        .eq("business_id", businessId);

      const customerMap = new Map<string, { id: string; state?: string; district?: string }>();
      customers?.forEach((c: any) => {
        const info = {
          id: c.id,
          state: (c as any).customer_addresses?.[0]?.state,
          district: (c as any).customer_addresses?.[0]?.district,
        };
        if (c.name) customerMap.set(c.name.trim().toLowerCase(), info);
        if (c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, "");
          if (digits.length >= 7) customerMap.set(digits.slice(-10), info);
        }
      });

      const { data: products } = await supabase
        .from("products")
        .select("id, sku, name, selling_price, tax_rate, quality_standard, qty_is_4985, qty_is_12786, qty_is_13487, qty_is_13488, qty_is_12785")
        .eq("business_id", businessId);

      const productBySku = new Map<string, any>();
      products?.forEach((p: any) => productBySku.set(p.sku.trim().toLowerCase(), p));

      for (const [orderNumber, items] of orderGroups.entries()) {
        const firstRow = items[0];
        const rowNum = firstRow._rowNumber || 1;

        try {
          const { data: existingOrd } = await supabase
            .from("orders")
            .select("id")
            .eq("business_id", businessId)
            .eq("order_number", orderNumber)
            .maybeSingle();

          if (existingOrd) {
            addError(rowNum, orderNumber, `Order Number "${orderNumber}" already exists in the system.`, firstRow);
            for (const itm of items) {
              await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, `Order Number "${orderNumber}" already exists.`);
            }
            continue;
          }

          const rawPhone = String(firstRow.customer_phone || "").replace(/[^0-9]/g, "");
          const rawName = String(firstRow.customer_name || "").trim().toLowerCase();
          let customerInfo = customerMap.get(rawName);
          if (!customerInfo && rawPhone.length >= 7) {
            customerInfo = customerMap.get(rawPhone.slice(-10));
          }

          if (!customerInfo) {
            const custName = String(firstRow.customer_name || "Historical Customer").trim();
            const { data: newCust, error: custErr } = await supabase
              .from("customers")
              .insert({
                business_id: businessId,
                name: custName,
                phone: firstRow.customer_phone || null,
                payment_terms: "Historical",
                credit_limit: 0,
                status: "ACTIVE",
              })
              .select("id")
              .single();

            if (custErr || !newCust) {
              addError(rowNum, orderNumber, `Could not resolve or create customer "${custName}".`, firstRow);
              for (const itm of items) {
                await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, `Could not resolve customer "${custName}".`);
              }
              continue;
            }
            customerInfo = { id: newCust.id };
            customerMap.set(custName.toLowerCase(), customerInfo);
            if (rawPhone.length >= 7) customerMap.set(rawPhone.slice(-10), customerInfo);
          }

          let subtotal = 0;
          let discountAmount = 0;
          let taxAmount = 0;
          const validItemsPayload: any[] = [];
          let itemFailed = false;

          for (const itm of items) {
            const sku = String(itm.product_sku || "").trim().toLowerCase();
            let prd = productBySku.get(sku);
            if (!prd) {
              const prdName = String(itm.product_name || `Imported Product ${itm.product_sku}`).trim();
              const { data: newPrd, error: prdErr } = await supabase
                .from("products")
                .insert({
                  business_id: businessId,
                  sku: String(itm.product_sku || "SKU-AUTO").trim(),
                  name: prdName,
                  unit: "Piece",
                  production_unit: "Piece",
                  daily_capacity: 100,
                  selling_price: parseNumberRobust(itm.unit_price) ?? 0,
                  tax_rate: parseNumberRobust(itm.tax_rate) ?? 18,
                  active: true,
                })
                .select("id, sku, name, selling_price, tax_rate")
                .single();

              if (prdErr || !newPrd) {
                addError(itm._rowNumber || rowNum, orderNumber, `Product "${itm.product_sku}" could not be resolved.`, itm);
                for (const sitm of items) {
                  await markRowFailed(supabase, jobId, sitm._rowNumber || rowNum, `Product "${itm.product_sku}" could not be resolved.`);
                }
                itemFailed = true;
                break;
              }
              prd = newPrd;
              productBySku.set(sku, prd);
            }

            const qty = parseNumberRobust(itm.quantity) ?? 1;
            const unitPrice = parseNumberRobust(itm.unit_price) ?? (prd.selling_price ?? 0);
            const discRate = parseNumberRobust(itm.discount_rate) ?? 0;
            const taxRate = parseNumberRobust(itm.tax_rate) ?? (prd.tax_rate ?? 18);

            const lineRaw = qty * unitPrice;
            const lineDisc = lineRaw * (discRate / 100);
            const lineTaxable = lineRaw - lineDisc;
            const lineTax = lineTaxable * (taxRate / 100);
            const lineTotal = lineTaxable + lineTax;

            subtotal += lineRaw;
            discountAmount += lineDisc;
            taxAmount += lineTax;

            validItemsPayload.push({
              product_id: prd.id,
              product_name: prd.name,
              quality_standard: prd.quality_standard ?? null,
              quantity: qty,
              qty_is_4985: prd.qty_is_4985 ?? 0,
              qty_is_12786: prd.qty_is_12786 ?? 0,
              qty_is_13487: prd.qty_is_13487 ?? 0,
              qty_is_13488: prd.qty_is_13488 ?? 0,
              qty_is_12785: prd.qty_is_12785 ?? 0,
              unit_price: unitPrice,
              discount_rate: discRate,
              tax_rate: taxRate,
              taxable_amount: lineTaxable,
              line_total: lineTotal,
            });
          }

          if (itemFailed) continue;

          const totalAmount = subtotal - discountAmount + taxAmount;
          const parsedOrderDate = parseDateRobust(firstRow.order_date) || new Date().toISOString().split("T")[0];

          const { data: newOrder, error: orderErr } = await supabase
            .from("orders")
            .insert({
              business_id: businessId,
              customer_id: customerInfo.id,
              order_number: orderNumber,
              order_date: parsedOrderDate,
              status: firstRow.status || "CONFIRMED",
              priority: "NORMAL",
              subtotal: Number(subtotal.toFixed(2)),
              discount_amount: Number(discountAmount.toFixed(2)),
              tax_amount: Number(taxAmount.toFixed(2)),
              total_amount: Number(totalAmount.toFixed(2)),
              paid_amount: 0,
              due_amount: Number(totalAmount.toFixed(2)),
              notes: firstRow.notes || "Historical imported order",
              district: customerInfo.district || null,
            })
            .select("id")
            .single();

          if (orderErr || !newOrder) throw orderErr;

          const itemsToInsert = validItemsPayload.map((itm) => ({
            business_id: businessId,
            order_id: newOrder.id,
            product_id: itm.product_id,
            product_name: itm.product_name,
            quality_standard: itm.quality_standard ?? null,
            quantity: itm.quantity,
            qty_is_4985: itm.qty_is_4985 ?? 0,
            qty_is_12786: itm.qty_is_12786 ?? 0,
            qty_is_13487: itm.qty_is_13487 ?? 0,
            qty_is_13488: itm.qty_is_13488 ?? 0,
            qty_is_12785: itm.qty_is_12785 ?? 0,
            unit_price: itm.unit_price,
            discount_rate: itm.discount_rate,
            tax_rate: itm.tax_rate,
            line_total: itm.line_total,
          }));

          await supabase.from("order_items").insert(itemsToInsert);

          await supabase.from("order_status_history").insert({
            business_id: businessId,
            order_id: newOrder.id,
            old_status: null,
            new_status: firstRow.status || "CONFIRMED",
            old_priority: null,
            new_priority: "NORMAL",
            changed_by: userId,
            reason: "Historical bulk data import",
          });

          for (const itm of items) {
            await markRowSuccess(supabase, jobId, itm._rowNumber || rowNum, newOrder.id);
          }
          importedCount += items.length;
        } catch (err: any) {
          addError(rowNum, orderNumber, err.message || "Failed to import historical order", firstRow);
          for (const itm of items) {
            await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, err.message || "Failed to import historical order");
          }
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 7. HISTORICAL PAYMENTS & BALANCES
    // -------------------------------------------------------------
    case "historical_payments": {
      const { data: dbCustomers } = await supabase
        .from("customers")
        .select("id, name, company_name, phone")
        .eq("business_id", businessId);

      const custMap = new Map<string, any>();
      (dbCustomers || []).forEach((c: any) => {
        if (c.name) custMap.set(c.name.trim().toLowerCase(), c);
        if (c.company_name) custMap.set(c.company_name.trim().toLowerCase(), c);
        if (c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, "");
          if (digits.length >= 7) custMap.set(digits.slice(-10), c);
        }
      });

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const paymentNumber = String(row.payment_number || "").trim().toUpperCase();
          if (!paymentNumber) {
            addError(rowNum, undefined, "Payment Number is required", row);
            await markRowFailed(supabase, jobId, rowNum, "Payment Number is required");
            continue;
          }

          const amount = parseNumberRobust(row.amount) ?? 0;
          if (amount <= 0) {
            addError(rowNum, paymentNumber, "Payment amount must be greater than 0", row);
            await markRowFailed(supabase, jobId, rowNum, "Payment amount must be greater than 0");
            continue;
          }

          // Check duplicate payment_number
          const { data: existingPay } = await supabase
            .from("payments")
            .select("id")
            .eq("business_id", businessId)
            .eq("payment_number", paymentNumber)
            .maybeSingle();

          if (existingPay) {
            addError(rowNum, paymentNumber, `Payment Number "${paymentNumber}" already exists.`, row);
            await markRowFailed(supabase, jobId, rowNum, `Payment Number "${paymentNumber}" already exists.`);
            continue;
          }

          // Resolve customer
          const custName = String(row.customer_name || "").trim();
          const custDigits = custName.replace(/[^0-9]/g, "");
          let customer = custMap.get(custName.toLowerCase()) || (custDigits.length >= 7 ? custMap.get(custDigits.slice(-10)) : null);

          if (!customer && custName) {
            const { data: cData } = await supabase
              .from("customers")
              .select("id, name")
              .eq("business_id", businessId)
              .ilike("name", custName)
              .maybeSingle();
            customer = cData;
          }

          if (!customer) {
            addError(rowNum, paymentNumber, `Customer "${custName}" not found. Create customer first.`, row);
            await markRowFailed(supabase, jobId, rowNum, `Customer "${custName}" not found.`);
            continue;
          }

          // Optional: link to order if order_number provided
          let linkedOrderId: string | null = null;
          if (row.order_number) {
            const { data: ord } = await supabase
              .from("orders")
              .select("id, paid_amount, total_amount")
              .eq("business_id", businessId)
              .eq("order_number", String(row.order_number).trim().toUpperCase())
              .maybeSingle();

            if (ord) {
              linkedOrderId = ord.id;
              const newPaid = Number(((ord.paid_amount || 0) + amount).toFixed(2));
              const newDue = Math.max(0, Number(((ord.total_amount || 0) - newPaid).toFixed(2)));
              await supabase
                .from("orders")
                .update({ paid_amount: newPaid, due_amount: newDue })
                .eq("id", ord.id);
            }
          }

          const txnId = row.transaction_id ? String(row.transaction_id).trim() : null;
          const utrNum = row.utr_number
            ? String(row.utr_number).trim()
            : (row.payment_method !== "CASH" && row.reference ? String(row.reference).trim() : null);

          // Deterministic idempotency key for this row in this job
          const idempotencyKey = `import-${jobId}-row-${rowNum}-${paymentNumber}`;
          const paymentDate = parseDateRobust(row.payment_date) || new Date().toISOString().split("T")[0];

          // Insert into payments
          const { data: newPayment, error: payErr } = await supabase
            .from("payments")
            .insert({
              business_id: businessId,
              customer_id: customer.id,
              order_id: linkedOrderId,
              payment_number: paymentNumber,
              idempotency_key: idempotencyKey,
              transaction_id: txnId,
              utr_number: utrNum,
              amount: amount,
              payment_date: paymentDate,
              payment_method: normalizePaymentMethod(row.payment_method),
              reference: row.reference || null,
              notes: row.notes || "Historical payment import",
              status: "SUCCESS",
            })
            .select("id")
            .single();

          if (payErr || !newPayment) throw payErr;

          // Record in customer_ledger
          await supabase.from("customer_ledger").insert({
            business_id: businessId,
            customer_id: customer.id,
            order_id: linkedOrderId,
            payment_id: newPayment.id,
            entry_type: "PAYMENT",
            description: `Payment ${paymentNumber}: ${row.reference || "Historical Receipt"}`.trim(),
            debit: 0,
            credit: amount,
            balance: 0,
            entry_date: paymentDate,
            created_by: userId,
          });

          // Recalculate customer running balance
          try {
            await supabase.rpc("recalculate_customer_ledger", {
              p_business_id: businessId,
              p_customer_id: customer.id,
            });
          } catch {
            // non-fatal
          }

          await markRowSuccess(supabase, jobId, rowNum, newPayment.id);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.payment_number, err.message || "Failed to import payment", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to import payment");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 8. PURCHASES
    // -------------------------------------------------------------
    case "purchases": {
      const poGroups = new Map<string, any[]>();
      records.forEach((r) => {
        const num = String(r.po_number || "").trim().toUpperCase();
        if (!num) return;
        if (!poGroups.has(num)) poGroups.set(num, []);
        poGroups.get(num)!.push(r);
      });

      for (const [poNumber, items] of poGroups.entries()) {
        const firstRow = items[0];
        const rowNum = firstRow._rowNumber || 1;

        try {
          const { data: existingPo } = await supabase
            .from("purchase_orders")
            .select("id")
            .eq("business_id", businessId)
            .eq("po_number", poNumber)
            .maybeSingle();

          if (existingPo) {
            addError(rowNum, poNumber, `PO Number "${poNumber}" already exists in the system.`, firstRow);
            for (const itm of items) {
              await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, `PO Number "${poNumber}" already exists.`);
            }
            continue;
          }

          const suppName = String(firstRow.supplier_name || "").trim();
          let { data: supplier } = await supabase
            .from("suppliers")
            .select("id")
            .eq("business_id", businessId)
            .ilike("name", suppName)
            .maybeSingle();

          if (!supplier) {
            const { data: newSupp, error: suppErr } = await supabase
              .from("suppliers")
              .insert({
                business_id: businessId,
                name: suppName || "Historical Supplier",
                status: "ACTIVE",
              })
              .select("id")
              .single();
            if (suppErr || !newSupp) {
              addError(rowNum, poNumber, `Supplier "${suppName}" could not be resolved or created.`, firstRow);
              for (const itm of items) {
                await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, `Supplier "${suppName}" could not be resolved.`);
              }
              continue;
            }
            supplier = newSupp;
          }

          let subtotal = 0;
          let taxAmount = 0;
          const validPoItems: any[] = [];
          let poItemFailed = false;

          for (const itm of items) {
            const matName = String(itm.material_name || "Raw Material").trim();
            let { data: material } = await supabase
              .from("raw_materials")
              .select("id")
              .eq("business_id", businessId)
              .ilike("name", matName)
              .maybeSingle();

            if (!material) {
              const { data: newMat, error: matErr } = await supabase
                .from("raw_materials")
                .insert({
                  business_id: businessId,
                  name: matName,
                  unit: normalizeRawMaterialUnit(itm.unit),
                  purchase_price: parseNumberRobust(itm.unit_cost) ?? 0,
                  min_stock: 0,
                  current_stock: 0,
                  reorder_level: 0,
                  status: "ACTIVE",
                })
                .select("id")
                .single();
              if (matErr || !newMat) {
                addError(itm._rowNumber || rowNum, poNumber, `Raw Material "${matName}" could not be resolved.`, itm);
                for (const sitm of items) {
                  await markRowFailed(supabase, jobId, sitm._rowNumber || rowNum, `Raw Material "${matName}" could not be resolved.`);
                }
                poItemFailed = true;
                break;
              }
              material = newMat;
            }

            const ordQty = parseNumberRobust(itm.ordered_quantity) ?? 1;
            const recQty =
              itm.received_quantity !== undefined &&
              itm.received_quantity !== null &&
              String(itm.received_quantity).trim() !== ""
                ? (parseNumberRobust(itm.received_quantity) ?? ordQty)
                : ordQty;
            const unitCost = parseNumberRobust(itm.unit_cost) ?? 0;
            const taxRate = parseNumberRobust(itm.tax_rate) ?? 18;

            const lineRaw = ordQty * unitCost;
            const lineTax = lineRaw * (taxRate / 100);
            const lineTotal = lineRaw + lineTax;

            subtotal += lineRaw;
            taxAmount += lineTax;

            validPoItems.push({
              raw_material_id: material.id,
              ordered_quantity: ordQty,
              received_quantity: recQty,
              unit_cost: unitCost,
              tax_rate: taxRate,
              line_total: lineTotal,
            });
          }

          if (poItemFailed) continue;

          const totalAmount = subtotal + taxAmount;
          const parsedPoDate = parseDateRobust(firstRow.po_date) || new Date().toISOString().split("T")[0];

          const { data: newPo, error: poErr } = await supabase
            .from("purchase_orders")
            .insert({
              business_id: businessId,
              supplier_id: supplier.id,
              po_number: poNumber,
              order_date: parsedPoDate,
              status: firstRow.status || "RECEIVED",
              subtotal: Number(subtotal.toFixed(2)),
              tax_amount: Number(taxAmount.toFixed(2)),
              total_amount: Number(totalAmount.toFixed(2)),
              notes: firstRow.notes || "Historical purchase order import",
            })
            .select("id")
            .single();

          if (poErr || !newPo) throw poErr;

          const poItemsToInsert = validPoItems.map((itm) => ({
            business_id: businessId,
            purchase_order_id: newPo.id,
            raw_material_id: itm.raw_material_id,
            ordered_quantity: itm.ordered_quantity,
            received_quantity: itm.received_quantity,
            unit_cost: itm.unit_cost,
            tax_rate: itm.tax_rate,
            line_total: itm.line_total,
          }));

          await supabase.from("purchase_order_items").insert(poItemsToInsert);

          for (const itm of validPoItems) {
            await supabase.from("purchase_receipts").insert({
              business_id: businessId,
              purchase_order_id: newPo.id,
              raw_material_id: itm.raw_material_id,
              received_quantity: itm.received_quantity,
              unit_cost: itm.unit_cost,
              tax_rate: itm.tax_rate,
              received_by: userId,
              received_at: parsedPoDate ? new Date(parsedPoDate).toISOString() : new Date().toISOString(),
              notes: "Historical procurement receipt",
            });
          }

          for (const itm of items) {
            await markRowSuccess(supabase, jobId, itm._rowNumber || rowNum, newPo.id);
          }
          importedCount += items.length;
        } catch (err: any) {
          addError(rowNum, poNumber, err.message || "Failed to import purchase order", firstRow);
          for (const itm of items) {
            await markRowFailed(supabase, jobId, itm._rowNumber || rowNum, err.message || "Failed to import purchase order");
          }
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 9. EXPENSES
    // -------------------------------------------------------------
    case "expenses": {
      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        try {
          const category = String(row.category || "").trim();
          const amount = parseNumberRobust(row.amount) ?? 0;
          if (!category || amount <= 0) {
            addError(rowNum, row.reference, "Category and valid Amount (>0) are required.", row);
            await markRowFailed(supabase, jobId, rowNum, "Category and valid Amount (>0) are required.");
            continue;
          }

          const parsedExpDate = parseDateRobust(row.expense_date) || new Date().toISOString().split("T")[0];

          const { data: newExp, error: expErr } = await supabase
            .from("expenses")
            .insert({
              business_id: businessId,
              category,
              amount,
              expense_date: parsedExpDate,
              reference: row.reference || null,
              description: row.description || "Historical expense import",
              status: row.status || "POSTED",
              created_by: userId,
            })
            .select("id")
            .single();

          if (expErr) throw expErr;
          await markRowSuccess(supabase, jobId, rowNum, newExp?.id);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, row.reference, err.message || "Failed to import expense", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to import expense");
        }
      }
      break;
    }

    // -------------------------------------------------------------
    // 10. CUSTOMER OPENING BALANCES
    // -------------------------------------------------------------
    case "customer_opening_balances": {
      const { data: allCustomers, error: custFetchErr } = await supabase
        .from("customers")
        .select("id, name, company_name, phone")
        .eq("business_id", businessId);

      if (custFetchErr) {
        throw new Error("Failed to load customer list for validation: " + custFetchErr.message);
      }

      const customerById = new Map<string, any>();
      const customerByName = new Map<string, any>();
      const customerByPhone = new Map<string, any>();

      (allCustomers || []).forEach((c: any) => {
        if (c.id) customerById.set(c.id.toLowerCase(), c);
        if (c.name) customerByName.set(c.name.trim().toLowerCase(), c);
        if (c.company_name) customerByName.set(c.company_name.trim().toLowerCase(), c);
        if (c.phone) {
          const cleanPhone = c.phone.trim().replace(/[^0-9]/g, "");
          if (cleanPhone) customerByPhone.set(cleanPhone, c);
        }
      });

      const { data: existingBalances, error: balFetchErr } = await supabase
        .from("customer_opening_balances")
        .select("customer_id, as_on_date")
        .eq("business_id", businessId);

      if (balFetchErr) {
        throw new Error("Failed to load existing opening balances for validation: " + balFetchErr.message);
      }

      const existingDbKeys = new Set<string>();
      (existingBalances || []).forEach((b: any) => {
        existingDbKeys.add(`${b.customer_id}:::${b.as_on_date}`);
      });

      const seenInFile = new Set<string>();

      for (const row of records) {
        const rowNum = row._rowNumber || importedCount + 1;
        const rawCustomerName = String(row.customer_name || "").trim();
        const rawCustomerCode = String(row.customer_code || "").trim();
        const identifier = rawCustomerCode || rawCustomerName || `Row #${rowNum}`;

        try {
          let matchedCustomer: any = null;

          if (rawCustomerCode) {
            const codeClean = rawCustomerCode.toLowerCase();
            if (customerById.has(codeClean)) {
              matchedCustomer = customerById.get(codeClean);
            }
          }

          if (!matchedCustomer && rawCustomerName) {
            const nameClean = rawCustomerName.toLowerCase();
            if (customerByName.has(nameClean)) {
              matchedCustomer = customerByName.get(nameClean);
            }
          }

          if (!matchedCustomer && rawCustomerCode) {
            const digits = rawCustomerCode.replace(/[^0-9]/g, "");
            if (digits.length >= 7 && customerByPhone.has(digits)) {
              matchedCustomer = customerByPhone.get(digits);
            }
          }

          if (!matchedCustomer) {
            addError(
              rowNum,
              identifier,
              `Customer not found: "${rawCustomerCode || rawCustomerName}". Please specify a valid customer name or code.`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `Customer not found: "${rawCustomerCode || rawCustomerName}".`);
            continue;
          }

          const amount = parseNumberRobust(row.amount);
          if (amount === null || isNaN(amount) || amount <= 0) {
            addError(
              rowNum,
              identifier,
              `Opening Balance Amount must be a positive number greater than 0 (got "${row.amount}").`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `Opening Balance Amount must be a positive number greater than 0.`);
            continue;
          }

          const rawType = String(row.balance_type || "").trim().toUpperCase();
          let balanceType: "RECEIVABLE" | "PAYABLE" | null = null;
          if (rawType === "RECEIVABLE" || rawType === "DR" || rawType === "DEBIT") {
            balanceType = "RECEIVABLE";
          } else if (rawType === "PAYABLE" || rawType === "CR" || rawType === "CREDIT" || rawType === "ADVANCE") {
            balanceType = "PAYABLE";
          } else {
            addError(
              rowNum,
              identifier,
              `Balance Type must be either 'Receivable' or 'Payable' (got "${row.balance_type}").`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `Balance Type must be either 'Receivable' or 'Payable'.`);
            continue;
          }

          const asOnDateStr = parseDateRobust(row.as_on_date) || String(row.as_on_date || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(asOnDateStr) || isNaN(new Date(asOnDateStr).getTime())) {
            addError(
              rowNum,
              identifier,
              `As-on Date must be a valid date in YYYY-MM-DD format (got "${row.as_on_date}").`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `As-on Date must be a valid date in YYYY-MM-DD format.`);
            continue;
          }

          const comboKey = `${matchedCustomer.id}:::${asOnDateStr}`;
          if (seenInFile.has(comboKey)) {
            addError(
              rowNum,
              identifier,
              `Duplicate entry: File contains multiple records for customer "${matchedCustomer.name}" on date ${asOnDateStr}.`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `Duplicate entry in file for customer "${matchedCustomer.name}" on date ${asOnDateStr}.`);
            continue;
          }
          seenInFile.add(comboKey);

          if (existingDbKeys.has(comboKey)) {
            addError(
              rowNum,
              identifier,
              `Duplicate entry: Opening balance already exists in database for customer "${matchedCustomer.name}" on date ${asOnDateStr}.`,
              row
            );
            await markRowFailed(supabase, jobId, rowNum, `Duplicate entry in database for customer "${matchedCustomer.name}" on date ${asOnDateStr}.`);
            continue;
          }

          const { data: newBal, error: insErr } = await supabase
            .from("customer_opening_balances")
            .insert({
              business_id: businessId,
              customer_id: matchedCustomer.id,
              amount: Math.round(amount * 100) / 100,
              balance_type: balanceType,
              as_on_date: asOnDateStr,
              notes: `Bulk imported from job ${jobId}`,
              created_by: userId,
            })
            .select("id")
            .single();

          if (insErr) {
            if (insErr.code === "23505") {
              addError(
                rowNum,
                identifier,
                `Duplicate entry: Opening balance already recorded for customer "${matchedCustomer.name}" on date ${asOnDateStr}.`,
                row
              );
              await markRowFailed(supabase, jobId, rowNum, `Duplicate entry for customer "${matchedCustomer.name}".`);
              continue;
            }
            throw insErr;
          }

          existingDbKeys.add(comboKey);
          await markRowSuccess(supabase, jobId, rowNum, newBal?.id);
          importedCount++;
        } catch (err: any) {
          addError(rowNum, identifier, err.message || "Failed to import opening balance", row);
          await markRowFailed(supabase, jobId, rowNum, err.message || "Failed to import opening balance");
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported module: ${module}`);
  }

  return importedCount;
}

/**
 * Executes the bulk import operation across safe batches
 */
export async function executeImportAction(payload: {
  module: ImportModule;
  filename: string;
  fileHash: string;
  records: any[];
}): Promise<ImportExecutionResponse> {
  const { context, db } = await requireAdminAuth();
  const businessId = context.user.business_id;
  const userId = context.user.id;
  const { module, filename, fileHash, records } = payload;

  if (!records || records.length === 0) {
    throw new Error("No records provided for import.");
  }

  // 1. Run Classification Engine to partition rows into NEW, DUPLICATE, INVALID, REJECTED
  const classification = await classifyImportRowsInternal(
    db,
    businessId,
    module,
    records
  );

  // 2. Create the import job record up-front with status PROCESSING
  const { data: job, error: jobErr } = await db
    .from("import_jobs")
    .insert({
      business_id: businessId,
      module,
      filename,
      file_hash: fileHash,
      total_rows: records.length,
      imported_rows: 0,
      failed_rows: classification.invalidCount + classification.rejectedCount,
      status: "PROCESSING",
      error_summary: "Import in progress...",
      errors: [],
      metadata: {
        imported_at: new Date().toISOString(),
        user_id: userId,
        classification_counts: {
          total: classification.totalRows,
          new: classification.newCount,
          duplicate: classification.duplicateCount,
          invalid: classification.invalidCount,
          rejected: classification.rejectedCount,
        },
      },
      created_by: userId,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to create import job record: ${jobErr?.message || "Unknown error"}`);
  }
  const jobId = job.id;

  // 3. Insert all classified rows into import_job_rows table
  const jobRowsToInsert = classification.rows.map((cr: ClassifiedImportRow) => ({
    job_id: jobId,
    business_id: businessId,
    row_number: cr.rowNumber,
    identifier: cr.identifier || null,
    classification: cr.classification,
    status:
      cr.classification === "DUPLICATE"
        ? "SKIPPED_DUPLICATE"
        : cr.classification === "INVALID"
        ? "FAILED"
        : cr.classification === "REJECTED"
        ? "REJECTED"
        : "PENDING",
    reason: cr.reason || null,
    error_message: cr.classification !== "NEW" ? (cr.reason || null) : null,
    raw_data: cr.data,
  }));

  for (let i = 0; i < jobRowsToInsert.length; i += 250) {
    const chunk = jobRowsToInsert.slice(i, i + 250);
    const { error: insRowsErr } = await db.from("import_job_rows").insert(chunk);
    if (insRowsErr) {
      console.error("Error inserting import_job_rows chunk:", insRowsErr);
    }
  }

  // 4. Collect errors from invalid/rejected rows
  const failedErrors: RowValidationError[] = [];
  for (const cr of classification.rows) {
    if (cr.classification === "INVALID" || cr.classification === "REJECTED") {
      failedErrors.push({
        rowNumber: cr.rowNumber,
        identifier: cr.identifier,
        errors: [cr.reason || "Row validation failed"],
        rawData: cr.data,
      });
    }
  }

  // 5. Filter valid NEW rows to execute
  const newClassifiedRows = classification.rows.filter((cr: ClassifiedImportRow) => cr.classification === "NEW");
  let importedCount = 0;

  if (newClassifiedRows.length > 0) {
    const rowsToExecute = newClassifiedRows.map((c: ClassifiedImportRow) => ({
      ...c.data,
      _rowNumber: c.rowNumber,
    }));

    importedCount = await processModuleImportRows(
      db,
      businessId,
      userId,
      jobId,
      module,
      rowsToExecute,
      (rowNum, identifier, errorMsg, rawData) => {
        failedErrors.push({
          rowNumber: rowNum,
          identifier,
          errors: [errorMsg],
          rawData,
        });
      }
    );
  }

  const failedCount = failedErrors.length;
  const skippedDuplicates = classification.duplicateCount;
  const totalCount = records.length;

  let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED" = "COMPLETED";
  if (failedCount > 0 && importedCount === 0) {
    finalStatus = "FAILED";
  } else if (failedCount > 0) {
    finalStatus = "PARTIAL";
  } else {
    finalStatus = "COMPLETED";
  }

  const summary =
    finalStatus === "COMPLETED"
      ? `Successfully processed ${totalCount} rows (${importedCount} imported, ${skippedDuplicates} duplicates safely skipped).`
      : finalStatus === "PARTIAL"
      ? `Partially imported: ${importedCount} imported, ${skippedDuplicates} duplicates skipped, ${failedCount} errors.`
      : `Import failed: 0 imported, ${skippedDuplicates} duplicates skipped, ${failedCount} errors.`;

  await db
    .from("import_jobs")
    .update({
      imported_rows: importedCount,
      failed_rows: failedCount,
      status: finalStatus,
      error_summary: summary,
      errors: failedErrors,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  try {
    revalidatePath("/import");
    revalidatePath("/inventory");
    revalidatePath("/orders");
    revalidatePath("/payments");
    revalidatePath("/customers");
    revalidatePath("/suppliers");
    revalidatePath("/products");
    revalidatePath("/purchases");
    revalidatePath("/expenses");
  } catch (revErr) {
    console.warn("Revalidation warning:", revErr);
  }

  return {
    success: importedCount > 0 || (skippedDuplicates > 0 && failedCount === 0),
    jobId,
    totalRows: totalCount,
    importedRows: importedCount,
    skippedDuplicates,
    failedRows: failedCount,
    errors: failedErrors,
    message: summary,
  };
}

/**
 * Retries only failed or rejected rows for a previously executed import job
 */
export async function retryImportJobAction(payload: { jobId: string }): Promise<RetryImportResponse> {
  const { context, db } = await requireAdminAuth();
  const businessId = context.user.business_id;
  const userId = context.user.id;

  // 1. Fetch job
  const { data: job, error: jobErr } = await db
    .from("import_jobs")
    .select("*")
    .eq("id", payload.jobId)
    .eq("business_id", businessId)
    .single();

  if (jobErr || !job) {
    throw new Error(`Import job not found: ${jobErr?.message || payload.jobId}`);
  }

  // 2. Fetch failed/rejected rows
  const { data: failedRows, error: fetchErr } = await db
    .from("import_job_rows")
    .select("*")
    .eq("job_id", payload.jobId)
    .in("status", ["FAILED", "REJECTED"])
    .order("row_number", { ascending: true });

  if (fetchErr) {
    throw new Error("Failed to fetch retryable rows: " + fetchErr.message);
  }

  if (!failedRows || failedRows.length === 0) {
    return {
      success: true,
      jobId: payload.jobId,
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      retriedRows: 0,
      newlyImportedRows: 0,
      errors: [],
      message: "No failed or rejected rows remaining to retry in this batch.",
    };
  }

  // 3. Re-run classification on failed rows against current database state
  const rawRecords = failedRows.map((fr: any) => ({
    ...(fr.raw_data || {}),
    _rowNumber: fr.row_number,
  }));

  const reclassification = await classifyImportRowsInternal(
    db,
    businessId,
    job.module as ImportModule,
    rawRecords
  );

  let newlyImported = 0;
  const stillFailedErrors: RowValidationError[] = [];

  for (const cr of reclassification.rows) {
    if (cr.classification === "DUPLICATE") {
      await db
        .from("import_job_rows")
        .update({
          status: "SKIPPED_DUPLICATE",
          classification: "DUPLICATE",
          reason: cr.reason,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("job_id", payload.jobId)
        .eq("row_number", cr.rowNumber);
    } else if (cr.classification === "INVALID" || cr.classification === "REJECTED") {
      stillFailedErrors.push({
        rowNumber: cr.rowNumber,
        identifier: cr.identifier,
        errors: [cr.reason || "Validation failed on retry"],
        rawData: cr.data,
      });
      await db
        .from("import_job_rows")
        .update({
          status: cr.classification === "INVALID" ? "FAILED" : "REJECTED",
          classification: cr.classification,
          reason: cr.reason,
          error_message: cr.reason || "Validation failed on retry",
          updated_at: new Date().toISOString(),
        })
        .eq("job_id", payload.jobId)
        .eq("row_number", cr.rowNumber);
    }
  }

  const validForRetry = reclassification.rows.filter((cr: ClassifiedImportRow) => cr.classification === "NEW");

  if (validForRetry.length > 0) {
    const rowsToExecute = validForRetry.map((c: ClassifiedImportRow) => ({
      ...c.data,
      _rowNumber: c.rowNumber,
    }));

    const executedCount = await processModuleImportRows(
      db,
      businessId,
      userId,
      payload.jobId,
      job.module as ImportModule,
      rowsToExecute,
      (rowNum, identifier, errorMsg, rawData) => {
        stillFailedErrors.push({
          rowNumber: rowNum,
          identifier,
          errors: [errorMsg],
          rawData,
        });
      }
    );
    newlyImported = executedCount;
  }

  // Re-aggregate counts from import_job_rows
  const { data: allJobRows } = await db
    .from("import_job_rows")
    .select("status")
    .eq("job_id", payload.jobId);

  const importedTotal = (allJobRows || []).filter((r: any) => r.status === "IMPORTED").length;
  const failedTotal = (allJobRows || []).filter((r: any) => r.status === "FAILED" || r.status === "REJECTED").length;
  const skippedTotal = (allJobRows || []).filter((r: any) => r.status === "SKIPPED_DUPLICATE").length;

  let finalJobStatus: "COMPLETED" | "PARTIAL" | "FAILED" = "COMPLETED";
  if (failedTotal > 0 && importedTotal === 0) {
    finalJobStatus = "FAILED";
  } else if (failedTotal > 0) {
    finalJobStatus = "PARTIAL";
  } else {
    finalJobStatus = "COMPLETED";
  }

  const updatedSummary =
    finalJobStatus === "COMPLETED"
      ? `Successfully completed all rows (${importedTotal} imported, ${skippedTotal} duplicates skipped).`
      : `Batch partially completed: ${importedTotal} imported, ${failedTotal} failed.`;

  await db
    .from("import_jobs")
    .update({
      imported_rows: importedTotal,
      failed_rows: failedTotal,
      status: finalJobStatus,
      error_summary: updatedSummary,
      errors: stillFailedErrors,
      completed_at: new Date().toISOString(),
    })
    .eq("id", payload.jobId);

  try {
    revalidatePath("/import");
    revalidatePath("/inventory");
    revalidatePath("/orders");
    revalidatePath("/payments");
    revalidatePath("/customers");
    revalidatePath("/suppliers");
    revalidatePath("/products");
    revalidatePath("/purchases");
    revalidatePath("/expenses");
  } catch (revErr) {
    console.warn("Revalidation warning:", revErr);
  }

  return {
    success: newlyImported > 0 || failedTotal === 0,
    jobId: payload.jobId,
    totalRows: (allJobRows || []).length,
    importedRows: importedTotal,
    failedRows: failedTotal,
    skippedDuplicates: skippedTotal,
    retriedRows: failedRows.length,
    newlyImportedRows: newlyImported,
    errors: stillFailedErrors,
    message: updatedSummary,
  };
}

/**
 * Returns full details of an import job and its classified rows
 */
export async function getImportJobDetailsAction(jobId: string): Promise<{
  job: ImportJobRecord;
  rows: ImportJobRowRecord[];
}> {
  const { context, supabase } = await requireAdminAuth();
  const businessId = context.user.business_id;

  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .select("*, users!created_by(name)")
    .eq("id", jobId)
    .eq("business_id", businessId)
    .single();

  if (jobErr || !job) {
    throw new Error(`Import job not found: ${jobErr?.message || jobId}`);
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("import_job_rows")
    .select("*")
    .eq("job_id", jobId)
    .order("row_number", { ascending: true });

  if (rowsErr) {
    throw new Error("Failed to load job row details: " + rowsErr.message);
  }

  return {
    job: {
      id: job.id,
      business_id: job.business_id,
      module: job.module as ImportModule,
      filename: job.filename,
      file_hash: job.file_hash,
      total_rows: job.total_rows,
      imported_rows: job.imported_rows,
      failed_rows: job.failed_rows,
      status: job.status,
      error_summary: job.error_summary,
      errors: job.errors || [],
      metadata: job.metadata || {},
      created_by: job.created_by,
      created_at: job.created_at,
      completed_at: job.completed_at,
      creator_name: job.users?.name,
    },
    rows: (rows || []).map((r: any) => ({
      id: r.id,
      job_id: r.job_id,
      business_id: r.business_id,
      row_number: r.row_number,
      identifier: r.identifier,
      classification: r.classification,
      status: r.status,
      reason: r.reason,
      error_message: r.error_message,
      raw_data: r.raw_data,
      imported_record_id: r.imported_record_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  };
}
