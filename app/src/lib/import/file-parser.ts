import type {
  ModuleSchema,
  ColumnMapping,
  ParsedFileInfo,
  RowValidationError,
  ImportModule,
} from "@/types/import";
import { IMPORT_MODULE_SCHEMAS } from "./module-schemas";

/**
 * Computes a SHA-256 hash of an ArrayBuffer in the browser or Node.js
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback if Web Crypto Subtle is unavailable
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return `hash-${Math.abs(hash)}`;
}

/**
 * Normalizes a header string for fuzzy matching (lowercase, no spaces or special chars)
 */
function normalizeHeader(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Automatically matches Excel/CSV headers to module schema fields
 */
export function autoDetectMapping(
  headers: string[],
  schema: ModuleSchema
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeHeader(h),
  }));

  for (const field of schema.fields) {
    const fieldKeyNorm = normalizeHeader(field.key);
    const fieldLabelNorm = normalizeHeader(field.label);
    const aliasNorms = field.aliases.map((a) => normalizeHeader(a));

    // 1. Try exact label or key match
    const exactMatch = normalizedHeaders.find(
      (h) => h.normalized === fieldLabelNorm || h.normalized === fieldKeyNorm
    );
    if (exactMatch) {
      mapping[field.key] = exactMatch.original;
      continue;
    }

    // 2. Try alias match
    const aliasMatch = normalizedHeaders.find((h) =>
      aliasNorms.includes(h.normalized)
    );
    if (aliasMatch) {
      mapping[field.key] = aliasMatch.original;
      continue;
    }

    // 3. Substring match (e.g. "Customer Mobile" contains "mobile")
    const subMatch = normalizedHeaders.find((h) =>
      aliasNorms.some(
        (alias) =>
          h.normalized.includes(alias) || (alias.length > 3 && alias.includes(h.normalized))
      )
    );
    if (subMatch) {
      mapping[field.key] = subMatch.original;
    }
  }

  return mapping;
}

/**
 * Parses an Excel (.xlsx, .xls) or .csv File into headers, raw rows, and hash
 */
export async function parseUploadedFile(
  file: File,
  module: ImportModule
): Promise<ParsedFileInfo> {
  const buffer = await file.arrayBuffer();
  const fileHash = await computeFileHash(buffer);

  // Read workbook using dynamically loaded SheetJS
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Uploaded spreadsheet contains no sheets.");
  }

  const worksheet = workbook.Sheets[sheetName];
  // Convert sheet to array of arrays first to inspect header row
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "YYYY-MM-DD",
  });

  if (!rawData || rawData.length === 0) {
    throw new Error("Uploaded spreadsheet is completely empty.");
  }

  // Find header row (first non-empty row)
  let headerIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (row && row.some((cell) => cell !== undefined && String(cell).trim() !== "")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error("Could not find a valid header row in the spreadsheet.");
  }

  const rawHeaders: string[] = rawData[headerIndex].map((h, colIdx) =>
    h ? String(h).trim() : `Column_${colIdx + 1}`
  );

  // Filter out trailing empty columns
  const validColCount = rawHeaders.length;
  const headers = rawHeaders;

  // Build raw row objects
  const rawRows: Record<string, any>[] = [];
  for (let r = headerIndex + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || !row.some((cell) => cell !== undefined && String(cell).trim() !== "")) {
      continue; // Skip entirely blank rows
    }

    const rowObj: Record<string, any> = {};
    for (let c = 0; c < validColCount; c++) {
      const header = headers[c];
      const val = row[c];
      rowObj[header] = val !== undefined ? String(val).trim() : "";
    }
    rawRows.push(rowObj);
  }

  const schema = IMPORT_MODULE_SCHEMAS[module];
  const detectedMapping = autoDetectMapping(headers, schema);

  return {
    filename: file.name,
    fileHash,
    totalRows: rawRows.length,
    headers,
    rawRows,
    detectedMapping,
  };
}

/**
 * Robust date parser supporting YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, and Excel serial numbers
 */
export function parseDateRobust(valStr?: any): string | null {
  if (valStr === undefined || valStr === null || valStr === "") return null;
  const s = String(valStr).trim();

  // Excel serial number (e.g. 45678)
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10);
    const utcDays = serial - 25569;
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (!isNaN(dateInfo.getTime())) {
      return dateInfo.toISOString().split("T")[0];
    }
  }

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return s;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
  }

  // General fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    try {
      return d.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Robust number parser stripping commas, spaces, currency symbols
 */
export function parseNumberRobust(valStr?: any): number | null {
  if (valStr === undefined || valStr === null || valStr === "") return null;
  const cleaned = String(valStr).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Validates parsed rows against the module schema and column mapping
 */
export function validateMappedRows(
  rawRows: Record<string, any>[],
  schema: ModuleSchema,
  mapping: ColumnMapping
): {
  validRows: any[];
  invalidRows: RowValidationError[];
  allRows: any[];
  hasErrors: boolean;
} {
  const validRows: any[] = [];
  const allRows: any[] = [];
  const errors: RowValidationError[] = [];

  const seenIdentifiers = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // 1-indexed, accounting for header
    const rowErrors: string[] = [];
    const mappedRecord: Record<string, any> = { _rowNumber: rowNumber };

    // Map each field
    for (const field of schema.fields) {
      const sourceHeader = mapping[field.key];
      const rawValue = sourceHeader ? row[sourceHeader] : undefined;
      const valStr = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : "";

      // Required check
      if (field.required && !valStr) {
        if (schema.id === "customer_opening_balances" && field.key === "customer_name") {
          const codeHeader = mapping["customer_code"];
          const codeVal = codeHeader ? row[codeHeader] : undefined;
          if (codeVal && String(codeVal).trim()) {
            mappedRecord[field.key] = "";
            continue;
          }
        }
        rowErrors.push(`${field.label} is required.`);
        continue;
      }

      if (!valStr) {
        mappedRecord[field.key] = null;
        continue;
      }

      // Type validations
      if (field.type === "number") {
        const num = parseNumberRobust(valStr);
        if (num === null) {
          rowErrors.push(`${field.label} must be a valid number (got "${valStr}").`);
        } else if (schema.id === "customer_opening_balances" && field.key === "amount" && num <= 0) {
          rowErrors.push(`${field.label} must be a positive number greater than 0.`);
        } else {
          mappedRecord[field.key] = num;
        }
      } else if (field.type === "date") {
        const parsedDate = parseDateRobust(valStr);
        if (!parsedDate) {
          rowErrors.push(`${field.label} must be a valid date (YYYY-MM-DD or DD/MM/YYYY, got "${valStr}").`);
        } else {
          mappedRecord[field.key] = parsedDate;
        }
      } else if (field.type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valStr)) {
          rowErrors.push(`${field.label} is an invalid email address ("${valStr}").`);
        } else {
          mappedRecord[field.key] = valStr.toLowerCase();
        }
      } else if (field.type === "gst") {
        const gstClean = valStr.toUpperCase().replace(/\s/g, "");
        if (gstClean.length !== 15 && gstClean.length > 0) {
          rowErrors.push(`${field.label} should be a 15-character GSTIN (got "${valStr}").`);
        }
        mappedRecord[field.key] = gstClean;
      } else if (field.type === "select" && field.options) {
        const cleanVal = valStr.trim();
        const upperVal = cleanVal.toUpperCase();
        const matched = field.options.find((opt) => opt.trim().toUpperCase() === upperVal);
        if (!matched) {
          rowErrors.push(
            `${field.label} must be one of: ${field.options.join(", ")} (got "${valStr}").`
          );
        } else {
          mappedRecord[field.key] = matched;
        }
      } else {
        mappedRecord[field.key] = valStr;
      }
    }

    // Check duplicate primary identifier within the file (if applicable)
    const idVal = mappedRecord[schema.identifierField];
    if (schema.id === "customer_opening_balances") {
      const custIdentifier = (mappedRecord.customer_code || mappedRecord.customer_name || "").toString().toLowerCase().trim();
      const asOnDate = (mappedRecord.as_on_date || "").toString().trim();
      if (custIdentifier && asOnDate) {
        const comboKey = `${custIdentifier}:::${asOnDate}`;
        if (seenIdentifiers.has(comboKey)) {
          rowErrors.push(`Duplicate customer and as-on date entry in file: "${custIdentifier}" on "${asOnDate}".`);
        } else {
          seenIdentifiers.add(comboKey);
        }
      }
    } else {
      if (idVal && schema.id !== "historical_orders" && schema.id !== "purchases") {
        const idKey = String(idVal).toLowerCase();
        if (seenIdentifiers.has(idKey)) {
          rowErrors.push(`Duplicate ${schema.identifierField} in file: "${idVal}".`);
        } else {
          seenIdentifiers.add(idKey);
        }
      }
    }

    if (rowErrors.length > 0) {
      mappedRecord._validationErrors = rowErrors;
      mappedRecord._rawData = row;
      errors.push({
        rowNumber,
        identifier: idVal ? String(idVal) : undefined,
        errors: rowErrors,
        rawData: row,
      });
    } else {
      validRows.push(mappedRecord);
    }
    allRows.push(mappedRecord);
  });

  return {
    validRows,
    invalidRows: errors,
    allRows,
    hasErrors: errors.length > 0,
  };
}

/**
 * Generates and triggers download of a pre-filled Excel or CSV template
 */
export async function downloadModuleTemplate(
  module: ImportModule,
  format: "xlsx" | "csv" = "xlsx"
) {
  const schema = IMPORT_MODULE_SCHEMAS[module];
  if (!schema) return;

  const XLSX = await import("xlsx");

  // Build headers from schema field labels
  const headers = schema.fields.map((f) => f.label);
  const rows = schema.sampleData.map((sample) =>
    schema.fields.map((f) => sample[f.key] ?? "")
  );

  const aoa = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths
  worksheet["!cols"] = schema.fields.map((f) => ({
    wch: Math.max(f.label.length + 4, 15),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, schema.title.slice(0, 31));

  const filename = `${schema.id}_import_template.${format}`;
  if (format === "csv") {
    XLSX.writeFile(workbook, filename, { bookType: "csv" });
  } else {
    XLSX.writeFile(workbook, filename, { bookType: "xlsx" });
  }
}

/**
 * Generates and downloads an error report spreadsheet containing the original row data plus validation error details
 */
export async function downloadErrorReportFile(
  filename: string,
  errors: RowValidationError[]
) {
  if (!errors || errors.length === 0) return;

  const XLSX = await import("xlsx");

  // Extract all unique headers from rawData
  const allHeadersSet = new Set<string>();
  errors.forEach((e) => {
    Object.keys(e.rawData || {}).forEach((h) => allHeadersSet.add(h));
  });
  const headers = Array.from(allHeadersSet);

  const aoa = [
    ["Row #", "Validation Errors", ...headers],
    ...errors.map((e) => [
      e.rowNumber,
      e.errors.join("; "),
      ...headers.map((h) => e.rawData[h] ?? ""),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 45 },
    ...headers.map((h) => ({ wch: Math.max(h.length + 3, 14) })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Import Errors");

  const baseName = filename.replace(/\.[^/.]+$/, "");
  XLSX.writeFile(workbook, `${baseName}_errors.xlsx`, { bookType: "xlsx" });
}
