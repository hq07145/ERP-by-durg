import {
  determineGstTaxType,
  calculateItemGst,
  calculateOrderGst,
  validateItemTaxRates,
  INDIAN_STATES,
  isValidGstin,
} from "../app/src/lib/financials/gst";

console.log("================================================================");
console.log("RUNNING GST ENGINE UNIT & VALIDATION TESTS");
console.log("================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  }
}

// -------------------------------------------------------------------------
// 1. Tax Type Determination
// -------------------------------------------------------------------------
console.log("--- 1. Tax Type Determination ---");

// Intra-State: Maharashtra to Maharashtra
const intra = determineGstTaxType({
  supplierState: "Maharashtra",
  customerState: "Maharashtra",
});
assert(intra === "INTRA_STATE", "Same state (Maharashtra -> Maharashtra) resolves to INTRA_STATE");

// Intra-State via GSTIN (27 -> 27)
const intraGstin = determineGstTaxType({
  supplierGstin: "27AABCS1429B1ZB",
  customerGstin: "27AAAAA0000A1Z5",
});
assert(intraGstin === "INTRA_STATE", "Same GSTIN state code (27 -> 27) resolves to INTRA_STATE");

// Inter-State: Maharashtra to Gujarat
const inter = determineGstTaxType({
  supplierState: "Maharashtra",
  customerState: "Gujarat",
});
assert(inter === "INTER_STATE", "Different states (Maharashtra -> Gujarat) resolves to INTER_STATE");

// Inter-State via Place of Supply (Supplier: MH, PoS: Delhi)
const interPos = determineGstTaxType({
  supplierState: "Maharashtra",
  placeOfSupply: "Delhi",
});
assert(interPos === "INTER_STATE", "Place of supply in different state resolves to INTER_STATE");

// Place of Supply in same state overrides customer location
const intraPos = determineGstTaxType({
  supplierState: "Maharashtra",
  customerState: "Gujarat",
  placeOfSupply: "Maharashtra",
});
assert(intraPos === "INTRA_STATE", "Place of supply in supplier state overrides to INTRA_STATE");

// -------------------------------------------------------------------------
// 2. Intra-State GST Calculation (CGST 50% + SGST 50%, IGST 0%)
// -------------------------------------------------------------------------
console.log("\n--- 2. Intra-State GST Calculation ---");

const intraItem = calculateItemGst({
  taxType: "INTRA_STATE",
  quantity: 10,
  unitPrice: 1000,
  discountRate: 0,
  gstRate: 18,
});

assert(intraItem.taxableAmount === 10000, "Taxable amount is ₹10,000");
assert(intraItem.cgstRate === 9, "CGST rate is 9% (half of 18%)");
assert(intraItem.sgstRate === 9, "SGST rate is 9% (half of 18%)");
assert(intraItem.igstRate === 0, "IGST rate is 0%");
assert(intraItem.cgstAmount === 900, "CGST amount is ₹900");
assert(intraItem.sgstAmount === 900, "SGST amount is ₹900");
assert(intraItem.igstAmount === 0, "IGST amount is ₹0");
assert(intraItem.taxAmount === 1800, "Total GST is ₹1,800");
assert(intraItem.lineTotal === 11800, "Line total is ₹11,800");

// -------------------------------------------------------------------------
// 3. Interstate GST Calculation (IGST 100%, CGST 0%, SGST 0%)
// -------------------------------------------------------------------------
console.log("\n--- 3. Interstate GST Calculation ---");

const interItem = calculateItemGst({
  taxType: "INTER_STATE",
  quantity: 10,
  unitPrice: 1000,
  discountRate: 0,
  gstRate: 18,
});

assert(interItem.taxableAmount === 10000, "Taxable amount is ₹10,000");
assert(interItem.cgstRate === 0, "CGST rate is 0%");
assert(interItem.sgstRate === 0, "SGST rate is 0%");
assert(interItem.igstRate === 18, "IGST rate is 18% (100% of 18%)");
assert(interItem.cgstAmount === 0, "CGST amount is ₹0");
assert(interItem.sgstAmount === 0, "SGST amount is ₹0");
assert(interItem.igstAmount === 1800, "IGST amount is ₹1,800");
assert(interItem.taxAmount === 1800, "Total GST is ₹1,800");
assert(interItem.lineTotal === 11800, "Line total is ₹11,800");

// -------------------------------------------------------------------------
// 4. Tax Rate Validation & Double Taxation Prevention
// -------------------------------------------------------------------------
console.log("\n--- 4. Tax Rate Validation Checks ---");

// Valid Intra-State
const validIntra = validateItemTaxRates({
  taxType: "INTRA_STATE",
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
});
assert(validIntra.isValid, "Valid intra-state (CGST 9% + SGST 9%, IGST 0%) passes validation");

// Negative rate rejected
const negativeRate = validateItemTaxRates({
  taxType: "INTRA_STATE",
  cgstRate: -1,
  sgstRate: 9,
  igstRate: 0,
});
assert(!negativeRate.isValid, "Negative GST rate is rejected");

// Invalid Intra-State: Having IGST
const invalidIgstOnIntra = validateItemTaxRates({
  taxType: "INTRA_STATE",
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 18,
});
assert(!invalidIgstOnIntra.isValid, "Charging both CGST/SGST and IGST fails validation (double-tax prevention)");

// Valid Interstate
const validInter = validateItemTaxRates({
  taxType: "INTER_STATE",
  cgstRate: 0,
  sgstRate: 0,
  igstRate: 18,
});
assert(validInter.isValid, "Valid interstate (CGST 0%, SGST 0%, IGST 18%) passes validation");

// Invalid Interstate: Having CGST/SGST
const invalidCgstOnInter = validateItemTaxRates({
  taxType: "INTER_STATE",
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
});
assert(!invalidCgstOnInter.isValid, "Charging CGST/SGST on an interstate order fails validation");

// -------------------------------------------------------------------------
// 5. Order Calculation with Multi-item Discount
// -------------------------------------------------------------------------
console.log("\n--- 5. Order Calculation with Discounts ---");

const multiItemOrder = calculateOrderGst({
  supplierState: "Maharashtra",
  customerState: "Gujarat", // Interstate
  items: [
    {
      productId: "prod-1",
      quantity: 5,
      unitPrice: 200, // Gross 1000
      discountRate: 10, // Disc 100 -> Taxable 900
      taxRate: 18, // IGST 18% on 900 = 162
      igstRate: 18,
      cgstRate: 0,
      sgstRate: 0,
    },
    {
      productId: "prod-2",
      quantity: 2,
      unitPrice: 500, // Gross 1000
      discountRate: 20, // Disc 200 -> Taxable 800
      taxRate: 12, // IGST 12% on 800 = 96
      igstRate: 12,
      cgstRate: 0,
      sgstRate: 0,
    },
  ],
});

assert(multiItemOrder.taxType === "INTER_STATE", "Order resolved to INTER_STATE");
assert(multiItemOrder.subtotal === 2000, "Subtotal is ₹2,000");
assert(multiItemOrder.discountAmount === 300, "Discount amount is ₹300");
assert(multiItemOrder.taxableSubtotal === 1700, "Taxable subtotal is ₹1,700");
assert(multiItemOrder.igstAmount === 258, "Total IGST is ₹258 (162 + 96)");
assert(multiItemOrder.cgstAmount === 0, "CGST is ₹0");
assert(multiItemOrder.sgstAmount === 0, "SGST is ₹0");
assert(multiItemOrder.totalAmount === 1958, "Total Amount is ₹1,958 (1700 + 258)");

console.log("\n================================================================");
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("================================================================");

if (failed > 0) {
  process.exit(1);
}
