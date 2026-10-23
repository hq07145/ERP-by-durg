"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import type {
  ImportModule,
  ImportJobRecord,
  ImportExecutionResponse,
  RowValidationError,
} from "@/types/import";

function normalizeProductUnit(u?: string): "Piece" | "Bundle" | "Box" | "Kg" | "Meter" | "Set" {
  if (!u) return "Piece";
  const lower = u.trim().toLowerCase();
  if (lower.startsWith("kg") || lower.startsWith("kilo")) return "Kg";
  if (lower.startsWith("meter") || lower.startsWith("mtr") || lower === "m") return "Meter";
  if (lower.startsWith("box")) return "Box";
  if (lower.startsWith("bundle")) return "Bundle";
  if (lower.startsWith("set")) return "Set";
  return "Piece";
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

  return { context, supabase };
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
 * Executes the bulk import operation across safe batches
 */
export async function executeImportAction(payload: {
  module: ImportModule;
  filename: string;
  fileHash: string;
  records: any[];
}): Promise<ImportExecutionResponse> {
  const { context, supabase } = await requireAdminAuth();
  const businessId = context.user.business_id;
  const userId = context.user.id;
  const { module, filename, fileHash, records } = payload;

  if (!records || records.length === 0) {
    throw new Error("No records provided for import.");
  }

  let importedCount = 0;
  const failedErrors: RowValidationError[] = [];

  // Helper to record errors
  const addError = (rowNumber: number, identifier: string | undefined, errorMsg: string, rawData: any = {}) => {
    failedErrors.push({
      rowNumber,
      identifier,
      errors: [errorMsg],
      rawData,
    });
  };

  try {
    switch (module) {
      // -------------------------------------------------------------
      // 1. CUSTOMERS
      // -------------------------------------------------------------
      case "customers": {
        for (const row of records) {
          const rowNum = row._rowNumber || importedCount + 1;
          try {
            const name = String(row.name || "").trim();
            if (!name) {
              addError(rowNum, undefined, "Customer Name is required", row);
              continue;
            }

            // Check if existing customer matches name or phone
            let existingCustomerId: string | null = null;
            let existingAddressId: string | null = null;

            if (row.phone) {
              const { data: byPhone } = await supabase
                .from("customers")
                .select("id, customer_addresses(id)")
                .eq("business_id", businessId)
                .eq("phone", String(row.phone).trim())
                .limit(1)
                .maybeSingle();
              if (byPhone) {
                existingCustomerId = byPhone.id;
                existingAddressId = (byPhone as any).customer_addresses?.[0]?.id || null;
              }
            }

            if (!existingCustomerId) {
              const { data: byName } = await supabase
                .from("customers")
                .select("id, customer_addresses(id)")
                .eq("business_id", businessId)
                .ilike("name", name)
                .limit(1)
                .maybeSingle();
              if (byName) {
                existingCustomerId = byName.id;
                existingAddressId = (byName as any).customer_addresses?.[0]?.id || null;
              }
            }

            if (existingCustomerId) {
              // Update existing customer
              const { error: updErr } = await supabase.rpc("update_customer_with_address", {
                target_business_id: businessId,
                target_customer_id: existingCustomerId,
                target_address_id: existingAddressId,
                target_name: name,
                target_company_name: row.company_name || null,
                target_phone: row.phone || null,
                target_email: row.email || null,
                target_gst_number: row.gst_number || null,
                target_payment_terms: row.payment_terms || null,
                target_credit_limit: String(row.credit_limit || "0"),
                target_address: row.address || null,
                target_city: row.city || null,
                target_state: row.state || null,
                target_postal_code: row.postal_code || null,
                target_district: row.district || null,
              });
              if (updErr) throw updErr;
            } else {
              // Create new customer with address
              const { error: insErr } = await supabase.rpc("create_customer_with_address", {
                target_business_id: businessId,
                target_name: name,
                target_company_name: row.company_name || null,
                target_phone: row.phone || null,
                target_email: row.email || null,
                target_gst_number: row.gst_number || null,
                target_payment_terms: row.payment_terms || null,
                target_credit_limit: String(row.credit_limit || "0"),
                target_address: row.address || null,
                target_city: row.city || null,
                target_state: row.state || null,
                target_postal_code: row.postal_code || null,
                target_district: row.district || null,
              });
              if (insErr) throw insErr;
            }
            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.name, err.message || "Failed to save customer", row);
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
              continue;
            }

            const { data: existing } = await supabase
              .from("suppliers")
              .select("id")
              .eq("business_id", businessId)
              .ilike("name", name)
              .maybeSingle();

            if (existing) {
              await supabase
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
            } else {
              const { error } = await supabase.from("suppliers").insert({
                business_id: businessId,
                name,
                phone: row.phone || null,
                email: row.email || null,
                address: row.address || null,
                gst_number: row.gst_number || null,
                status: row.status || "ACTIVE",
              });
              if (error) throw error;
            }
            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.name, err.message || "Failed to save supplier", row);
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 3. PRODUCTS & CATEGORIES
      // -------------------------------------------------------------
      case "products": {
        // Pre-fetch active categories map
        const { data: existingCats } = await supabase
          .from("categories")
          .select("id, name")
          .eq("business_id", businessId);

        const categoryMap = new Map<string, string>();
        existingCats?.forEach((c) => categoryMap.set(c.name.trim().toLowerCase(), c.id));

        for (const row of records) {
          const rowNum = row._rowNumber || importedCount + 1;
          try {
            const sku = String(row.sku || "").trim();
            const name = String(row.name || "").trim();
            if (!sku || !name) {
              addError(rowNum, sku, "SKU and Product Name are required", row);
              continue;
            }

            // Resolve or auto-create category
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

            const sellingPrice = parseFloat(String(row.selling_price || 0));
            const taxRate = parseFloat(String(row.tax_rate ?? 18));
            const minStock = parseInt(String(row.min_stock || 0), 10);
            const dailyCapacity = parseInt(String(row.daily_capacity || 100), 10);

            // Upsert product by SKU
            const { data: existingProduct } = await supabase
              .from("products")
              .select("id")
              .eq("business_id", businessId)
              .eq("sku", sku)
              .maybeSingle();

            const parseQty = (val: any) => {
              if (val === null || val === undefined || String(val).trim() === "") return 0;
              const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              return isNaN(n) ? 0 : Math.max(0, n);
            };

            const normUnit = normalizeProductUnit(row.unit);

            if (existingProduct) {
              const updatePayload: Record<string, any> = {
                name,
                category_id: categoryId,
                unit: normUnit,
                production_unit: normUnit,
                selling_price: sellingPrice,
                tax_rate: taxRate,
                min_stock: minStock,
                daily_capacity: dailyCapacity,
                description: row.description || null,
                active: true,
                updated_at: new Date().toISOString(),
              };
              if (row.qty_is_4985 !== undefined && row.qty_is_4985 !== null) updatePayload.qty_is_4985 = parseQty(row.qty_is_4985);
              if (row.qty_is_12786 !== undefined && row.qty_is_12786 !== null) updatePayload.qty_is_12786 = parseQty(row.qty_is_12786);
              if (row.qty_is_13487 !== undefined && row.qty_is_13487 !== null) updatePayload.qty_is_13487 = parseQty(row.qty_is_13487);
              if (row.qty_is_13488 !== undefined && row.qty_is_13488 !== null) updatePayload.qty_is_13488 = parseQty(row.qty_is_13488);
              if (row.qty_is_12785 !== undefined && row.qty_is_12785 !== null) updatePayload.qty_is_12785 = parseQty(row.qty_is_12785);

              const { error } = await supabase
                .from("products")
                .update(updatePayload)
                .eq("id", existingProduct.id);
              if (error) throw error;
            } else {
              const { error } = await supabase.from("products").insert({
                business_id: businessId,
                sku,
                name,
                category_id: categoryId,
                unit: normUnit,
                production_unit: normUnit,
                selling_price: sellingPrice,
                tax_rate: taxRate,
                min_stock: minStock,
                daily_capacity: dailyCapacity,
                description: row.description || null,
                active: true,
                qty_is_4985: parseQty(row.qty_is_4985),
                qty_is_12786: parseQty(row.qty_is_12786),
                qty_is_13487: parseQty(row.qty_is_13487),
                qty_is_13488: parseQty(row.qty_is_13488),
                qty_is_12785: parseQty(row.qty_is_12785),
              });
              if (error) throw error;
            }
            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.sku, err.message || "Failed to save product", row);
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 4. OPENING FINISHED-GOODS STOCK
      // -------------------------------------------------------------
      case "opening_finished_goods": {
        // Pre-fetch products
        const { data: products } = await supabase
          .from("products")
          .select("id, sku, name")
          .eq("business_id", businessId);

        const productBySku = new Map<string, string>();
        products?.forEach((p) => productBySku.set(p.sku.trim().toLowerCase(), p.id));

        for (const row of records) {
          const rowNum = row._rowNumber || importedCount + 1;
          try {
            const sku = String(row.sku || "").trim().toLowerCase();
            const productId = productBySku.get(sku);
            if (!productId) {
              addError(rowNum, row.sku, `Product SKU "${row.sku}" not found in catalog. Create the product first.`, row);
              continue;
            }

            const qty = parseFloat(String(row.quantity || 0));
            if (qty <= 0) {
              addError(rowNum, row.sku, "Opening quantity must be greater than 0", row);
              continue;
            }

            // Check existing inventory record
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

            // Record audit transaction
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
              created_at: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
            });

            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.sku, err.message || "Failed to set opening stock", row);
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
        materials?.forEach((m) => materialMap.set(m.name.trim().toLowerCase(), m.id));

        for (const row of records) {
          const rowNum = row._rowNumber || importedCount + 1;
          try {
            const name = String(row.material_name || "").trim();
            if (!name) {
              addError(rowNum, undefined, "Material name is required", row);
              continue;
            }

            let materialId = materialMap.get(name.toLowerCase());
            if (!materialId) {
              // Create material
              const { data: newMat, error: matErr } = await supabase
                .from("raw_materials")
                .insert({
                  business_id: businessId,
                  name,
                  unit: row.unit || "KG",
                  unit_cost: parseFloat(String(row.unit_cost || 0)),
                  min_stock: parseFloat(String(row.min_stock || 0)),
                })
                .select("id")
                .single();
              if (matErr) throw matErr;
              materialId = newMat.id;
              materialMap.set(name.toLowerCase(), newMat.id);
            }

            const qty = parseFloat(String(row.quantity || 0));
            if (qty <= 0) {
              addError(rowNum, name, "Quantity must be greater than 0", row);
              continue;
            }

            // Update raw material inventory
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

            // Transaction log
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

            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.material_name, err.message || "Failed to set opening material stock", row);
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 6. HISTORICAL SALES ORDERS & ITEMS
      // -------------------------------------------------------------
      case "historical_orders": {
        // Group rows by order_number
        const orderGroups = new Map<string, any[]>();
        records.forEach((r) => {
          const num = String(r.order_number || "").trim().toUpperCase();
          if (!num) return;
          if (!orderGroups.has(num)) orderGroups.set(num, []);
          orderGroups.get(num)!.push(r);
        });

        // Preload customer and product maps
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, phone, customer_addresses(state, district)")
          .eq("business_id", businessId);

        const customerMap = new Map<string, { id: string; state?: string; district?: string }>();
        customers?.forEach((c) => {
          customerMap.set(c.name.trim().toLowerCase(), {
            id: c.id,
            state: (c as any).customer_addresses?.[0]?.state,
            district: (c as any).customer_addresses?.[0]?.district,
          });
          if (c.phone) {
            customerMap.set(c.phone.trim(), {
              id: c.id,
              state: (c as any).customer_addresses?.[0]?.state,
              district: (c as any).customer_addresses?.[0]?.district,
            });
          }
        });

        const { data: products } = await supabase
          .from("products")
          .select("id, sku, name, selling_price, tax_rate, qty_is_4985, qty_is_12786, qty_is_13487, qty_is_13488, qty_is_12785")
          .eq("business_id", businessId);

        const productBySku = new Map<string, any>();
        products?.forEach((p) => productBySku.set(p.sku.trim().toLowerCase(), p));

        for (const [orderNumber, items] of orderGroups.entries()) {
          const firstRow = items[0];
          const rowNum = firstRow._rowNumber || 1;

          try {
            // Check duplicate order_number
            const { data: existingOrd } = await supabase
              .from("orders")
              .select("id")
              .eq("business_id", businessId)
              .eq("order_number", orderNumber)
              .maybeSingle();

            if (existingOrd) {
              addError(rowNum, orderNumber, `Order Number "${orderNumber}" already exists in the system.`, firstRow);
              continue;
            }

            // Resolve customer
            const custQuery = String(firstRow.customer_phone || firstRow.customer_name || "").trim().toLowerCase();
            let customerInfo = customerMap.get(custQuery);

            if (!customerInfo) {
              // Auto-create customer if missing
              const custName = String(firstRow.customer_name || "Historical Customer").trim();
              const { data: newCust, error: custErr } = await supabase.rpc("create_customer_with_address", {
                target_business_id: businessId,
                target_name: custName,
                target_company_name: null,
                target_phone: firstRow.customer_phone || null,
                target_email: null,
                target_gst_number: null,
                target_payment_terms: "Historical",
                target_credit_limit: "0",
                target_address: null,
                target_city: null,
                target_state: null,
                target_postal_code: null,
                target_district: null,
              });
              if (custErr || !newCust) {
                addError(rowNum, orderNumber, `Could not resolve or create customer "${custName}".`, firstRow);
                continue;
              }
              customerInfo = { id: newCust };
              customerMap.set(custName.toLowerCase(), customerInfo);
            }

            // Validate all line items
            let subtotal = 0;
            let discountAmount = 0;
            let taxAmount = 0;
            const validItemsPayload: any[] = [];
            let itemFailed = false;

            for (const itm of items) {
              const sku = String(itm.product_sku || "").trim().toLowerCase();
              let prd = productBySku.get(sku);
              if (!prd) {
                // Auto create product if missing
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
                    selling_price: parseFloat(String(itm.unit_price || 0)),
                    tax_rate: parseFloat(String(itm.tax_rate ?? 18)),
                    active: true,
                  })
                  .select("id, sku, name, selling_price, tax_rate")
                  .single();

                if (prdErr || !newPrd) {
                  addError(itm._rowNumber || rowNum, orderNumber, `Product "${itm.product_sku}" could not be resolved.`, itm);
                  itemFailed = true;
                  break;
                }
                prd = newPrd;
                productBySku.set(sku, prd);
              }

              const qty = parseFloat(String(itm.quantity || 1));
              const unitPrice = parseFloat(String(itm.unit_price ?? prd.selling_price ?? 0));
              const discRate = parseFloat(String(itm.discount_rate || 0));
              const taxRate = parseFloat(String(itm.tax_rate ?? prd.tax_rate ?? 18));

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

            // Insert into orders
            const { data: newOrder, error: orderErr } = await supabase
              .from("orders")
              .insert({
                business_id: businessId,
                customer_id: customerInfo.id,
                order_number: orderNumber,
                order_date: firstRow.order_date || new Date().toISOString().split("T")[0],
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

            // Insert order items
            const itemsToInsert = validItemsPayload.map((itm) => ({
              business_id: businessId,
              order_id: newOrder.id,
              product_id: itm.product_id,
              product_name: itm.product_name,
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

            // Audit history
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

            importedCount += items.length;
          } catch (err: any) {
            addError(rowNum, orderNumber, err.message || "Failed to import historical order", firstRow);
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // 7. HISTORICAL PAYMENTS & BALANCES
      // -------------------------------------------------------------
      case "historical_payments": {
        for (const row of records) {
          const rowNum = row._rowNumber || importedCount + 1;
          try {
            const paymentNumber = String(row.payment_number || "").trim().toUpperCase();
            if (!paymentNumber) {
              addError(rowNum, undefined, "Payment Number is required", row);
              continue;
            }

            const amount = parseFloat(String(row.amount || 0));
            if (amount <= 0) {
              addError(rowNum, paymentNumber, "Payment amount must be greater than 0", row);
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
              continue;
            }

            // Resolve customer
            const custName = String(row.customer_name || "").trim();
            const { data: customer } = await supabase
              .from("customers")
              .select("id, name")
              .eq("business_id", businessId)
              .ilike("name", custName)
              .maybeSingle();

            if (!customer) {
              addError(rowNum, paymentNumber, `Customer "${custName}" not found. Create customer first.`, row);
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
                // Update order's paid amount & due amount
                const newPaid = Number(((ord.paid_amount || 0) + amount).toFixed(2));
                const newDue = Math.max(0, Number(((ord.total_amount || 0) - newPaid).toFixed(2)));
                await supabase
                  .from("orders")
                  .update({ paid_amount: newPaid, due_amount: newDue })
                  .eq("id", ord.id);
              }
            }

            // Insert into payments
            const { data: newPayment, error: payErr } = await supabase
              .from("payments")
              .insert({
                business_id: businessId,
                customer_id: customer.id,
                order_id: linkedOrderId,
                payment_number: paymentNumber,
                amount: amount,
                payment_date: row.payment_date || new Date().toISOString().split("T")[0],
                payment_method: row.payment_method || "BANK_TRANSFER",
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
              balance: 0, // Recalculated below
              entry_date: row.payment_date || new Date().toISOString().split("T")[0],
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

            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.payment_number, err.message || "Failed to import payment", row);
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
              continue;
            }

            // Resolve supplier
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
              if (suppErr || !newSupp) throw suppErr;
              supplier = newSupp;
            }

            let subtotal = 0;
            let taxAmount = 0;
            const validPoItems: any[] = [];

            for (const itm of items) {
              const matName = String(itm.material_name || "").trim();
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
                    name: matName || "Raw Material",
                    unit: "KG",
                    unit_cost: parseFloat(String(itm.unit_cost || 0)),
                  })
                  .select("id")
                  .single();
                if (matErr || !newMat) throw matErr;
                material = newMat;
              }

              const qty = parseFloat(String(itm.ordered_quantity || 1));
              const unitCost = parseFloat(String(itm.unit_cost || 0));
              const taxRate = parseFloat(String(itm.tax_rate || 0));
              const lineCost = qty * unitCost;
              const lineTax = lineCost * (taxRate / 100);

              subtotal += lineCost;
              taxAmount += lineTax;

              validPoItems.push({
                raw_material_id: material.id,
                ordered_quantity: qty,
                received_quantity: qty,
                unit_cost: unitCost,
                tax_rate: taxRate,
                line_total: lineCost + lineTax,
              });
            }

            const totalAmount = subtotal + taxAmount;

            const { data: newPo, error: poErr } = await supabase
              .from("purchase_orders")
              .insert({
                business_id: businessId,
                supplier_id: supplier.id,
                po_number: poNumber,
                order_date: firstRow.po_date || new Date().toISOString().split("T")[0],
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

            // If status is RECEIVED, create receipts
            for (const itm of validPoItems) {
              await supabase.from("purchase_receipts").insert({
                business_id: businessId,
                purchase_order_id: newPo.id,
                raw_material_id: itm.raw_material_id,
                received_quantity: itm.received_quantity,
                unit_cost: itm.unit_cost,
                tax_rate: itm.tax_rate,
                received_by: userId,
                received_at: firstRow.po_date ? new Date(firstRow.po_date).toISOString() : new Date().toISOString(),
                notes: "Historical procurement receipt",
              });
            }

            importedCount += items.length;
          } catch (err: any) {
            addError(rowNum, poNumber, err.message || "Failed to import purchase order", firstRow);
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
            const amount = parseFloat(String(row.amount || 0));
            if (!category || amount <= 0) {
              addError(rowNum, row.reference, "Category and valid Amount (>0) are required.", row);
              continue;
            }

            const { error: expErr } = await supabase.from("expenses").insert({
              business_id: businessId,
              category,
              amount,
              expense_date: row.expense_date || new Date().toISOString().split("T")[0],
              reference: row.reference || null,
              description: row.description || "Historical expense import",
              status: row.status || "POSTED",
              created_by: userId,
            });

            if (expErr) throw expErr;
            importedCount++;
          } catch (err: any) {
            addError(rowNum, row.reference, err.message || "Failed to import expense", row);
          }
        }
        break;
      }

      default:
        throw new Error(`Unsupported module: ${module}`);
    }

    // Determine final status
    const failedCount = failedErrors.length;
    const totalCount = records.length;
    let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED" = "COMPLETED";

    if (importedCount === 0 && failedCount > 0) {
      finalStatus = "FAILED";
    } else if (failedCount > 0) {
      finalStatus = "PARTIAL";
    }

    const summary =
      finalStatus === "COMPLETED"
        ? `Successfully imported all ${importedCount} records.`
        : finalStatus === "PARTIAL"
        ? `Imported ${importedCount} records with ${failedCount} failures.`
        : `Import failed: all ${failedCount} records encountered errors.`;

    // Record job in public.import_jobs
    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        business_id: businessId,
        module,
        filename,
        file_hash: fileHash,
        total_rows: totalCount,
        imported_rows: importedCount,
        failed_rows: failedCount,
        status: finalStatus,
        error_summary: summary,
        errors: failedErrors,
        metadata: {
          imported_at: new Date().toISOString(),
          user_id: userId,
        },
        created_by: userId,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobErr) {
      console.error("Failed to record import job:", jobErr);
    }

    return {
      success: importedCount > 0,
      jobId: job?.id || "job-" + Date.now(),
      totalRows: totalCount,
      importedRows: importedCount,
      failedRows: failedCount,
      errors: failedErrors,
      message: summary,
    };
  } catch (err: any) {
    console.error("Fatal import error:", err);
    throw new Error(err.message || "Bulk import failed unexpectedly.");
  }
}
