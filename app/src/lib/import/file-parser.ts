import * as XLSX from "xlsx";
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
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Node.js fallback
  try {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  } catch {
    // Basic fallback if crypto unavailable
    let hash = 0;
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      hash = (hash << 5) - hash + bytes[i];
      hash |= 0;
    }
    return `hash-${Math.abs(hash)}`;
  }
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

  // Read workbook using SheetJS
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
 * Validates parsed rows against the module schema and column mapping
 */
export function validateMappedRows(
  rawRows: Record<string, any>[],
  schema: ModuleSchema,
  mapping: ColumnMapping
): {
  validRows: any[];
  invalidRows: RowValidationError[];
  hasErrors: boolean;
} {
  const validRows: any[] = [];
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
        const cleaned = valStr.replace(/[^0-9.-]/g, "");
        const num = parseFloat(cleaned);
        if (isNaN(num)) {
          rowErrors.push(`${field.label} must be a valid number (got "${valStr}").`);
        } else if (schema.id === "customer_opening_balances" && field.key === "amount" && num <= 0) {
          rowErrors.push(`${field.label} must be a positive number greater than 0.`);
        } else {
          mappedRecord[field.key] = num;
        }
      } else if (field.type === "date") {
        const d = new Date(valStr);
        if (isNaN(d.getTime())) {
          rowErrors.push(`${field.label} must be a valid date (YYYY-MM-DD, got "${valStr}").`);
        } else {
          // Format standard YYYY-MM-DD
          try {
            mappedRecord[field.key] = d.toISOString().split("T")[0];
          } catch {
            mappedRecord[field.key] = valStr;
          }
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
        const upperVal = valStr.toUpperCase();
        const matched = field.options.find((opt) => opt.toUpperCase() === upperVal);
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
        // (Orders and Purchases can repeat the ID for multiple line items)
        const idKey = String(idVal).toLowerCase();
        if (seenIdentifiers.has(idKey)) {
          rowErrors.push(`Duplicate ${schema.identifierField} in file: "${idVal}".`);
        } else {
          seenIdentifiers.add(idKey);
        }
      }
    }

    if (rowErrors.length > 0) {
      errors.push({
        rowNumber,
        identifier: idVal ? String(idVal) : undefined,
        errors: rowErrors,
        rawData: row,
      });
    } else {
      validRows.push(mappedRecord);
    }
  });

  return {
    validRows,
    invalidRows: errors,
    hasErrors: errors.length > 0,
  };
}

/**
 * Generates and triggers download of a pre-filled Excel or CSV template
 */
export function downloadModuleTemplate(
  module: ImportModule,
  format: "xlsx" | "csv" = "xlsx"
) {
  const schema = IMPORT_MODULE_SCHEMAS[module];
  if (!schema) return;

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
export function downloadErrorReportFile(
  filename: string,
  errors: RowValidationError[]
) {
  if (!errors || errors.length === 0) return;

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
