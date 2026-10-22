/**
 * Authoritative Indian GST Calculation Engine
 * 
 * Supports:
 * - 28 States + 8 Union Territories with official 2-digit GST state codes
 * - Rule-based tax type determination (Intra-State vs Inter-State vs Exempt)
 * - Equal CGST + SGST split for Intra-State (50% each of product GST rate)
 * - IGST for Inter-State (100% of product GST rate)
 * - Tax calculated strictly on taxable amount after discounts: (qty * price) - discount
 * - Prevents CGST/SGST and IGST from being charged together on the same taxable value
 * - Banker's / standard decimal rounding to 2 decimal places for financial integrity
 */

export interface IndianState {
  code: string;
  name: string;
}

export const INDIAN_STATES: readonly IndianState[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;

export const STANDARD_GST_RATES = [0, 5, 12, 18, 28] as const;

export type TaxType = "INTRA_STATE" | "INTER_STATE" | "EXEMPT";

export function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Validate Indian GSTIN format (15 alphanumeric characters: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum)
 */
export function isValidGstin(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  const cleaned = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return regex.test(cleaned);
}

/**
 * Extract 2-digit state code from GSTIN
 */
export function getStateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const cleaned = gstin.trim().toUpperCase();
  if (cleaned.length >= 2) {
    const code = cleaned.substring(0, 2);
    const found = INDIAN_STATES.find((s) => s.code === code);
    if (found) return found.code;
  }
  return null;
}

/**
 * Normalize state input into a recognized IndianState
 */
export function normalizeState(input: string | null | undefined): IndianState | null {
  if (!input) return null;
  const cleaned = input.trim();
  if (!cleaned) return null;

  // 1. Direct match on code (e.g. "27" or "07")
  const byCode = INDIAN_STATES.find((s) => s.code === cleaned.padStart(2, "0"));
  if (byCode) return byCode;

  // 2. Format like "27 - Maharashtra" or "27-Maharashtra"
  const prefixMatch = cleaned.match(/^(\d{2})\s*[-:]\s*(.+)$/);
  if (prefixMatch) {
    const code = prefixMatch[1];
    const match = INDIAN_STATES.find((s) => s.code === code);
    if (match) return match;
  }

  // 3. Name match case-insensitive
  const lower = cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = INDIAN_STATES.find((s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === lower);
  if (byName) return byName;

  // 4. Fuzzy / alias matches
  if (lower === "delhi" || lower === "nctofdelhi" || lower === "newdelhi") {
    return INDIAN_STATES.find((s) => s.code === "07") || null;
  }
  if (lower === "orissa") {
    return INDIAN_STATES.find((s) => s.code === "21") || null;
  }
  if (lower === "pondicherry") {
    return INDIAN_STATES.find((s) => s.code === "34") || null;
  }
  if (lower === "jammuandkashmir" || lower === "jk" || lower === "jammukashmir") {
    return INDIAN_STATES.find((s) => s.code === "01") || null;
  }
  if (lower === "uttaranchal") {
    return INDIAN_STATES.find((s) => s.code === "05") || null;
  }

  return null;
}

/**
 * Authoritative Indian GST Rule Engine to determine Tax Type:
 * - Intra-State (CGST + SGST): When Supplier Registered State matches Customer State / Place of Supply
 * - Inter-State (IGST): When Supplier Registered State differs from Customer State / Place of Supply
 * - Exempt: When explicitly flagged or non-taxable
 */
export function determineGstTaxType(params: {
  supplierState?: string | null;
  supplierGstin?: string | null;
  customerState?: string | null;
  customerGstin?: string | null;
  placeOfSupply?: string | null;
}): TaxType {
  // 1. Resolve Supplier State: prioritize explicit state, fallback to state extracted from GSTIN
  let supplier = normalizeState(params.supplierState);
  if (!supplier && params.supplierGstin) {
    const code = getStateCodeFromGstin(params.supplierGstin);
    if (code) supplier = normalizeState(code);
  }
  // Default supplier state to Maharashtra (27) if neither configured (per Indian registered baseline)
  if (!supplier) {
    supplier = normalizeState("27");
  }

  // 2. Resolve Customer / Place of Supply State
  // Priority: placeOfSupply > customerState > customerGstin
  let customer = normalizeState(params.placeOfSupply);
  if (!customer) {
    customer = normalizeState(params.customerState);
  }
  if (!customer && params.customerGstin) {
    const code = getStateCodeFromGstin(params.customerGstin);
    if (code) customer = normalizeState(code);
  }

  // If customer location is unspecified, default to supplier state (Intra-State)
  if (!customer) {
    return "INTRA_STATE";
  }

  // Indian GST Rule: same state code = INTRA_STATE, different = INTER_STATE
  return supplier?.code === customer.code ? "INTRA_STATE" : "INTER_STATE";
}

export interface CalculatedItemGst {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  taxRate: number; // Product GST percentage
  itemSubtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxType: TaxType;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface CalculateItemGstParams {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discountRate?: number | string;
  gstRate?: number | string;
  taxType: TaxType;
  sgstRate?: number | string | null;
  cgstRate?: number | string | null;
  igstRate?: number | string | null;
}

/**
 * Validate manual GST rates against Indian tax rules and transaction tax type
 */
export function validateItemTaxRates(params: {
  taxType: TaxType;
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
}): { isValid: boolean; error?: string } {
  if (params.sgstRate < 0 || params.cgstRate < 0 || params.igstRate < 0) {
    return { isValid: false, error: "GST rates cannot be negative." };
  }
  const hasIntra = params.sgstRate > 0 || params.cgstRate > 0;
  const hasInter = params.igstRate > 0;

  if (hasIntra && hasInter) {
    return {
      isValid: false,
      error: "Cannot apply both intra-state (SGST/CGST) and inter-state (IGST) to the same line item.",
    };
  }

  if (params.taxType === "INTRA_STATE" && hasInter && !hasIntra) {
    return {
      isValid: false,
      error: "This order is intra-state (same state). Please use SGST and CGST instead of IGST.",
    };
  }

  if (params.taxType === "INTER_STATE" && hasIntra && !hasInter) {
    return {
      isValid: false,
      error: "This order is inter-state (cross-border). Please use IGST instead of SGST and CGST.",
    };
  }

  return { isValid: true };
}

/**
 * Calculate single item GST with strict decimal rounding and rate splitting
 * Supports both manual SGST/CGST/IGST rates and automatic product tax rate splitting.
 */
export function calculateItemGst(params: CalculateItemGstParams): CalculatedItemGst {
  const qty = Number(params.quantity) || 0;
  const price = Number(params.unitPrice) || 0;
  const discRate = Math.min(100, Math.max(0, Number(params.discountRate) || 0));
  const fallbackGstRate = Math.min(100, Math.max(0, Number(params.gstRate) || 0));

  const itemSubtotal = roundCurrency(qty * price);
  const discountAmount = roundCurrency(itemSubtotal * (discRate / 100));
  const taxableAmount = Math.max(0, roundCurrency(itemSubtotal - discountAmount));

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;
  let fullGstRate = fallbackGstRate;

  const hasManualRates =
    params.sgstRate !== undefined || params.cgstRate !== undefined || params.igstRate !== undefined;

  if (hasManualRates) {
    sgstRate = Math.min(100, Math.max(0, Number(params.sgstRate) || 0));
    cgstRate = Math.min(100, Math.max(0, Number(params.cgstRate) || 0));
    igstRate = Math.min(100, Math.max(0, Number(params.igstRate) || 0));
    fullGstRate = roundCurrency(sgstRate + cgstRate + igstRate);

    sgstAmount = roundCurrency(taxableAmount * (sgstRate / 100));
    cgstAmount = roundCurrency(taxableAmount * (cgstRate / 100));
    igstAmount = roundCurrency(taxableAmount * (igstRate / 100));
  } else if (params.taxType === "EXEMPT" || fullGstRate === 0) {
    cgstRate = 0;
    cgstAmount = 0;
    sgstRate = 0;
    sgstAmount = 0;
    igstRate = 0;
    igstAmount = 0;
  } else if (params.taxType === "INTRA_STATE") {
    cgstRate = roundCurrency(fullGstRate / 2);
    sgstRate = roundCurrency(fullGstRate / 2);
    cgstAmount = roundCurrency(taxableAmount * (cgstRate / 100));
    sgstAmount = roundCurrency(taxableAmount * (sgstRate / 100));
    igstRate = 0;
    igstAmount = 0;
  } else {
    cgstRate = 0;
    cgstAmount = 0;
    sgstRate = 0;
    sgstAmount = 0;
    igstRate = fullGstRate;
    igstAmount = roundCurrency(taxableAmount * (igstRate / 100));
  }

  const taxAmount = roundCurrency(cgstAmount + sgstAmount + igstAmount);
  const lineTotal = roundCurrency(taxableAmount + taxAmount);

  return {
    productId: params.productId,
    quantity: qty,
    unitPrice: price,
    discountRate: discRate,
    taxRate: fullGstRate,
    itemSubtotal,
    discountAmount,
    taxableAmount,
    taxType: params.taxType,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    taxAmount,
    lineTotal,
  };
}

export interface CalculatedOrderGst {
  taxType: TaxType;
  placeOfSupply: string;
  subtotal: number;
  discountAmount: number;
  taxableSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: CalculatedItemGst[];
}

/**
 * Authoritative Order GST Calculation
 * Aggregates all line items, computing taxable subtotals, CGST, SGST, IGST, and grand total.
 */
export function calculateOrderGst(params: {
  items: Array<{
    productId: string;
    quantity: number | string;
    unitPrice: number | string;
    discountRate?: number | string;
    taxRate?: number | string;
    sgstRate?: number | string | null;
    cgstRate?: number | string | null;
    igstRate?: number | string | null;
  }>;
  supplierState?: string | null;
  supplierGstin?: string | null;
  customerState?: string | null;
  customerGstin?: string | null;
  placeOfSupply?: string | null;
}): CalculatedOrderGst {
  const taxType = determineGstTaxType({
    supplierState: params.supplierState,
    supplierGstin: params.supplierGstin,
    customerState: params.customerState,
    customerGstin: params.customerGstin,
    placeOfSupply: params.placeOfSupply,
  });

  // Normalized place of supply string for display and record
  const posState =
    normalizeState(params.placeOfSupply) ||
    normalizeState(params.customerState) ||
    (params.customerGstin ? normalizeState(getStateCodeFromGstin(params.customerGstin)) : null) ||
    normalizeState(params.supplierState) ||
    normalizeState("27");

  const placeOfSupplyName = posState ? `${posState.code}-${posState.name}` : "27-Maharashtra";

  let subtotal = 0;
  let discountAmount = 0;
  let taxableSubtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  const calculatedItems = params.items.map((item) => {
    const calc = calculateItemGst({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountRate: item.discountRate,
      gstRate: item.taxRate,
      sgstRate: item.sgstRate,
      cgstRate: item.cgstRate,
      igstRate: item.igstRate,
      taxType,
    });

    subtotal = roundCurrency(subtotal + calc.itemSubtotal);
    discountAmount = roundCurrency(discountAmount + calc.discountAmount);
    taxableSubtotal = roundCurrency(taxableSubtotal + calc.taxableAmount);
    cgstAmount = roundCurrency(cgstAmount + calc.cgstAmount);
    sgstAmount = roundCurrency(sgstAmount + calc.sgstAmount);
    igstAmount = roundCurrency(igstAmount + calc.igstAmount);

    return calc;
  });

  const taxAmount = roundCurrency(cgstAmount + sgstAmount + igstAmount);
  const totalAmount = roundCurrency(taxableSubtotal + taxAmount);

  return {
    taxType,
    placeOfSupply: placeOfSupplyName,
    subtotal,
    discountAmount,
    taxableSubtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    totalAmount,
    items: calculatedItems,
  };
}
