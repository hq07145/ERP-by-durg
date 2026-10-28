import type {
  ImportModule,
  ClassifiedImportRow,
  ImportClassificationResult,
} from "../../types/import";
import { parseDateRobust, parseNumberRobust } from "./file-parser";

/**
 * Server-side classification engine for Excel/CSV imports.
 * Inspects all rows against database records and within-file occurrences.
 * Classifies each row into:
 *  - NEW: Valid record that does not exist in the database and is not duplicated in the file.
 *  - DUPLICATE: Exists in database or repeated in file (by stable business identifiers).
 *  - INVALID: Missing required fields, invalid date/number format, or non-existent references.
 *  - REJECTED: Violates business rules (overpayment, negative amount, etc.).
 */
export async function classifyImportRowsInternal(
  supabase: any,
  businessId: string,
  module: ImportModule,
  records: any[]
): Promise<ImportClassificationResult> {
  const classifiedRows: ClassifiedImportRow[] = [];
  let newCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let rejectedCount = 0;

  switch (module) {
    // -----------------------------------------------------------------
    // 1. HISTORICAL PAYMENTS
    // -----------------------------------------------------------------
    case "historical_payments": {
      // 1. Existing payments
      const { data: dbPayments } = await supabase
        .from("payments")
        .select("id, payment_number, transaction_id, utr_number, reference, payment_method, amount, payment_date")
        .eq("business_id", businessId);

      const dbPayNumMap = new Map<string, string>(); // lower(num) -> id
      const dbTxnIdMap = new Map<string, { id: string; num: string }>(); // lower(txnId) -> info
      const dbUtrMap = new Map<string, { id: string; num: string; date: string }>(); // lower(utr) -> info

      (dbPayments || []).forEach((p: any) => {
        if (p.payment_number) dbPayNumMap.set(p.payment_number.trim().toLowerCase(), p.id);
        if (p.transaction_id && p.transaction_id.trim()) {
          dbTxnIdMap.set(p.transaction_id.trim().toLowerCase(), { id: p.id, num: p.payment_number });
        }
        const utr = (p.utr_number || p.reference || "").trim().toLowerCase();
        if (utr && p.payment_method !== "CASH") {
          dbUtrMap.set(utr, { id: p.id, num: p.payment_number, date: p.payment_date });
        }
      });

      // 2. Customers
      const { data: dbCustomers } = await supabase
        .from("customers")
        .select("id, name, company_name, phone")
        .eq("business_id", businessId);

      const customerMap = new Map<string, string>();
      (dbCustomers || []).forEach((c: any) => {
        if (c.name) customerMap.set(c.name.trim().toLowerCase(), c.id);
        if (c.company_name) customerMap.set(c.company_name.trim().toLowerCase(), c.id);
        if (c.phone) {
          const digits = c.phone.replace(/[^0-9]/g, "");
          if (digits.length >= 7) customerMap.set(digits.slice(-10), c.id);
        }
      });

      // 3. Orders
      const { data: dbOrders } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, paid_amount, due_amount")
        .eq("business_id", businessId);

      const orderMap = new Map<string, any>();
      (dbOrders || []).forEach((o: any) => {
        if (o.order_number) orderMap.set(o.order_number.trim().toLowerCase(), o);
      });

      const filePayNums = new Set<string>();
      const fileTxnIds = new Set<string>();
      const fileUtrs = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const payNum = String(row.payment_number || "").trim();
        const txnId = String(row.transaction_id || "").trim();
        const rawRef = String(row.utr_number || row.reference || "").trim();
        const method = String(row.payment_method || "BANK_TRANSFER").trim().toUpperCase();
        const custName = String(row.customer_name || "").trim();
        const rawAmt = row.amount;
        const amt = parseNumberRobust(rawAmt) ?? 0;
        const payDate = parseDateRobust(row.payment_date) || String(row.payment_date || "").trim();
        const orderNum = String(row.order_number || "").trim();

        const identifier = payNum || txnId || rawRef || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!payNum) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Payment Number is required.",
            data: row,
          });
          return;
        }

        const custPhoneDigits = custName.replace(/[^0-9]/g, "");
        const matchedCustId =
          customerMap.get(custName.toLowerCase()) ||
          (custPhoneDigits.length >= 7 ? customerMap.get(custPhoneDigits.slice(-10)) : null);

        if (!matchedCustId) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: custName ? `Customer "${custName}" not found in database.` : "Customer Name is required.",
            data: row,
          });
          return;
        }

        if (isNaN(amt) || amt <= 0) {
          rejectedCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "REJECTED",
            reason: `Payment amount must be greater than 0 (got "${rawAmt}").`,
            data: row,
          });
          return;
        }

        if (row.payment_date && !parseDateRobust(row.payment_date)) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: `Payment Date must be a valid date in YYYY-MM-DD or DD/MM/YYYY format (got "${row.payment_date}").`,
            data: row,
          });
          return;
        }

        if (orderNum) {
          const ord = orderMap.get(orderNum.toLowerCase());
          if (!ord) {
            invalidCount++;
            classifiedRows.push({
              rowNumber: rowNum,
              identifier,
              classification: "INVALID",
              reason: `Linked Order "${orderNum}" not found in system.`,
              data: row,
            });
            return;
          }
          if (amt > ord.due_amount + 0.001) {
            rejectedCount++;
            classifiedRows.push({
              rowNumber: rowNum,
              identifier,
              classification: "REJECTED",
              reason: `Overpayment blocked: Amount (₹${amt}) exceeds order balance due (₹${ord.due_amount}).`,
              data: row,
            });
            return;
          }
        }

        // Duplicate checks in file
        if (payNum && filePayNums.has(payNum.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate Payment Number "${payNum}" found within this file.`,
            data: row,
          });
          return;
        }
        if (txnId && fileTxnIds.has(txnId.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate Transaction ID "${txnId}" found within this file.`,
            data: row,
          });
          return;
        }
        if (rawRef && method !== "CASH" && fileUtrs.has(rawRef.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate Bank UTR/Reference "${rawRef}" found within this file.`,
            data: row,
          });
          return;
        }

        // Duplicate checks against database
        if (payNum && dbPayNumMap.has(payNum.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Payment Number "${payNum}" already exists in database.`,
            data: row,
            existingRecordId: dbPayNumMap.get(payNum.toLowerCase()),
          });
          return;
        }

        if (txnId && dbTxnIdMap.has(txnId.toLowerCase())) {
          const matched = dbTxnIdMap.get(txnId.toLowerCase())!;
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `External Transaction ID "${txnId}" already recorded in payment ${matched.num}.`,
            data: row,
            existingRecordId: matched.id,
          });
          return;
        }

        if (rawRef && method !== "CASH" && dbUtrMap.has(rawRef.toLowerCase())) {
          const matched = dbUtrMap.get(rawRef.toLowerCase())!;
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Bank UTR/Reference "${rawRef}" already recorded in payment ${matched.num} on ${matched.date}.`,
            data: row,
            existingRecordId: matched.id,
          });
          return;
        }

        if (payNum) filePayNums.add(payNum.toLowerCase());
        if (txnId) fileTxnIds.add(txnId.toLowerCase());
        if (rawRef && method !== "CASH") fileUtrs.add(rawRef.toLowerCase());

        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new payment record ready for import.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 2. CUSTOMERS
    // -----------------------------------------------------------------
    case "customers": {
      const { data: dbCustomers } = await supabase
        .from("customers")
        .select("id, name, company_name, phone")
        .eq("business_id", businessId);

      const dbPhoneMap = new Map<string, string>();
      const dbNameMap = new Map<string, string>();

      (dbCustomers || []).forEach((c: any) => {
        if (c.phone) dbPhoneMap.set(c.phone.trim().replace(/[^0-9]/g, ""), c.id);
        if (c.name) dbNameMap.set(c.name.trim().toLowerCase(), c.id);
        if (c.company_name) dbNameMap.set(c.company_name.trim().toLowerCase(), c.id);
      });

      const filePhones = new Set<string>();
      const fileNames = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const name = String(row.name || "").trim();
        const rawPhone = String(row.phone || "").trim();
        const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
        const identifier = name || rawPhone || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!name) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Customer Name is required.",
            data: row,
          });
          return;
        }

        // File duplicate
        if (cleanPhone && cleanPhone.length >= 7 && filePhones.has(cleanPhone)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate phone "${rawPhone}" found within this file.`,
            data: row,
          });
          return;
        }
        if (fileNames.has(name.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate customer name "${name}" found within this file.`,
            data: row,
          });
          return;
        }

        // Database duplicate
        if (cleanPhone && cleanPhone.length >= 7 && dbPhoneMap.has(cleanPhone)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Customer with phone "${rawPhone}" already exists in database.`,
            data: row,
            existingRecordId: dbPhoneMap.get(cleanPhone),
          });
          return;
        }
        if (dbNameMap.has(name.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Customer with name "${name}" already exists in database.`,
            data: row,
            existingRecordId: dbNameMap.get(name.toLowerCase()),
          });
          return;
        }

        if (cleanPhone && cleanPhone.length >= 7) filePhones.add(cleanPhone);
        fileNames.add(name.toLowerCase());

        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new customer ready for creation.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 3. PRODUCTS
    // -----------------------------------------------------------------
    case "products": {
      const { data: dbProducts } = await supabase
        .from("products")
        .select("id, sku, name")
        .eq("business_id", businessId);

      const dbSkuMap = new Map<string, string>();
      (dbProducts || []).forEach((p: any) => {
        if (p.sku) dbSkuMap.set(p.sku.trim().toLowerCase(), p.id);
      });

      const fileSkus = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const sku = String(row.sku || "").trim();
        const name = String(row.name || "").trim();
        const identifier = sku || name || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!sku || !name) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Product SKU and Name are required.",
            data: row,
          });
          return;
        }

        if (fileSkus.has(sku.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate Product SKU "${sku}" found within this file.`,
            data: row,
          });
          return;
        }

        if (dbSkuMap.has(sku.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Product SKU "${sku}" already exists in product catalog.`,
            data: row,
            existingRecordId: dbSkuMap.get(sku.toLowerCase()),
          });
          return;
        }

        fileSkus.add(sku.toLowerCase());
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new product ready for creation.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 4. SUPPLIERS
    // -----------------------------------------------------------------
    case "suppliers": {
      const { data: dbSuppliers } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("business_id", businessId);

      const dbSuppMap = new Map<string, string>();
      (dbSuppliers || []).forEach((s: any) => {
        if (s.name) dbSuppMap.set(s.name.trim().toLowerCase(), s.id);
      });

      const fileSupps = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const name = String(row.name || "").trim();
        const identifier = name || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!name) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Supplier Name is required.",
            data: row,
          });
          return;
        }

        if (fileSupps.has(name.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate Supplier Name "${name}" found within this file.`,
            data: row,
          });
          return;
        }

        if (dbSuppMap.has(name.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Supplier "${name}" already exists in database.`,
            data: row,
            existingRecordId: dbSuppMap.get(name.toLowerCase()),
          });
          return;
        }

        fileSupps.add(name.toLowerCase());
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new supplier ready for creation.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 5. HISTORICAL ORDERS
    // -----------------------------------------------------------------
    case "historical_orders": {
      const { data: dbOrders } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("business_id", businessId);

      const dbOrdMap = new Map<string, string>();
      (dbOrders || []).forEach((o: any) => {
        if (o.order_number) dbOrdMap.set(o.order_number.trim().toLowerCase(), o.id);
      });

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const orderNum = String(row.order_number || "").trim();
        const sku = String(row.product_sku || "").trim();
        const qty = parseNumberRobust(row.quantity) ?? 0;
        const identifier = orderNum || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!orderNum) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Order Number is required.",
            data: row,
          });
          return;
        }

        if (dbOrdMap.has(orderNum.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Order Number "${orderNum}" already exists in database.`,
            data: row,
            existingRecordId: dbOrdMap.get(orderNum.toLowerCase()),
          });
          return;
        }

        if (!sku || isNaN(qty) || qty <= 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Valid Product SKU and positive quantity are required.",
            data: row,
          });
          return;
        }

        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new order line ready for import.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 6. PURCHASES
    // -----------------------------------------------------------------
    case "purchases": {
      const { data: dbPo } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("business_id", businessId);

      const dbPoMap = new Map<string, string>();
      (dbPo || []).forEach((p: any) => {
        if (p.po_number) dbPoMap.set(p.po_number.trim().toLowerCase(), p.id);
      });

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const poNum = String(row.po_number || "").trim();
        const mat = String(row.material_name || "").trim();
        const identifier = poNum || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!poNum || !mat) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "PO Number and Material Name are required.",
            data: row,
          });
          return;
        }

        if (dbPoMap.has(poNum.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `PO Number "${poNum}" already exists in database.`,
            data: row,
            existingRecordId: dbPoMap.get(poNum.toLowerCase()),
          });
          return;
        }

        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new purchase order line ready for import.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 7. CUSTOMER OPENING BALANCES
    // -----------------------------------------------------------------
    case "customer_opening_balances": {
      const { data: dbCustomers } = await supabase
        .from("customers")
        .select("id, name, company_name, phone")
        .eq("business_id", businessId);

      const custMap = new Map<string, any>();
      (dbCustomers || []).forEach((c: any) => {
        if (c.id) custMap.set(c.id.toLowerCase(), c);
        if (c.name) custMap.set(c.name.trim().toLowerCase(), c);
        if (c.company_name) custMap.set(c.company_name.trim().toLowerCase(), c);
        if (c.phone) custMap.set(c.phone.trim().replace(/[^0-9]/g, ""), c);
      });

      const { data: dbBalances } = await supabase
        .from("customer_opening_balances")
        .select("customer_id, as_on_date")
        .eq("business_id", businessId);

      const dbBalSet = new Set<string>();
      (dbBalances || []).forEach((b: any) => {
        dbBalSet.add(`${b.customer_id}:::${b.as_on_date}`);
      });

      const fileBalSet = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const custCode = String(row.customer_code || "").trim().toLowerCase();
        const custName = String(row.customer_name || "").trim().toLowerCase();
        const amt = parseNumberRobust(row.amount) ?? 0;
        const asOnDate = parseDateRobust(row.as_on_date) || String(row.as_on_date || "").trim();

        const identifier = row.customer_name || row.customer_code || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        const cleanCodeDigits = custCode.replace(/[^0-9]/g, "");
        const matched =
          custMap.get(custCode) ||
          custMap.get(custName) ||
          (cleanCodeDigits.length >= 7 ? custMap.get(cleanCodeDigits.slice(-10)) : null);

        if (!matched) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: `Customer "${row.customer_name || row.customer_code}" not found.`,
            data: row,
          });
          return;
        }

        if (isNaN(amt) || amt <= 0) {
          rejectedCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "REJECTED",
            reason: `Amount must be a positive number greater than 0 (got "${row.amount}").`,
            data: row,
          });
          return;
        }

        if (row.as_on_date && !parseDateRobust(row.as_on_date)) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: `As-on Date must be valid YYYY-MM-DD or DD/MM/YYYY (got "${row.as_on_date}").`,
            data: row,
          });
          return;
        }

        const comboKey = `${matched.id}:::${asOnDate}`;

        if (fileBalSet.has(comboKey)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate opening balance for "${matched.name}" on ${asOnDate} within file.`,
            data: row,
          });
          return;
        }

        if (dbBalSet.has(comboKey)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Opening balance already recorded for "${matched.name}" on ${asOnDate} in database.`,
            data: row,
          });
          return;
        }

        fileBalSet.add(comboKey);
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid opening balance ready for recording.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 8. OPENING FINISHED GOODS STOCK
    // -----------------------------------------------------------------
    case "opening_finished_goods": {
      const { data: dbProducts } = await supabase
        .from("products")
        .select("id, sku, name")
        .eq("business_id", businessId);

      const prodMap = new Map<string, string>();
      (dbProducts || []).forEach((p: any) => {
        if (p.sku) prodMap.set(p.sku.trim().toLowerCase(), p.id);
      });

      const { data: dbOpeningTxns } = await supabase
        .from("inventory_transactions")
        .select("item_id")
        .eq("business_id", businessId)
        .eq("transaction_type", "STOCK_IN")
        .eq("reference_type", "opening_stock");

      const dbHasOpening = new Set<string>();
      (dbOpeningTxns || []).forEach((t: any) => dbHasOpening.add(t.item_id));

      const fileSkus = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const sku = String(row.sku || "").trim();
        const qty = parseNumberRobust(row.quantity) ?? 0;
        const identifier = sku || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        const prodId = prodMap.get(sku.toLowerCase());
        if (!prodId) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: `Product SKU "${sku}" not found in catalog.`,
            data: row,
          });
          return;
        }

        if (isNaN(qty) || qty <= 0) {
          rejectedCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "REJECTED",
            reason: `Opening quantity must be greater than 0 (got "${row.quantity}").`,
            data: row,
          });
          return;
        }

        if (fileSkus.has(sku.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate opening stock entry for SKU "${sku}" within file.`,
            data: row,
          });
          return;
        }

        if (dbHasOpening.has(prodId)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Opening stock for Product SKU "${sku}" already recorded in database.`,
            data: row,
          });
          return;
        }

        fileSkus.add(sku.toLowerCase());
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid opening stock ready for posting.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 9. OPENING RAW MATERIALS
    // -----------------------------------------------------------------
    case "opening_raw_materials": {
      const { data: dbMaterials } = await supabase
        .from("raw_materials")
        .select("id, name")
        .eq("business_id", businessId);

      const matMap = new Map<string, string>();
      (dbMaterials || []).forEach((m: any) => {
        if (m.name) matMap.set(m.name.trim().toLowerCase(), m.id);
      });

      const { data: dbOpeningTxns } = await supabase
        .from("inventory_transactions")
        .select("item_id")
        .eq("business_id", businessId)
        .eq("item_type", "raw_material")
        .eq("transaction_type", "STOCK_IN")
        .eq("reference_type", "opening_stock");

      const dbHasOpening = new Set<string>();
      (dbOpeningTxns || []).forEach((t: any) => dbHasOpening.add(t.item_id));

      const fileMats = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const matName = String(row.material_name || "").trim();
        const qty = parseNumberRobust(row.quantity) ?? 0;
        const identifier = matName || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!matName) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Material Name is required.",
            data: row,
          });
          return;
        }

        if (isNaN(qty) || qty <= 0) {
          rejectedCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "REJECTED",
            reason: `Quantity must be greater than 0 (got "${row.quantity}").`,
            data: row,
          });
          return;
        }

        if (fileMats.has(matName.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate material "${matName}" within file.`,
            data: row,
          });
          return;
        }

        const matId = matMap.get(matName.toLowerCase());
        if (matId && dbHasOpening.has(matId)) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Opening raw material stock for "${matName}" already recorded in database.`,
            data: row,
          });
          return;
        }

        fileMats.add(matName.toLowerCase());
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid opening raw material stock ready for posting.",
          data: row,
        });
      });
      break;
    }

    // -----------------------------------------------------------------
    // 10. EXPENSES
    // -----------------------------------------------------------------
    case "expenses": {
      const { data: dbExpenses } = await supabase
        .from("expenses")
        .select("id, reference")
        .eq("business_id", businessId);

      const dbRefMap = new Map<string, string>();
      (dbExpenses || []).forEach((e: any) => {
        if (e.reference && e.reference.trim()) {
          dbRefMap.set(e.reference.trim().toLowerCase(), e.id);
        }
      });

      const fileRefs = new Set<string>();

      records.forEach((row, index) => {
        const rowNum = row._rowNumber || index + 1;
        const cat = String(row.category || "").trim();
        const amt = parseNumberRobust(row.amount) ?? 0;
        const ref = String(row.reference || "").trim();
        const identifier = ref || cat || `Row #${rowNum}`;

        if (row._validationErrors && row._validationErrors.length > 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: row._validationErrors.join("; "),
            data: row,
          });
          return;
        }

        if (!cat || isNaN(amt) || amt <= 0) {
          invalidCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "INVALID",
            reason: "Category and positive Amount are required.",
            data: row,
          });
          return;
        }

        if (ref && fileRefs.has(ref.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Duplicate expense reference "${ref}" within file.`,
            data: row,
          });
          return;
        }

        if (ref && dbRefMap.has(ref.toLowerCase())) {
          duplicateCount++;
          classifiedRows.push({
            rowNumber: rowNum,
            identifier,
            classification: "DUPLICATE",
            reason: `Expense with reference "${ref}" already exists in database.`,
            data: row,
            existingRecordId: dbRefMap.get(ref.toLowerCase()),
          });
          return;
        }

        if (ref) fileRefs.add(ref.toLowerCase());
        newCount++;
        classifiedRows.push({
          rowNumber: rowNum,
          identifier,
          classification: "NEW",
          reason: "Valid new expense record ready for import.",
          data: row,
        });
      });
      break;
    }

    default:
      throw new Error(`Unsupported module: ${module}`);
  }

  return {
    totalRows: records.length,
    newCount,
    duplicateCount,
    invalidCount,
    rejectedCount,
    rows: classifiedRows,
  };
}
