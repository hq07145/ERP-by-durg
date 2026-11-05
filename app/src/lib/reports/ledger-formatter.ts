import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from "./fonts/noto-sans";

/**
 * Ensures that the Geist Unicode font is registered on the jsPDF document.
 * This enables native rendering of the Indian Rupee symbol (₹ U+20B9) and other Unicode glyphs.
 */
export function ensurePdfUnicodeFont(doc: jsPDF): void {
  try {
    const fontList = doc.getFontList();
    if (!fontList || !fontList["NotoSans"]) {
      doc.addFileToVFS("NotoSans-Regular.ttf", NOTO_SANS_REGULAR_BASE64);
      doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
      doc.addFileToVFS("NotoSans-Bold.ttf", NOTO_SANS_BOLD_BASE64);
      doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    }
    doc.setFont("NotoSans", "normal");
  } catch (err) {
    console.warn("Failed to register NotoSans font in jsPDF:", err);
  }
}

export interface LedgerEntryRow {
  date: string; // DD-MMM-YY
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number | null;
  credit: number | null;
  amountDue?: number | null;
}

export interface LedgerReportData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  customerName?: string;
  customerCompany?: string;
  openingDebit?: number;
  openingCredit?: number;
  entries: LedgerEntryRow[];
}

export interface OperationalReportData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  headers: string[];
  rows: any[][];
  totals?: any[];
  numericColumnIndices?: number[]; // indices to right-align
}

/**
 * Formats a date string into standard DD-MMM-YY (e.g., 21-Oct-26).
 */
export function formatLedgerDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  try {
    const s = typeof dateInput === "string" ? dateInput.split("T")[0] : dateInput.toISOString().split("T")[0];
    const parts = s.split("-").map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const day = String(parts[2]).padStart(2, "0");
      const month = months[parts[1] - 1] || "Jan";
      const year = String(parts[0]).slice(-2);
      return `${day}-${month}-${year}`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats a number with Indian currency grouping (e.g. 1,23,456.00).
 * Returns empty string for null/undefined/0 when requested.
 */
export function formatIndianCurrency(
  val: number | string | null | undefined,
  showZero = false
): string {
  if (val === null || val === undefined || val === "") return showZero ? "0.00" : "";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return showZero ? "0.00" : "";
  if (num === 0 && !showZero) return "";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats an amount into standard Indian Rupee representation (e.g. ₹1,02,637.00).
 * Zero displays consistently as ₹0.00.
 */
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Single centralized INR formatting function conforming to accounting standards:
 * - Formats valid numbers with Indian comma grouping and ₹ symbol (e.g. ₹1,59,400.00).
 * - Zero renders consistently as ₹0.00.
 * - Negative values format consistently (e.g. -₹1,02,637.00).
 */
export function formatINR(val: number | string | null | undefined, showZero = true): string {
  if (val === null || val === undefined || val === "") return showZero ? "₹0.00" : "";
  const num = typeof val === "string" ? parseFloat(String(val).replace(/[^0-9.-]/g, "")) : Number(val);
  if (isNaN(num)) return showZero ? "₹0.00" : "";
  if (num === 0) return showZero ? "₹0.00" : "";
  return inrFormatter.format(num);
}

export function formatIndianCurrencyWithSymbol(
  val: number | string | null | undefined,
  showZero = true
): string {
  return formatINR(val, showZero);
}

/**
 * Checks whether a string represents a pure numeric or currency amount.
 * Prevents formula injection escaping from altering legitimate negative numbers or currency values.
 */
function isPureNumericOrCurrency(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  const cleaned = s.replace(/[₹$€£\s,]/g, "").trim();
  return /^[+-]?\d+(\.\d+)?$/.test(cleaned);
}

function sanitizeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  const isNumeric = typeof val === "number" || isPureNumericOrCurrency(str);
  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sanitizeExcel(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  const isNumeric = typeof val === "number" || isPureNumericOrCurrency(str);
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

/**
 * Builds paginated professional ledger PDF matching the reference accounting format.
 * Returns a base64 encoded string safe for Next.js Server Action response.
 */
export function generateLedgerPDF(data: LedgerReportData): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });
  ensurePdfUnicodeFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch

  const openingDebit = Number(data.openingDebit) || 0;
  const openingCredit = Number(data.openingCredit) || 0;
  const netOpening = openingDebit - openingCredit;

  const TX_PER_PAGE = 25;
  const pagesData: string[][][] = [];

  let txIndex = 0;
  let cumDebit = openingDebit;
  let cumCredit = openingCredit;
  let periodDebit = 0;
  let periodCredit = 0;
  let pageIdx = 0;

  const entries = data.entries || [];

  while (txIndex < entries.length || (pageIdx === 0 && entries.length === 0)) {
    const pageRows: string[][] = [];
    const isFirstPage = pageIdx === 0;

    const isAllTime = (data.periodStr || "").toLowerCase().includes("all time");
    const openLabel = isAllTime ? "Original Opening Balance" : "Opening Balance";

    if (isFirstPage) {
      if (netOpening > 0) {
        pageRows.push([
          "",
          `${openLabel} [RECEIVABLE]`,
          "",
          "",
          formatIndianCurrencyWithSymbol(netOpening, true),
          "",
          formatIndianCurrencyWithSymbol(netOpening, true),
        ]);
      } else if (netOpening < 0) {
        pageRows.push([
          "",
          `${openLabel} [PAYABLE / ADVANCE]`,
          "",
          "",
          "",
          formatIndianCurrencyWithSymbol(Math.abs(netOpening), true),
          "₹0.00",
        ]);
      } else {
        pageRows.push([
          "",
          `${openLabel} [NIL]`,
          "",
          "",
          "₹0.00",
          "₹0.00",
          "₹0.00",
        ]);
      }
    } else {
      const runningDue = Math.max(0, cumDebit - cumCredit);
      pageRows.push([
        "",
        "Brought Forward",
        "",
        "",
        formatIndianCurrencyWithSymbol(cumDebit, true),
        formatIndianCurrencyWithSymbol(cumCredit, true),
        formatIndianCurrencyWithSymbol(runningDue, true),
      ]);
    }

    const currentBatch = entries.slice(txIndex, txIndex + TX_PER_PAGE);
    txIndex += TX_PER_PAGE;
    const isLastPage = txIndex >= entries.length;

    for (const tx of currentBatch) {
      const d = Number(tx.debit) || 0;
      const c = Number(tx.credit) || 0;
      cumDebit += d;
      cumCredit += c;
      periodDebit += d;
      periodCredit += c;

      const dueStr =
        tx.amountDue !== undefined && tx.amountDue !== null
          ? formatIndianCurrencyWithSymbol(tx.amountDue, true)
          : tx.debit
          ? formatIndianCurrencyWithSymbol(tx.debit, true)
          : "—";

      pageRows.push([
        tx.date || "",
        tx.particulars || "",
        tx.vchType || "",
        tx.vchNo || "",
        d > 0 ? formatIndianCurrencyWithSymbol(d, true) : "",
        c > 0 ? formatIndianCurrencyWithSymbol(c, true) : "",
        dueStr,
      ]);
    }

    const currentRunningDue = Math.max(0, cumDebit - cumCredit);

    if (!isLastPage) {
      pageRows.push([
        "",
        "Carried Forward",
        "",
        "",
        formatIndianCurrencyWithSymbol(cumDebit, true),
        formatIndianCurrencyWithSymbol(cumCredit, true),
        formatIndianCurrencyWithSymbol(currentRunningDue, true),
      ]);
    } else {
      const netClosing = netOpening + periodDebit - periodCredit;
      let closingDebit = 0;
      let closingCredit = 0;
      let closingDue = 0;

      if (netClosing > 0) {
        closingCredit = netClosing;
        closingDue = netClosing;
      } else if (netClosing < 0) {
        closingDebit = Math.abs(netClosing);
        closingDue = 0;
      }

      // Total Period Transactions Row
      pageRows.push([
        "",
        "Total Period Transactions",
        "",
        "",
        formatIndianCurrencyWithSymbol(periodDebit, true),
        formatIndianCurrencyWithSymbol(periodCredit, true),
        "",
      ]);

      // Closing Balance Row with explicit [RECEIVABLE] or [PAYABLE / ADVANCE] label
      if (netClosing > 0) {
        pageRows.push([
          "",
          "Closing Balance [RECEIVABLE]",
          "",
          "",
          formatIndianCurrencyWithSymbol(netClosing, true),
          "",
          formatIndianCurrencyWithSymbol(netClosing, true),
        ]);
      } else if (netClosing < 0) {
        pageRows.push([
          "",
          "Closing Balance [PAYABLE / ADVANCE]",
          "",
          "",
          "",
          formatIndianCurrencyWithSymbol(Math.abs(netClosing), true),
          "₹0.00",
        ]);
      } else {
        pageRows.push([
          "",
          "Closing Balance [NIL]",
          "",
          "",
          "₹0.00",
          "₹0.00",
          "₹0.00",
        ]);
      }

      // Reconciled Grand Total Row
      const grandDebit = (netOpening > 0 ? netOpening : 0) + periodDebit + closingDebit;
      const grandCredit = (netOpening < 0 ? Math.abs(netOpening) : 0) + periodCredit + closingCredit;
      const balancedTotal = Math.max(grandDebit, grandCredit);

      pageRows.push([
        "",
        "Total",
        "",
        "",
        formatIndianCurrencyWithSymbol(balancedTotal, true),
        formatIndianCurrencyWithSymbol(balancedTotal, true),
        formatIndianCurrencyWithSymbol(closingDue, true),
      ]);
    }

    pagesData.push(pageRows);
    pageIdx++;
  }

  // Render pages
  for (let p = 0; p < pagesData.length; p++) {
    if (p > 0) doc.addPage();

    const rows = pagesData[p];

    autoTable(doc, {
      startY: 85,
      margin: { left: margin, right: margin, top: 85, bottom: 45 },
      head: [["Date", "Particulars", "Voucher Type", "Voucher Number / Delivery Number", "Debit", "Credit", "Amount Due"]],
      body: rows,
      theme: "plain",
      styles: {
        font: "NotoSans",
        fontSize: 8,
        textColor: [0, 0, 0],
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
        lineWidth: 0,
        lineColor: [0, 0, 0],
        overflow: "linebreak",
      },
      headStyles: {
        font: "NotoSans",
        fontStyle: "bold",
        fillColor: false,
        textColor: [0, 0, 0],
        lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 60 },
        3: { cellWidth: 75 },
        4: { cellWidth: 65, halign: "right" },
        5: { cellWidth: 65, halign: "right" },
        6: { cellWidth: 68, halign: "right" },
      },
      didParseCell: function (cellData) {
        const rawRow = cellData.row.raw as any;
        const rowText = String(Array.isArray(rawRow) ? rawRow[1] : (rawRow?.particulars || ""));
        if (rowText === "Total") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
        } else if (
          rowText.startsWith("Closing Balance") ||
          rowText.startsWith("Opening Balance") ||
          rowText.startsWith("Original Opening Balance") ||
          rowText.startsWith("Total Period Transactions")
        ) {
          cellData.cell.styles.fontStyle = "bold";
          if (rowText.startsWith("Closing Balance") || rowText.startsWith("Total Period Transactions")) {
            cellData.cell.styles.lineWidth = { top: 0.5, bottom: 0, left: 0, right: 0 };
          }
        } else if (rowText === "Carried Forward" || rowText === "Brought Forward") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
        }
      },
    });

    // Draw header on every page
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName || "SANKALP IRRIGATION", pageWidth / 2, 32, { align: "center" });

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(10);
    const custHeader = data.customerName
      ? "Customer: " + data.customerName + (data.customerCompany ? " (" + data.customerCompany + ")" : "")
      : data.reportTitle;
    doc.text(custHeader, pageWidth / 2, 47, { align: "center" });

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8.5);
    doc.text("Account Statement: " + data.periodStr, pageWidth / 2, 60, { align: "center" });

    // Footer - Page Number
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8);
    const pageText = pagesData.length > 1 ? "Page " + (p + 1) + " of " + pagesData.length : "Page 1";
    doc.text(pageText, pageWidth - margin, pageHeight - 25, { align: "right" });
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

/**
 * Generates an Excel HTML workbook in the professional ledger format.
 */
export function generateLedgerExcel(data: LedgerReportData): string {
  const BOM = "\uFEFF";
  const openingDebit = Number(data.openingDebit) || 0;
  const openingCredit = Number(data.openingCredit) || 0;
  const netOpening = openingDebit - openingCredit;

  let periodDebit = 0;
  let periodCredit = 0;

  let bodyHtml = "";
  const isAllTime = (data.periodStr || "").toLowerCase().includes("all time");
  const openLabel = isAllTime ? "Original Opening Balance" : "Opening Balance";

  if (netOpening > 0) {
    bodyHtml += '<tr class="bold-row"><td></td><td>' + openLabel + ' [RECEIVABLE]</td><td></td><td></td><td class="num">' + netOpening.toFixed(2) + '</td><td class="num"></td><td class="num">' + netOpening.toFixed(2) + '</td></tr>';
  } else if (netOpening < 0) {
    bodyHtml += '<tr class="bold-row"><td></td><td>' + openLabel + ' [PAYABLE / ADVANCE]</td><td></td><td></td><td class="num"></td><td class="num">' + Math.abs(netOpening).toFixed(2) + '</td><td class="num">0.00</td></tr>';
  } else {
    bodyHtml += '<tr class="bold-row"><td></td><td>' + openLabel + ' [NIL]</td><td></td><td></td><td class="num">0.00</td><td class="num">0.00</td><td class="num">0.00</td></tr>';
  }

  for (const tx of data.entries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    periodDebit += d;
    periodCredit += c;

    const dueStr =
      tx.amountDue !== undefined && tx.amountDue !== null
        ? Number(tx.amountDue).toFixed(2)
        : d > 0
        ? d.toFixed(2)
        : "";

    bodyHtml += '<tr><td>' + sanitizeExcel(tx.date) + '</td><td>' + sanitizeExcel(tx.particulars) + '</td><td>' + sanitizeExcel(tx.vchType) + '</td><td>' + sanitizeExcel(tx.vchNo) + '</td><td class="num">' + (d > 0 ? d.toFixed(2) : "") + '</td><td class="num">' + (c > 0 ? c.toFixed(2) : "") + '</td><td class="num">' + dueStr + '</td></tr>';
  }

  const netClosing = netOpening + periodDebit - periodCredit;
  let closingDebit = 0;
  let closingCredit = 0;
  let closingDue = 0;
  if (netClosing > 0) {
    closingCredit = netClosing;
    closingDue = netClosing;
  } else if (netClosing < 0) {
    closingDebit = Math.abs(netClosing);
    closingDue = 0;
  }

  // Total Period Transactions
  bodyHtml += '<tr class="bold-row"><td></td><td>Total Period Transactions</td><td></td><td></td><td class="num">' + periodDebit.toFixed(2) + '</td><td class="num">' + periodCredit.toFixed(2) + '</td><td class="num"></td></tr>';

  // Closing Balance
  if (netClosing > 0) {
    bodyHtml += '<tr class="bold-row"><td></td><td>Closing Balance [RECEIVABLE]</td><td></td><td></td><td class="num">' + netClosing.toFixed(2) + '</td><td class="num"></td><td class="num">' + netClosing.toFixed(2) + '</td></tr>';
  } else if (netClosing < 0) {
    bodyHtml += '<tr class="bold-row"><td></td><td>Closing Balance [PAYABLE / ADVANCE]</td><td></td><td></td><td class="num"></td><td class="num">' + Math.abs(netClosing).toFixed(2) + '</td><td class="num">0.00</td></tr>';
  } else {
    bodyHtml += '<tr class="bold-row"><td></td><td>Closing Balance [NIL]</td><td></td><td></td><td class="num">0.00</td><td class="num">0.00</td><td class="num">0.00</td></tr>';
  }

  const grandDebit = (netOpening > 0 ? netOpening : 0) + periodDebit + closingDebit;
  const grandCredit = (netOpening < 0 ? Math.abs(netOpening) : 0) + periodCredit + closingCredit;
  const balancedTotal = Math.max(grandDebit, grandCredit);

  bodyHtml += '<tr class="total-row"><td></td><td>Total</td><td></td><td></td><td class="num">' + balancedTotal.toFixed(2) + '</td><td class="num">' + balancedTotal.toFixed(2) + '</td><td class="num">' + closingDue.toFixed(2) + '</td></tr>';

  const custHeader = data.customerName
    ? "Customer: " + data.customerName + (data.customerCompany ? " (" + data.customerCompany + ")" : "")
    : data.reportTitle;

  return BOM + '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <style>\n' +
'    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }\n' +
'    h2 { font-size: 14pt; margin: 0; text-align: center; }\n' +
'    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }\n' +
'    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }\n' +
'    table { border-collapse: collapse; width: 100%; }\n' +
'    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }\n' +
'    th.num { text-align: right; }\n' +
'    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }\n' +
'    td.num { text-align: right; mso-number-format: "\\\\#\\\\,\\\\#\\\\#0\\\\.00"; }\n' +
'    .bold-row { font-weight: bold; }\n' +
'    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <h2>' + sanitizeExcel(data.companyName || "SANKALP IRRIGATION") + '</h2>\n' +
'  <h3>' + sanitizeExcel(custHeader) + '</h3>\n' +
'  <p class="period">' + sanitizeExcel("Account Statement: " + data.periodStr) + '</p>\n' +
'  <table>\n' +
'    <thead>\n' +
'      <tr>\n' +
'        <th>Date</th>\n' +
'        <th>Particulars</th>\n' +
'        <th>Voucher Type</th>\n' +
'        <th>Voucher Number / Delivery Number</th>\n' +
'        <th class="num">Debit</th>\n' +
'        <th class="num">Credit</th>\n' +
'        <th class="num">Amount Due</th>\n' +
'      </tr>\n' +
'    </thead>\n' +
'    <tbody>\n' +
'      ' + bodyHtml + '\n' +
'    </tbody>\n' +
'  </table>\n' +
'</body>\n' +
'</html>';
}

/**
 * Generates clean CSV in the ledger format with UTF-8 BOM.
 */
export function generateLedgerCSV(data: LedgerReportData): string {
  const BOM = "\uFEFF";
  const custHeader = data.customerName
    ? "Customer: " + data.customerName + (data.customerCompany ? " (" + data.customerCompany + ")" : "")
    : data.reportTitle;

  const lines = [
    sanitizeCsv(data.companyName || "SANKALP IRRIGATION"),
    sanitizeCsv(custHeader),
    sanitizeCsv("Account Statement: " + data.periodStr),
    "",
    "Date,Particulars,Voucher Type,Voucher Number / Delivery Number,Debit,Credit,Amount Due",
  ];

  const openingDebit = Number(data.openingDebit) || 0;
  const openingCredit = Number(data.openingCredit) || 0;
  const netOpening = openingDebit - openingCredit;

  let periodDebit = 0;
  let periodCredit = 0;
  const isAllTime = (data.periodStr || "").toLowerCase().includes("all time");
  const openLabel = isAllTime ? "Original Opening Balance" : "Opening Balance";

  if (netOpening > 0) {
    lines.push(',"' + openLabel + ' [RECEIVABLE]",,,' + netOpening.toFixed(2) + ',,' + netOpening.toFixed(2));
  } else if (netOpening < 0) {
    lines.push(',"' + openLabel + ' [PAYABLE / ADVANCE]",,,,' + Math.abs(netOpening).toFixed(2) + ',0.00');
  } else {
    lines.push(',"' + openLabel + ' [NIL]",,,0.00,0.00,0.00');
  }

  for (const tx of data.entries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    periodDebit += d;
    periodCredit += c;

    const dueStr =
      tx.amountDue !== undefined && tx.amountDue !== null
        ? Number(tx.amountDue).toFixed(2)
        : d > 0
        ? d.toFixed(2)
        : "";

    lines.push(
      [
        sanitizeCsv(tx.date),
        sanitizeCsv(tx.particulars),
        sanitizeCsv(tx.vchType),
        sanitizeCsv(tx.vchNo),
        d > 0 ? d.toFixed(2) : "",
        c > 0 ? c.toFixed(2) : "",
        dueStr,
      ].join(",")
    );
  }

  const netClosing = netOpening + periodDebit - periodCredit;
  let closingDebit = 0;
  let closingCredit = 0;
  let closingDue = 0;
  if (netClosing > 0) {
    closingCredit = netClosing;
    closingDue = netClosing;
  } else if (netClosing < 0) {
    closingDebit = Math.abs(netClosing);
    closingDue = 0;
  }

  // Total Period Transactions
  lines.push(',"Total Period Transactions",,,' + periodDebit.toFixed(2) + ',' + periodCredit.toFixed(2) + ',');

  // Closing Balance
  if (netClosing > 0) {
    lines.push(',"Closing Balance [RECEIVABLE]",,,' + netClosing.toFixed(2) + ',,' + netClosing.toFixed(2));
  } else if (netClosing < 0) {
    lines.push(',"Closing Balance [PAYABLE / ADVANCE]",,,,,' + Math.abs(netClosing).toFixed(2) + ',0.00');
  } else {
    lines.push(',"Closing Balance [NIL]",,,0.00,0.00,0.00');
  }

  const grandDebit = (netOpening > 0 ? netOpening : 0) + periodDebit + closingDebit;
  const grandCredit = (netOpening < 0 ? Math.abs(netOpening) : 0) + periodCredit + closingCredit;
  const balancedTotal = Math.max(grandDebit, grandCredit);

  lines.push(',"Total",,,' + balancedTotal.toFixed(2) + ',' + balancedTotal.toFixed(2) + ',' + closingDue.toFixed(2));

  return BOM + lines.join("\n");
}

/**
 * Generates operational reports (inventory, production, delivery, profit)
 * matching the same clean, professional black-and-white print layout.
 */
export function generateOperationalPDF(data: OperationalReportData): string {
  const doc = new jsPDF({
    orientation: data.headers.length > 7 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  ensurePdfUnicodeFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  const columnStyles: Record<number, any> = {};
  if (data.numericColumnIndices) {
    for (const idx of data.numericColumnIndices) {
      columnStyles[idx] = { halign: "right" };
    }
  }

  const tableBody = data.totals ? [...data.rows, data.totals] : data.rows;

  autoTable(doc, {
    startY: 85,
    margin: { left: margin, right: margin, top: 85, bottom: 45 },
    head: [data.headers],
    body: tableBody,
    theme: "plain",
    showHead: "everyPage",
    styles: {
      font: "NotoSans",
      fontSize: 8,
      textColor: [0, 0, 0],
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      lineWidth: 0,
      lineColor: [0, 0, 0],
    },
    headStyles: {
      font: "NotoSans",
      fontStyle: "bold",
      fillColor: false,
      textColor: [0, 0, 0],
      lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
    },
    columnStyles,
    didParseCell: function (cellData) {
      if (data.totals && cellData.row.index === data.rows.length) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
      }
    },
    didDrawPage: function (pageInfo) {
      doc.setFont("NotoSans", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("NotoSans", "bold");
      doc.setFontSize(10);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - margin, pageHeight - 25, { align: "right" });
    },
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

/**
 * Generates operational reports Excel with black-and-white print styling.
 */
export function generateOperationalExcel(data: OperationalReportData): string {
  const BOM = "\uFEFF";
  let bodyHtml = "";

  for (const row of data.rows) {
    bodyHtml += "<tr>";
    row.forEach((v, idx) => {
      const isNum = data.numericColumnIndices?.includes(idx);
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  if (data.totals) {
    bodyHtml += '<tr class="total-row">';
    data.totals.forEach((v, idx) => {
      const isNum = data.numericColumnIndices?.includes(idx);
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }
    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }
    table { border-collapse: collapse; width: 100%; }
    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }
    th.num { text-align: right; }
    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }
    td.num { text-align: right; }
    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName)}</h2>
  <h3>${sanitizeExcel(data.reportTitle)}</h3>
  <p class="period">${sanitizeExcel(data.periodStr)}</p>
  <table>
    <thead>
      <tr>${data.headers.map((h, i) => `<th class="${data.numericColumnIndices?.includes(i) ? "num" : ""}">${sanitizeExcel(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Generates operational reports CSV with black-and-white header styling.
 */
export function generateOperationalCSV(data: OperationalReportData): string {
  const BOM = "\uFEFF";
  const lines: string[] = [
    sanitizeCsv(data.companyName),
    sanitizeCsv(data.reportTitle),
    sanitizeCsv(data.periodStr),
    "",
    data.headers.map(sanitizeCsv).join(","),
  ];

  for (const row of data.rows) {
    lines.push(row.map(sanitizeCsv).join(","));
  }

  if (data.totals) {
    lines.push(data.totals.map(sanitizeCsv).join(","));
  }

  return BOM + lines.join("\n");
}

export interface SalesReportExportData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  districtHeaders: string[];
  districtRows: any[][];
  districtTotals: any[];
  ledgerEntries: LedgerEntryRow[];
}

/**
 * Generates Sales Report PDF with:
 * Section 1: District-Wise Sales Summary
 * Section 2: Professional Sales Ledger with Carried Forward across pages.
 */
export function generateSalesLedgerPDF(data: SalesReportExportData): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  // PAGE 1: DISTRICT-WISE SALES SUMMARY (if any)
  let currentPage = 1;
  const hasDistrictSummary = data.districtRows && data.districtRows.length > 0;

  if (hasDistrictSummary) {
    autoTable(doc, {
      startY: 105,
      margin: { left: margin, right: margin, top: 105, bottom: 45 },
      head: [["District", "Orders", "Qty", "Taxable", "CGST", "SGST", "IGST", "Total Sales", "Received", "Due"]],
      body: [...data.districtRows, data.districtTotals],
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        textColor: [0, 0, 0],
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        lineWidth: 0,
        lineColor: [0, 0, 0],
      },
      headStyles: {
        fontStyle: "bold",
        fillColor: false,
        textColor: [0, 0, 0],
        lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
      },
      columnStyles: {
        0: { cellWidth: 85 },
        1: { halign: "right", cellWidth: 35 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
        9: { halign: "right" },
      },
      didParseCell: function (cellData) {
        if (cellData.row.index === data.districtRows.length) {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
        }
      },
    });

    // Header & Section title for Page 1
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(10);
    doc.text("Sales Report - District-Wise Sales Summary", pageWidth / 2, 50, { align: "center" });

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8.5);
    doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(9);
    doc.text("District-Wise Sales Summary", margin, 95);

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${currentPage}`, pageWidth - margin, pageHeight - 25, { align: "right" });

    currentPage++;
    doc.addPage();
  }

  // SALES LEDGER TRANSACTIONS SECTION
  const TX_PER_PAGE = 26;
  const entries = data.ledgerEntries || [];
  let txIndex = 0;
  let runningDebit = 0;
  let runningCredit = 0;
  let ledgerPageIdx = 0;

  const ledgerPagesData: string[][][] = [];

  while (txIndex < entries.length || (ledgerPageIdx === 0 && entries.length === 0)) {
    const pageRows: string[][] = [];
    const isFirstLedgerPage = ledgerPageIdx === 0;

    if (!isFirstLedgerPage) {
      pageRows.push([
        "",
        "Brought Forward",
        "",
        "",
        formatIndianCurrency(runningDebit, true),
        formatIndianCurrency(runningCredit, true),
      ]);
    }

    const currentBatch = entries.slice(txIndex, txIndex + TX_PER_PAGE);
    txIndex += TX_PER_PAGE;
    const isLastPage = txIndex >= entries.length;

    for (const tx of currentBatch) {
      const d = Number(tx.debit) || 0;
      const c = Number(tx.credit) || 0;
      runningDebit += d;
      runningCredit += c;

      pageRows.push([
        tx.date || "",
        tx.particulars || "",
        tx.vchType || "",
        tx.vchNo || "",
        formatIndianCurrency(tx.debit),
        formatIndianCurrency(tx.credit),
      ]);
    }

    if (!isLastPage) {
      pageRows.push([
        "",
        "Carried Forward",
        "",
        "",
        formatIndianCurrency(runningDebit, true),
        formatIndianCurrency(runningCredit, true),
      ]);
    } else {
      pageRows.push([
        "",
        "Total",
        "",
        "",
        formatIndianCurrency(runningDebit, true),
        formatIndianCurrency(runningCredit, true),
      ]);
    }

    ledgerPagesData.push(pageRows);
    ledgerPageIdx++;
  }

  for (let lp = 0; lp < ledgerPagesData.length; lp++) {
    if (lp > 0) doc.addPage();

    const rows = ledgerPagesData[lp];

    autoTable(doc, {
      startY: 85,
      margin: { left: margin, right: margin, top: 85, bottom: 45 },
      head: [["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"]],
      body: rows,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        textColor: [0, 0, 0],
        cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
        lineWidth: 0,
        lineColor: [0, 0, 0],
      },
      headStyles: {
        fontStyle: "bold",
        fillColor: false,
        textColor: [0, 0, 0],
        lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
      },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 70 },
        3: { cellWidth: 80 },
        4: { cellWidth: 75, halign: "right" },
        5: { cellWidth: 75, halign: "right" },
      },
      didParseCell: function (cellData) {
        const rawRow = cellData.row.raw as any;
        const rowText = String(Array.isArray(rawRow) ? rawRow[1] : (rawRow?.particulars || ""));
        if (rowText === "Total") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
        } else if (rowText === "Carried Forward" || rowText === "Brought Forward") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
        }
      },
    });

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(10);
    doc.text("Sales Ledger (Transactions)", pageWidth / 2, 50, { align: "center" });

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8.5);
    doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

    doc.setFont("NotoSans", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${currentPage}`, pageWidth - margin, pageHeight - 25, { align: "right" });
    currentPage++;
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

/**
 * Generates Sales Report Excel with District Summary and Sales Ledger.
 */
export function generateSalesLedgerExcel(data: SalesReportExportData): string {
  const BOM = "\uFEFF";
  let runningDebit = 0;
  let runningCredit = 0;

  let ledgerBodyHtml = "";
  for (const tx of data.ledgerEntries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    runningDebit += d;
    runningCredit += c;

    ledgerBodyHtml += `<tr>
      <td>${sanitizeExcel(tx.date)}</td>
      <td>${sanitizeExcel(tx.particulars)}</td>
      <td>${sanitizeExcel(tx.vchType)}</td>
      <td>${sanitizeExcel(tx.vchNo)}</td>
      <td class="num">${d > 0 ? d.toFixed(2) : ""}</td>
      <td class="num">${c > 0 ? c.toFixed(2) : ""}</td>
    </tr>`;
  }

  ledgerBodyHtml += `<tr class="total-row">
    <td></td>
    <td>Total</td>
    <td></td>
    <td></td>
    <td class="num">${runningDebit.toFixed(2)}</td>
    <td class="num">${runningCredit.toFixed(2)}</td>
  </tr>`;

  let districtTableHtml = "";
  if (data.districtRows && data.districtRows.length > 0) {
    districtTableHtml = `
    <h3 style="margin-top: 24px; text-align: left;">District-Wise Sales Summary</h3>
    <table>
      <thead>
        <tr>${data.districtHeaders.map((h) => `<th>${sanitizeExcel(h)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${data.districtRows.map((r) => `<tr>${r.map((c) => `<td>${sanitizeExcel(c)}</td>`).join("")}</tr>`).join("")}
        <tr class="total-row">${data.districtTotals.map((c) => `<td>${sanitizeExcel(c)}</td>`).join("")}</tr>
      </tbody>
    </table>
    <h3 style="margin-top: 28px; text-align: left;">Sales Ledger (Transactions)</h3>
    `;
  }

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }
    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }
    th.num { text-align: right; }
    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }
    td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.00"; }
    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName)}</h2>
  <h3>Sales Report &amp; Ledger</h3>
  <p class="period">${sanitizeExcel(data.periodStr)}</p>
  ${districtTableHtml}
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Particulars</th>
        <th>Vch Type</th>
        <th>Vch No.</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
      </tr>
    </thead>
    <tbody>
      ${ledgerBodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Generates Sales Report CSV with District Summary and Sales Ledger.
 */
export function generateSalesLedgerCSV(data: SalesReportExportData): string {
  const BOM = "\uFEFF";
  const lines: string[] = [
    sanitizeCsv(data.companyName),
    "Sales Report & Ledger",
    sanitizeCsv(data.periodStr),
    "",
  ];

  if (data.districtRows && data.districtRows.length > 0) {
    lines.push('"--- DISTRICT-WISE SALES SUMMARY ---"');
    lines.push(data.districtHeaders.map(sanitizeCsv).join(","));
    for (const row of data.districtRows) {
      lines.push(row.map(sanitizeCsv).join(","));
    }
    lines.push(data.districtTotals.map(sanitizeCsv).join(","));
    lines.push("");
    lines.push('"--- SALES LEDGER (TRANSACTIONS) ---"');
  }

  lines.push("Date,Particulars,Vch Type,Vch No.,Debit,Credit");

  let runningDebit = 0;
  let runningCredit = 0;

  for (const tx of data.ledgerEntries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    runningDebit += d;
    runningCredit += c;

    lines.push(
      [
        sanitizeCsv(tx.date),
        sanitizeCsv(tx.particulars),
        sanitizeCsv(tx.vchType),
        sanitizeCsv(tx.vchNo),
        d > 0 ? d.toFixed(2) : "",
        c > 0 ? c.toFixed(2) : "",
      ].join(",")
    );
  }

  lines.push(`,"Total",,,${runningDebit.toFixed(2)},${runningCredit.toFixed(2)}`);

  return BOM + lines.join("\n");
}

// ============================================
// STATE-WISE SALES & GST REPORT FORMATTERS
// ============================================

export interface StateWiseGstReportData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  headers: string[];
  rows: any[][];
  totals: any[];
}

export function generateStateWiseGstCSV(data: StateWiseGstReportData): string {
  const BOM = "\uFEFF";
  const lines: string[] = [
    sanitizeCsv(data.companyName),
    sanitizeCsv(data.reportTitle),
    sanitizeCsv(data.periodStr),
    "",
    data.headers.map(sanitizeCsv).join(","),
  ];

  for (const row of data.rows) {
    lines.push(row.map(sanitizeCsv).join(","));
  }

  if (data.totals) {
    lines.push(data.totals.map(sanitizeCsv).join(","));
  }

  return BOM + lines.join("\n");
}

export function generateStateWiseGstExcel(data: StateWiseGstReportData): string {
  const BOM = "\uFEFF";
  let bodyHtml = "";

  for (const row of data.rows) {
    bodyHtml += "<tr>";
    row.forEach((v, idx) => {
      const isNum = idx >= 5;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  if (data.totals) {
    bodyHtml += '<tr class="total-row">';
    data.totals.forEach((v, idx) => {
      const isNum = idx >= 5;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }
    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }
    th.num { text-align: right; }
    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }
    td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.00"; }
    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName)}</h2>
  <h3>${sanitizeExcel(data.reportTitle)}</h3>
  <p class="period">${sanitizeExcel(data.periodStr)}</p>
  <table>
    <thead>
      <tr>${data.headers.map((h, i) => `<th class="${i >= 5 ? "num" : ""}">${sanitizeExcel(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

export function generateStateWiseGstPDF(data: StateWiseGstReportData): string {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;

  // Format headers specifically for PDF with clean 2-line wraps to guarantee zero overlap
  const pdfHeaders = data.headers.map((h) => {
    if (h.includes("Amount Paid")) return "Amount Paid\n(₹)";
    if (h.includes("Amount Due")) return "Amount Due\n(₹)";
    if (h === "Taxable Amount") return "Taxable\nAmount";
    if (h === "Dealer Name & Address") return "Dealer Name\n& Address";
    if (h === "GST Number") return "GST\nNumber";
    return h;
  });

  autoTable(doc, {
    startY: 85,
    margin: { left: margin, right: margin, top: 85, bottom: 40 },
    head: [pdfHeaders],
    body: [...data.rows, data.totals],
    theme: "plain",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      textColor: [0, 0, 0],
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
      lineWidth: 0,
      lineColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: false,
      textColor: [0, 0, 0],
      lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
      valign: "bottom",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 26 }, // Sr. No
      1: { cellWidth: 54 }, // District
      // Col 2: Dealer Name & Address flexes naturally to fill available space (~195 pt)
      3: { cellWidth: 72 }, // GST number
      4: { halign: "center", cellWidth: 42 }, // Month
      5: { halign: "right", cellWidth: 60 }, // Taxable Amount
      6: { halign: "right", cellWidth: 46 }, // IGST
      7: { halign: "right", cellWidth: 46 }, // CGST
      8: { halign: "right", cellWidth: 46 }, // SGST
      9: { halign: "right", cellWidth: 32 }, // Cess
      10: { halign: "right", cellWidth: 62 }, // Total
      11: { halign: "right", cellWidth: 62 }, // Amount Paid
      12: { halign: "right", cellWidth: 62 }, // Amount Due
    },
    didParseCell: function (cellData) {
      if (cellData.row.index === data.rows.length) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
      }
    },
    didDrawPage: function (pageInfo) {
      doc.setFont("NotoSans", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("NotoSans", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

// ============================================
// SALE DETAILS / PRODUCT-WISE REPORT FORMATTERS
// ============================================

export interface SaleDetailsProductWiseData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  fixedHeaders: string[]; // ["Sr. No.", "District", "Dealer Name & Address", "GST Number", "Bill No.", "Bill Date"]
  products: { id: string; name: string; sku: string | null }[];
  rows: any[][];
  totals: any[];
}

export function generateSaleDetailsProductWiseCSV(data: SaleDetailsProductWiseData): string {
  const BOM = "\uFEFF";
  const numProducts = data.products.length;

  const topHeader = ["", "", "", "", "", "", "Sale Details", ...new Array(numProducts).fill("")];
  const subHeader = [
    "Sr. No.",
    "District",
    "Dealer Name & Address",
    "GST Number",
    "Bill No.",
    "Bill Date",
    ...data.products.map((p) => p.name),
    "Total Qty",
  ];

  const lines: string[] = [
    sanitizeCsv(data.companyName),
    sanitizeCsv(data.reportTitle),
    sanitizeCsv(data.periodStr),
    "",
    topHeader.map(sanitizeCsv).join(","),
    subHeader.map(sanitizeCsv).join(","),
  ];

  for (const row of data.rows) {
    lines.push(row.map(sanitizeCsv).join(","));
  }

  if (data.totals) {
    lines.push(data.totals.map(sanitizeCsv).join(","));
  }

  return BOM + lines.join("\n");
}

export function generateSaleDetailsProductWiseExcel(data: SaleDetailsProductWiseData): string {
  const BOM = "\uFEFF";
  const numProducts = data.products.length;

  let bodyHtml = "";
  for (const row of data.rows) {
    bodyHtml += "<tr>";
    row.forEach((v, idx) => {
      const isNum = idx >= 6;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  if (data.totals) {
    bodyHtml += '<tr class="total-row">';
    data.totals.forEach((v, idx) => {
      const isNum = idx >= 6;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }
    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }
    th.num { text-align: right; }
    th.center { text-align: center; }
    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }
    td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0"; }
    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName)}</h2>
  <h3>${sanitizeExcel(data.reportTitle)}</h3>
  <p class="period">${sanitizeExcel(data.periodStr)}</p>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Sr. No.</th>
        <th rowspan="2">District</th>
        <th rowspan="2">Dealer Name &amp; Address</th>
        <th rowspan="2">GST Number</th>
        <th rowspan="2">Bill No.</th>
        <th rowspan="2">Bill Date</th>
        <th colspan="${Math.max(1, numProducts + 1)}" class="center" style="background-color: #f1f5f9;">Sale Details</th>
      </tr>
      <tr>
        ${data.products.map((p) => `<th class="num">${sanitizeExcel(p.name)}</th>`).join("")}
        <th class="num">Total Qty</th>
      </tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

export function generateSaleDetailsProductWisePDF(data: SaleDetailsProductWiseData): string {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const usableWidth = pageWidth - margin * 2; // ~805.89 pt

  const numProducts = data.products.length;
  const totalCols = 6 + numProducts + 1;

  const fontSize =
    numProducts === 1
      ? 7.6
      : totalCols > 16
      ? 5.8
      : totalCols > 12
      ? 6.4
      : totalCols > 9
      ? 6.8
      : 7.2;

  const headRow1: any[] = [
    { content: "Sr. No.", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "District", rowSpan: 2, styles: { valign: "middle" } },
    { content: "Dealer Name & Address", rowSpan: 2, styles: { valign: "middle" } },
    { content: "GST Number", rowSpan: 2, styles: { valign: "middle" } },
    { content: "Bill No.", rowSpan: 2, styles: { valign: "middle" } },
    { content: "Bill Date", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    {
      content: "Sale Details",
      colSpan: Math.max(1, numProducts + 1),
      styles: { halign: "center", valign: "middle", fontStyle: "bold" },
    },
  ];

  const headRow2: any[] = [
    ...data.products.map((p) => {
      let label = p.name;
      return { content: label, styles: { halign: "right", valign: "bottom" } };
    }),
    { content: "Total\nQty", styles: { halign: "right", valign: "bottom", fontStyle: "bold" } },
  ];

  const srWidth = 24;
  const distWidth = numProducts === 1 ? 62 : totalCols > 14 ? 46 : 52;
  const gstWidth = numProducts === 1 ? 84 : totalCols > 14 ? 60 : 68;
  const billNoWidth = numProducts === 1 ? 62 : totalCols > 14 ? 50 : 56;
  const billDateWidth = numProducts === 1 ? 48 : totalCols > 14 ? 40 : 44;
  const totalQtyWidth = numProducts === 1 ? 55 : totalCols > 14 ? 38 : 42;

  const fixedNonDealerNonProduct =
    srWidth + distWidth + gstWidth + billNoWidth + billDateWidth + totalQtyWidth;
  const remainingForDealerAndProducts = usableWidth - fixedNonDealerNonProduct;

  const productColWidth =
    numProducts === 1
      ? 85
      : numProducts > 0
      ? Math.max(32, Math.min(80, Math.floor((remainingForDealerAndProducts - 140) / numProducts)))
      : 0;

  const colStyles: Record<number, any> = {
    0: { halign: "center", cellWidth: srWidth },
    1: { cellWidth: distWidth },
    // Col 2: Dealer Name & Address flexes naturally
    3: { cellWidth: gstWidth },
    4: { cellWidth: billNoWidth },
    5: { halign: "center", cellWidth: billDateWidth },
  };

  for (let i = 0; i < numProducts; i++) {
    colStyles[6 + i] = { halign: "right", cellWidth: productColWidth };
  }
  colStyles[6 + numProducts] = { halign: "right", cellWidth: totalQtyWidth };

  autoTable(doc, {
    startY: 85,
    margin: { left: margin, right: margin, top: 85, bottom: 40 },
    head: [headRow1, headRow2],
    body: [...data.rows, data.totals],
    theme: "plain",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize,
      textColor: [0, 0, 0],
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
      lineWidth: 0,
      lineColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: false,
      textColor: [0, 0, 0],
      lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
    },
    columnStyles: colStyles,
    didParseCell: function (cellData) {
      if (cellData.row.index === data.rows.length) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
      }
    },
    didDrawPage: function (pageInfo) {
      doc.setFont("NotoSans", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("NotoSans", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

// ============================================
// DETAILED SALES TRANSACTIONS REPORT FORMATTERS
// ============================================

export interface DetailedSalesTransactionsData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  headers: string[];
  productStartIndex: number;
  rows: any[][];
  totals: any[];
}

export function generateDetailedSalesCSV(data: DetailedSalesTransactionsData): string {
  const BOM = "\uFEFF";
  const lines: string[] = [
    sanitizeCsv(data.companyName),
    sanitizeCsv(data.reportTitle),
    sanitizeCsv(data.periodStr),
    "",
    data.headers.map(sanitizeCsv).join(","),
  ];

  for (const row of data.rows) {
    lines.push(row.map(sanitizeCsv).join(","));
  }

  if (data.totals) {
    lines.push(data.totals.map(sanitizeCsv).join(","));
  }

  return BOM + lines.join("\n");
}

export function generateDetailedSalesExcel(data: DetailedSalesTransactionsData): string {
  const BOM = "\uFEFF";
  let bodyHtml = "";

  for (const row of data.rows) {
    bodyHtml += "<tr>";
    row.forEach((v, idx) => {
      const isNum = idx >= data.productStartIndex;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  if (data.totals) {
    bodyHtml += '<tr class="total-row">';
    data.totals.forEach((v, idx) => {
      const isNum = idx >= data.productStartIndex;
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(v)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 4px 0; text-align: center; }
    .period { font-size: 9pt; margin: 2px 0 16px 0; text-align: center; color: #333333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-weight: bold; text-align: left; padding: 6px; }
    th.num { text-align: right; }
    td { padding: 4px 6px; border-bottom: 0.5pt solid #f0f0f0; }
    td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.00"; }
    .total-row { font-weight: bold; border-top: 1pt solid #000000; border-bottom: 2pt double #000000; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName)}</h2>
  <h3>${sanitizeExcel(data.reportTitle)}</h3>
  <p class="period">${sanitizeExcel(data.periodStr)}</p>
  <table>
    <thead>
      <tr>${data.headers.map((h, i) => `<th class="${i >= data.productStartIndex ? "num" : ""}">${sanitizeExcel(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

export function generateDetailedSalesPDF(data: LedgerReportData | DetailedSalesTransactionsData): string {
  if ("entries" in data) {
    return generateLedgerPDF(data);
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const usableWidth = pageWidth - margin * 2; // ~805.89 pt

  const totalCols = data.headers.length;
  // Non-product columns: 6 leading (Sr, Dist, Dealer, GST, Bill No, Bill Date) + 4 trailing (Total Qty, Bill Amt, Paid, Due)
  const numProducts = Math.max(0, totalCols - 10);

  // Dynamic font sizing based on column count
  const fontSize = totalCols > 16 ? 5.8 : totalCols > 13 ? 6.4 : totalCols > 10 ? 6.8 : 7.2;

  // Format headers specifically for PDF with clean multiline labels to prevent overlap
  const pdfHeaders = data.headers.map((h) => {
    if (h.includes("Amount Paid")) return "Amount Paid\n(₹)";
    if (h.includes("Amount Due")) return "Amount Due\n(₹)";
    if (h === "Bill Amount") return "Bill\nAmount";
    if (h === "Total Qty") return "Total\nQty";
    if (h === "Bill Number") return "Bill\nNumber";
    if (h === "Bill Date") return "Bill\nDate";
    if (h === "GST Number") return "GST\nNumber";
    if (h === "Dealer Name & Address") return "Dealer Name\n& Address";
    if (h.includes(" (") && h.length > 18) {
      const idx = h.lastIndexOf(" (");
      return h.substring(0, idx) + "\n" + h.substring(idx + 1);
    }
    return h;
  });

  // Calculate proportional column widths
  const srWidth = 24;
  const distWidth = totalCols > 16 ? 44 : 50;
  const gstWidth = totalCols > 16 ? 58 : 66;
  const billNoWidth = totalCols > 16 ? 48 : 52;
  const billDateWidth = totalCols > 16 ? 38 : 42;
  const totalQtyWidth = totalCols > 16 ? 36 : 40;
  const billAmtWidth = totalCols > 16 ? 54 : 58;
  const paidWidth = totalCols > 16 ? 54 : 58;
  const dueWidth = totalCols > 16 ? 54 : 58;

  const fixedExceptDealer =
    srWidth + distWidth + gstWidth + billNoWidth + billDateWidth +
    totalQtyWidth + billAmtWidth + paidWidth + dueWidth;

  const remainingForDealerAndProducts = usableWidth - fixedExceptDealer;

  // Allocate product width (leave at least 95pt for dealer name & address)
  const productColWidth = numProducts > 0
    ? Math.max(26, Math.min(65, Math.floor((remainingForDealerAndProducts - 95) / numProducts)))
    : 0;

  const colStyles: Record<number, any> = {
    0: { halign: "center", cellWidth: srWidth },
    1: { cellWidth: distWidth },
    // Col 2: Dealer Name & Address flexes naturally to fill remaining space
    3: { cellWidth: gstWidth },
    4: { cellWidth: billNoWidth },
    5: { halign: "center", cellWidth: billDateWidth },
  };

  // Product columns
  for (let c = data.productStartIndex; c < data.productStartIndex + numProducts; c++) {
    colStyles[c] = { halign: "right", cellWidth: productColWidth };
  }

  // Trailing summary columns: Total Qty, Bill Amount, Amount Paid, Amount Due
  const totalQtyCol = totalCols - 4;
  const billAmtCol = totalCols - 3;
  const paidCol = totalCols - 2;
  const dueCol = totalCols - 1;

  colStyles[totalQtyCol] = { halign: "right", cellWidth: totalQtyWidth };
  colStyles[billAmtCol] = { halign: "right", cellWidth: billAmtWidth };
  colStyles[paidCol] = { halign: "right", cellWidth: paidWidth };
  colStyles[dueCol] = { halign: "right", cellWidth: dueWidth };

  autoTable(doc, {
    startY: 85,
    margin: { left: margin, right: margin, top: 85, bottom: 40 },
    head: [pdfHeaders],
    body: [...data.rows, data.totals],
    theme: "plain",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize,
      textColor: [0, 0, 0],
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      lineWidth: 0,
      lineColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: false,
      textColor: [0, 0, 0],
      lineWidth: { top: 0.75, bottom: 0.75, left: 0, right: 0 },
      valign: "bottom",
    },
    columnStyles: colStyles,
    didParseCell: function (cellData) {
      if (cellData.row.index === data.rows.length) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
      }
    },
    didDrawPage: function (pageInfo) {
      doc.setFont("NotoSans", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("NotoSans", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

// ============================================
// 7. DETAILED SALES TRANSACTIONS (8-COLUMN TABLE EXPORT)
// Exact columns: ORDER #, DATE, CUSTOMER, DISTRICT, PRODUCT, QUALITY STANDARD, QTY, IS:498
// ============================================

export interface DetailedSalesTableData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  activeFiltersStr?: string;
  totalRecords: number;
  headers: string[]; // ["ORDER #", "DATE", "CUSTOMER", "DISTRICT", "PRODUCT", "QUALITY STANDARD", "QTY", "IS:498"]
  rows: (string | number)[][];
  totals: (string | number)[];
}

/**
 * Generates UTF-8 CSV with BOM for Detailed Sales Transactions (exact 8-column table structure).
 */
export function generateDetailedSalesTableCSV(data: DetailedSalesTableData): string {
  const BOM = "\uFEFF";
  const headerLine = data.headers.map(sanitizeCsv).join(",");
  const dataLines = data.rows.map((row) => row.map(sanitizeCsv).join(",")).join("\n");
  let result = BOM + headerLine + "\n" + dataLines;
  if (data.totals && data.totals.length > 0) {
    const totalsLine = data.totals.map(sanitizeCsv).join(",");
    result += "\n" + totalsLine;
  }
  return result;
}

/**
 * Generates genuine .xlsx binary workbook base64 for Detailed Sales Transactions (exact 8-column table).
 * Preserves bold headers, autofilter, frozen header row, and numeric quantities.
 */
export function generateDetailedSalesTableXLSX(data: DetailedSalesTableData): string {
  const wb = XLSX.utils.book_new();
  const aoa = [data.headers, ...data.rows, data.totals];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths matching content
  ws["!cols"] = [
    { wch: 16 }, // ORDER #
    { wch: 14 }, // DATE
    { wch: 32 }, // CUSTOMER
    { wch: 18 }, // DISTRICT
    { wch: 34 }, // PRODUCT
    { wch: 24 }, // QUALITY STANDARD
    { wch: 14 }, // QTY
    { wch: 14 }, // IS:498
  ];

  // Auto-filter enabled on data rows
  ws["!autofilter"] = { ref: `A1:H${data.rows.length + 1}` };

  // Freeze header row
  ws["!views"] = [{ state: "frozen", ySplit: 1 }];

  XLSX.utils.book_append_sheet(wb, ws, "Detailed Sales");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

/**
 * Generates professional Landscape A4 PDF base64 for Detailed Sales Transactions (exact 8-column table).
 * Header repeated on every page, page numbers (Page X of Y), and company branding.
 */
export function generateDetailedSalesTablePDF(data: DetailedSalesTableData): string {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  const pdfDataRows = data.rows.map((r) => [
    r[0],
    r[1],
    r[2],
    r[3],
    r[4],
    r[5],
    formatIndianCurrency(r[6], true),
    formatIndianCurrency(r[7], true),
  ]);

  const pdfTotalsRow = [
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    formatIndianCurrency(data.totals[6], true),
    formatIndianCurrency(data.totals[7], true),
  ];

  autoTable(doc, {
    startY: 72,
    margin: { left: margin, right: margin, top: 72, bottom: 35 },
    head: [data.headers],
    body: pdfDataRows,
    foot: [pdfTotalsRow],
    theme: "grid",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 4,
      overflow: "linebreak",
      lineWidth: 0.5,
      lineColor: [226, 232, 240],
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [15, 118, 110], // #0F766E
      textColor: [255, 255, 255],
      lineWidth: 0.5,
      lineColor: [13, 101, 94],
      halign: "left",
    },
    tableWidth: pageWidth - margin * 2,
    columnStyles: {
      0: { halign: "center", cellWidth: 60 },
      1: { halign: "center", cellWidth: 55 },
      2: { halign: "left" },
      3: { halign: "left", cellWidth: 75 },
      4: { halign: "left" },
      5: { halign: "left", cellWidth: 90 },
      6: { halign: "right", cellWidth: 58 },
      7: { halign: "right", cellWidth: 55 },
    },
    footStyles: {
      fontStyle: "bold",
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineWidth: 0.5,
      lineColor: [203, 213, 225],
    },
    didDrawPage: function (pageInfo) {
      // Header
      doc.setFont("NotoSans", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(data.companyName || "SANKALP IRRIGATION", pageWidth / 2, 26, { align: "center" });

      doc.setFont("NotoSans", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 118, 110);
      doc.text(data.reportTitle || "DETAILED SALES TRANSACTIONS", pageWidth / 2, 42, { align: "center" });

      doc.setFont("NotoSans", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const subheader = [
        `Generated: ${new Date().toLocaleDateString("en-IN")}`,
        data.activeFiltersStr || `Period: ${data.periodStr}`,
        `Total Records: ${data.totalRecords}`,
      ]
        .filter(Boolean)
        .join("   |   ");
      doc.text(subheader, pageWidth / 2, 56, { align: "center" });
    },
  });

  // Page numbering in footer on every page
  const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated on ${new Date().toLocaleString("en-IN")}   |   Confidential - For Internal Use Only`,
      margin,
      pageHeight - 16
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 16,
      { align: "right" }
    );
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}


// ====================================================================
// CUSTOMER OUTSTANDING & DUE REPORT EXPORT GENERATORS
// ====================================================================

export interface CustomerOutstandingReportData {
  companyName: string;
  reportTitle: string;
  periodStr: string;
  activeFiltersStr?: string;
  totalRecords: number;
  headers: string[];
  rows: any[][];
  totals?: any[];
  totalDueAmount?: number;
  totalCustomerAdvance?: number;
  invoiceRows?: {
    order_id: string;
    invoice_number: string;
    invoice_date: string;
    customer_id: string;
    customer_name: string;
    customer_company: string | null;
    bill_amount: number;
    paid_amount: number;
    credit_notes: number;
    pending_due: number;
  }[];
}

/**
 * Generates a high-quality Landscape A4 PDF base64 for Customer Outstanding & Due Report.
 * Displays separate, positive monetary columns for Opening Receivable and Opening Credit.
 */
export function generateCustomerOutstandingReportPDF(data: CustomerOutstandingReportData): string {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });
  ensurePdfUnicodeFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();   // 841.89 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 595.28 pt
  const margin = 47; // Centers 748 pt table on 842 pt page (842 - 748 = 94 / 2 = 47 pt)

  // Compute total due & advance if not explicitly provided
  let totalDue = data.totalDueAmount;
  let totalAdv = data.totalCustomerAdvance;
  if (totalDue === undefined || totalAdv === undefined) {
    totalDue = 0;
    totalAdv = 0;
    for (const r of data.rows) {
      totalDue += Number(r[7] || 0);
      totalAdv += Number(r[8] || 0);
    }
  }

  const pdfHeaders = [
    "Customer",
    "Company",
    "Phone",
    "Opening\nReceivable",
    "Opening\nCredit",
    "Period\nSales",
    "Payments\nReceived",
    "Total Due\nAmount",
    "Customer\nAdvance",
    "Last Payment\nDate",
    "Last\nPayment",
    "Credit\nLimit",
    "Terms",
  ];

  const pdfRows = data.rows.map((r) => [
    r[0] || "—",
    r[1] || "—",
    r[2] || "—",
    formatIndianCurrencyWithSymbol(r[3], true),
    formatIndianCurrencyWithSymbol(r[4], true),
    formatIndianCurrencyWithSymbol(r[5], true),
    formatIndianCurrencyWithSymbol(r[6], true),
    formatIndianCurrencyWithSymbol(r[7], true),
    formatIndianCurrencyWithSymbol(r[8], true),
    r[9] ? (String(r[9]).includes("-") ? formatLedgerDate(r[9] as string) : String(r[9])) : "—",
    formatIndianCurrencyWithSymbol(r[10], true),
    formatIndianCurrencyWithSymbol(r[11], true),
    r[12] || "—",
  ]);

  let pdfFoot: string[][] | undefined = undefined;
  if (data.totals && data.totals.length > 0) {
    pdfFoot = [[
      "TOTALS",
      `${data.totalRecords} Customers`,
      "",
      formatIndianCurrencyWithSymbol(data.totals[3], true),
      formatIndianCurrencyWithSymbol(data.totals[4], true),
      formatIndianCurrencyWithSymbol(data.totals[5], true),
      formatIndianCurrencyWithSymbol(data.totals[6], true),
      formatIndianCurrencyWithSymbol(data.totals[7], true),
      formatIndianCurrencyWithSymbol(data.totals[8], true),
      "",
      formatIndianCurrencyWithSymbol(data.totals[10], true),
      formatIndianCurrencyWithSymbol(data.totals[11], true),
      "",
    ]];
  }

  // Draw Table 1: Customer-wise Due Details
  autoTable(doc, {
    startY: 112,
    margin: { left: margin, right: margin, top: 62, bottom: 35 },
    head: [pdfHeaders],
    body: pdfRows.length > 0 ? pdfRows : [["No customer records found matching the selected filters.", "", "", "", "", "", "", "", "", "", "", "", ""]],
    foot: pdfFoot,
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    tableWidth: 748,
    styles: {
      font: "NotoSans",
      fontSize: 6.8,
      textColor: [30, 41, 59],
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
      overflow: "linebreak",
      lineWidth: 0.4,
      lineColor: [226, 232, 240],
      valign: "middle",
    },
    headStyles: {
      font: "NotoSans",
      fontStyle: "bold",
      fontSize: 7.2,
      fillColor: [15, 118, 110], // Sankalp Teal #0F766E
      textColor: [255, 255, 255],
      lineWidth: 0.5,
      lineColor: [13, 101, 94],
      halign: "left",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 90, halign: "left" },    // Customer
      1: { cellWidth: 78, halign: "left" },    // Company
      2: { cellWidth: 46, halign: "center" },  // Phone
      3: { cellWidth: 57, halign: "right" },   // Opening Receivable
      4: { cellWidth: 56, halign: "right" },   // Opening Credit
      5: { cellWidth: 57, halign: "right" },   // Period Sales
      6: { cellWidth: 57, halign: "right" },   // Payments Received
      7: { cellWidth: 57, halign: "right", fontStyle: "bold", textColor: [180, 30, 30] }, // Total Due Amount
      8: { cellWidth: 56, halign: "right", textColor: [15, 118, 110] }, // Customer Advance
      9: { cellWidth: 46, halign: "center" },  // Last Payment Date
      10: { cellWidth: 54, halign: "right" },  // Last Payment
      11: { cellWidth: 54, halign: "right" },  // Credit Limit
      12: { cellWidth: 40, halign: "center" }, // Terms
    },
    footStyles: {
      font: "NotoSans",
      fontStyle: "bold",
      fontSize: 6.8,
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineWidth: 0.5,
      lineColor: [203, 213, 225],
      valign: "middle",
    },
    didDrawPage: function (pageInfo) {
      if (pageInfo.pageNumber === 1) {
        // Page 1 Header Branding & Executive KPI Summary Cards
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(data.companyName || "SANKALP IRRIGATION", pageWidth / 2, 20, { align: "center" });

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(15, 118, 110);
        doc.text(data.reportTitle || "CUSTOMER DUE & OUTSTANDING REPORT", pageWidth / 2, 33, { align: "center" });

        doc.setFont("NotoSans", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const subheader = [
          `Generated: ${new Date().toLocaleDateString("en-IN")}`,
          data.periodStr ? `Period: ${data.periodStr}` : null,
          data.activeFiltersStr || null,
          `Total Customers: ${data.totalRecords}`,
        ]
          .filter(Boolean)
          .join("   |   ");
        doc.text(subheader, pageWidth / 2, 44, { align: "center" });

        // Executive KPI Cards
        const cardWidth = 220;
        const cardHeight = 44;
        const cardY = 54;
        const card1X = (pageWidth / 2) - cardWidth - 16;
        const card2X = (pageWidth / 2) + 16;

        // Card 1: TOTAL DUE AMOUNT
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.roundedRect(card1X, cardY, cardWidth, cardHeight, 4, 4, "FD");

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(185, 28, 28);
        doc.text("TOTAL DUE AMOUNT (ALL PENDING DUES)", card1X + 12, cardY + 16);

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(13);
        doc.setTextColor(153, 27, 27);
        doc.text(formatINR(totalDue, true), card1X + 12, cardY + 35);

        // Card 2: TOTAL CUSTOMER ADVANCE
        doc.setFillColor(240, 253, 250);
        doc.setDrawColor(153, 246, 228);
        doc.roundedRect(card2X, cardY, cardWidth, cardHeight, 4, 4, "FD");

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(15, 118, 110);
        doc.text("TOTAL CUSTOMER ADVANCE (EXCESS RECEIPTS)", card2X + 12, cardY + 16);

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(13);
        doc.setTextColor(17, 94, 89);
        doc.text(formatINR(totalAdv, true), card2X + 12, cardY + 35);

        // Subheading for Table 1
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text("1. CUSTOMER-WISE DUE DETAILS", margin, 106);
      } else {
        // Subsequent Pages Header
        doc.setFont("NotoSans", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(data.companyName || "SANKALP IRRIGATION", margin, 24);

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 118, 110);
        doc.text(`${data.reportTitle || "CUSTOMER DUE REPORT"} - Continued`, margin, 37);

        doc.setFont("NotoSans", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Period: ${data.periodStr}   |   Total Records: ${data.totalRecords}`, margin, 48);

        doc.setFont("NotoSans", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text("1. CUSTOMER-WISE DUE DETAILS (Contd.)", margin, 58);
      }
    },
  });

  // Draw Table 2: Invoice-wise Pending Due Details
  if (data.invoiceRows && data.invoiceRows.length > 0) {
    let finalY = (doc as any).lastAutoTable.finalY + 26;

    if (finalY + 110 > pageHeight - 35) {
      doc.addPage();
      finalY = 62;
    }

    doc.setFont("NotoSans", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text("2. INVOICE-WISE PENDING DUE DETAILS", margin, finalY - 8);

    const invHeaders = [
      "Invoice / Order #",
      "Date",
      "Customer Name",
      "Company",
      "Bill Amount",
      "Payments\nAllocated",
      "Credit Notes\n/ Adj",
      "Pending Due\nAmount",
    ];

    const invRows = data.invoiceRows.map((inv) => [
      inv.invoice_number,
      formatLedgerDate(inv.invoice_date),
      inv.customer_name,
      inv.customer_company || "—",
      formatINR(inv.bill_amount, true),
      formatINR(inv.paid_amount, true),
      formatINR(inv.credit_notes, true),
      formatINR(inv.pending_due, true),
    ]);

    const totBill = data.invoiceRows.reduce((sum, r) => sum + Number(r.bill_amount || 0), 0);
    const totPaid = data.invoiceRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const totCred = data.invoiceRows.reduce((sum, r) => sum + Number(r.credit_notes || 0), 0);
    const totDue = data.invoiceRows.reduce((sum, r) => sum + Number(r.pending_due || 0), 0);

    const invFoot = [[
      "TOTALS",
      `${data.invoiceRows.length} Pending Invoices`,
      "",
      "",
      formatINR(totBill, true),
      formatINR(totPaid, true),
      formatINR(totCred, true),
      formatINR(totDue, true),
    ]];

    autoTable(doc, {
      startY: finalY,
      margin: { left: margin, right: margin, top: 62, bottom: 35 },
      head: [invHeaders],
      body: invRows,
      foot: invFoot,
      theme: "grid",
      showHead: "everyPage",
      showFoot: "lastPage",
      tableWidth: 748,
      styles: {
        font: "NotoSans",
        fontSize: 7.2,
        textColor: [30, 41, 59],
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
        overflow: "linebreak",
        lineWidth: 0.4,
        lineColor: [226, 232, 240],
        valign: "middle",
      },
      headStyles: {
        font: "NotoSans",
        fontStyle: "bold",
        fontSize: 7.5,
        fillColor: [30, 41, 59], // Dark Slate #1E293B
        textColor: [255, 255, 255],
        lineWidth: 0.5,
        lineColor: [15, 23, 42],
        halign: "left",
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: 78, halign: "left", fontStyle: "bold" },
        1: { cellWidth: 55, halign: "center" },
        2: { cellWidth: 135, halign: "left" },
        3: { cellWidth: 120, halign: "left" },
        4: { cellWidth: 90, halign: "right" },
        5: { cellWidth: 90, halign: "right" },
        6: { cellWidth: 80, halign: "right" },
        7: { cellWidth: 100, halign: "right", fontStyle: "bold", textColor: [180, 30, 30] },
      },
      footStyles: {
        font: "NotoSans",
        fontStyle: "bold",
        fontSize: 7.2,
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        lineWidth: 0.5,
        lineColor: [203, 213, 225],
        valign: "middle",
      },
    });
  }

  // Page numbering in footer on every page
  const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated on ${new Date().toLocaleString("en-IN")}   |   Confidential - For Internal Use Only`,
      margin,
      pageHeight - 16
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 16,
      { align: "right" }
    );
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

/**
 * Generates an Excel-compatible HTML spreadsheet for Customer Outstanding & Due Report.
 */
export function generateCustomerOutstandingReportExcel(data: CustomerOutstandingReportData): string {
  const BOM = "\uFEFF";
  let bodyHtml = "";

  const numericIndices = [3, 4, 5, 6, 7, 8, 10, 11];

  for (const row of data.rows) {
    bodyHtml += "<tr>";
    row.forEach((v, idx) => {
      const isNum = numericIndices.includes(idx);
      const formattedVal = isNum ? formatIndianCurrencyWithSymbol(v, true) : (v || "—");
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(formattedVal)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  if (data.totals) {
    bodyHtml += '<tr class="total-row">';
    data.totals.forEach((v, idx) => {
      const isNum = numericIndices.includes(idx);
      const formattedVal = isNum && v ? formatIndianCurrencyWithSymbol(v, true) : (v || "");
      bodyHtml += `<td class="${isNum ? "num" : ""}">${sanitizeExcel(formattedVal)}</td>`;
    });
    bodyHtml += "</tr>";
  }

  let invoiceSectionHtml = "";
  if (data.invoiceRows && data.invoiceRows.length > 0) {
    let invRowsHtml = "";
    for (const inv of data.invoiceRows) {
      invRowsHtml += `<tr>
        <td>${sanitizeExcel(inv.invoice_number)}</td>
        <td>${sanitizeExcel(formatLedgerDate(inv.invoice_date))}</td>
        <td>${sanitizeExcel(inv.customer_name)}</td>
        <td>${sanitizeExcel(inv.customer_company || "—")}</td>
        <td class="num">${sanitizeExcel(formatINR(inv.bill_amount, true))}</td>
        <td class="num">${sanitizeExcel(formatINR(inv.paid_amount, true))}</td>
        <td class="num">${sanitizeExcel(formatINR(inv.credit_notes, true))}</td>
        <td class="num">${sanitizeExcel(formatINR(inv.pending_due, true))}</td>
      </tr>`;
    }

    const totBill = data.invoiceRows.reduce((sum, r) => sum + Number(r.bill_amount || 0), 0);
    const totPaid = data.invoiceRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const totCred = data.invoiceRows.reduce((sum, r) => sum + Number(r.credit_notes || 0), 0);
    const totDue = data.invoiceRows.reduce((sum, r) => sum + Number(r.pending_due || 0), 0);

    invoiceSectionHtml = `
      <br/><br/>
      <h3>INVOICE-WISE PENDING DUE DETAILS</h3>
      <table>
        <thead>
          <tr>
            <th>Invoice / Order #</th>
            <th>Date</th>
            <th>Customer Name</th>
            <th>Company</th>
            <th class="num">Bill Amount</th>
            <th class="num">Payments Allocated</th>
            <th class="num">Credit Notes / Adj</th>
            <th class="num">Pending Due Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invRowsHtml}
          <tr class="total-row">
            <td>TOTALS</td>
            <td>${data.invoiceRows.length} Invoices</td>
            <td></td>
            <td></td>
            <td class="num">${sanitizeExcel(formatINR(totBill, true))}</td>
            <td class="num">${sanitizeExcel(formatINR(totPaid, true))}</td>
            <td class="num">${sanitizeExcel(formatINR(totCred, true))}</td>
            <td class="num">${sanitizeExcel(formatINR(totDue, true))}</td>
          </tr>
        </tbody>
      </table>`;
  }

  const totalDueVal = data.totalDueAmount !== undefined ? formatINR(data.totalDueAmount, true) : "";
  const totalAdvVal = data.totalCustomerAdvance !== undefined ? formatINR(data.totalCustomerAdvance, true) : "";

  return `${BOM}<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000000; }
    h2 { font-size: 14pt; margin: 0; text-align: center; }
    h3 { font-size: 11pt; margin: 6px 0; text-align: left; color: #0F766E; }
    .kpi-table { margin-bottom: 12px; }
    .kpi-table td { padding: 8px 14px; font-weight: bold; border: 1px solid #CBD5E1; }
    .period { font-size: 9pt; margin: 2px 0 12px 0; text-align: center; color: #64748B; }
    table { border-collapse: collapse; width: 100%; margin-top: 6px; }
    th { background-color: #0F766E; color: #FFFFFF; font-weight: bold; border: 1px solid #0D655E; padding: 6px 8px; text-align: left; }
    th.num { text-align: right; }
    td { border: 1px solid #E2E8F0; padding: 5px 8px; }
    td.num { text-align: right; }
    .total-row td { background-color: #F1F5F9; font-weight: bold; border-top: 2px solid #0F766E; border-bottom: 2px solid #0F766E; }
  </style>
</head>
<body>
  <h2>${sanitizeExcel(data.companyName || "SANKALP IRRIGATION")}</h2>
  <h3 style="text-align: center;">${sanitizeExcel(data.reportTitle || "CUSTOMER DUE & OUTSTANDING REPORT")}</h3>
  <p class="period">Period: ${sanitizeExcel(data.periodStr)}   |   Total Customers: ${data.totalRecords}</p>

  ${totalDueVal ? `
  <table class="kpi-table" style="width: auto; margin: 0 auto 14px auto;">
    <tr>
      <td style="background-color: #FEF2F2; color: #991B1B;">TOTAL DUE AMOUNT: ${totalDueVal}</td>
      <td style="background-color: #F0FDFA; color: #115E59;">TOTAL CUSTOMER ADVANCE: ${totalAdvVal}</td>
    </tr>
  </table>` : ""}

  <h3>1. CUSTOMER-WISE DUE DETAILS</h3>
  <table>
    <thead>
      <tr>${data.headers.map((h, i) => `<th class="${numericIndices.includes(i) ? "num" : ""}">${sanitizeExcel(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>

  ${invoiceSectionHtml}
</body>
</html>`;
}

/**
 * Generates clean CSV data for Customer Outstanding & Due Report.
 */
export function generateCustomerOutstandingReportCSV(data: CustomerOutstandingReportData): string {
  const BOM = "\uFEFF";
  const numericIndices = [3, 4, 5, 6, 7, 8, 10, 11];
  const lines: string[] = [];

  // Summary lines
  if (data.totalDueAmount !== undefined) {
    lines.push(`"TOTAL DUE AMOUNT",${sanitizeCsv(formatINR(data.totalDueAmount, true))}`);
    lines.push(`"TOTAL CUSTOMER ADVANCE",${sanitizeCsv(formatINR(data.totalCustomerAdvance, true))}`);
    lines.push("");
  }

  // Section 1: Customer-wise
  lines.push('"--- 1. CUSTOMER-WISE DUE DETAILS ---"');
  lines.push(data.headers.map(sanitizeCsv).join(","));

  for (const row of data.rows) {
    const formattedRow = row.map((v, i) => {
      if (numericIndices.includes(i)) {
        return formatIndianCurrencyWithSymbol(v, true);
      }
      return v || "";
    });
    lines.push(formattedRow.map(sanitizeCsv).join(","));
  }

  if (data.totals) {
    const formattedTotals = data.totals.map((v, i) => {
      if (numericIndices.includes(i) && v) {
        return formatIndianCurrencyWithSymbol(v, true);
      }
      return v || "";
    });
    lines.push(formattedTotals.map(sanitizeCsv).join(","));
  }

  // Section 2: Invoice-wise
  if (data.invoiceRows && data.invoiceRows.length > 0) {
    lines.push("");
    lines.push('"--- 2. INVOICE-WISE PENDING DUE DETAILS ---"');
    lines.push('"Invoice / Order #","Date","Customer Name","Company","Bill Amount","Payments Allocated","Credit Notes / Adj","Pending Due Amount"');

    for (const inv of data.invoiceRows) {
      lines.push([
        sanitizeCsv(inv.invoice_number),
        sanitizeCsv(formatLedgerDate(inv.invoice_date)),
        sanitizeCsv(inv.customer_name),
        sanitizeCsv(inv.customer_company || "—"),
        sanitizeCsv(formatINR(inv.bill_amount, true)),
        sanitizeCsv(formatINR(inv.paid_amount, true)),
        sanitizeCsv(formatINR(inv.credit_notes, true)),
        sanitizeCsv(formatINR(inv.pending_due, true)),
      ].join(","));
    }

    const totBill = data.invoiceRows.reduce((sum, r) => sum + Number(r.bill_amount || 0), 0);
    const totPaid = data.invoiceRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const totCred = data.invoiceRows.reduce((sum, r) => sum + Number(r.credit_notes || 0), 0);
    const totDue = data.invoiceRows.reduce((sum, r) => sum + Number(r.pending_due || 0), 0);

    lines.push([
      '"TOTALS"',
      `"${data.invoiceRows.length} Invoices"`,
      '""',
      '""',
      sanitizeCsv(formatINR(totBill, true)),
      sanitizeCsv(formatINR(totPaid, true)),
      sanitizeCsv(formatINR(totCred, true)),
      sanitizeCsv(formatINR(totDue, true)),
    ].join(","));
  }

  return BOM + lines.join("\n");
}
