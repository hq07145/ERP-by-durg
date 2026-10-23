"use server";

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ReportType,
  ExportFormat,
  ReportFilters,
  SalesReportFilters,
  OrdersReportFilters,
  PaymentsReportFilters,
  CustomerDueReportFilters,
  ExpensesReportFilters,
  ProfitReportFilters,
  ProductionReportFilters,
  InventoryReportFilters,
  DeliveryReportFilters,
  SalesReportRow,
  OrdersReportRow,
  PaymentsReportRow,
  CustomerDueReportRow,
  ExpensesReportRow,
  ProfitReportRow,
  ProductionReportRow,
  InventoryReportRow,
  DeliveryReportRow,
  ReportRow,
  DistrictSalesSummaryItem,
} from "@/types/reports";
import { REPORT_CONFIGS } from "@/types/reports";
import {
  resolveFinancialDateRange,
  getProfitByPeriodFinancials,
} from "@/lib/financials/service";
import { calculateReportTotals } from "@/lib/reports/totals";
import {
  matchesDistrict,
  resolveDistrictDisplayName,
  getIndianDistrictsDropdownOptions,
} from "@/lib/reports/indian-districts";
import {
  formatLedgerDate,
  formatIndianCurrency,
  generateLedgerPDF,
  generateLedgerExcel,
  generateLedgerCSV,
  generateSalesLedgerPDF,
  generateSalesLedgerExcel,
  generateSalesLedgerCSV,
  generateOperationalPDF,
  generateOperationalExcel,
  generateOperationalCSV,
  type LedgerEntryRow,
  type OperationalReportData,
} from "@/lib/reports/ledger-formatter";

// ============================================
// HELPER: Resolve date range
// ============================================

function resolveDateRange(filters: ReportFilters): { startDate: string | null; endDate: string | null } {
  const effectiveRange = filters.dateRange || (!filters.startDate && !filters.endDate ? "this_month" : undefined);
  return resolveFinancialDateRange({
    dateRange: effectiveRange,
    customStartDate: filters.startDate,
    customEndDate: filters.endDate,
  });
}

// ============================================
// AUDIT LOG HELPER
// ============================================

async function auditExport(
  context: Awaited<ReturnType<typeof getAuthContext>>,
  reportType: ReportType,
  filters: ReportFilters,
  format: ExportFormat,
  rowCount: number
) {
  if (!context) return;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.rpc("audit_export", {
      p_business_id: context.user.business_id,
      p_user_id: context.user.id,
      p_report_type: reportType,
      p_filters: filters as any,
      p_format: format,
      p_row_count: rowCount,
    });
    if (error) {
      console.warn("audit_export RPC warning, attempting direct insert:", error.message);
      await supabase.from("export_audit_log").insert({
        business_id: context.user.business_id,
        user_id: context.user.id,
        report_type: reportType,
        filters: filters as any,
        format,
        row_count: rowCount,
      });
    }
  } catch (err) {
    console.error("Failed to audit report export:", err);
  }
}

// ============================================
// FORMULA INJECTION SAFE EXPORT HELPERS
// ============================================

/**
 * Sanitizes a cell value to prevent CSV Formula Injection.
 * Prefixes strings starting with dangerous characters (=, +, -, @, \t, \r) with a single quote.
 */
function sanitizeCsvValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // If numeric or clean number, don't prefix with quote unless starting with formula signs
  const isNumeric = typeof val === "number" || (!isNaN(Number(str)) && !str.startsWith("=") && !str.startsWith("@"));

  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: any[][], totals?: any[]): string {
  // Prepend UTF-8 BOM so Excel opens currency symbols (₹) and non-ASCII chars cleanly
  const BOM = "\uFEFF";
  const headerLine = headers.map(sanitizeCsvValue).join(",");
  const dataLines = rows.map((row) => row.map(sanitizeCsvValue).join(",")).join("\n");

  let result = BOM + headerLine + "\n" + dataLines;
  if (totals && totals.length > 0) {
    const totalsLine = totals.map(sanitizeCsvValue).join(",");
    result += "\n" + totalsLine;
  }
  return result;
}

/**
 * Sanitizes a cell value for HTML Excel exports.
 */
function sanitizeExcelValue(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  const isNumeric = typeof val === "number" || (!isNaN(Number(str)) && !str.startsWith("=") && !str.startsWith("@"));
  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toExcel(headers: string[], rows: any[][], title: string, totals?: any[]): string {
  const BOM = "\uFEFF";
  let html = `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sanitizeExcelValue(title)}</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    th { background-color: #2563eb; color: #ffffff; font-weight: bold; text-align: left; padding: 6px; }
    td { padding: 4px; border: 1px solid #e5e7eb; }
    .totals { background-color: #f3f4f6; font-weight: bold; }
  </style>
</head>
<body>
  <h2>${sanitizeExcelValue(title)}</h2>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <table border="1">
    <thead>
      <tr>${headers.map((h) => `<th>${sanitizeExcelValue(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>`;

  for (const row of rows) {
    html += `<tr>${row.map((v) => `<td>${sanitizeExcelValue(v)}</td>`).join("")}</tr>`;
  }

  if (totals && totals.length > 0) {
    html += `<tr class="totals">${totals.map((v) => `<td>${sanitizeExcelValue(v)}</td>`).join("")}</tr>`;
  }

  html += `</tbody></table></body></html>`;
  return html;
}

/**
 * Generates a valid standard PDF 1.4 document in A4 Landscape.
 * Returns base64 encoded string safe for Next.js Server Action serialization.
 */
function toPDF(headers: string[], rows: any[][], title: string, totals?: any[]): string {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 30;
  const usableWidth = pageWidth - margin * 2;
  const colCount = headers.length;
  const colWidth = usableWidth / colCount;
  const rowHeight = 16;
  const headerHeight = 20;
  const topMargin = 70;
  const bottomMargin = 40;
  const maxRowsPerPage = Math.floor((pageHeight - topMargin - bottomMargin - headerHeight) / rowHeight);

  const escapePdf = (str: any) =>
    String(str ?? "")
      .replace(/₹/g, "INR ")
      .slice(0, 30)
      .replace(/[()\\\\]/g, "\\$&");

  const allRows = [...rows];
  if (totals) allRows.push(totals);

  const pages: string[] = [];
  let rowIndex = 0;
  const totalPagesCount = Math.max(1, Math.ceil(allRows.length / maxRowsPerPage));
  let pageNum = 1;

  while (rowIndex < allRows.length || (rowIndex === 0 && allRows.length === 0)) {
    const pageRows = allRows.slice(rowIndex, rowIndex + maxRowsPerPage);
    rowIndex += maxRowsPerPage;

    let s = "";
    // Document Title
    s += "BT /F1 13 Tf " + margin + " " + (pageHeight - 35) + " Td (" + escapePdf(title) + ") Tj ET\n";
    s +=
      "BT /F2 8 Tf " +
      margin +
      " " +
      (pageHeight - 48) +
      " Td (Generated: " +
      new Date().toISOString().replace("T", " ").slice(0, 19) +
      " UTC | Page " +
      pageNum +
      " of " +
      totalPagesCount +
      ") Tj ET\n";

    // Table Header Box
    const tableTop = pageHeight - topMargin;
    s += "0.92 0.94 0.98 rg " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re f\n";
    s += "0.7 0.75 0.85 RG 0.75 w " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re S\n";

    // Header Text
    headers.forEach((h, i) => {
      const x = margin + i * colWidth + 4;
      const y = tableTop - 13;
      s += "0.1 0.15 0.3 rg BT /F1 7.5 Tf " + x + " " + y + " Td (" + escapePdf(h) + ") Tj ET\n";
    });

    // Row Data
    pageRows.forEach((r, idx) => {
      const isTotalsRow = totals && rowIndex >= allRows.length && idx === pageRows.length - 1;
      const y = tableTop - headerHeight - (idx + 1) * rowHeight;

      if (isTotalsRow) {
        s += "0.9 0.92 0.96 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
        s += "0.4 0.5 0.7 RG 1 w " + margin + " " + (y + rowHeight) + " m " + (margin + usableWidth) + " " + (y + rowHeight) + " l S\n";
      } else if (idx % 2 === 1) {
        s += "0.98 0.98 0.99 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
      }

      r.forEach((cell, cIdx) => {
        const x = margin + cIdx * colWidth + 4;
        const fontName = isTotalsRow ? "/F1" : "/F2";
        const fontSize = isTotalsRow ? "7.5" : "7";
        s += "0.1 0.1 0.1 rg BT " + fontName + " " + fontSize + " Tf " + x + " " + (y + 4) + " Td (" + escapePdf(cell) + ") Tj ET\n";
      });

      // Bottom border line
      s += "0.88 0.88 0.9 RG 0.5 w " + margin + " " + y + " m " + (margin + usableWidth) + " " + y + " l S\n";
    });

    pages.push(s);
    pageNum++;
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  let objCount = 1;
  const catalogObj = objCount++;
  const pagesObj = objCount++;
  const font1Obj = objCount++;
  const font2Obj = objCount++;

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(objCount++);
    contentIds.push(objCount++);
  }

  function addObj(id: number, content: string) {
    offsets[id] = Buffer.byteLength(out, "utf8");
    out += id + " 0 obj\n" + content + "\nendobj\n";
  }

  addObj(catalogObj, "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>");
  addObj(
    pagesObj,
    "<< /Type /Pages /Kids [" + pageIds.map((id) => id + " 0 R").join(" ") + "] /Count " + pages.length + " >>"
  );
  addObj(font1Obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObj(font2Obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let i = 0; i < pages.length; i++) {
    addObj(
      pageIds[i],
      "<< /Type /Page /Parent " +
        pagesObj +
        " 0 R /MediaBox [0 0 " +
        pageWidth +
        " " +
        pageHeight +
        "] /Contents " +
        contentIds[i] +
        " 0 R /Resources << /Font << /F1 " +
        font1Obj +
        " 0 R /F2 " +
        font2Obj +
        " 0 R >> >> >>"
    );
    addObj(contentIds[i], "<< /Length " + Buffer.byteLength(pages[i], "utf8") + " >>\nstream\n" + pages[i] + "endstream");
  }

  const xrefOffset = Buffer.byteLength(out, "utf8");
  out += "xref\n0 " + objCount + "\n0000000000 65535 f \n";
  for (let i = 1; i < objCount; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out += "trailer\n<< /Size " + objCount + " /Root " + catalogObj + " 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";

  return Buffer.from(out, "utf8").toString("base64");
}

function toSalesExcel(
  districtHeaders: string[],
  districtRows: any[][],
  districtTotals: any[],
  detailHeaders: string[],
  detailRows: any[][],
  detailTotals: any[] | undefined,
  title: string
): string {
  const BOM = "\uFEFF";
  let html = `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, sans-serif; }
    h2 { color: #0F172A; }
    h3 { color: #0F766E; margin-top: 24px; margin-bottom: 8px; }
    table { border-collapse: collapse; margin-bottom: 30px; width: 100%; }
    th { background-color: #0F766E; color: #ffffff; font-weight: bold; text-align: left; padding: 6px 10px; border: 1px solid #cbd5e1; }
    td { padding: 5px 10px; border: 1px solid #e2e8f0; }
    .alt { background-color: #f8fafc; }
    .totals { background-color: #e2e8f0; font-weight: bold; }
  </style>
</head>
<body>
  <h2>${sanitizeExcelValue(title)}</h2>
  <p>Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</p>
  
  <h3>District-Wise Sales Summary</h3>
  <table border="1">
    <thead>
      <tr>${districtHeaders.map((h) => `<th>${sanitizeExcelValue(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${districtRows
        .map(
          (row, idx) =>
            `<tr class="${idx % 2 === 1 ? "alt" : ""}">${row
              .map((v) => `<td>${sanitizeExcelValue(v)}</td>`)
              .join("")}</tr>`
        )
        .join("")}
      <tr class="totals">${districtTotals.map((v) => `<td>${sanitizeExcelValue(v)}</td>`).join("")}</tr>
    </tbody>
  </table>

  <h3>Detailed Sales Transactions</h3>
  <table border="1">
    <thead>
      <tr>${detailHeaders.map((h) => `<th>${sanitizeExcelValue(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${detailRows
        .map(
          (row, idx) =>
            `<tr class="${idx % 2 === 1 ? "alt" : ""}">${row
              .map((v) => `<td>${sanitizeExcelValue(v)}</td>`)
              .join("")}</tr>`
        )
        .join("")}
      ${
        detailTotals && detailTotals.length > 0
          ? `<tr class="totals">${detailTotals.map((v) => `<td>${sanitizeExcelValue(v)}</td>`).join("")}</tr>`
          : ""
      }
    </tbody>
  </table>
</body>
</html>`;
  return html;
}

function toSalesPDF(
  districtHeaders: string[],
  districtRows: any[][],
  districtTotals: any[],
  detailHeaders: string[],
  detailRows: any[][],
  detailTotals: any[] | undefined,
  title: string
): string {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 25;
  const usableWidth = pageWidth - margin * 2;

  const escapePdf = (str: any) =>
    String(str ?? "")
      .replace(/₹/g, "INR ")
      .slice(0, 32)
      .replace(/[()\\\\]/g, "\\$&");

  const pages: string[] = [];

  // PAGE 1: DISTRICT-WISE SALES SUMMARY
  {
    let s = "";
    s += "BT /F1 14 Tf " + margin + " " + (pageHeight - 35) + " Td (" + escapePdf(title) + ") Tj ET\n";
    s +=
      "BT /F2 8 Tf " +
      margin +
      " " +
      (pageHeight - 48) +
      " Td (Generated: " +
      new Date().toISOString().replace("T", " ").slice(0, 19) +
      " UTC | Section 1: District-Wise Sales Summary) Tj ET\n";

    s += "BT /F1 10.5 Tf " + margin + " " + (pageHeight - 68) + " Td (1. District-Wise Sales Summary) Tj ET\n";

    const tableTop = pageHeight - 78;
    const headerHeight = 20;
    const rowHeight = 17;
    const colCount = districtHeaders.length;
    const colWidth = usableWidth / colCount;

    s += "0.06 0.46 0.43 rg " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re f\n";
    s += "0.05 0.40 0.37 RG 1 w " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re S\n";

    districtHeaders.forEach((h, i) => {
      const x = margin + i * colWidth + 4;
      const y = tableTop - 13;
      s += "1 1 1 rg BT /F1 7.5 Tf " + x + " " + y + " Td (" + escapePdf(h) + ") Tj ET\n";
    });

    const allDistRows = [...districtRows, districtTotals];
    allDistRows.forEach((r, idx) => {
      const isTotalsRow = idx === allDistRows.length - 1;
      const y = tableTop - headerHeight - (idx + 1) * rowHeight;

      if (isTotalsRow) {
        s += "0.9 0.94 0.96 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
        s += "0.06 0.46 0.43 RG 1 w " + margin + " " + (y + rowHeight) + " m " + (margin + usableWidth) + " " + (y + rowHeight) + " l S\n";
      } else if (idx % 2 === 1) {
        s += "0.98 0.98 0.99 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
      }

      r.forEach((cell, cIdx) => {
        const x = margin + cIdx * colWidth + 4;
        const fontName = isTotalsRow ? "/F1" : "/F2";
        const fontSize = isTotalsRow ? "7.5" : "7";
        const fontColor = isTotalsRow ? "0.06 0.46 0.43" : "0.1 0.1 0.1";
        s += fontColor + " rg BT " + fontName + " " + fontSize + " Tf " + x + " " + (y + 4) + " Td (" + escapePdf(cell) + ") Tj ET\n";
      });

      s += "0.88 0.88 0.9 RG 0.5 w " + margin + " " + y + " m " + (margin + usableWidth) + " " + y + " l S\n";
    });

    pages.push(s);
  }

  // PAGES 2+: DETAILED SALES TRANSACTIONS
  {
    const headerHeight = 20;
    const rowHeight = 15;
    const topMargin = 70;
    const bottomMargin = 40;
    const maxRowsPerPage = Math.floor((pageHeight - topMargin - bottomMargin - headerHeight) / rowHeight);

    const allDetailRows = [...detailRows];
    if (detailTotals) allDetailRows.push(detailTotals);

    const colCount = detailHeaders.length;
    const colWidth = usableWidth / colCount;

    let rowIndex = 0;
    const totalDetailPages = Math.max(1, Math.ceil(allDetailRows.length / maxRowsPerPage));
    let detailPageNum = 1;

    while (rowIndex < allDetailRows.length || (rowIndex === 0 && allDetailRows.length === 0)) {
      const pageRows = allDetailRows.slice(rowIndex, rowIndex + maxRowsPerPage);
      rowIndex += maxRowsPerPage;

      let s = "";
      s += "BT /F1 13 Tf " + margin + " " + (pageHeight - 35) + " Td (" + escapePdf(title) + ") Tj ET\n";
      s +=
        "BT /F2 8 Tf " +
        margin +
        " " +
        (pageHeight - 48) +
        " Td (Section 2: Detailed Sales Transactions | Detail Page " +
        detailPageNum +
        " of " +
        totalDetailPages +
        ") Tj ET\n";

      const tableTop = pageHeight - topMargin;
      s += "0.92 0.94 0.98 rg " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re f\n";
      s += "0.7 0.75 0.85 RG 0.75 w " + margin + " " + (tableTop - headerHeight) + " " + usableWidth + " " + headerHeight + " re S\n";

      detailHeaders.forEach((h, i) => {
        const x = margin + i * colWidth + 2;
        const y = tableTop - 13;
        s += "0.1 0.15 0.3 rg BT /F1 6.5 Tf " + x + " " + y + " Td (" + escapePdf(h) + ") Tj ET\n";
      });

      pageRows.forEach((r, idx) => {
        const isTotalsRow = detailTotals && rowIndex >= allDetailRows.length && idx === pageRows.length - 1;
        const y = tableTop - headerHeight - (idx + 1) * rowHeight;

        if (isTotalsRow) {
          s += "0.9 0.92 0.96 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
          s += "0.4 0.5 0.7 RG 1 w " + margin + " " + (y + rowHeight) + " m " + (margin + usableWidth) + " " + (y + rowHeight) + " l S\n";
        } else if (idx % 2 === 1) {
          s += "0.98 0.98 0.99 rg " + margin + " " + y + " " + usableWidth + " " + rowHeight + " re f\n";
        }

        r.forEach((cell, cIdx) => {
          const x = margin + cIdx * colWidth + 2;
          const fontName = isTotalsRow ? "/F1" : "/F2";
          const fontSize = isTotalsRow ? "6.5" : "6";
          s += "0.1 0.1 0.1 rg BT " + fontName + " " + fontSize + " Tf " + x + " " + (y + 3) + " Td (" + escapePdf(cell) + ") Tj ET\n";
        });

        s += "0.88 0.88 0.9 RG 0.5 w " + margin + " " + y + " m " + (margin + usableWidth) + " " + y + " l S\n";
      });

      pages.push(s);
      detailPageNum++;
    }
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  let objCount = 1;
  const catalogObj = objCount++;
  const pagesObj = objCount++;
  const font1Obj = objCount++;
  const font2Obj = objCount++;

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    pageIds.push(objCount++);
    contentIds.push(objCount++);
  }

  function addObj(id: number, content: string) {
    offsets[id] = Buffer.byteLength(out, "utf8");
    out += id + " 0 obj\n" + content + "\nendobj\n";
  }

  addObj(catalogObj, "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>");
  addObj(
    pagesObj,
    "<< /Type /Pages /Kids [" + pageIds.map((id) => id + " 0 R").join(" ") + "] /Count " + pages.length + " >>"
  );
  addObj(font1Obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObj(font2Obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let i = 0; i < pages.length; i++) {
    addObj(
      pageIds[i],
      "<< /Type /Page /Parent " +
        pagesObj +
        " 0 R /MediaBox [0 0 " +
        pageWidth +
        " " +
        pageHeight +
        "] /Contents " +
        contentIds[i] +
        " 0 R /Resources << /Font << /F1 " +
        font1Obj +
        " 0 R /F2 " +
        font2Obj +
        " 0 R >> >> >>"
    );
    addObj(contentIds[i], "<< /Length " + Buffer.byteLength(pages[i], "utf8") + " >>\nstream\n" + pages[i] + "endstream");
  }

  const xrefOffset = Buffer.byteLength(out, "utf8");
  out += "xref\n0 " + objCount + "\n0000000000 65535 f \n";
  for (let i = 1; i < objCount; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out += "trailer\n<< /Size " + objCount + " /Root " + catalogObj + " 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";

  return Buffer.from(out, "utf8").toString("base64");
}

// ============================================
// REPORT DATA FETCHING (QUERIES)
// ============================================

interface CustomerAddressQueryResult {
  district?: string | null;
  state?: string | null;
  address_type?: string;
}

interface CustomerQueryResult {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  customer_addresses?: CustomerAddressQueryResult[] | null;
}

interface ProductQueryResult {
  id: string;
  name: string;
  sku: string | null;
}

interface OrderItemQueryResult {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_rate: number;
  tax_rate: number;
  line_total: number;
  taxable_amount?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
  product: ProductQueryResult | null;
}

interface OrderQueryResult {
  id: string;
  order_number: string;
  order_date: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  tax_type?: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  district?: string | null;
  place_of_supply?: string | null;
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: string;
  customer: CustomerQueryResult | null;
  items: OrderItemQueryResult[] | null;
}

interface OrderSimpleQueryResult {
  id: string;
  order_number: string;
  order_date: string;
  priority: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  tax_type?: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  earliest_delivery_date: string | null;
  latest_delivery_date: string | null;
  expected_delivery_date: string | null;
  delivery_status: string;
  customer: CustomerQueryResult | null;
}

interface PaymentQueryResult {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  status: string;
  notes: string | null;
  customer: CustomerQueryResult | null;
  order: { id: string; order_number: string } | null;
}

interface LedgerEntryQueryResult {
  entry_type: string;
  debit: number | null;
  credit: number | null;
  entry_date: string;
}

interface CustomerWithLedgerQueryResult {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  credit_limit: number;
  payment_terms: string | null;
  ledger: LedgerEntryQueryResult[] | null;
}

interface ExpenseQueryResult {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string | null;
  reference: string | null;
  status: string;
  created_at: string;
  created_by_user: { name: string } | null;
}

interface ProductionOrderQueryResult {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  status: string;
  priority: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_at: string;
  order: { order_number: string; order_date?: string; customer: { name: string } | null } | null;
  product: { name: string; sku: string | null } | null;
}

interface InventoryQueryResult {
  id: string;
  item_id: string;
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  raw_material: {
    id: string;
    code: string | null;
    name: string;
    unit: string;
    reorder_level: number;
    min_stock: number;
    purchase_price: number;
  } | null;
}

interface DeliveryQueryResult {
  id: string;
  delivery_number: string;
  order_id: string;
  status: string;
  expected_delivery_date: string | null;
  tracking_number: string | null;
  vehicle: string | null;
  driver: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
  order: { order_number: string; customer: { name: string } | null } | null;
}

// ============================================
// 1. SALES REPORT & DISTRICT SUMMARY
// ============================================

export async function getSalesReportBundle(
  filters: SalesReportFilters,
  limit = 50,
  offset = 0
): Promise<{
  rows: SalesReportRow[];
  totalCount: number;
  summary: DistrictSalesSummaryItem[];
  totals: DistrictSalesSummaryItem;
}> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Sales report is restricted to Admin and Super Admin");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("orders")
    .select(
      `
      id, order_number, order_date, status, subtotal, discount_amount, tax_amount, cgst_amount, sgst_amount, igst_amount, tax_type, total_amount, paid_amount, due_amount, district, place_of_supply,
      earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status,
      customer:customers!inner(
        id, name, company_name, phone, email,
        customer_addresses(district, state, address_type)
      ),
      items:order_items(
        id, product_id, quantity, unit_price, discount_rate, tax_rate, line_total, taxable_amount, cgst_amount, sgst_amount, igst_amount,
        product:products!inner(id, name, sku)
      )
    `
    )
    .eq("business_id", context.user.business_id);

  if (filters.status) {
    query = query.eq("status", filters.status);
  } else {
    query = query.neq("status", "CANCELLED");
  }

  if (startDate) query = query.gte("order_date", startDate);
  if (endDate) query = query.lte("order_date", endDate);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);

  const { data, error } = await query.order("order_date", { ascending: false });
  if (error) throw error;

  const districtMap = new Map<
    string,
    {
      total_orders: number;
      total_quantity: number;
      taxable_sales: number;
      cgst: number;
      sgst: number;
      igst: number;
      total_sales: number;
      amount_received: number;
      outstanding_amount: number;
    }
  >();

  const allRows: SalesReportRow[] = [];

  for (const order of (data as unknown as OrderQueryResult[]) ?? []) {
    const addrs = order.customer?.customer_addresses as CustomerAddressQueryResult[] | undefined;
    const primaryAddr = addrs?.find((a) => a.address_type === "PRIMARY") ?? addrs?.[0];
    const rawDistrict = (order.district && order.district.trim()) || primaryAddr?.district?.trim() || null;
    const rawState = (order.place_of_supply && order.place_of_supply.trim()) || primaryAddr?.state?.trim() || null;

    if (!matchesDistrict(rawDistrict, rawState, filters.district)) {
      continue;
    }

    const districtName = resolveDistrictDisplayName(rawDistrict, rawState);

    const allItems = order.items ?? [];
    const matchingItems = filters.productId
      ? allItems.filter((it) => it.product_id === filters.productId)
      : allItems;

    if (matchingItems.length === 0) continue;

    let orderQty = 0;
    let orderTaxable = 0;
    let orderCgst = 0;
    let orderSgst = 0;
    let orderIgst = 0;
    let matchingLineTotal = 0;

    const orderPaidAmount = Number(order.paid_amount) || 0;
    const orderDueAmount = Number(order.due_amount) || 0;
    const orderTotalLines = matchingItems.reduce((acc, it) => acc + (Number(it.line_total) || 0), 0);

    for (const item of matchingItems) {
      const q = Number(item.quantity) || 0;
      const u = Number(item.unit_price) || 0;
      const discRate = Number(item.discount_rate) || 0;
      const taxRate = Number(item.tax_rate) || 0;
      const lineTotal = Number(item.line_total) || 0;
      const itemTaxable = Number(item.taxable_amount != null ? item.taxable_amount : q * u * (1 - discRate / 100));

      let c = 0;
      let s = 0;
      let i = 0;

      if (item.cgst_amount != null && Number(item.cgst_amount) > 0) {
        c = Number(item.cgst_amount);
        s = Number(item.sgst_amount || 0);
        i = Number(item.igst_amount || 0);
      } else if (taxRate > 0) {
        if (order.tax_type === "INTER_STATE") {
          i = Math.round(itemTaxable * (taxRate / 100) * 100) / 100;
        } else {
          c = Math.round(itemTaxable * (taxRate / 200) * 100) / 100;
          s = Math.round(itemTaxable * (taxRate / 200) * 100) / 100;
        }
      }

      orderQty += q;
      orderTaxable += itemTaxable;
      orderCgst += c;
      orderSgst += s;
      orderIgst += i;
      matchingLineTotal += lineTotal;

      let itemPaid = 0;
      let itemDue = 0;
      if (matchingItems.length === 1) {
        itemPaid = orderPaidAmount;
        itemDue = orderDueAmount;
      } else if (orderTotalLines > 0) {
        itemPaid = Math.round((lineTotal / orderTotalLines) * orderPaidAmount * 100) / 100;
        itemDue = Math.round((lineTotal / orderTotalLines) * orderDueAmount * 100) / 100;
      }

      allRows.push({
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        customer_id: order.customer?.id ?? "",
        customer_name: order.customer?.name ?? "",
        customer_company: order.customer?.company_name ?? null,
        customer_district: districtName,
        product_id: item.product?.id ?? "",
        product_name: item.product?.name ?? "",
        product_sku: item.product?.sku ?? null,
        quantity: q,
        unit_price: u,
        discount_rate: discRate,
        tax_rate: taxRate,
        line_total: lineTotal,
        gross_amount: itemTaxable,
        discount_amount: Math.round(q * u * (discRate / 100) * 100) / 100,
        tax_amount: Math.round((c + s + i) * 100) / 100,
        cgst_amount: c,
        sgst_amount: s,
        igst_amount: i,
        tax_type: order.tax_type ?? "INTRA_STATE",
        net_amount: lineTotal,
        paid_amount: itemPaid,
        outstanding_amount: itemDue,
        order_status: order.status as any,
      });
    }

    let orderSales = 0;
    let orderReceived = 0;
    let orderOutstanding = 0;

    const fullOrderTotal = Number(order.total_amount) || 0;
    const fullOrderPaid = Number(order.paid_amount) || 0;
    const fullOrderDue = Number(order.due_amount) || 0;

    if (!filters.productId) {
      orderSales = fullOrderTotal;
      orderReceived = fullOrderPaid;
      orderOutstanding = fullOrderDue;
    } else {
      orderSales = matchingLineTotal;
      const ratio = fullOrderTotal > 0 ? matchingLineTotal / fullOrderTotal : 0;
      orderReceived = Math.round(fullOrderPaid * ratio * 100) / 100;
      orderOutstanding = Math.round(fullOrderDue * ratio * 100) / 100;
    }

    const existing = districtMap.get(districtName) || {
      total_orders: 0,
      total_quantity: 0,
      taxable_sales: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_sales: 0,
      amount_received: 0,
      outstanding_amount: 0,
    };

    existing.total_orders += 1;
    existing.total_quantity += orderQty;
    existing.taxable_sales += orderTaxable;
    existing.cgst += orderCgst;
    existing.sgst += orderSgst;
    existing.igst += orderIgst;
    existing.total_sales += orderSales;
    existing.amount_received += orderReceived;
    existing.outstanding_amount += orderOutstanding;

    districtMap.set(districtName, existing);
  }

  const summary: DistrictSalesSummaryItem[] = [];
  const totals: DistrictSalesSummaryItem = {
    district: "TOTALS",
    total_orders: 0,
    total_quantity: 0,
    taxable_sales: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total_sales: 0,
    amount_received: 0,
    outstanding_amount: 0,
  };

  const sortedKeys = Array.from(districtMap.keys()).sort((a, b) => {
    if (a === "Unknown District") return 1;
    if (b === "Unknown District") return -1;
    return a.localeCompare(b);
  });

  for (const d of sortedKeys) {
    const stats = districtMap.get(d)!;
    const item: DistrictSalesSummaryItem = {
      district: d,
      total_orders: stats.total_orders,
      total_quantity: Math.round(stats.total_quantity * 1000) / 1000,
      taxable_sales: Math.round(stats.taxable_sales * 100) / 100,
      cgst: Math.round(stats.cgst * 100) / 100,
      sgst: Math.round(stats.sgst * 100) / 100,
      igst: Math.round(stats.igst * 100) / 100,
      total_sales: Math.round(stats.total_sales * 100) / 100,
      amount_received: Math.round(stats.amount_received * 100) / 100,
      outstanding_amount: Math.round(stats.outstanding_amount * 100) / 100,
    };
    summary.push(item);

    totals.total_orders += item.total_orders;
    totals.total_quantity = Math.round((totals.total_quantity + item.total_quantity) * 1000) / 1000;
    totals.taxable_sales = Math.round((totals.taxable_sales + item.taxable_sales) * 100) / 100;
    totals.cgst = Math.round((totals.cgst + item.cgst) * 100) / 100;
    totals.sgst = Math.round((totals.sgst + item.sgst) * 100) / 100;
    totals.igst = Math.round((totals.igst + item.igst) * 100) / 100;
    totals.total_sales = Math.round((totals.total_sales + item.total_sales) * 100) / 100;
    totals.amount_received = Math.round((totals.amount_received + item.amount_received) * 100) / 100;
    totals.outstanding_amount = Math.round((totals.outstanding_amount + item.outstanding_amount) * 100) / 100;
  }

  return {
    rows: allRows.slice(offset, offset + limit),
    totalCount: allRows.length,
    summary,
    totals,
  };
}

export async function getDistrictSalesSummary(
  filters: SalesReportFilters
): Promise<{
  summary: DistrictSalesSummaryItem[];
  totals: DistrictSalesSummaryItem;
  totalLineItems: number;
}> {
  const bundle = await getSalesReportBundle(filters, 0, 0);
  return {
    summary: bundle.summary,
    totals: bundle.totals,
    totalLineItems: bundle.totalCount,
  };
}

export async function getSalesReport(
  filters: SalesReportFilters,
  limit = 10000,
  offset = 0
): Promise<SalesReportRow[]> {
  const bundle = await getSalesReportBundle(filters, limit, offset);
  return bundle.rows;
}

// ============================================
// 2. ORDERS REPORT
// ============================================

export async function getOrdersReport(
  filters: OrdersReportFilters,
  limit = 10000,
  offset = 0
): Promise<OrdersReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) {
    throw new Error("Forbidden: orders.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("orders")
    .select(
      `
      id, order_number, order_date, priority, status, subtotal, discount_amount, tax_amount, cgst_amount, sgst_amount, igst_amount, tax_type, total_amount, paid_amount, due_amount,
      earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status,
      customer:customers!inner(id, name, company_name)
    `
    )
    .eq("business_id", context.user.business_id);

  if (startDate) query = query.gte("order_date", startDate);
  if (endDate) query = query.lte("order_date", endDate);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);

  query = query.order("order_date", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as OrderSimpleQueryResult[]) ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    order_date: o.order_date,
    customer_id: o.customer?.id ?? "",
    customer_name: o.customer?.name ?? "",
    customer_company: o.customer?.company_name ?? null,
    priority: o.priority as any,
    status: o.status as any,
    subtotal: o.subtotal,
    discount_amount: o.discount_amount,
    tax_amount: o.tax_amount,
    cgst_amount: o.cgst_amount ?? 0,
    sgst_amount: o.sgst_amount ?? 0,
    igst_amount: o.igst_amount ?? 0,
    tax_type: o.tax_type ?? "INTRA_STATE",
    total_amount: o.total_amount,
    paid_amount: o.paid_amount,
    due_amount: o.due_amount,
    earliest_delivery_date: o.earliest_delivery_date,
    latest_delivery_date: o.latest_delivery_date,
    expected_delivery_date: o.expected_delivery_date,
    delivery_status: o.delivery_status,
  }));
}

// ============================================
// 3. PAYMENTS REPORT
// ============================================

export async function getPaymentsReport(
  filters: PaymentsReportFilters,
  limit = 10000,
  offset = 0
): Promise<PaymentsReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "payments.view")) {
    throw new Error("Forbidden: payments.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("payments")
    .select(
      `
      id, payment_number, payment_date, amount, payment_method, reference, status, notes,
      customer:customers!inner(id, name, company_name),
      order:orders!left(id, order_number)
    `
    )
    .eq("business_id", context.user.business_id);

  if (startDate) query = query.gte("payment_date", startDate);
  if (endDate) query = query.lte("payment_date", endDate);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.orderId) query = query.eq("order_id", filters.orderId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);

  query = query.order("payment_date", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as PaymentQueryResult[]) ?? []).map((p) => ({
    id: p.id,
    payment_number: p.payment_number,
    payment_date: p.payment_date,
    customer_id: p.customer?.id ?? "",
    customer_name: p.customer?.name ?? "",
    customer_company: p.customer?.company_name ?? null,
    order_id: p.order?.id ?? null,
    order_number: p.order?.order_number ?? null,
    amount: p.amount,
    payment_method: p.payment_method as any,
    reference: p.reference,
    status: p.status as any,
    notes: p.notes,
  }));
}

// ============================================
// 4. CUSTOMER DUE REPORT
// ============================================

export async function getCustomerDueReport(
  filters: CustomerDueReportFilters,
  limit = 10000,
  offset = 0
): Promise<CustomerDueReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "customers.view")) {
    throw new Error("Forbidden: customers.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("customers")
    .select(
      `
      id, name, company_name, phone, email, credit_limit, payment_terms,
      ledger:customer_ledger!left(entry_type, debit, credit, entry_date)
    `
    )
    .eq("business_id", context.user.business_id)
    .eq("status", "ACTIVE");

  if (filters.customerId) query = query.eq("id", filters.customerId);

  const { data, error } = await query.order("name", { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;

  const rows: CustomerDueReportRow[] = [];
  for (const customer of (data as unknown as CustomerWithLedgerQueryResult[]) ?? []) {
    let totalPurchases = 0;
    let totalPaid = 0;

    for (const entry of customer.ledger ?? []) {
      if (entry.entry_type === "INVOICE") {
        totalPurchases += Number(entry.debit || 0);
      } else if (entry.entry_type === "PAYMENT") {
        totalPaid += Number(entry.credit || 0);
      }
    }

    const totalDue = Math.round((totalPurchases - totalPaid) * 100) / 100;
    if (filters.minDueAmount && totalDue < Number(filters.minDueAmount)) continue;

    const payments = (customer.ledger ?? [])
      .filter((e) => e.entry_type === "PAYMENT")
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
    const lastPayment = payments[0];

    rows.push({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_company: customer.company_name,
      customer_phone: customer.phone,
      customer_email: customer.email,
      total_purchases: Math.round(totalPurchases * 100) / 100,
      total_paid: Math.round(totalPaid * 100) / 100,
      total_due: totalDue,
      last_payment_date: lastPayment?.entry_date ?? null,
      last_payment_amount: lastPayment?.credit ? Number(lastPayment.credit) : 0,
      credit_limit: customer.credit_limit,
      payment_terms: customer.payment_terms,
    });
  }

  return rows;
}

// ============================================
// 5. EXPENSES REPORT
// ============================================

export async function getExpensesReport(
  filters: ExpensesReportFilters,
  limit = 10000,
  offset = 0
): Promise<ExpensesReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "expenses.view")) {
    throw new Error("Forbidden: expenses.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("expenses")
    .select(
      `
      id, category, amount, expense_date, description, reference, status, created_at,
      created_by_user:users!created_by(name)
    `
    )
    .eq("business_id", context.user.business_id);

  if (startDate) query = query.gte("expense_date", startDate);
  if (endDate) query = query.lte("expense_date", endDate);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) {
    query = query.eq("status", filters.status);
  } else {
    // Default to posted business expenses
    query = query.eq("status", "POSTED");
  }

  query = query.order("expense_date", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as ExpenseQueryResult[]) ?? []).map((e) => ({
    id: e.id,
    category: e.category,
    amount: e.amount,
    expense_date: e.expense_date,
    description: e.description,
    reference: e.reference,
    status: e.status as any,
    created_by_name: e.created_by_user?.name ?? null,
    created_at: e.created_at,
  }));
}

// ============================================
// 6. PROFIT REPORT
// ============================================

export async function getProfitReport(
  filters: ProfitReportFilters,
  limit = 10000,
  offset = 0
): Promise<ProfitReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  if (!isAdminOrSuper) {
    throw new Error("Forbidden: Profit report is restricted to Admin and Super Admin");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  const rows = await getProfitByPeriodFinancials(supabase, context.user.business_id, {
    startDate,
    endDate,
    customerId: filters.customerId || null,
  });

  return rows.slice(offset, offset + limit);
}

// ============================================
// 7. PRODUCTION REPORT
// ============================================

export async function getProductionReport(
  filters: ProductionReportFilters,
  limit = 10000,
  offset = 0
): Promise<ProductionReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("production_orders")
    .select(
      `
      id, order_id, product_id, quantity, status, priority,
      scheduled_start_date, scheduled_end_date, actual_start_date, actual_end_date, created_at,
      order:orders!inner(order_number, order_date, customer:customers!inner(name)),
      product:products!inner(name, sku)
    `
    )
    .eq("business_id", context.user.business_id);

  if (startDate) query = query.gte("created_at", `${startDate}T00:00:00Z`);
  if (endDate) query = query.lte("created_at", `${endDate}T23:59:59Z`);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as ProductionOrderQueryResult[]) ?? []).map((po) => ({
    id: po.id,
    order_id: po.order_id,
    order_number: po.order?.order_number ?? "",
    customer_name: po.order?.customer?.name ?? null,
    product_id: po.product_id,
    product_name: po.product?.name ?? "",
    product_sku: po.product?.sku ?? null,
    quantity: po.quantity,
    status: po.status as any,
    priority: po.priority as any,
    scheduled_start_date: po.scheduled_start_date,
    scheduled_end_date: po.scheduled_end_date,
    actual_start_date: po.actual_start_date,
    actual_end_date: po.actual_end_date,
    created_at: po.created_at,
  }));
}

// ============================================
// 8. INVENTORY REPORT
// ============================================

export async function getInventoryReport(
  filters: InventoryReportFilters,
  limit = 10000,
  offset = 0
): Promise<InventoryReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "inventory.view")) {
    throw new Error("Forbidden: inventory.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("inventory")
    .select(
      `
      id, item_id, current_stock, reserved_stock, available_stock,
      raw_material:raw_materials!inner(id, code, name, unit, reorder_level, min_stock, purchase_price)
    `
    )
    .eq("business_id", context.user.business_id)
    .eq("item_type", "raw_material");

  if (filters.rawMaterialId) query = query.eq("item_id", filters.rawMaterialId);

  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  let rows = ((data as unknown as InventoryQueryResult[]) ?? []).map((i) => ({
    item_id: i.item_id,
    code: i.raw_material?.code ?? null,
    name: i.raw_material?.name ?? "",
    unit: i.raw_material?.unit ?? "",
    current_stock: i.current_stock,
    reserved_stock: i.reserved_stock,
    available_stock: i.available_stock,
    reorder_level: i.raw_material?.reorder_level ?? 0,
    min_stock: i.raw_material?.min_stock ?? 0,
    purchase_price: i.raw_material?.purchase_price ?? 0,
    is_low_stock: Number(i.available_stock) <= Number(i.raw_material?.reorder_level ?? 0),
  }));

  if (filters.lowStockOnly) {
    rows = rows.filter((r) => r.is_low_stock);
  }

  return rows;
}

// ============================================
// 9. DELIVERY REPORT
// ============================================

export async function getDeliveryReport(
  filters: DeliveryReportFilters,
  limit = 10000,
  offset = 0
): Promise<DeliveryReportRow[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let query = supabase
    .from("deliveries")
    .select(
      `
      id, delivery_number, order_id, status, expected_delivery_date,
      tracking_number, vehicle, driver, dispatched_at, delivered_at, created_at,
      order:orders!inner(order_number, customer:customers!inner(name))
    `
    )
    .eq("business_id", context.user.business_id);

  if (startDate) query = query.gte("expected_delivery_date", startDate);
  if (endDate) query = query.lte("expected_delivery_date", endDate);
  if (filters.orderId) query = query.eq("order_id", filters.orderId);
  if (filters.status) query = query.eq("status", filters.status);

  query = query.order("expected_delivery_date", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as DeliveryQueryResult[]) ?? []).map((d) => ({
    id: d.id,
    delivery_number: d.delivery_number,
    order_id: d.order_id,
    order_number: d.order?.order_number ?? "",
    customer_name: d.order?.customer?.name ?? null,
    status: d.status as any,
    expected_delivery_date: d.expected_delivery_date,
    tracking_number: d.tracking_number,
    vehicle: d.vehicle,
    driver: d.driver,
    dispatched_at: d.dispatched_at,
    delivered_at: d.delivered_at,
    created_at: d.created_at,
  }));
}

// ============================================
// LOOKUPS FOR REPORT FILTERS
// ============================================

export async function getReportFilterLookups(): Promise<{
  customers: { id: string; name: string }[];
  products: { id: string; name: string }[];
  rawMaterials: { id: string; name: string }[];
  orders: { id: string; order_number: string }[];
  districts: { value: string; label: string }[];
}> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { customers: [], products: [], rawMaterials: [], orders: [], districts: [] };

  const [custRes, prodRes, matRes, orderRes, orderDistrictsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, customer_addresses(district)")
      .eq("business_id", context.user.business_id)
      .order("name"),
    supabase.from("products").select("id, name").eq("business_id", context.user.business_id).order("name"),
    supabase.from("raw_materials").select("id, name").eq("business_id", context.user.business_id).order("name"),
    supabase
      .from("orders")
      .select("id, order_number")
      .eq("business_id", context.user.business_id)
      .order("order_number", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("district")
      .eq("business_id", context.user.business_id)
      .not("district", "is", null),
  ]);

  const districtSet = new Set<string>();
  for (const c of (custRes.data as any[]) ?? []) {
    const addrs = c.customer_addresses as { district?: string | null }[] | undefined;
    for (const a of addrs ?? []) {
      const d = a.district?.trim();
      if (d) districtSet.add(d);
    }
  }
  for (const o of (orderDistrictsRes.data as any[]) ?? []) {
    const d = o.district?.trim();
    if (d) districtSet.add(d);
  }

  const districtOptions = getIndianDistrictsDropdownOptions(Array.from(districtSet));

  const customersList = (custRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name }));

  return {
    customers: customersList,
    products: prodRes.data ?? [],
    rawMaterials: matRes.data ?? [],
    orders: orderRes.data ?? [],
    districts: districtOptions,
  };
}

// ============================================
// SERVER-SIDE PAGINATED PREVIEW (for UI)
// ============================================

export async function getReportPreview(
  reportType: ReportType,
  filters: ReportFilters,
  limit = 50,
  offset = 0
): Promise<{ rows: ReportRow[]; totalCount: number }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const config = REPORT_CONFIGS[reportType];
  if (!hasPermission({ permissions: context.permissions }, config.requiredPermission)) {
    throw new Error(`Forbidden: ${config.requiredPermission}`);
  }

  if (reportType === "sales" || reportType === "profit") {
    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (!isAdminOrSuper) {
      throw new Error(`Forbidden: ${reportType} report is restricted to Admin and Super Admin`);
    }
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { startDate, endDate } = resolveDateRange(filters);

  let rows: ReportRow[] = [];
  let totalCount = 0;

  switch (reportType) {
    case "sales": {
      const bundle = await getSalesReportBundle(filters as SalesReportFilters, limit, offset);
      rows = bundle.rows;
      totalCount = bundle.totalCount;
      break;
    }
    case "orders": {
      rows = await getOrdersReport(filters as OrdersReportFilters, limit, offset);
      let countQuery = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id);
      if (startDate) countQuery = countQuery.gte("order_date", startDate);
      if (endDate) countQuery = countQuery.lte("order_date", endDate);
      if ((filters as OrdersReportFilters).customerId) countQuery = countQuery.eq("customer_id", (filters as OrdersReportFilters).customerId);
      if ((filters as OrdersReportFilters).status) countQuery = countQuery.eq("status", (filters as OrdersReportFilters).status);
      if ((filters as OrdersReportFilters).priority) countQuery = countQuery.eq("priority", (filters as OrdersReportFilters).priority);
      const cRes = await countQuery;
      totalCount = cRes.count ?? rows.length;
      break;
    }
    case "payments": {
      rows = await getPaymentsReport(filters as PaymentsReportFilters, limit, offset);
      let countQuery = supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id);
      if (startDate) countQuery = countQuery.gte("payment_date", startDate);
      if (endDate) countQuery = countQuery.lte("payment_date", endDate);
      if ((filters as PaymentsReportFilters).customerId) countQuery = countQuery.eq("customer_id", (filters as PaymentsReportFilters).customerId);
      if ((filters as PaymentsReportFilters).orderId) countQuery = countQuery.eq("order_id", (filters as PaymentsReportFilters).orderId);
      if ((filters as PaymentsReportFilters).status) countQuery = countQuery.eq("status", (filters as PaymentsReportFilters).status);
      if ((filters as PaymentsReportFilters).paymentMethod) countQuery = countQuery.eq("payment_method", (filters as PaymentsReportFilters).paymentMethod);
      const cRes = await countQuery;
      totalCount = cRes.count ?? rows.length;
      break;
    }
    case "customer_due": {
      rows = await getCustomerDueReport(filters as CustomerDueReportFilters, limit, offset);
      totalCount = rows.length;
      break;
    }
    case "expenses": {
      rows = await getExpensesReport(filters as ExpensesReportFilters, limit, offset);
      let countQuery = supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id);
      if (startDate) countQuery = countQuery.gte("expense_date", startDate);
      if (endDate) countQuery = countQuery.lte("expense_date", endDate);
      if ((filters as ExpensesReportFilters).category) countQuery = countQuery.eq("category", (filters as ExpensesReportFilters).category);
      if ((filters as ExpensesReportFilters).status) {
        countQuery = countQuery.eq("status", (filters as ExpensesReportFilters).status);
      } else {
        countQuery = countQuery.eq("status", "POSTED");
      }
      const cRes = await countQuery;
      totalCount = cRes.count ?? rows.length;
      break;
    }
    case "profit": {
      rows = await getProfitReport(filters as ProfitReportFilters, limit, offset);
      totalCount = rows.length;
      break;
    }
    case "production": {
      rows = await getProductionReport(filters as ProductionReportFilters, limit, offset);
      let countQuery = supabase
        .from("production_orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id);
      if (startDate) countQuery = countQuery.gte("created_at", `${startDate}T00:00:00Z`);
      if (endDate) countQuery = countQuery.lte("created_at", `${endDate}T23:59:59Z`);
      if ((filters as ProductionReportFilters).productId) countQuery = countQuery.eq("product_id", (filters as ProductionReportFilters).productId);
      if ((filters as ProductionReportFilters).status) countQuery = countQuery.eq("status", (filters as ProductionReportFilters).status);
      if ((filters as ProductionReportFilters).priority) countQuery = countQuery.eq("priority", (filters as ProductionReportFilters).priority);
      const cRes = await countQuery;
      totalCount = cRes.count ?? rows.length;
      break;
    }
    case "inventory": {
      rows = await getInventoryReport(filters as InventoryReportFilters, limit, offset);
      totalCount = rows.length;
      break;
    }
    case "delivery": {
      rows = await getDeliveryReport(filters as DeliveryReportFilters, limit, offset);
      let countQuery = supabase
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.user.business_id);
      if (startDate) countQuery = countQuery.gte("expected_delivery_date", startDate);
      if (endDate) countQuery = countQuery.lte("expected_delivery_date", endDate);
      if ((filters as DeliveryReportFilters).orderId) countQuery = countQuery.eq("order_id", (filters as DeliveryReportFilters).orderId);
      if ((filters as DeliveryReportFilters).status) countQuery = countQuery.eq("status", (filters as DeliveryReportFilters).status);
      const cRes = await countQuery;
      totalCount = cRes.count ?? rows.length;
      break;
    }
  }

  return { rows, totalCount };
}

// ============================================
// REPORT EXPORT (FULL DATASET EXPORT)
// ============================================

interface ReportExportData {
  headers: string[];
  rows: any[][];
  totals: any[];
  title: string;
}

function getReportConfig(type: ReportType, rows: ReportRow[]): ReportExportData {
  const totalsMap = calculateReportTotals(type, rows);

  const formatCurrencyVal = (v: number | undefined) =>
    v !== undefined
      ? `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";

  switch (type) {
    case "sales": {
      const headers = [
        "Order #",
        "Order Date",
        "Customer",
        "District",
        "Product",
        "SKU",
        "Qty",
        "Unit Price",
        "CGST",
        "SGST",
        "IGST",
        "Line Total",
        "Gross",
        "Discount",
        "Tax",
        "Net",
        "Paid",
        "Outstanding",
        "Status",
      ];
      const mappedRows = (rows as SalesReportRow[]).map((r) => [
        r.order_number,
        r.order_date,
        r.customer_name + (r.customer_company ? ` (${r.customer_company})` : ""),
        r.customer_district || "Unknown District",
        r.product_name,
        r.product_sku ?? "",
        r.quantity,
        formatCurrencyVal(Number(r.unit_price)),
        formatCurrencyVal(Number(r.cgst_amount || 0)),
        formatCurrencyVal(Number(r.sgst_amount || 0)),
        formatCurrencyVal(Number(r.igst_amount || 0)),
        formatCurrencyVal(Number(r.line_total)),
        formatCurrencyVal(Number(r.gross_amount)),
        formatCurrencyVal(Number(r.discount_amount)),
        formatCurrencyVal(Number(r.tax_amount)),
        formatCurrencyVal(Number(r.net_amount)),
        formatCurrencyVal(Number(r.paid_amount)),
        formatCurrencyVal(Number(r.outstanding_amount)),
        r.order_status,
      ]);
      const totals = [
        "TOTALS",
        "",
        "",
        "",
        "",
        "",
        totalsMap["quantity"] ?? 0,
        "",
        formatCurrencyVal(totalsMap["cgst_amount"]),
        formatCurrencyVal(totalsMap["sgst_amount"]),
        formatCurrencyVal(totalsMap["igst_amount"]),
        formatCurrencyVal(totalsMap["line_total"]),
        formatCurrencyVal(totalsMap["gross_amount"]),
        formatCurrencyVal(totalsMap["discount_amount"]),
        formatCurrencyVal(totalsMap["tax_amount"]),
        formatCurrencyVal(totalsMap["net_amount"]),
        formatCurrencyVal(totalsMap["paid_amount"]),
        formatCurrencyVal(totalsMap["outstanding_amount"]),
        "",
      ];
      return { headers, rows: mappedRows, totals, title: "Sales Report" };
    }
    case "orders": {
      const headers = [
        "Order #",
        "Date",
        "Customer",
        "Priority",
        "Status",
        "Subtotal",
        "Discount",
        "Tax",
        "Total",
        "Paid",
        "Due",
        "Earliest Delivery",
        "Latest Delivery",
        "Expected Delivery",
        "Delivery Status",
      ];
      const mappedRows = (rows as OrdersReportRow[]).map((r) => [
        r.order_number,
        r.order_date,
        r.customer_name + (r.customer_company ? ` (${r.customer_company})` : ""),
        r.priority,
        r.status,
        formatCurrencyVal(Number(r.subtotal)),
        formatCurrencyVal(Number(r.discount_amount)),
        formatCurrencyVal(Number(r.tax_amount)),
        formatCurrencyVal(Number(r.total_amount)),
        formatCurrencyVal(Number(r.paid_amount)),
        formatCurrencyVal(Number(r.due_amount)),
        r.earliest_delivery_date ?? "",
        r.latest_delivery_date ?? "",
        r.expected_delivery_date ?? "",
        r.delivery_status,
      ]);
      const totals = [
        "TOTALS",
        "",
        "",
        "",
        "",
        formatCurrencyVal(totalsMap["subtotal"]),
        formatCurrencyVal(totalsMap["discount_amount"]),
        formatCurrencyVal(totalsMap["tax_amount"]),
        formatCurrencyVal(totalsMap["total_amount"]),
        formatCurrencyVal(totalsMap["paid_amount"]),
        formatCurrencyVal(totalsMap["due_amount"]),
        "",
        "",
        "",
        "",
      ];
      return { headers, rows: mappedRows, totals, title: "Orders Report" };
    }
    case "payments": {
      const headers = ["Payment #", "Date", "Customer", "Order #", "Amount", "Method", "Reference", "Status", "Notes"];
      const mappedRows = (rows as PaymentsReportRow[]).map((r) => [
        r.payment_number,
        r.payment_date,
        r.customer_name + (r.customer_company ? ` (${r.customer_company})` : ""),
        r.order_number ?? "",
        formatCurrencyVal(Number(r.amount)),
        r.payment_method,
        r.reference ?? "",
        r.status,
        r.notes ?? "",
      ]);
      const totals = ["TOTALS", "", "", "", formatCurrencyVal(totalsMap["amount"]), "", "", "", ""];
      return { headers, rows: mappedRows, totals, title: "Payments Report" };
    }
    case "customer_due": {
      const headers = [
        "Customer",
        "Company",
        "Phone",
        "Email",
        "Total Purchases",
        "Total Paid",
        "Total Due",
        "Last Payment Date",
        "Last Payment",
        "Credit Limit",
        "Terms",
      ];
      const mappedRows = (rows as CustomerDueReportRow[]).map((r) => [
        r.customer_name,
        r.customer_company ?? "",
        r.customer_phone ?? "",
        r.customer_email ?? "",
        formatCurrencyVal(Number(r.total_purchases)),
        formatCurrencyVal(Number(r.total_paid)),
        formatCurrencyVal(Number(r.total_due)),
        r.last_payment_date ?? "",
        formatCurrencyVal(Number(r.last_payment_amount)),
        formatCurrencyVal(Number(r.credit_limit)),
        r.payment_terms ?? "",
      ]);
      const totals = [
        "TOTALS",
        "",
        "",
        "",
        formatCurrencyVal(totalsMap["total_purchases"]),
        formatCurrencyVal(totalsMap["total_paid"]),
        formatCurrencyVal(totalsMap["total_due"]),
        "",
        "",
        "",
        "",
      ];
      return { headers, rows: mappedRows, totals, title: "Customer Due Report" };
    }
    case "expenses": {
      const headers = ["Category", "Amount", "Date", "Description", "Reference", "Status", "Created By", "Created At"];
      const mappedRows = (rows as ExpensesReportRow[]).map((r) => [
        r.category,
        formatCurrencyVal(Number(r.amount)),
        r.expense_date,
        r.description ?? "",
        r.reference ?? "",
        r.status,
        r.created_by_name ?? "",
        r.created_at,
      ]);
      const totals = ["TOTALS", formatCurrencyVal(totalsMap["amount"]), "", "", "", "", "", ""];
      return { headers, rows: mappedRows, totals, title: "Expenses Report" };
    }
    case "profit": {
      const headers = [
        "Period",
        "Gross Sales",
        "Discounts",
        "Tax",
        "Net Sales",
        "Received",
        "Outstanding",
        "Expenses",
        "Profit",
      ];
      const mappedRows = (rows as ProfitReportRow[]).map((r) => [
        r.period,
        formatCurrencyVal(Number(r.gross_sales)),
        formatCurrencyVal(Number(r.discounts)),
        formatCurrencyVal(Number(r.tax)),
        formatCurrencyVal(Number(r.net_sales)),
        formatCurrencyVal(Number(r.payments_received)),
        formatCurrencyVal(Number(r.outstanding)),
        formatCurrencyVal(Number(r.total_expenses)),
        formatCurrencyVal(Number(r.profit)),
      ]);
      const totals = [
        "TOTALS",
        formatCurrencyVal(totalsMap["gross_sales"]),
        formatCurrencyVal(totalsMap["discounts"]),
        formatCurrencyVal(totalsMap["tax"]),
        formatCurrencyVal(totalsMap["net_sales"]),
        formatCurrencyVal(totalsMap["payments_received"]),
        formatCurrencyVal(totalsMap["outstanding"]),
        formatCurrencyVal(totalsMap["total_expenses"]),
        formatCurrencyVal(totalsMap["profit"]),
      ];
      return { headers, rows: mappedRows, totals, title: "Profit & Loss Report" };
    }
    case "production": {
      const headers = [
        "Order #",
        "Customer",
        "Product",
        "SKU",
        "Qty",
        "Status",
        "Priority",
        "Scheduled Start",
        "Scheduled End",
        "Actual Start",
        "Actual End",
        "Created",
      ];
      const mappedRows = (rows as ProductionReportRow[]).map((r) => [
        r.order_number,
        r.customer_name ?? "",
        r.product_name,
        r.product_sku ?? "",
        r.quantity,
        r.status,
        r.priority,
        r.scheduled_start_date ?? "",
        r.scheduled_end_date ?? "",
        r.actual_start_date ?? "",
        r.actual_end_date ?? "",
        r.created_at,
      ]);
      const totals = ["TOTALS", "", "", "", totalsMap["quantity"] ?? 0, "", "", "", "", "", "", ""];
      return { headers, rows: mappedRows, totals, title: "Production Report" };
    }
    case "inventory": {
      const headers = [
        "Code",
        "Name",
        "Unit",
        "Current Stock",
        "Reserved",
        "Available",
        "Reorder Level",
        "Min Stock",
        "Purchase Price",
        "Low Stock",
      ];
      const mappedRows = (rows as InventoryReportRow[]).map((r) => [
        r.code ?? "",
        r.name,
        r.unit,
        r.current_stock,
        r.reserved_stock,
        r.available_stock,
        r.reorder_level,
        r.min_stock,
        formatCurrencyVal(Number(r.purchase_price)),
        r.is_low_stock ? "YES" : "NO",
      ]);
      const totals = [
        "TOTALS",
        "",
        "",
        totalsMap["current_stock"] ?? 0,
        totalsMap["reserved_stock"] ?? 0,
        totalsMap["available_stock"] ?? 0,
        "",
        "",
        "",
        "",
      ];
      return { headers, rows: mappedRows, totals, title: "Inventory Report" };
    }
    case "delivery": {
      const headers = [
        "Delivery #",
        "Order #",
        "Customer",
        "Status",
        "Expected Date",
        "Tracking #",
        "Vehicle",
        "Driver",
        "Dispatched",
        "Delivered",
        "Created",
      ];
      const mappedRows = (rows as DeliveryReportRow[]).map((r) => [
        r.delivery_number,
        r.order_number,
        r.customer_name ?? "",
        r.status,
        r.expected_delivery_date ?? "",
        r.tracking_number ?? "",
        r.vehicle ?? "",
        r.driver ?? "",
        r.dispatched_at ?? "",
        r.delivered_at ?? "",
        r.created_at,
      ]);
      const totals = [`TOTAL DELIVERIES: ${rows.length}`, "", "", "", "", "", "", "", "", "", ""];
      return { headers, rows: mappedRows, totals, title: "Delivery Report" };
    }
  }
}

async function fetchReportData(type: ReportType, filters: ReportFilters): Promise<ReportExportData> {
  let rows: ReportRow[] = [];
  const exportLimit = 50000;

  switch (type) {
    case "sales":
      rows = await getSalesReport(filters as SalesReportFilters, exportLimit, 0);
      break;
    case "orders":
      rows = await getOrdersReport(filters as OrdersReportFilters, exportLimit, 0);
      break;
    case "payments":
      rows = await getPaymentsReport(filters as PaymentsReportFilters, exportLimit, 0);
      break;
    case "customer_due":
      rows = await getCustomerDueReport(filters as CustomerDueReportFilters, exportLimit, 0);
      break;
    case "expenses":
      rows = await getExpensesReport(filters as ExpensesReportFilters, exportLimit, 0);
      break;
    case "profit":
      rows = await getProfitReport(filters as ProfitReportFilters, exportLimit, 0);
      break;
    case "production":
      rows = await getProductionReport(filters as ProductionReportFilters, exportLimit, 0);
      break;
    case "inventory":
      rows = await getInventoryReport(filters as InventoryReportFilters, exportLimit, 0);
      break;
    case "delivery":
      rows = await getDeliveryReport(filters as DeliveryReportFilters, exportLimit, 0);
      break;
  }

  return getReportConfig(type, rows);
}

export async function exportReport(
  reportType: ReportType,
  filters: ReportFilters,
  format: ExportFormat
): Promise<{ content: string; contentType: string; filename: string }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const config = REPORT_CONFIGS[reportType];
  if (!hasPermission({ permissions: context.permissions }, config.requiredPermission)) {
    throw new Error(`Forbidden: ${config.requiredPermission}`);
  }
  if (!hasPermission({ permissions: context.permissions }, config.exportPermission)) {
    throw new Error(`Forbidden: ${config.exportPermission}`);
  }

  if (reportType === "sales" || reportType === "profit") {
    const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
    if (!isAdminOrSuper) {
      throw new Error(`Forbidden: Exporting ${reportType} report is restricted to Admin and Super Admin`);
    }
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let companyName = "Development Business Pvt. Ltd.";
  if (context.user?.business_id) {
    const { data: bData } = await supabase
      .from("businesses")
      .select("name, legal_name")
      .eq("id", context.user.business_id)
      .maybeSingle();
    if (bData) {
      companyName = bData.legal_name || bData.name || companyName;
    }
  }

  const { startDate, endDate } = resolveDateRange(filters);
  const periodStr =
    startDate && endDate
      ? `${formatLedgerDate(startDate)} to ${formatLedgerDate(endDate)}`
      : startDate
      ? `From ${formatLedgerDate(startDate)}`
      : endDate
      ? `Up to ${formatLedgerDate(endDate)}`
      : "All Time";

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `${reportType}_report_${dateStr}.${format === "excel" ? "xls" : format}`;

  // 1. SALES REPORT (Sales Ledger & District Summary)
  if (reportType === "sales") {
    const salesRows = await getSalesReport(filters as SalesReportFilters, 50000, 0);
    const { summary: districtSummaries, totals: districtTotals } = await getDistrictSalesSummary(
      filters as SalesReportFilters
    );
    await auditExport(context, reportType, filters, format, salesRows.length);

    const districtHeaders = [
      "District",
      "Orders",
      "Qty",
      "Taxable Sales",
      "CGST",
      "SGST",
      "IGST",
      "Total Sales",
      "Received",
      "Outstanding",
    ];
    const districtRows = districtSummaries.map((d) => [
      d.district,
      d.total_orders,
      d.total_quantity,
      formatIndianCurrency(d.taxable_sales, true),
      formatIndianCurrency(d.cgst, true),
      formatIndianCurrency(d.sgst, true),
      formatIndianCurrency(d.igst, true),
      formatIndianCurrency(d.total_sales, true),
      formatIndianCurrency(d.amount_received, true),
      formatIndianCurrency(d.outstanding_amount, true),
    ]);
    const districtTotalsRow = [
      "TOTALS",
      districtTotals.total_orders,
      districtTotals.total_quantity,
      formatIndianCurrency(districtTotals.taxable_sales, true),
      formatIndianCurrency(districtTotals.cgst, true),
      formatIndianCurrency(districtTotals.sgst, true),
      formatIndianCurrency(districtTotals.igst, true),
      formatIndianCurrency(districtTotals.total_sales, true),
      formatIndianCurrency(districtTotals.amount_received, true),
      formatIndianCurrency(districtTotals.outstanding_amount, true),
    ];

    // Build distinct sales ledger entries (1 row per sales invoice to prevent double counting)
    const distinctOrdersMap = new Map<string, {
      order_number: string;
      order_date: string;
      customer_name: string;
      customer_company: string | null;
      product_name: string;
      total_amount: number;
    }>();

    for (const r of salesRows) {
      if (!distinctOrdersMap.has(r.order_number)) {
        distinctOrdersMap.set(r.order_number, {
          order_number: r.order_number,
          order_date: r.order_date,
          customer_name: r.customer_name,
          customer_company: r.customer_company,
          product_name: r.product_name,
          total_amount: Number(r.net_amount || r.gross_amount || 0),
        });
      }
    }

    const ledgerEntries: LedgerEntryRow[] = Array.from(distinctOrdersMap.values())
      .sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime())
      .map((o) => ({
        date: formatLedgerDate(o.order_date),
        particulars: `To Sales - ${o.customer_name}${o.customer_company ? ` (${o.customer_company})` : ""}`,
        vchType: "Sales",
        vchNo: o.order_number,
        debit: o.total_amount,
        credit: null,
      }));

    const salesData = {
      companyName,
      reportTitle: "Sales Report & Ledger",
      periodStr,
      districtHeaders,
      districtRows,
      districtTotals: districtTotalsRow,
      ledgerEntries,
    };

    switch (format) {
      case "csv":
        return {
          content: generateSalesLedgerCSV(salesData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateSalesLedgerExcel(salesData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateSalesLedgerPDF(salesData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 2. CUSTOMER DUE / CUSTOMER LEDGER REPORT
  if (reportType === "customer_due") {
    let openingDebit = 0;
    let openingCredit = 0;
    const ledgerEntries: LedgerEntryRow[] = [];
    let reportTitle = "Customer Accounts Ledger";

    const customerId = (filters as CustomerDueReportFilters).customerId;

    if (customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name, company_name")
        .eq("id", customerId)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (cust) {
        reportTitle = `${cust.name}${cust.company_name ? ` (${cust.company_name})` : ""} - Ledger Account`;
      }

      // Compute opening balance prior to startDate
      if (startDate) {
        const { data: preEntries } = await supabase
          .from("customer_ledger")
          .select("debit, credit")
          .eq("business_id", context.user.business_id)
          .eq("customer_id", customerId)
          .lt("entry_date", startDate);

        let preDebit = 0;
        let preCredit = 0;
        for (const pe of preEntries ?? []) {
          preDebit += Number(pe.debit || 0);
          preCredit += Number(pe.credit || 0);
        }
        const netPre = preDebit - preCredit;
        if (netPre > 0) openingDebit = netPre;
        else if (netPre < 0) openingCredit = Math.abs(netPre);
      }

      let q = supabase
        .from("customer_ledger")
        .select("*, orders(order_number), payments(payment_number)")
        .eq("business_id", context.user.business_id)
        .eq("customer_id", customerId);

      if (startDate) q = q.gte("entry_date", startDate);
      if (endDate) q = q.lte("entry_date", endDate);

      const { data: cEntries } = await q.order("entry_date", { ascending: true }).order("created_at", { ascending: true });

      for (const e of cEntries ?? []) {
        const d = Number(e.debit) || 0;
        const c = Number(e.credit) || 0;
        const vchNo = (e as any).orders?.order_number || (e as any).payments?.payment_number || e.description || "—";
        const vchType =
          e.entry_type === "INVOICE"
            ? "Sales"
            : e.entry_type === "PAYMENT"
            ? "Receipt"
            : e.entry_type === "CREDIT_NOTE"
            ? "Credit Note"
            : e.entry_type === "DEBIT_NOTE"
            ? "Debit Note"
            : "Journal";

        ledgerEntries.push({
          date: formatLedgerDate(e.entry_date),
          particulars: e.description || (e.entry_type === "INVOICE" ? "To Sales" : "By Payment"),
          vchType,
          vchNo,
          debit: d > 0 ? d : null,
          credit: c > 0 ? c : null,
        });
      }
    } else {
      // All customers customer_due report
      if (startDate) {
        const { data: preEntries } = await supabase
          .from("customer_ledger")
          .select("debit, credit")
          .eq("business_id", context.user.business_id)
          .lt("entry_date", startDate);

        let preDebit = 0;
        let preCredit = 0;
        for (const pe of preEntries ?? []) {
          preDebit += Number(pe.debit || 0);
          preCredit += Number(pe.credit || 0);
        }
        const netPre = preDebit - preCredit;
        if (netPre > 0) openingDebit = netPre;
        else if (netPre < 0) openingCredit = Math.abs(netPre);
      }

      let q = supabase
        .from("customer_ledger")
        .select("*, customers(name, company_name), orders(order_number), payments(payment_number)")
        .eq("business_id", context.user.business_id);

      if (startDate) q = q.gte("entry_date", startDate);
      if (endDate) q = q.lte("entry_date", endDate);

      const { data: cEntries } = await q.order("entry_date", { ascending: true }).order("created_at", { ascending: true });

      for (const e of cEntries ?? []) {
        const d = Number(e.debit) || 0;
        const c = Number(e.credit) || 0;
        const custName = (e as any).customers?.name || "Customer";
        const vchNo = (e as any).orders?.order_number || (e as any).payments?.payment_number || "—";
        const vchType =
          e.entry_type === "INVOICE"
            ? "Sales"
            : e.entry_type === "PAYMENT"
            ? "Receipt"
            : e.entry_type === "CREDIT_NOTE"
            ? "Credit Note"
            : e.entry_type === "DEBIT_NOTE"
            ? "Debit Note"
            : "Journal";

        ledgerEntries.push({
          date: formatLedgerDate(e.entry_date),
          particulars: `${custName}: ${e.description || (e.entry_type === "INVOICE" ? "To Sales" : "By Payment")}`,
          vchType,
          vchNo,
          debit: d > 0 ? d : null,
          credit: c > 0 ? c : null,
        });
      }
    }

    await auditExport(context, reportType, filters, format, ledgerEntries.length);

    const ledgerData = {
      companyName,
      reportTitle,
      periodStr,
      openingDebit,
      openingCredit,
      entries: ledgerEntries,
    };

    switch (format) {
      case "csv":
        return {
          content: generateLedgerCSV(ledgerData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateLedgerExcel(ledgerData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateLedgerPDF(ledgerData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 3. PAYMENTS REPORT (Receipt / Payment Ledger)
  if (reportType === "payments") {
    const paymentsRows = await getPaymentsReport(filters as PaymentsReportFilters, 50000, 0);
    await auditExport(context, reportType, filters, format, paymentsRows.length);

    const ledgerEntries: LedgerEntryRow[] = paymentsRows.map((p) => {
      const isRefund = p.status === "REFUNDED";
      const amt = Number(p.amount) || 0;
      return {
        date: formatLedgerDate(p.payment_date),
        particulars: `Received from ${p.customer_name}${p.payment_method ? ` (${p.payment_method})` : ""}${p.reference ? ` - Ref: ${p.reference}` : ""}`,
        vchType: isRefund ? "Payment" : "Receipt",
        vchNo: p.payment_number,
        debit: isRefund ? null : amt,
        credit: isRefund ? amt : null,
      };
    });

    const ledgerData = {
      companyName,
      reportTitle: "Receipt & Payment Ledger",
      periodStr,
      entries: ledgerEntries,
    };

    switch (format) {
      case "csv":
        return {
          content: generateLedgerCSV(ledgerData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateLedgerExcel(ledgerData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateLedgerPDF(ledgerData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 4. EXPENSES REPORT (Expense Ledger / Payment Book)
  if (reportType === "expenses") {
    const expenseRows = await getExpensesReport(filters as ExpensesReportFilters, 50000, 0);
    await auditExport(context, reportType, filters, format, expenseRows.length);

    const ledgerEntries: LedgerEntryRow[] = expenseRows.map((e) => ({
      date: formatLedgerDate(e.expense_date),
      particulars: `${e.category}: ${e.description || "Expense"}`,
      vchType: "Payment",
      vchNo: e.reference || `EXP-${e.id.slice(0, 8).toUpperCase()}`,
      debit: Number(e.amount) || 0,
      credit: null,
    }));

    const ledgerData = {
      companyName,
      reportTitle: "Expense Ledger (Payment Book)",
      periodStr,
      entries: ledgerEntries,
    };

    switch (format) {
      case "csv":
        return {
          content: generateLedgerCSV(ledgerData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateLedgerExcel(ledgerData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateLedgerPDF(ledgerData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 5. ORDERS REPORT (Sales Orders Register)
  if (reportType === "orders") {
    const ordersRows = await getOrdersReport(filters as OrdersReportFilters, 50000, 0);
    await auditExport(context, reportType, filters, format, ordersRows.length);

    const ledgerEntries: LedgerEntryRow[] = ordersRows.map((o) => ({
      date: formatLedgerDate(o.order_date),
      particulars: `${o.customer_name}${o.customer_company ? ` (${o.customer_company})` : ""} [${o.status}]`,
      vchType: "Sales Order",
      vchNo: o.order_number,
      debit: Number(o.total_amount) || null,
      credit: Number(o.paid_amount) || null,
    }));

    const ledgerData = {
      companyName,
      reportTitle: "Sales Orders Register",
      periodStr,
      entries: ledgerEntries,
    };

    switch (format) {
      case "csv":
        return {
          content: generateLedgerCSV(ledgerData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateLedgerExcel(ledgerData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateLedgerPDF(ledgerData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 6. PROFIT REPORT (Profit & Loss Statement)
  if (reportType === "profit") {
    const profitRows = await getProfitReport(filters as ProfitReportFilters, 50000, 0);
    await auditExport(context, reportType, filters, format, profitRows.length);

    const headers = [
      "Period",
      "Gross Sales",
      "Discounts",
      "Tax",
      "Net Sales",
      "Received",
      "Outstanding",
      "Expenses",
      "Profit",
    ];
    const rows = profitRows.map((r) => [
      r.period,
      formatIndianCurrency(Number(r.gross_sales), true),
      formatIndianCurrency(Number(r.discounts), true),
      formatIndianCurrency(Number(r.tax), true),
      formatIndianCurrency(Number(r.net_sales), true),
      formatIndianCurrency(Number(r.payments_received), true),
      formatIndianCurrency(Number(r.outstanding), true),
      formatIndianCurrency(Number(r.total_expenses), true),
      formatIndianCurrency(Number(r.profit), true),
    ]);

    const totalsMap = calculateReportTotals("profit", profitRows);
    const totals = [
      "TOTALS",
      formatIndianCurrency(totalsMap["gross_sales"], true),
      formatIndianCurrency(totalsMap["discounts"], true),
      formatIndianCurrency(totalsMap["tax"], true),
      formatIndianCurrency(totalsMap["net_sales"], true),
      formatIndianCurrency(totalsMap["payments_received"], true),
      formatIndianCurrency(totalsMap["outstanding"], true),
      formatIndianCurrency(totalsMap["total_expenses"], true),
      formatIndianCurrency(totalsMap["profit"], true),
    ];

    const opData: OperationalReportData = {
      companyName,
      reportTitle: "Profit & Loss Statement",
      periodStr,
      headers,
      rows,
      totals,
      numericColumnIndices: [1, 2, 3, 4, 5, 6, 7, 8],
    };

    switch (format) {
      case "csv":
        return {
          content: generateOperationalCSV(opData),
          contentType: "text/csv; charset=utf-8",
          filename,
        };
      case "excel":
        return {
          content: generateOperationalExcel(opData),
          contentType: "application/vnd.ms-excel; charset=utf-8",
          filename,
        };
      case "pdf":
        return {
          content: generateOperationalPDF(opData),
          contentType: "application/pdf",
          filename,
        };
    }
  }

  // 7. OPERATIONAL REPORTS (inventory, production, delivery)
  const reportData = await fetchReportData(reportType, filters);
  await auditExport(context, reportType, filters, format, reportData.rows.length);

  let numericColumnIndices: number[] = [];
  if (reportType === "inventory") {
    numericColumnIndices = [3, 4, 5, 6, 7, 8];
  } else if (reportType === "production") {
    numericColumnIndices = [4];
  }

  const opData: OperationalReportData = {
    companyName,
    reportTitle: reportData.title,
    periodStr,
    headers: reportData.headers,
    rows: reportData.rows,
    totals: reportData.totals,
    numericColumnIndices,
  };

  switch (format) {
    case "csv":
      return {
        content: generateOperationalCSV(opData),
        contentType: "text/csv; charset=utf-8",
        filename,
      };
    case "excel":
      return {
        content: generateOperationalExcel(opData),
        contentType: "application/vnd.ms-excel; charset=utf-8",
        filename,
      };
    case "pdf":
      return {
        content: generateOperationalPDF(opData),
        contentType: "application/pdf",
        filename,
      };
  }
}