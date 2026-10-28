import type { ReportType, ReportRow } from "@/types/reports";

/**
 * Calculates column totals for any report row collection.
 */
export function calculateReportTotals(reportType: ReportType, rows: ReportRow[]): Record<string, number> {
  const totals: Record<string, number> = {};

  if (!rows || rows.length === 0) return totals;

  const sumKey = (key: string) => {
    let sum = 0;
    for (const r of rows) {
      const val = Number((r as any)[key] || 0);
      if (!isNaN(val)) sum += val;
    }
    return Math.round(sum * 100) / 100;
  };

  switch (reportType) {
    case "sales":
      totals["quantity"] = sumKey("quantity");
      totals["qty_is_4985"] = sumKey("qty_is_4985");
      totals["qty_is_12786"] = sumKey("qty_is_12786");
      totals["qty_is_13487"] = sumKey("qty_is_13487");
      totals["qty_is_13488"] = sumKey("qty_is_13488");
      totals["qty_is_12785"] = sumKey("qty_is_12785");
      totals["line_total"] = sumKey("line_total");
      totals["gross_amount"] = sumKey("gross_amount");
      totals["discount_amount"] = sumKey("discount_amount");
      totals["cgst_amount"] = sumKey("cgst_amount");
      totals["sgst_amount"] = sumKey("sgst_amount");
      totals["igst_amount"] = sumKey("igst_amount");
      totals["tax_amount"] = sumKey("tax_amount");
      totals["net_amount"] = sumKey("net_amount");
      totals["paid_amount"] = sumKey("paid_amount");
      totals["outstanding_amount"] = sumKey("outstanding_amount");
      break;
    case "orders":
      totals["subtotal"] = sumKey("subtotal");
      totals["discount_amount"] = sumKey("discount_amount");
      totals["cgst_amount"] = sumKey("cgst_amount");
      totals["sgst_amount"] = sumKey("sgst_amount");
      totals["igst_amount"] = sumKey("igst_amount");
      totals["tax_amount"] = sumKey("tax_amount");
      totals["total_amount"] = sumKey("total_amount");
      totals["paid_amount"] = sumKey("paid_amount");
      totals["due_amount"] = sumKey("due_amount");
      break;
    case "payments":
      totals["amount"] = sumKey("amount");
      break;
    case "customer_due":
      totals["opening_balance"] = sumKey("opening_balance");
      totals["period_sales"] = sumKey("period_sales");
      totals["period_payments"] = sumKey("period_payments");
      totals["closing_receivable"] = sumKey("closing_receivable");
      totals["closing_advance"] = sumKey("closing_advance");
      totals["total_purchases"] = sumKey("period_sales");
      totals["total_paid"] = sumKey("period_payments");
      totals["total_due"] = sumKey("closing_receivable");
      break;
    case "expenses":
      totals["amount"] = sumKey("amount");
      break;
    case "profit":
      totals["gross_sales"] = sumKey("gross_sales");
      totals["discounts"] = sumKey("discounts");
      totals["tax"] = sumKey("tax");
      totals["net_sales"] = sumKey("net_sales");
      totals["payments_received"] = sumKey("payments_received");
      totals["outstanding"] = sumKey("outstanding");
      totals["total_expenses"] = sumKey("total_expenses");
      totals["profit"] = sumKey("profit");
      break;
    case "production":
      totals["quantity"] = sumKey("quantity");
      break;
    case "inventory":
      totals["current_stock"] = sumKey("current_stock");
      totals["reserved_stock"] = sumKey("reserved_stock");
      totals["available_stock"] = sumKey("available_stock");
      break;
    case "delivery":
      totals["ordered_quantity"] = sumKey("ordered_quantity");
      totals["dispatched_quantity"] = sumKey("dispatched_quantity");
      totals["remaining_quantity"] = sumKey("remaining_quantity");
      break;
    case "returns":
      totals["returned_quantity"] = sumKey("returned_quantity");
      totals["adjustment_amount"] = sumKey("adjustment_amount");
      break;
  }

  return totals;
}
