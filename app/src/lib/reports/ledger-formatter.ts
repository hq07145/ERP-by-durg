import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
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

function sanitizeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  const isNumeric = typeof val === "number" || (!isNaN(Number(str)) && !str.startsWith("=") && !str.startsWith("@"));
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

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch

  const openingDebit = Number(data.openingDebit) || 0;
  const openingCredit = Number(data.openingCredit) || 0;
  const hasOpening = openingDebit > 0 || openingCredit > 0;
  const openingDue = openingDebit > openingCredit ? openingDebit - openingCredit : 0;

  const TX_PER_PAGE = 26;
  const pagesData: string[][][] = [];

  let txIndex = 0;
  let runningDebit = openingDebit;
  let runningCredit = openingCredit;
  let pageIdx = 0;

  const entries = data.entries || [];

  while (txIndex < entries.length || (pageIdx === 0 && entries.length === 0)) {
    const pageRows: string[][] = [];
    const isFirstPage = pageIdx === 0;
    const runningDue = Math.max(0, runningDebit - runningCredit);

    if (isFirstPage && hasOpening) {
      pageRows.push([
        "",
        "Opening Balance",
        "",
        "",
        formatIndianCurrency(openingDebit),
        formatIndianCurrency(openingCredit),
        formatIndianCurrency(openingDue, true),
      ]);
    } else if (!isFirstPage) {
      pageRows.push([
        "",
        "Brought Forward",
        "",
        "",
        formatIndianCurrency(runningDebit, true),
        formatIndianCurrency(runningCredit, true),
        formatIndianCurrency(runningDue, true),
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

      const dueStr =
        tx.amountDue !== undefined && tx.amountDue !== null
          ? formatIndianCurrency(tx.amountDue, true)
          : tx.debit
          ? formatIndianCurrency(tx.debit, true)
          : "—";

      pageRows.push([
        tx.date || "",
        tx.particulars || "",
        tx.vchType || "",
        tx.vchNo || "",
        formatIndianCurrency(tx.debit),
        formatIndianCurrency(tx.credit),
        dueStr,
      ]);
    }

    const currentRunningDue = Math.max(0, runningDebit - runningCredit);

    if (!isLastPage) {
      pageRows.push([
        "",
        "Carried Forward",
        "",
        "",
        formatIndianCurrency(runningDebit, true),
        formatIndianCurrency(runningCredit, true),
        formatIndianCurrency(currentRunningDue, true),
      ]);
    } else {
      const diff = runningDebit - runningCredit;
      let closingDebit = 0;
      let closingCredit = 0;
      let closingDue = 0;

      if (diff > 0) {
        closingCredit = diff;
        closingDue = diff;
      } else if (diff < 0) {
        closingDebit = Math.abs(diff);
        closingDue = 0; // Customer advances are not treated as unpaid dues
      }

      const finalTotalDebit = runningDebit + closingDebit;
      const finalTotalCredit = runningCredit + closingCredit;
      const finalTotalDue = Math.max(0, diff);

      if (hasOpening || diff !== 0) {
        pageRows.push([
          "",
          diff < 0 ? "Closing Balance (Advance)" : "Closing Balance",
          "",
          "",
          formatIndianCurrency(closingDebit),
          formatIndianCurrency(closingCredit),
          formatIndianCurrency(closingDue, true),
        ]);
        pageRows.push([
          "",
          "Total",
          "",
          "",
          formatIndianCurrency(finalTotalDebit, true),
          formatIndianCurrency(finalTotalCredit, true),
          formatIndianCurrency(finalTotalDue, true),
        ]);
      } else {
        pageRows.push([
          "",
          "Total",
          "",
          "",
          formatIndianCurrency(runningDebit, true),
          formatIndianCurrency(runningCredit, true),
          formatIndianCurrency(0, true),
        ]);
      }
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
      head: [["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit", "Amount Due"]],
      body: rows,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: [0, 0, 0],
        cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
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
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 58 },
        3: { cellWidth: 68 },
        4: { cellWidth: 65, halign: "right" },
        5: { cellWidth: 65, halign: "right" },
        6: { cellWidth: 70, halign: "right" },
      },
      didParseCell: function (cellData) {
        const rawRow = cellData.row.raw as any;
        const rowText = String(Array.isArray(rawRow) ? rawRow[1] : (rawRow?.particulars || ""));
        if (rowText === "Total") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
        } else if (rowText === "Closing Balance" || rowText === "Opening Balance" || rowText.startsWith("Closing Balance")) {
          cellData.cell.styles.fontStyle = "bold";
          if (rowText.startsWith("Closing Balance")) {
            cellData.cell.styles.lineWidth = { top: 0.5, bottom: 0, left: 0, right: 0 };
          }
        } else if (rowText === "Carried Forward" || rowText === "Brought Forward") {
          cellData.cell.styles.fontStyle = "bold";
          cellData.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
        }
      },
    });

    // Draw header on every page
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

    // Footer - Page Number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const pageText = pagesData.length > 1 ? `Page ${p + 1} of ${pagesData.length}` : `Page 1`;
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
  const hasOpening = openingDebit > 0 || openingCredit > 0;
  const openingDue = openingDebit > openingCredit ? openingDebit - openingCredit : 0;

  let runningDebit = openingDebit;
  let runningCredit = openingCredit;

  let bodyHtml = "";

  if (hasOpening) {
    bodyHtml += `<tr class="bold-row">
      <td></td>
      <td>Opening Balance</td>
      <td></td>
      <td></td>
      <td class="num">${openingDebit > 0 ? openingDebit.toFixed(2) : ""}</td>
      <td class="num">${openingCredit > 0 ? openingCredit.toFixed(2) : ""}</td>
      <td class="num">${openingDue > 0 ? openingDue.toFixed(2) : "0.00"}</td>
    </tr>`;
  }

  for (const tx of data.entries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    runningDebit += d;
    runningCredit += c;

    const dueStr =
      tx.amountDue !== undefined && tx.amountDue !== null
        ? Number(tx.amountDue).toFixed(2)
        : d > 0
        ? d.toFixed(2)
        : "";

    bodyHtml += `<tr>
      <td>${sanitizeExcel(tx.date)}</td>
      <td>${sanitizeExcel(tx.particulars)}</td>
      <td>${sanitizeExcel(tx.vchType)}</td>
      <td>${sanitizeExcel(tx.vchNo)}</td>
      <td class="num">${d > 0 ? d.toFixed(2) : ""}</td>
      <td class="num">${c > 0 ? c.toFixed(2) : ""}</td>
      <td class="num">${dueStr}</td>
    </tr>`;
  }

  const diff = runningDebit - runningCredit;
  let closingDebit = 0;
  let closingCredit = 0;
  let closingDue = 0;
  if (diff > 0) {
    closingCredit = diff;
    closingDue = diff;
  } else if (diff < 0) {
    closingDebit = Math.abs(diff);
    closingDue = 0;
  }

  const finalTotalDebit = runningDebit + closingDebit;
  const finalTotalCredit = runningCredit + closingCredit;
  const finalTotalDue = Math.max(0, diff);

  if (hasOpening || diff !== 0) {
    bodyHtml += `<tr class="bold-row">
      <td></td>
      <td>${diff < 0 ? "Closing Balance (Advance)" : "Closing Balance"}</td>
      <td></td>
      <td></td>
      <td class="num">${closingDebit > 0 ? closingDebit.toFixed(2) : ""}</td>
      <td class="num">${closingCredit > 0 ? closingCredit.toFixed(2) : ""}</td>
      <td class="num">${closingDue > 0 ? closingDue.toFixed(2) : "0.00"}</td>
    </tr>`;
    bodyHtml += `<tr class="total-row">
      <td></td>
      <td>Total</td>
      <td></td>
      <td></td>
      <td class="num">${finalTotalDebit.toFixed(2)}</td>
      <td class="num">${finalTotalCredit.toFixed(2)}</td>
      <td class="num">${finalTotalDue.toFixed(2)}</td>
    </tr>`;
  } else {
    bodyHtml += `<tr class="total-row">
      <td></td>
      <td>Total</td>
      <td></td>
      <td></td>
      <td class="num">${runningDebit.toFixed(2)}</td>
      <td class="num">${runningCredit.toFixed(2)}</td>
      <td class="num">${finalTotalDue.toFixed(2)}</td>
    </tr>`;
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
    td.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.00"; }
    .bold-row { font-weight: bold; }
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
        <th>Date</th>
        <th>Particulars</th>
        <th>Vch Type</th>
        <th>Vch No.</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
        <th class="num">Amount Due</th>
      </tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Generates clean CSV in the ledger format with UTF-8 BOM.
 */
export function generateLedgerCSV(data: LedgerReportData): string {
  const BOM = "\uFEFF";
  const lines: string[] = [
    sanitizeCsv(data.companyName),
    sanitizeCsv(data.reportTitle),
    sanitizeCsv(data.periodStr),
    "",
    "Date,Particulars,Vch Type,Vch No.,Debit,Credit,Amount Due",
  ];

  const openingDebit = Number(data.openingDebit) || 0;
  const openingCredit = Number(data.openingCredit) || 0;
  const hasOpening = openingDebit > 0 || openingCredit > 0;
  const openingDue = openingDebit > openingCredit ? openingDebit - openingCredit : 0;

  let runningDebit = openingDebit;
  let runningCredit = openingCredit;

  if (hasOpening) {
    lines.push(
      `,"Opening Balance",,,${openingDebit > 0 ? openingDebit.toFixed(2) : ""},${openingCredit > 0 ? openingCredit.toFixed(2) : ""},${openingDue > 0 ? openingDue.toFixed(2) : "0.00"}`
    );
  }

  for (const tx of data.entries) {
    const d = Number(tx.debit) || 0;
    const c = Number(tx.credit) || 0;
    runningDebit += d;
    runningCredit += c;

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

  const diff = runningDebit - runningCredit;
  let closingDebit = 0;
  let closingCredit = 0;
  let closingDue = 0;
  if (diff > 0) {
    closingCredit = diff;
    closingDue = diff;
  } else if (diff < 0) {
    closingDebit = Math.abs(diff);
    closingDue = 0;
  }

  const finalTotalDebit = runningDebit + closingDebit;
  const finalTotalCredit = runningCredit + closingCredit;
  const finalTotalDue = Math.max(0, diff);

  if (hasOpening || diff !== 0) {
    lines.push(
      `,"${diff < 0 ? "Closing Balance (Advance)" : "Closing Balance"}",,,${closingDebit > 0 ? closingDebit.toFixed(2) : ""},${closingCredit > 0 ? closingCredit.toFixed(2) : ""},${closingDue > 0 ? closingDue.toFixed(2) : "0.00"}`
    );
    lines.push(`,"Total",,,${finalTotalDebit.toFixed(2)},${finalTotalCredit.toFixed(2)},${finalTotalDue.toFixed(2)}`);
  } else {
    lines.push(`,"Total",,,${runningDebit.toFixed(2)},${runningCredit.toFixed(2)},${finalTotalDue.toFixed(2)}`);
  }

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
      font: "helvetica",
      fontSize: 8,
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
    columnStyles,
    didParseCell: function (cellData) {
      if (data.totals && cellData.row.index === data.rows.length) {
        cellData.cell.styles.fontStyle = "bold";
        cellData.cell.styles.lineWidth = { top: 0.75, bottom: 1.5, left: 0, right: 0 };
      }
    },
    didDrawPage: function (pageInfo) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("helvetica", "normal");
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Sales Report - District-Wise Sales Summary", pageWidth / 2, 50, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("District-Wise Sales Summary", margin, 95);

    doc.setFont("helvetica", "normal");
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

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Sales Ledger (Transactions)", pageWidth / 2, 50, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

    doc.setFont("helvetica", "normal");
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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("helvetica", "normal");
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
      ? 75
      : numProducts > 0
      ? Math.max(26, Math.min(65, Math.floor((remainingForDealerAndProducts - 110) / numProducts)))
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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("helvetica", "normal");
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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(data.companyName, pageWidth / 2, 35, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(data.reportTitle, pageWidth / 2, 50, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(data.periodStr, pageWidth / 2, 63, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return buffer.toString("base64");
}

