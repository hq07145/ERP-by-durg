/**
 * Authoritative High-Precision Decimal Calculation Engine for Target Invoice Total
 * SANKALP IRRIGATION ERP - Financial Calculation Subsystem
 *
 * Designed to eliminate IEEE 754 binary floating-point rounding errors and provide
 * deterministic target-amount reconciliation for GST invoices under Indian taxation laws.
 *
 * Core Principles:
 * 1. Arbitrary-precision decimal arithmetic (precision: 30 significant digits).
 * 2. Rates retain at least 10 decimal places internally (RATE_DECIMALS = 10).
 * 3. Currency values are rounded to exactly 2 decimal places (paise) using ROUND_HALF_UP.
 * 4. GST amounts and Taxable amounts are never silently modified; any residual variance
 *    against target total is tracked explicitly as residualDifference / roundOffRequired.
 * 5. Complete isolation from Product Master selling rates.
 */

import Decimal from "decimal.js";

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * Isolated Decimal instance with explicit financial calculation configuration.
 * Avoids mutating global Decimal configuration.
 */
export const FinancialDecimal = Decimal.clone({
  precision: 30, // 30 significant digits
  rounding: Decimal.ROUND_HALF_UP, // Standard Indian commercial/statutory rounding
  toExpNeg: -20, // Avoid scientific notation for small decimal rates
  toExpPos: 30,
});

/** Currency precision: Indian Rupee (2 decimal places / paise) */
export const CURRENCY_DECIMALS = 2;

/** High precision for internal rates (at least 10 decimal places) */
export const RATE_DECIMALS = 10;

/** Extended display precision for unit prices */
export const DISPLAY_RATE_DECIMALS = 4;

/** Supported standard Indian GST rates */
export const VALID_GST_RATES = [0, 5, 12, 18, 28] as const;

export type TaxType = "INTRA_STATE" | "INTER_STATE" | "EXEMPT";

export type MultiProductAdjustmentStrategy =
  | "PROPORTIONAL" // Proportionally adjust all items based on current amounts
  | "ADJUST_SPECIFIED_ITEM" // Adjust one selected item, keeping all other items unchanged
  | "EQUAL_SPLIT"; // Split target equally across items

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TargetPricingItemInput {
  id?: string;
  productId?: string;
  productName?: string;
  quantity: Decimal.Value;
  currentPrice?: Decimal.Value; // Current catalog or entered price
  currentPriceIsInclusive?: boolean;
  discountRate?: Decimal.Value; // Discount percentage (0 - 100)
  gstRate: Decimal.Value; // e.g. 5, 12, 18, 28
  isAdjustmentTarget?: boolean; // Used for ADJUST_SPECIFIED_ITEM strategy
  participatesInAdjustment?: boolean; // Step 5: whether this line item participates in target allocation (default true)
}

export interface CalculatedItemTaxDetails {
  taxType: TaxType;
  fullGstRate: Decimal;
  cgstRate: Decimal;
  cgstAmount: Decimal;
  sgstRate: Decimal;
  sgstAmount: Decimal;
  igstRate: Decimal;
  igstAmount: Decimal;
  totalGstAmount: Decimal;
}

export interface CalculatedLineTargetPricing {
  id?: string;
  productId?: string;
  productName?: string;
  quantity: Decimal;
  discountRate: Decimal;
  gstRate: Decimal;
  participatesInAdjustment: boolean;
  isAdjusted: boolean;

  // Original rates & totals before adjustment (for comparison & audit)
  originalExclusiveRate: Decimal;
  originalInclusiveRate: Decimal;
  originalExclusiveRateStr: string;
  originalInclusiveRateStr: string;
  originalLineTotal: Decimal;
  originalLineTotalStr: string;

  // Rate calculations (high precision >= 10 decimal places)
  adjustedInclusiveRate: Decimal;
  adjustedExclusiveRate: Decimal;

  // Formatted rate strings for display / record persistence
  adjustedInclusiveRateStr: string; // 10 decimal places
  adjustedExclusiveRateStr: string; // 10 decimal places
  displayInclusiveRateStr: string; // 4 decimal places for compact tables
  displayExclusiveRateStr: string; // 4 decimal places for standard invoices

  // Line amounts (INR currency scale = 2 decimal places)
  inclusiveLineAmount: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal; // GST-exclusive base taxable value

  // Detailed tax components
  taxDetails: CalculatedItemTaxDetails;

  // Final statutory line total
  lineTotal: Decimal;

  // Formatted string values for 2-decimal currency display
  inclusiveLineAmountStr: string;
  taxableAmountStr: string;
  totalGstAmountStr: string;
  lineTotalStr: string;
}

export interface TargetInvoiceCalculationResult {
  success: boolean;
  error?: string;
  errorCode?:
    | "INVALID_QUANTITY"
    | "INVALID_TARGET"
    | "INVALID_GST_RATE"
    | "INVALID_DISCOUNT_RATE"
    | "IMPOSSIBLE_TARGET"
    | "ZERO_TOTAL"
    | "INVALID_INPUT"
    | "TARGET_ITEM_NOT_FOUND";

  // Context & Parameters
  targetInvoiceTotal: Decimal;
  taxType: TaxType;
  strategy: MultiProductAdjustmentStrategy;

  // Computed line items
  items: CalculatedLineTargetPricing[];

  // Document-level comparison metrics
  originalInvoiceTotal: Decimal;
  originalInvoiceTotalStr: string;
  participatingItemsCount: number;
  unadjustedItemsCount: number;

  // Document-level statutory aggregates (sum of rounded line amounts)
  totalTaxableAmount: Decimal;
  totalCgstAmount: Decimal;
  totalSgstAmount: Decimal;
  totalIgstAmount: Decimal;
  totalGstAmount: Decimal;
  calculatedGrandTotal: Decimal;

  // Explicit residual difference tracking
  targetInvoiceTotalRounded: Decimal;
  residualDifference: Decimal; // targetInvoiceTotalRounded - calculatedGrandTotal
  roundOffRequired: Decimal; // Exact adjustment needed to reconcile to target total
  isExactMatch: boolean;

  // Formatted 2-decimal string values for UI & PDF presentation
  targetInvoiceTotalStr: string;
  totalTaxableAmountStr: string;
  totalCgstAmountStr: string;
  totalSgstAmountStr: string;
  totalIgstAmountStr: string;
  totalGstAmountStr: string;
  calculatedGrandTotalStr: string;
  residualDifferenceStr: string;
  roundOffRequiredStr: string;
}

// ============================================================================
// CORE ATOMIC DECIMAL HELPER FUNCTIONS
// ============================================================================

/**
 * Safely parse any input value to FinancialDecimal with strict input validation.
 * Throws an Error with descriptive message if the input is not a valid finite number.
 */
export function toDecimal(val: Decimal.Value | null | undefined, fieldName = "value"): Decimal {
  if (val === null || val === undefined) {
    throw new Error(`Invalid ${fieldName}: value cannot be null or undefined.`);
  }

  try {
    const d = new FinancialDecimal(val);
    if (!d.isFinite()) {
      throw new Error(`Invalid ${fieldName}: value must be a finite number.`);
    }
    return d;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${fieldName}: unable to parse "${val}" as a valid Decimal. ${msg}`);
  }
}

/**
 * Round a Decimal to standard Indian currency scale (2 decimal places / paise)
 * using ROUND_HALF_UP (banker's / commercial rounding).
 */
export function roundToCurrency(val: Decimal.Value): Decimal {
  return toDecimal(val, "currency").toDecimalPlaces(CURRENCY_DECIMALS, FinancialDecimal.ROUND_HALF_UP);
}

/**
 * Round a rate Decimal to high precision (defaults to 10 decimal places).
 */
export function roundToRatePrecision(val: Decimal.Value, decimals = RATE_DECIMALS): Decimal {
  return toDecimal(val, "rate").toDecimalPlaces(decimals, FinancialDecimal.ROUND_HALF_UP);
}

/**
 * Calculate residual difference between target invoice total and calculated grand total.
 * Residual = Target - Calculated.
 */
export function calculateResidualDifference(
  targetTotal: Decimal.Value,
  calculatedTotal: Decimal.Value
): Decimal {
  const target = roundToCurrency(targetTotal);
  const calculated = roundToCurrency(calculatedTotal);
  return target.minus(calculated);
}

// ============================================================================
// STATUTORY FORMULAS & CALCULATION ENGINE
// ============================================================================

/**
 * Formula 1: Adjusted Inclusive Rate
 *
 * Adjusted Inclusive Rate = Target Invoice Total / Fixed Quantity
 *
 * @param targetInvoiceTotal Total inclusive amount to be achieved for this quantity
 * @param fixedQuantity Fixed quantity of the product (must be > 0)
 * @returns High-precision rate Decimal (untruncated internal precision)
 */
export function calculateAdjustedInclusiveRate(
  targetInvoiceTotal: Decimal.Value,
  fixedQuantity: Decimal.Value
): Decimal {
  const target = toDecimal(targetInvoiceTotal, "targetInvoiceTotal");
  const qty = toDecimal(fixedQuantity, "fixedQuantity");

  if (qty.lte(0)) {
    throw new Error("Fixed quantity must be strictly greater than zero.");
  }
  if (target.lt(0)) {
    throw new Error("Target invoice total cannot be negative.");
  }

  // Pure decimal division without floating-point conversion
  return target.div(qty);
}

/**
 * Formula 2: Taxable Value (Reverse GST Calculation)
 *
 * Taxable Value = Inclusive Line Amount / (1 + GST Rate / 100)
 *
 * Rounded to 2 decimal places per statutory Indian GST rules.
 *
 * @param inclusiveAmount Gross inclusive amount for the line item
 * @param gstRate Applicable GST percentage (e.g., 5 for 5%)
 * @returns Rounded 2-decimal Taxable Value Decimal
 */
export function calculateTaxableValue(
  inclusiveAmount: Decimal.Value,
  gstRate: Decimal.Value
): Decimal {
  const inc = toDecimal(inclusiveAmount, "inclusiveAmount");
  const rate = toDecimal(gstRate, "gstRate");

  if (rate.lt(0) || rate.gt(100)) {
    throw new Error(`GST rate must be between 0% and 100%. Received: ${rate.toString()}%`);
  }

  const divisor = new FinancialDecimal(1).plus(rate.div(100));
  const rawTaxable = inc.div(divisor);

  return roundToCurrency(rawTaxable);
}

/**
 * Formula 3: Reverse GST Amount
 *
 * GST Amount = Inclusive Line Amount - Taxable Value
 *
 * @param inclusiveAmount Gross inclusive amount for the line item
 * @param gstRate Applicable GST percentage
 * @returns Object with rounded taxableValue and reverse gstAmount
 */
export function calculateReverseGst(
  inclusiveAmount: Decimal.Value,
  gstRate: Decimal.Value
): { taxableValue: Decimal; gstAmount: Decimal } {
  const inc = roundToCurrency(inclusiveAmount);
  const taxableValue = calculateTaxableValue(inc, gstRate);
  const gstAmount = inc.minus(taxableValue);

  return {
    taxableValue,
    gstAmount: roundToCurrency(gstAmount),
  };
}

/**
 * Formula 4: CGST, SGST and IGST Breakdown
 *
 * Computes statutory tax components based on taxType:
 * - INTRA_STATE: CGST = taxableValue * (gstRate/2) / 100
 *                SGST = taxableValue * (gstRate/2) / 100
 *                IGST = 0
 * - INTER_STATE: IGST = taxableValue * gstRate / 100
 *                CGST = 0, SGST = 0
 * - EXEMPT:      All taxes = 0
 *
 * Each tax component is rounded to 2 decimal places independently per statutory GST filing rules.
 */
export function calculateGstComponents(
  taxableValue: Decimal.Value,
  gstRate: Decimal.Value,
  taxType: TaxType = "INTRA_STATE"
): CalculatedItemTaxDetails {
  const taxable = roundToCurrency(taxableValue);
  const fullRate = toDecimal(gstRate, "gstRate");

  let cgstRate = new FinancialDecimal(0);
  let cgstAmount = new FinancialDecimal(0);
  let sgstRate = new FinancialDecimal(0);
  let sgstAmount = new FinancialDecimal(0);
  let igstRate = new FinancialDecimal(0);
  let igstAmount = new FinancialDecimal(0);

  if (taxType === "EXEMPT" || fullRate.isZero()) {
    // Zero-rated / exempt
  } else if (taxType === "INTRA_STATE") {
    cgstRate = fullRate.div(2);
    sgstRate = fullRate.div(2);

    cgstAmount = roundToCurrency(taxable.times(cgstRate).div(100));
    sgstAmount = roundToCurrency(taxable.times(sgstRate).div(100));
  } else {
    // INTER_STATE
    igstRate = fullRate;
    igstAmount = roundToCurrency(taxable.times(igstRate).div(100));
  }

  const totalGstAmount = roundToCurrency(cgstAmount.plus(sgstAmount).plus(igstAmount));

  return {
    taxType,
    fullGstRate: fullRate,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalGstAmount,
  };
}

/**
 * Calculate single product line target pricing and statutory amounts.
 */
export function calculateSingleProductLineTarget(params: {
  id?: string;
  productId?: string;
  productName?: string;
  quantity: Decimal.Value;
  targetLineTotal: Decimal.Value;
  gstRate: Decimal.Value;
  discountRate?: Decimal.Value;
  taxType?: TaxType;
  participatesInAdjustment?: boolean;
  originalExclusiveRate?: Decimal.Value;
  originalInclusiveRate?: Decimal.Value;
  originalLineTotal?: Decimal.Value;
}): CalculatedLineTargetPricing {
  const qty = toDecimal(params.quantity, "quantity");
  const targetLineTotal = toDecimal(params.targetLineTotal, "targetLineTotal");
  const gstRate = toDecimal(params.gstRate, "gstRate");
  const discRate = params.discountRate ? toDecimal(params.discountRate, "discountRate") : new FinancialDecimal(0);
  const taxType = params.taxType || "INTRA_STATE";
  const participates = params.participatesInAdjustment !== false;

  if (qty.lte(0)) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (targetLineTotal.lt(0)) {
    throw new Error("Target line total cannot be negative.");
  }
  if (discRate.lt(0) || discRate.gt(100)) {
    throw new Error("Discount rate must be between 0% and 100%.");
  }
  if (gstRate.lt(0) || gstRate.gt(100)) {
    throw new Error("GST rate must be between 0% and 100%.");
  }

  // 1. Inclusive line amount rounded to currency
  const inclusiveLineAmount = roundToCurrency(targetLineTotal);

  // 2. Taxable value reverse calculated: inclusiveLineAmount / (1 + gstRate / 100)
  const taxableAmount = calculateTaxableValue(inclusiveLineAmount, gstRate);

  // 3. Calculate GST components on taxable amount
  const taxDetails = calculateGstComponents(taxableAmount, gstRate, taxType);

  // 4. Line Total = Taxable Amount + Total GST Amount
  const lineTotal = roundToCurrency(taxableAmount.plus(taxDetails.totalGstAmount));

  // 5. Pre-discount rates:
  // If a discount rate D is active, the pre-discount unit price must be:
  // unit_price = taxableAmount / (qty * (1 - discRate / 100))
  // so that: qty * unit_price * (1 - discRate / 100) = taxableAmount exactly.
  let adjustedExclusiveRate: Decimal;
  let adjustedInclusiveRate: Decimal;
  if (!participates && params.originalExclusiveRate != null) {
    adjustedExclusiveRate = toDecimal(params.originalExclusiveRate, "originalExclusiveRate");
    adjustedInclusiveRate = params.originalInclusiveRate != null
      ? toDecimal(params.originalInclusiveRate, "originalInclusiveRate")
      : adjustedExclusiveRate;
  } else if (discRate.gt(0)) {
    const netMultiplier = new FinancialDecimal(1).minus(discRate.div(100));
    adjustedExclusiveRate = taxableAmount.div(qty.times(netMultiplier));
    adjustedInclusiveRate = targetLineTotal.div(qty.times(netMultiplier));
  } else {
    adjustedExclusiveRate = taxableAmount.div(qty);
    adjustedInclusiveRate = targetLineTotal.div(qty);
  }

  // 6. Calculate nominal discount amount if discount percentage was specified
  let discountAmount = new FinancialDecimal(0);
  if (discRate.gt(0)) {
    const grossTaxable = taxableAmount.div(new FinancialDecimal(1).minus(discRate.div(100)));
    discountAmount = roundToCurrency(grossTaxable.minus(taxableAmount));
  }

  // 7. Resolve original values for audit and comparison
  const origExclusive = params.originalExclusiveRate != null
    ? toDecimal(params.originalExclusiveRate, "originalExclusiveRate")
    : adjustedExclusiveRate;
  const origInclusive = params.originalInclusiveRate != null
    ? toDecimal(params.originalInclusiveRate, "originalInclusiveRate")
    : adjustedInclusiveRate;
  const origLineTotal = params.originalLineTotal != null
    ? toDecimal(params.originalLineTotal, "originalLineTotal")
    : lineTotal;

  return {
    id: params.id,
    productId: params.productId,
    productName: params.productName,
    quantity: qty,
    discountRate: discRate,
    gstRate,
    participatesInAdjustment: participates,
    isAdjusted: participates,
    originalExclusiveRate: origExclusive,
    originalInclusiveRate: origInclusive,
    originalExclusiveRateStr: roundToRatePrecision(origExclusive, RATE_DECIMALS).toFixed(RATE_DECIMALS),
    originalInclusiveRateStr: roundToRatePrecision(origInclusive, RATE_DECIMALS).toFixed(RATE_DECIMALS),
    originalLineTotal: origLineTotal,
    originalLineTotalStr: origLineTotal.toFixed(CURRENCY_DECIMALS),
    adjustedInclusiveRate,
    adjustedExclusiveRate,
    adjustedInclusiveRateStr: roundToRatePrecision(adjustedInclusiveRate, RATE_DECIMALS).toFixed(RATE_DECIMALS),
    adjustedExclusiveRateStr: roundToRatePrecision(adjustedExclusiveRate, RATE_DECIMALS).toFixed(RATE_DECIMALS),
    displayInclusiveRateStr: roundToRatePrecision(adjustedInclusiveRate, DISPLAY_RATE_DECIMALS).toFixed(DISPLAY_RATE_DECIMALS),
    displayExclusiveRateStr: roundToRatePrecision(adjustedExclusiveRate, DISPLAY_RATE_DECIMALS).toFixed(DISPLAY_RATE_DECIMALS),
    inclusiveLineAmount,
    discountAmount,
    taxableAmount,
    taxDetails,
    lineTotal,
    inclusiveLineAmountStr: inclusiveLineAmount.toFixed(CURRENCY_DECIMALS),
    taxableAmountStr: taxableAmount.toFixed(CURRENCY_DECIMALS),
    totalGstAmountStr: taxDetails.totalGstAmount.toFixed(CURRENCY_DECIMALS),
    lineTotalStr: lineTotal.toFixed(CURRENCY_DECIMALS),
  };
}

// ============================================================================
// SINGLE & MULTI-PRODUCT TARGET INVOICE CALCULATOR INTERFACES
// ============================================================================

/**
 * High-precision single product target invoice reconciliation.
 */
export function calculateSingleProductTargetInvoice(params: {
  quantity: Decimal.Value;
  targetTotal: Decimal.Value;
  gstRate: Decimal.Value;
  taxType?: TaxType;
  discountRate?: Decimal.Value;
  productId?: string;
  productName?: string;
}): TargetInvoiceCalculationResult {
  try {
    const qty = toDecimal(params.quantity, "quantity");
    const target = toDecimal(params.targetTotal, "targetTotal");
    const gstRate = toDecimal(params.gstRate, "gstRate");
    const taxType = params.taxType || "INTRA_STATE";

    if (qty.lte(0)) {
      return createErrorResult(
        "INVALID_QUANTITY",
        "Quantity must be greater than zero.",
        target,
        taxType,
        "PROPORTIONAL"
      );
    }

    if (target.lt(0)) {
      return createErrorResult(
        "INVALID_TARGET",
        "Target invoice total cannot be negative.",
        target,
        taxType,
        "PROPORTIONAL"
      );
    }

    if (gstRate.lt(0) || gstRate.gt(100)) {
      return createErrorResult(
        "INVALID_GST_RATE",
        "GST rate must be between 0% and 100%.",
        target,
        taxType,
        "PROPORTIONAL"
      );
    }

    const line = calculateSingleProductLineTarget({
      id: "line-1",
      productId: params.productId,
      productName: params.productName,
      quantity: qty,
      targetLineTotal: target,
      gstRate,
      discountRate: params.discountRate,
      taxType,
    });

    return buildCalculationResult({
      targetInvoiceTotal: target,
      taxType,
      strategy: "PROPORTIONAL",
      items: [line],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return createErrorResult(
      "INVALID_INPUT",
      msg || "An unexpected error occurred during calculation.",
      new FinancialDecimal(0),
      params.taxType || "INTRA_STATE",
      "PROPORTIONAL"
    );
  }
}

/**
 * Multi-Product Target Invoice Reconciliation Engine.
 *
 * Supports:
 * - PROPORTIONAL: Adjusts each item proportionally based on its current value.
 * - ADJUST_SPECIFIED_ITEM: Adjusts one specified item while keeping others fixed at their current price.
 * - EQUAL_SPLIT: Splits the target total evenly across all items.
 */
export function calculateMultiProductTargetInvoice(params: {
  items: TargetPricingItemInput[];
  targetTotal: Decimal.Value;
  taxType?: TaxType;
  strategy?: MultiProductAdjustmentStrategy;
}): TargetInvoiceCalculationResult {
  const taxType = params.taxType || "INTRA_STATE";
  const strategy = params.strategy || "PROPORTIONAL";

  let targetTotalDec: Decimal;
  try {
    targetTotalDec = toDecimal(params.targetTotal, "targetTotal");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return createErrorResult("INVALID_TARGET", msg, new FinancialDecimal(0), taxType, strategy);
  }

  if (targetTotalDec.lt(0)) {
    return createErrorResult(
      "INVALID_TARGET",
      "Target invoice total cannot be negative.",
      targetTotalDec,
      taxType,
      strategy
    );
  }

  if (!params.items || params.items.length === 0) {
    return createErrorResult(
      "INVALID_INPUT",
      "At least one item is required for target calculation.",
      targetTotalDec,
      taxType,
      strategy
    );
  }

  // Validate item quantities and GST rates
  const parsedItems: Array<{
    input: TargetPricingItemInput;
    qty: Decimal;
    currentPrice: Decimal;
    currentInclusive: boolean;
    gstRate: Decimal;
    discRate: Decimal;
    baselineLineTotal: Decimal;
    participates: boolean;
    origExclusiveRate: Decimal;
    origInclusiveRate: Decimal;
  }> = [];

  for (let i = 0; i < params.items.length; i++) {
    const it = params.items[i];
    try {
      const qty = toDecimal(it.quantity, `Item #${i + 1} quantity`);
      if (qty.lte(0)) {
        return createErrorResult(
          "INVALID_QUANTITY",
          `Line item #${i + 1}: Quantity must be greater than zero.`,
          targetTotalDec,
          taxType,
          strategy
        );
      }

      const gstRate = toDecimal(it.gstRate, `Item #${i + 1} GST rate`);
      if (gstRate.lt(0) || gstRate.gt(100)) {
        return createErrorResult(
          "INVALID_GST_RATE",
          `Line item #${i + 1}: GST rate must be between 0% and 100%.`,
          targetTotalDec,
          taxType,
          strategy
        );
      }

      const discRate = it.discountRate
        ? toDecimal(it.discountRate, `Item #${i + 1} discount rate`)
        : new FinancialDecimal(0);
      if (discRate.lt(0) || discRate.gt(100)) {
        return createErrorResult(
          "INVALID_DISCOUNT_RATE",
          `Line item #${i + 1}: Discount rate must be between 0% and 100%.`,
          targetTotalDec,
          taxType,
          strategy
        );
      }

      const currentPrice = it.currentPrice
        ? toDecimal(it.currentPrice, `Item #${i + 1} current price`)
        : new FinancialDecimal(1);
      const currentInclusive = Boolean(it.currentPriceIsInclusive);
      const participates = it.participatesInAdjustment !== false;

      // Baseline line totals and pre-adjustment rates for audit & comparison
      let baselineLineTotal: Decimal;
      let origExclusiveRate: Decimal;
      let origInclusiveRate: Decimal;

      if (currentInclusive) {
        baselineLineTotal = roundToCurrency(qty.times(currentPrice));
        if (discRate.gt(0)) {
          const netMultiplier = new FinancialDecimal(1).minus(discRate.div(100));
          origInclusiveRate = currentPrice.div(netMultiplier);
          const taxablePerUnit = calculateTaxableValue(currentPrice, gstRate);
          origExclusiveRate = taxablePerUnit.div(netMultiplier);
        } else {
          origInclusiveRate = currentPrice;
          origExclusiveRate = calculateTaxableValue(currentPrice, gstRate);
        }
      } else {
        const gross = roundToCurrency(qty.times(currentPrice));
        const disc = roundToCurrency(gross.times(discRate).div(100));
        const taxable = gross.minus(disc);
        const tax = roundToCurrency(taxable.times(gstRate).div(100));
        baselineLineTotal = taxable.plus(tax);

        origExclusiveRate = currentPrice;
        origInclusiveRate = currentPrice.times(new FinancialDecimal(1).plus(gstRate.div(100)));
      }

      parsedItems.push({
        input: it,
        qty,
        currentPrice,
        currentInclusive,
        gstRate,
        discRate,
        baselineLineTotal,
        participates,
        origExclusiveRate,
        origInclusiveRate,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return createErrorResult(
        "INVALID_INPUT",
        `Line item #${i + 1}: ${msg}`,
        targetTotalDec,
        taxType,
        strategy
      );
    }
  }

  // Allocate target line amounts based on strategy
  const targetLineTotals: Decimal[] = [];
  const participatingParsed = parsedItems.filter((p) => p.participates);
  const nonParticipatingParsed = parsedItems.filter((p) => !p.participates);

  if (participatingParsed.length === 0) {
    return createErrorResult(
      "INVALID_INPUT",
      "At least one product line must be selected to participate in rate adjustment.",
      targetTotalDec,
      taxType,
      strategy
    );
  }

  if (strategy === "ADJUST_SPECIFIED_ITEM") {
    const targetIdx = parsedItems.findIndex((p) => p.input.isAdjustmentTarget);
    if (targetIdx === -1) {
      return createErrorResult(
        "TARGET_ITEM_NOT_FOUND",
        "Strategy ADJUST_SPECIFIED_ITEM requires one item with isAdjustmentTarget: true.",
        targetTotalDec,
        taxType,
        strategy
      );
    }

    let nonTargetSum = new FinancialDecimal(0);
    for (let i = 0; i < parsedItems.length; i++) {
      if (i !== targetIdx) {
        nonTargetSum = nonTargetSum.plus(parsedItems[i].baselineLineTotal);
      }
    }

    const remainingForTargetItem = roundToCurrency(targetTotalDec.minus(nonTargetSum));
    if (remainingForTargetItem.lt(0)) {
      return createErrorResult(
        "IMPOSSIBLE_TARGET",
        `Target invoice total (₹${targetTotalDec.toFixed(2)}) is less than the fixed non-target items total (₹${nonTargetSum.toFixed(2)}).`,
        targetTotalDec,
        taxType,
        strategy
      );
    }

    for (let i = 0; i < parsedItems.length; i++) {
      if (i === targetIdx) {
        targetLineTotals.push(remainingForTargetItem);
      } else {
        targetLineTotals.push(parsedItems[i].baselineLineTotal);
      }
    }
  } else if (strategy === "EQUAL_SPLIT") {
    let nonParticipatingBaseline = new FinancialDecimal(0);
    for (const p of nonParticipatingParsed) {
      nonParticipatingBaseline = nonParticipatingBaseline.plus(p.baselineLineTotal);
    }

    const targetForParticipating = roundToCurrency(targetTotalDec.minus(nonParticipatingBaseline));
    if (targetForParticipating.lt(0)) {
      return createErrorResult(
        "IMPOSSIBLE_TARGET",
        `Target invoice total (₹${targetTotalDec.toFixed(2)}) is less than the fixed total of unselected items (₹${nonParticipatingBaseline.toFixed(2)}).`,
        targetTotalDec,
        taxType,
        strategy
      );
    }

    const count = new FinancialDecimal(participatingParsed.length);
    const equalShare = roundToCurrency(targetForParticipating.div(count));
    let allocated = new FinancialDecimal(0);
    const participatingTargets = new Map<number, Decimal>();

    for (let idx = 0; idx < participatingParsed.length; idx++) {
      const originalIndex = parsedItems.indexOf(participatingParsed[idx]);
      if (idx === participatingParsed.length - 1) {
        participatingTargets.set(originalIndex, roundToCurrency(targetForParticipating.minus(allocated)));
      } else {
        participatingTargets.set(originalIndex, equalShare);
        allocated = allocated.plus(equalShare);
      }
    }

    for (let i = 0; i < parsedItems.length; i++) {
      if (parsedItems[i].participates) {
        targetLineTotals.push(participatingTargets.get(i)!);
      } else {
        targetLineTotals.push(parsedItems[i].baselineLineTotal);
      }
    }
  } else {
    // PROPORTIONAL strategy (default)
    let nonParticipatingBaseline = new FinancialDecimal(0);
    for (const p of nonParticipatingParsed) {
      nonParticipatingBaseline = nonParticipatingBaseline.plus(p.baselineLineTotal);
    }

    const targetForParticipating = roundToCurrency(targetTotalDec.minus(nonParticipatingBaseline));
    if (targetForParticipating.lt(0)) {
      return createErrorResult(
        "IMPOSSIBLE_TARGET",
        `Target invoice total (₹${targetTotalDec.toFixed(2)}) is less than the fixed total of unselected items (₹${nonParticipatingBaseline.toFixed(2)}).`,
        targetTotalDec,
        taxType,
        strategy
      );
    }

    let totalParticipatingBaseline = new FinancialDecimal(0);
    for (const p of participatingParsed) {
      totalParticipatingBaseline = totalParticipatingBaseline.plus(p.baselineLineTotal);
    }

    const participatingTargets = new Map<number, Decimal>();

    if (totalParticipatingBaseline.isZero()) {
      const count = new FinancialDecimal(participatingParsed.length);
      const equalShare = roundToCurrency(targetForParticipating.div(count));
      let allocated = new FinancialDecimal(0);
      for (let idx = 0; idx < participatingParsed.length; idx++) {
        const originalIndex = parsedItems.indexOf(participatingParsed[idx]);
        if (idx === participatingParsed.length - 1) {
          participatingTargets.set(originalIndex, roundToCurrency(targetForParticipating.minus(allocated)));
        } else {
          participatingTargets.set(originalIndex, equalShare);
          allocated = allocated.plus(equalShare);
        }
      }
    } else {
      let allocated = new FinancialDecimal(0);
      for (let idx = 0; idx < participatingParsed.length; idx++) {
        const originalIndex = parsedItems.indexOf(participatingParsed[idx]);
        if (idx === participatingParsed.length - 1) {
          // Last participating item absorbs rounding difference so selected targets sum exactly to targetForParticipating
          participatingTargets.set(originalIndex, roundToCurrency(targetForParticipating.minus(allocated)));
        } else {
          const itemTarget = roundToCurrency(
            targetForParticipating.times(participatingParsed[idx].baselineLineTotal).div(totalParticipatingBaseline)
          );
          participatingTargets.set(originalIndex, itemTarget);
          allocated = allocated.plus(itemTarget);
        }
      }
    }

    for (let i = 0; i < parsedItems.length; i++) {
      if (parsedItems[i].participates) {
        targetLineTotals.push(participatingTargets.get(i)!);
      } else {
        targetLineTotals.push(parsedItems[i].baselineLineTotal);
      }
    }
  }

  // Calculate each line item with its allocated target total
  const calculatedLines: CalculatedLineTargetPricing[] = [];
  for (let i = 0; i < parsedItems.length; i++) {
    const p = parsedItems[i];
    const targetLine = targetLineTotals[i];

    const line = calculateSingleProductLineTarget({
      id: p.input.id || `line-${i + 1}`,
      productId: p.input.productId,
      productName: p.input.productName,
      quantity: p.qty,
      targetLineTotal: targetLine,
      gstRate: p.gstRate,
      discountRate: p.discRate,
      taxType,
      participatesInAdjustment: p.participates,
      originalExclusiveRate: p.origExclusiveRate,
      originalInclusiveRate: p.origInclusiveRate,
      originalLineTotal: p.baselineLineTotal,
    });
    calculatedLines.push(line);
  }

  // Reconcile residual difference across participating lines if there is a 1-paise variance
  let currentTotal = new FinancialDecimal(0);
  for (const l of calculatedLines) {
    currentTotal = currentTotal.plus(l.lineTotal);
  }
  currentTotal = roundToCurrency(currentTotal);
  let diff = roundToCurrency(roundToCurrency(targetTotalDec).minus(currentTotal));

  if (!diff.isZero() && participatingParsed.length > 0 && diff.abs().lte(new FinancialDecimal("0.05"))) {
    const sign = diff.gt(0) ? new FinancialDecimal("0.01") : new FinancialDecimal("-0.01");
    for (let i = parsedItems.length - 1; i >= 0 && !diff.isZero(); i--) {
      if (!parsedItems[i].participates) continue;
      const p = parsedItems[i];
      const newTarget = targetLineTotals[i].plus(sign);
      if (newTarget.lte(0)) continue;

      const testLine = calculateSingleProductLineTarget({
        id: p.input.id || `line-${i + 1}`,
        productId: p.input.productId,
        productName: p.input.productName,
        quantity: p.qty,
        targetLineTotal: newTarget,
        gstRate: p.gstRate,
        discountRate: p.discRate,
        taxType,
        participatesInAdjustment: true,
        originalExclusiveRate: p.origExclusiveRate,
        originalInclusiveRate: p.origInclusiveRate,
        originalLineTotal: p.baselineLineTotal,
      });

      const lineDiff = testLine.lineTotal.minus(calculatedLines[i].lineTotal);
      if (lineDiff.equals(sign)) {
        calculatedLines[i] = testLine;
        targetLineTotals[i] = newTarget;
        diff = diff.minus(sign);
      }
    }
  }

  return buildCalculationResult({
    targetInvoiceTotal: targetTotalDec,
    taxType,
    strategy,
    items: calculatedLines,
  });
}

// ============================================================================
// RESULT AGGREGATION & ERROR BUILDERS
// ============================================================================

function buildCalculationResult(params: {
  targetInvoiceTotal: Decimal;
  taxType: TaxType;
  strategy: MultiProductAdjustmentStrategy;
  items: CalculatedLineTargetPricing[];
}): TargetInvoiceCalculationResult {
  const targetInvoiceTotalRounded = roundToCurrency(params.targetInvoiceTotal);

  let totalTaxableAmount = new FinancialDecimal(0);
  let totalCgstAmount = new FinancialDecimal(0);
  let totalSgstAmount = new FinancialDecimal(0);
  let totalIgstAmount = new FinancialDecimal(0);
  let totalGstAmount = new FinancialDecimal(0);
  let calculatedGrandTotal = new FinancialDecimal(0);
  let originalInvoiceTotal = new FinancialDecimal(0);
  let participatingItemsCount = 0;
  let unadjustedItemsCount = 0;

  for (const it of params.items) {
    totalTaxableAmount = totalTaxableAmount.plus(it.taxableAmount);
    totalCgstAmount = totalCgstAmount.plus(it.taxDetails.cgstAmount);
    totalSgstAmount = totalSgstAmount.plus(it.taxDetails.sgstAmount);
    totalIgstAmount = totalIgstAmount.plus(it.taxDetails.igstAmount);
    totalGstAmount = totalGstAmount.plus(it.taxDetails.totalGstAmount);
    calculatedGrandTotal = calculatedGrandTotal.plus(it.lineTotal);
    originalInvoiceTotal = originalInvoiceTotal.plus(it.originalLineTotal);
    if (it.isAdjusted) {
      participatingItemsCount++;
    } else {
      unadjustedItemsCount++;
    }
  }

  totalTaxableAmount = roundToCurrency(totalTaxableAmount);
  totalCgstAmount = roundToCurrency(totalCgstAmount);
  totalSgstAmount = roundToCurrency(totalSgstAmount);
  totalIgstAmount = roundToCurrency(totalIgstAmount);
  totalGstAmount = roundToCurrency(totalGstAmount);
  calculatedGrandTotal = roundToCurrency(calculatedGrandTotal);
  originalInvoiceTotal = roundToCurrency(originalInvoiceTotal);

  // Residual difference = Target - Calculated
  const residualDifference = calculateResidualDifference(targetInvoiceTotalRounded, calculatedGrandTotal);
  const roundOffRequired = residualDifference;
  const isExactMatch = residualDifference.isZero();

  return {
    success: true,
    targetInvoiceTotal: params.targetInvoiceTotal,
    taxType: params.taxType,
    strategy: params.strategy,
    items: params.items,
    originalInvoiceTotal,
    originalInvoiceTotalStr: originalInvoiceTotal.toFixed(CURRENCY_DECIMALS),
    participatingItemsCount,
    unadjustedItemsCount,
    totalTaxableAmount,
    totalCgstAmount,
    totalSgstAmount,
    totalIgstAmount,
    totalGstAmount,
    calculatedGrandTotal,
    targetInvoiceTotalRounded,
    residualDifference,
    roundOffRequired,
    isExactMatch,
    targetInvoiceTotalStr: targetInvoiceTotalRounded.toFixed(CURRENCY_DECIMALS),
    totalTaxableAmountStr: totalTaxableAmount.toFixed(CURRENCY_DECIMALS),
    totalCgstAmountStr: totalCgstAmount.toFixed(CURRENCY_DECIMALS),
    totalSgstAmountStr: totalSgstAmount.toFixed(CURRENCY_DECIMALS),
    totalIgstAmountStr: totalIgstAmount.toFixed(CURRENCY_DECIMALS),
    totalGstAmountStr: totalGstAmount.toFixed(CURRENCY_DECIMALS),
    calculatedGrandTotalStr: calculatedGrandTotal.toFixed(CURRENCY_DECIMALS),
    residualDifferenceStr: residualDifference.toFixed(CURRENCY_DECIMALS),
    roundOffRequiredStr: roundOffRequired.toFixed(CURRENCY_DECIMALS),
  };
}

function createErrorResult(
  errorCode: TargetInvoiceCalculationResult["errorCode"],
  error: string,
  target: Decimal,
  taxType: TaxType,
  strategy: MultiProductAdjustmentStrategy
): TargetInvoiceCalculationResult {
  const zero = new FinancialDecimal(0);
  return {
    success: false,
    error,
    errorCode,
    targetInvoiceTotal: target,
    taxType,
    strategy,
    items: [],
    originalInvoiceTotal: zero,
    originalInvoiceTotalStr: "0.00",
    participatingItemsCount: 0,
    unadjustedItemsCount: 0,
    totalTaxableAmount: zero,
    totalCgstAmount: zero,
    totalSgstAmount: zero,
    totalIgstAmount: zero,
    totalGstAmount: zero,
    calculatedGrandTotal: zero,
    targetInvoiceTotalRounded: roundToCurrency(target),
    residualDifference: zero,
    roundOffRequired: zero,
    isExactMatch: false,
    targetInvoiceTotalStr: "0.00",
    totalTaxableAmountStr: "0.00",
    totalCgstAmountStr: "0.00",
    totalSgstAmountStr: "0.00",
    totalIgstAmountStr: "0.00",
    totalGstAmountStr: "0.00",
    calculatedGrandTotalStr: "0.00",
    residualDifferenceStr: "0.00",
    roundOffRequiredStr: "0.00",
  };
}
