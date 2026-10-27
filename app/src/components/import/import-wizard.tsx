"use client";

import { useState, useRef } from "react";
import type {
  ImportModule,
  ModuleSchema,
  ColumnMapping,
  ParsedFileInfo,
  ImportExecutionResponse,
  RowValidationError,
  ImportJobRecord,
} from "@/types/import";
import { IMPORT_MODULE_SCHEMAS } from "@/lib/import/module-schemas";
import {
  parseUploadedFile,
  validateMappedRows,
  downloadModuleTemplate,
  downloadErrorReportFile,
} from "@/lib/import/file-parser";
import {
  checkDuplicateFileHash,
  executeImportAction,
} from "@/lib/import/actions";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  HelpCircle,
  FileText,
  Users,
  Truck,
  Package,
  Layers,
  Warehouse,
  ShoppingCart,
  CreditCard,
  ShoppingBag,
  Receipt,
  Wallet,
} from "lucide-react";

interface ImportWizardProps {
  onImportComplete?: () => void;
}

const MODULE_ICONS: Record<ImportModule, any> = {
  customers: Users,
  suppliers: Truck,
  products: Package,
  opening_finished_goods: Warehouse,
  opening_raw_materials: Layers,
  historical_orders: ShoppingCart,
  historical_payments: CreditCard,
  purchases: ShoppingBag,
  expenses: Receipt,
  customer_opening_balances: Wallet,
};

export function ImportWizard({ onImportComplete }: ImportWizardProps) {
  // Wizard state: 1 = Module, 2 = Upload, 3 = Mapping & Preview, 4 = Import / Results
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedModule, setSelectedModule] = useState<ImportModule>("customers");

  // File parsing & duplicate checking
  const [parsedFile, setParsedFile] = useState<ParsedFileInfo | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<ImportJobRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Column mapping & row validation
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validationResult, setValidationResult] = useState<{
    validRows: any[];
    invalidRows: RowValidationError[];
    hasErrors: boolean;
  }>({ validRows: [], invalidRows: [], hasErrors: false });
  const [previewFilter, setPreviewFilter] = useState<"all" | "valid" | "invalid">("all");

  // Execution
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ImportExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const currentSchema: ModuleSchema = IMPORT_MODULE_SCHEMAS[selectedModule];

  // Handle module selection
  const handleSelectModule = (mod: ImportModule) => {
    setSelectedModule(mod);
    setParsedFile(null);
    setParseError(null);
    setDuplicateWarning(null);
    setMapping({});
    setValidationResult({ validRows: [], invalidRows: [], hasErrors: false });
    setExecutionResult(null);
    setCurrentStep(2);
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setDuplicateWarning(null);

    try {
      const parsed = await parseUploadedFile(file, selectedModule);
      setParsedFile(parsed);
      setMapping(parsed.detectedMapping);

      // Check if file is duplicate
      const duplicateCheck = await checkDuplicateFileHash(parsed.fileHash, selectedModule);
      if (duplicateCheck.isDuplicate && duplicateCheck.previousJob) {
        setDuplicateWarning(duplicateCheck.previousJob);
      }

      // Initial validation with auto-detected mapping
      const validated = validateMappedRows(
        parsed.rawRows,
        currentSchema,
        parsed.detectedMapping
      );
      setValidationResult(validated);

      setCurrentStep(3);
    } catch (err: any) {
      console.error("File parse error:", err);
      setParseError(err.message || "Failed to parse file. Please ensure it is a valid .xlsx or .csv file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle manual column mapping change
  const handleMappingChange = (targetField: string, sourceHeader: string) => {
    const newMapping = { ...mapping, [targetField]: sourceHeader };
    setMapping(newMapping);
    if (parsedFile) {
      const validated = validateMappedRows(parsedFile.rawRows, currentSchema, newMapping);
      setValidationResult(validated);
    }
  };

  // Execute import
  const handleConfirmImport = async () => {
    if (!parsedFile) return;

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const res = await executeImportAction({
        module: selectedModule,
        filename: parsedFile.filename,
        fileHash: parsedFile.fileHash,
        records: validationResult.validRows,
      });

      setExecutionResult(res);
      setCurrentStep(4);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      console.error("Import execution failed:", err);
      setExecutionError(err.message || "Import execution encountered an unexpected error.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset wizard
  const handleStartNew = () => {
    setCurrentStep(1);
    setParsedFile(null);
    setParseError(null);
    setDuplicateWarning(null);
    setMapping({});
    setValidationResult({ validRows: [], invalidRows: [], hasErrors: false });
    setExecutionResult(null);
    setExecutionError(null);
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                currentStep >= 1 ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              1
            </span>
            <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 1 ? "text-slate-900" : "text-slate-400"}`}>
              Select Module
            </span>
          </div>

          <div className="hidden sm:block h-0.5 flex-1 bg-slate-200 mx-3" />

          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                currentStep >= 2 ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              2
            </span>
            <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 2 ? "text-slate-900" : "text-slate-400"}`}>
              Upload File
            </span>
          </div>

          <div className="hidden sm:block h-0.5 flex-1 bg-slate-200 mx-3" />

          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                currentStep >= 3 ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              3
            </span>
            <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 3 ? "text-slate-900" : "text-slate-400"}`}>
              Map & Preview
            </span>
          </div>

          <div className="hidden sm:block h-0.5 flex-1 bg-slate-200 mx-3" />

          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                currentStep >= 4 ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              4
            </span>
            <span className={`text-xs sm:text-sm font-semibold ${currentStep >= 4 ? "text-slate-900" : "text-slate-400"}`}>
              Import Results
            </span>
          </div>
        </div>
      </div>

      {/* STEP 1: MODULE SELECTION & TEMPLATES */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Choose Module to Import</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Select an entity to download an official template or proceed with spreadsheet import.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(IMPORT_MODULE_SCHEMAS).map((schema) => {
              const IconComp = MODULE_ICONS[schema.id] || FileSpreadsheet;
              return (
                <div
                  key={schema.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                        <IconComp className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-mono font-semibold uppercase text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                        {schema.fields.length} Fields
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--accent)] transition-colors">
                      {schema.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                      {schema.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => downloadModuleTemplate(schema.id, "xlsx")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
                      title="Download Excel Template"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-400" />
                      <span>Template</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectModule(schema.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 shadow-2xs transition"
                    >
                      <span>Upload Data</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: FILE UPLOAD */}
      {currentStep === 2 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Upload {currentSchema.title} Spreadsheet
                </h2>
                <p className="text-xs text-slate-500">
                  Supported formats: Microsoft Excel (.xlsx, .xls) and CSV (.csv)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadModuleTemplate(selectedModule, "xlsx")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <Download className="h-4 w-4 text-slate-400" />
                <span>Download .xlsx Template</span>
              </button>
              <button
                type="button"
                onClick={() => downloadModuleTemplate(selectedModule, "csv")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <Download className="h-4 w-4 text-slate-400" />
                <span>CSV Template</span>
              </button>
            </div>
          </div>

          {/* Module Guidelines Note */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-start gap-2.5">
              <HelpCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-900 space-y-1">
                <p className="font-semibold">{currentSchema.title} Import Guidelines:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
                  {currentSchema.notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                  <li>Headers do not need to match exactly; common variations are detected automatically.</li>
                </ul>
              </div>
            </div>
          </div>

          {parseError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Drag & Drop Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-12 text-center hover:border-[var(--accent)] hover:bg-slate-50 transition cursor-pointer group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            {isParsing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 text-[var(--accent)] animate-spin" />
                <p className="text-sm font-semibold text-slate-700">Reading and validating spreadsheet data...</p>
              </div>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 group-hover:bg-[var(--accent)]/10 text-slate-500 group-hover:text-[var(--accent)] transition mb-4">
                  <Upload className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Click to upload or drag & drop</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Upload your historical or batch file for {currentSchema.title} (XLSX, XLS, CSV)
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: COLUMN MAPPING & LIVE PREVIEW */}
      {currentStep === 3 && parsedFile && (
        <div className="space-y-6">
          {/* Top Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition mr-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-bold text-slate-900">{parsedFile.filename}</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {parsedFile.totalRows} Rows
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Target Module: <strong className="text-slate-800">{currentSchema.title}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                Choose Another File
              </button>

              <button
                type="button"
                disabled={validationResult.validRows.length === 0 || isExecuting}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Import ({validationResult.validRows.length} Rows)</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Duplicate Upload Warning Banner */}
          {duplicateWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-amber-950">Duplicate File Warning</p>
                  <p>
                    An identical file hash was already imported on{" "}
                    <strong>{new Date(duplicateWarning.created_at).toLocaleString()}</strong> by{" "}
                    <strong>{duplicateWarning.creator_name || "Admin"}</strong> (Status:{" "}
                    <span className="uppercase font-semibold">{duplicateWarning.status}</span>,{" "}
                    {duplicateWarning.imported_rows} rows imported).
                  </p>
                  <p className="text-amber-800 font-medium pt-0.5">
                    Re-importing will not create duplicates for records with identical keys, but please ensure you intend to re-apply this file.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Validation Status Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Rows</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{parsedFile.totalRows}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-300" />
            </div>

            <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Valid Rows</p>
                <p className="text-2xl font-bold text-green-900 mt-1">{validationResult.validRows.length}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Rows with Errors</p>
                <p className="text-2xl font-bold text-red-900 mt-1">{validationResult.invalidRows.length}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <XCircle className="h-8 w-8 text-red-500" />
                {validationResult.invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadErrorReportFile(parsedFile.filename, validationResult.invalidRows)}
                    className="text-[11px] font-bold text-red-700 hover:underline flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download Errors</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Column Mapping Configuration */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Column Mapping</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify or adjust which Excel column feeds into each application field.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMapping(parsedFile.detectedMapping);
                  const validated = validateMappedRows(parsedFile.rawRows, currentSchema, parsedFile.detectedMapping);
                  setValidationResult(validated);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset to Auto-detected</span>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentSchema.fields.map((field) => (
                <div key={field.key} className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-800">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {field.type}
                    </span>
                  </div>

                  <select
                    value={mapping[field.key] || ""}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-700 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  >
                    <option value="">-- Do Not Import / Leave Blank --</option>
                    {parsedFile.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Live Data Preview */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Spreadsheet Data Preview</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review how rows validate with current column mappings.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewFilter("all")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({parsedFile.totalRows})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("valid")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "valid"
                      ? "bg-green-600 text-white"
                      : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                  }`}
                >
                  Valid ({validationResult.validRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("invalid")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "invalid"
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                  }`}
                >
                  Errors ({validationResult.invalidRows.length})
                </button>
              </div>
            </div>

            {/* Error Table if viewing errors */}
            {previewFilter === "invalid" && (
              <div className="overflow-x-auto rounded-lg border border-red-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-red-50/70 border-b border-red-200 text-red-900 uppercase font-semibold">
                    <tr>
                      <th className="p-3 w-16">Row #</th>
                      <th className="p-3 w-48">Identifier</th>
                      <th className="p-3">Validation Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 bg-white">
                    {validationResult.invalidRows.map((err, i) => (
                      <tr key={i} className="hover:bg-red-50/30">
                        <td className="p-3 font-mono font-bold text-red-700">{err.rowNumber}</td>
                        <td className="p-3 font-semibold text-slate-900">{err.identifier || "—"}</td>
                        <td className="p-3 text-red-700 space-y-0.5">
                          {err.errors.map((eStr, ei) => (
                            <div key={ei} className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              <span>{eStr}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Valid / All Rows Preview Table */}
            {previewFilter !== "invalid" && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase sticky top-0">
                    <tr>
                      <th className="p-3 w-16">Row #</th>
                      {currentSchema.fields.map((f) => (
                        <th key={f.key} className="p-3 whitespace-nowrap">
                          {f.label} {f.required && <span className="text-red-500">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {validationResult.validRows.slice(0, 100).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-slate-400">{row._rowNumber}</td>
                        {currentSchema.fields.map((f) => (
                          <td key={f.key} className="p-3 whitespace-nowrap text-slate-800">
                            {row[f.key] !== null && row[f.key] !== undefined ? String(row[f.key]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {validationResult.validRows.length > 100 && previewFilter !== "invalid" && (
              <p className="text-xs text-slate-400 text-right">
                Showing first 100 of {validationResult.validRows.length} valid rows.
              </p>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: RESULTS */}
      {currentStep === 4 && executionResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-6">
          <div className="flex flex-col items-center justify-center">
            {executionResult.failedRows === 0 ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-3">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            ) : executionResult.importedRows > 0 ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
                <AlertTriangle className="h-10 w-10" />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
                <XCircle className="h-10 w-10" />
              </div>
            )}
            <h2 className="text-2xl font-bold text-slate-900">
              {executionResult.failedRows === 0
                ? "Import Completed Successfully"
                : executionResult.importedRows > 0
                ? "Partial Import Completed"
                : "Import Failed"}
            </h2>
            <p className="text-sm text-slate-600 mt-1">{executionResult.message}</p>
          </div>

          <div className="mx-auto max-w-lg grid grid-cols-3 gap-4 border-y border-slate-100 py-4 text-center">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Total Rows</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{executionResult.totalRows}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase">Imported</p>
              <p className="text-xl font-bold text-green-700 mt-1">{executionResult.importedRows}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase">Failed</p>
              <p className="text-xl font-bold text-red-700 mt-1">{executionResult.failedRows}</p>
            </div>
          </div>

          {executionResult.errors.length > 0 && (
            <div className="mx-auto max-w-xl text-left bg-red-50/50 border border-red-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-900 uppercase">Failure Details</span>
                <button
                  type="button"
                  onClick={() => downloadErrorReportFile(parsedFile?.filename || "import", executionResult.errors)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Error Report</span>
                </button>
              </div>
              <ul className="text-xs text-red-700 divide-y divide-red-100 max-h-48 overflow-y-auto">
                {executionResult.errors.slice(0, 10).map((err, idx) => (
                  <li key={idx} className="py-1.5">
                    Row {err.rowNumber}: {err.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleStartNew}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              Import Another File
            </button>

            <a
              href={`/${selectedModule.replace(/_/g, "-")}`}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-90 transition shadow-2xs"
            >
              <span>View {currentSchema.title}</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
