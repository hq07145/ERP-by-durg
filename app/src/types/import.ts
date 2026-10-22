export type ImportModule =
  | "customers"
  | "suppliers"
  | "products"
  | "opening_finished_goods"
  | "opening_raw_materials"
  | "historical_orders"
  | "historical_payments"
  | "purchases"
  | "expenses";

export type ImportJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "PARTIAL";

export interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "date" | "email" | "gst" | "select";
  options?: string[];
  description: string;
  example: string | number;
  aliases: string[]; // Common alternative headers used in Excel/CSV files
}

export interface ModuleSchema {
  id: ImportModule;
  title: string;
  description: string;
  targetTable: string;
  identifierField: string;
  fields: FieldDefinition[];
  sampleData: Record<string, any>[];
  notes: string[];
}

export interface RowValidationError {
  rowNumber: number;
  identifier?: string;
  errors: string[];
  rawData: Record<string, any>;
}

export interface ColumnMapping {
  [targetField: string]: string; // targetField -> excelHeader
}

export interface ParsedFileInfo {
  filename: string;
  fileHash: string;
  totalRows: number;
  headers: string[];
  rawRows: Record<string, any>[];
  detectedMapping: ColumnMapping;
}

export interface ImportValidationResult {
  totalRows: number;
  validRowCount: number;
  invalidRowCount: number;
  validRows: any[];
  invalidRows: RowValidationError[];
  hasErrors: boolean;
}

export interface ImportJobRecord {
  id: string;
  business_id: string;
  module: ImportModule;
  filename: string;
  file_hash: string;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  status: ImportJobStatus;
  error_summary: string | null;
  errors: RowValidationError[];
  metadata: Record<string, any>;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  creator_name?: string;
}

export interface ImportExecutionResponse {
  success: boolean;
  jobId: string;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: RowValidationError[];
  message: string;
}
