"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ImportModule,
  ModuleSchema,
  ColumnMapping,
  ParsedFileInfo,
  ImportExecutionResponse,
  RowValidationError,
  ImportJobRecord,
  ImportClassificationResult,
  ClassifiedImportRow,
  RetryImportResponse,
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
  classifyImportAction,
  retryImportJobAction,
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
  RotateCcw,
  Copy,
  Check,
  ShieldCheck,
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
  const router = useRouter();

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
    allRows?: any[];
  }>({ validRows: [], invalidRows: [], hasErrors: false, allRows: [] });

  // Classification State (Step 9)
  const [classification, setClassification] = useState<ImportClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<"all" | "new" | "duplicate" | "errors">("all");

  // Execution & Retry State (Step 9)
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ImportExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [copiedBatchId, setCopiedBatchId] = useState(false);

  const currentSchema: ModuleSchema = IMPORT_MODULE_SCHEMAS[selectedModule];

  // Helper to trigger server-side classification
  const runClassification = async (records: any[], mod: ImportModule) => {
    if (!records || records.length === 0) {
      setClassification(null);
      return;
    }
    setIsClassifying(true);
    try {
      const res = await classifyImportAction({
        module: mod,
        records,
      });
      setClassification(res);
    } catch (err) {
      console.error("Classification error:", err);
    } finally {
      setIsClassifying(false);
    }
  };

  // Handle module selection
  const handleSelectModule = (mod: ImportModule) => {
    setSelectedModule(mod);
    setParsedFile(null);
    setParseError(null);
    setDuplicateWarning(null);
    setMapping({});
    setValidationResult({ validRows: [], invalidRows: [], hasErrors: false, allRows: [] });
    setClassification(null);
    setExecutionResult(null);
    setRetryNotice(null);
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

      // Check if file hash has already been imported
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

      // Trigger server-side classification with allRows
      await runClassification(validated.allRows || validated.validRows, selectedModule);
    } catch (err: any) {
      console.error("File parse error:", err);
      setParseError(err.message || "Failed to parse file. Please ensure it is a valid .xlsx or .csv file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle manual column mapping change
  const handleMappingChange = async (targetField: string, sourceHeader: string) => {
    const newMapping = { ...mapping, [targetField]: sourceHeader };
    setMapping(newMapping);
    if (parsedFile) {
      const validated = validateMappedRows(parsedFile.rawRows, currentSchema, newMapping);
      setValidationResult(validated);
      await runClassification(validated.allRows || validated.validRows, selectedModule);
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
        records: validationResult.allRows || validationResult.validRows,
      });

      setExecutionResult(res);
      setCurrentStep(4);
      try {
        router.refresh();
      } catch (e) {
        console.warn("router refresh warning:", e);
      }
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      console.error("Import execution failed:", err);
      setExecutionError(err.message || "Import execution encountered an unexpected error.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Retry failed rows safely
  const handleRetryFailedRows = async () => {
    if (!executionResult?.jobId) return;

    setIsRetrying(true);
    setRetryNotice(null);

    try {
      const res: RetryImportResponse = await retryImportJobAction({
        jobId: executionResult.jobId,
      });

      setExecutionResult({
        ...executionResult,
        importedRows: res.importedRows,
        failedRows: res.failedRows,
        skippedDuplicates: res.skippedDuplicates,
        errors: res.errors,
        message: res.message,
      });

      setRetryNotice(
        res.newlyImportedRows > 0
          ? `Safe retry completed: ${res.newlyImportedRows} newly imported. Remaining failed: ${res.failedRows}.`
          : `Safe retry finished: 0 newly imported. Remaining failed: ${res.failedRows}.`
      );

      try {
        router.refresh();
      } catch (e) {
        console.warn("router refresh warning:", e);
      }
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      console.error("Retry failed:", err);
      setRetryNotice("Retry failed: " + (err.message || "Unknown error"));
    } finally {
      setIsRetrying(false);
    }
  };

  // Copy batch ID
  const handleCopyBatchId = () => {
    if (executionResult?.jobId) {
      navigator.clipboard.writeText(executionResult.jobId);
      setCopiedBatchId(true);
      setTimeout(() => setCopiedBatchId(false), 2000);
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
    setClassification(null);
    setExecutionResult(null);
    setExecutionError(null);
    setRetryNotice(null);
  };

  // Filtered rows for Step 3 table
  const getFilteredRows = (): ClassifiedImportRow[] => {
    if (!classification) {
      const rowsToShow = validationResult.allRows || validationResult.validRows;
      return rowsToShow.map((r, i) => {
        const isInvalid = Boolean(r._validationErrors && r._validationErrors.length > 0);
        return {
          rowNumber: r._rowNumber || i + 1,
          identifier: r.name || r.sku || r.order_number || r.payment_number || r.po_number || `Row #${i + 1}`,
          classification: isInvalid ? ("INVALID" as const) : ("NEW" as const),
          reason: isInvalid ? r._validationErrors.join("; ") : "Mapped valid row ready for classification.",
          data: r,
        };
      });
    }

    if (previewFilter === "new") {
      return classification.rows.filter((r) => r.classification === "NEW");
    }
    if (previewFilter === "duplicate") {
      return classification.rows.filter((r) => r.classification === "DUPLICATE");
    }
    if (previewFilter === "errors") {
      return classification.rows.filter(
        (r) => r.classification === "INVALID" || r.classification === "REJECTED"
      );
    }
    return classification.rows;
  };

  const filteredRows = getFilteredRows();

  const handleDownloadTemplate = async (format: "xlsx" | "csv") => {
    try {
      await downloadModuleTemplate(selectedModule, format);
    } catch (err) {
      console.error("Failed to download template:", err);
      alert(`Failed to download ${format.toUpperCase()} template. Please check your network connection and try again.`);
    }
  };

  const handleDownloadValidationErrors = async () => {
    if (!parsedFile) return;
    try {
      await downloadErrorReportFile(parsedFile.filename, validationResult.invalidRows);
    } catch (err) {
      console.error("Failed to download validation error report:", err);
      alert("Failed to download error report. Please check your network connection and try again.");
    }
  };

  const handleDownloadExecutionErrors = async () => {
    if (!executionResult || !executionResult.errors || executionResult.errors.length === 0) return;
    try {
      await downloadErrorReportFile(parsedFile?.filename || "import_errors", executionResult.errors);
    } catch (err) {
      console.error("Failed to download execution error report:", err);
      alert("Failed to download error report. Please check your network connection and try again.");
    }
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
              Results & Audit
            </span>
          </div>
        </div>
      </div>

      {/* STEP 1: MODULE SELECTION */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Choose Module to Import</h2>
            <p className="text-xs text-slate-500 mt-1">
              Select which operational dataset you want to import via Excel or CSV.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-5">
              {(Object.keys(IMPORT_MODULE_SCHEMAS) as ImportModule[]).map((modKey) => {
                const schema = IMPORT_MODULE_SCHEMAS[modKey];
                const Icon = MODULE_ICONS[modKey] || FileSpreadsheet;
                const isSelected = selectedModule === modKey;

                return (
                  <button
                    key={modKey}
                    type="button"
                    onClick={() => handleSelectModule(modKey)}
                    className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition hover:shadow-sm ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isSelected ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-sm text-slate-900 truncate">{schema.title}</p>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {schema.fields.length} Fields
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{schema.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: FILE UPLOAD & TEMPLATE DOWNLOAD */}
      {currentStep === 2 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition mr-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-lg font-bold text-slate-900">Upload {currentSchema.title} Spreadsheet</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">{currentSchema.description}</p>
            </div>

            {/* Template Download Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleDownloadTemplate("xlsx")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                <Download className="h-4 w-4 text-emerald-600" />
                <span>Download .xlsx Template</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate("csv")}
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
                  <li>Stable identifiers (e.g. Phone, SKU, Transaction ID, UTR) prevent accidental duplicates.</li>
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

      {/* STEP 3: COLUMN MAPPING & LIVE PREVIEW WITH DUPLICATE PROTECTION */}
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
                {isClassifying && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking Duplicates...</span>
                  </span>
                )}
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
                disabled={
                  Boolean(
                    isExecuting ||
                    isClassifying ||
                    (!classification && validationResult.validRows.length === 0) ||
                    (classification && classification.newCount === 0 && classification.duplicateCount === 0)
                  )
                }
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : isClassifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Classifying Rows...</span>
                  </>
                ) : classification && classification.newCount === 0 && classification.duplicateCount > 0 ? (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Process & Skip {classification.duplicateCount} Duplicates</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Import ({classification ? classification.newCount : validationResult.validRows.length} New Rows)</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Duplicate File Warning Banner */}
          {duplicateWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-amber-950">Duplicate File Warning</p>
                  <p>
                    An identical file was previously imported on{" "}
                    <strong>{new Date(duplicateWarning.created_at).toLocaleString()}</strong> by{" "}
                    <strong>{duplicateWarning.creator_name || "Admin"}</strong> (Batch:{" "}
                    <span className="font-mono">{duplicateWarning.id}</span>).
                  </p>
                  <p className="text-amber-800 font-medium pt-0.5">
                    Safe Duplicate Protection is active: re-uploading will detect existing records and skip them without duplicate postings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Execution Error Banner */}
          {executionError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm text-xs text-red-900">
              <div className="flex items-start gap-2.5">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-red-950">Import Failed</p>
                  <p>{executionError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 9 Classification Metric Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Rows */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Rows</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{parsedFile.totalRows}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-300" />
            </div>

            {/* New Rows (Ready) */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">New (Ready)</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1">
                  {classification ? classification.newCount : validationResult.validRows.length}
                </p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Will be imported</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>

            {/* Duplicates (Will be Skipped) */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Duplicates</p>
                <p className="text-2xl font-bold text-amber-900 mt-1">
                  {classification ? classification.duplicateCount : 0}
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">Safely skipped</p>
              </div>
              <ShieldCheck className="h-8 w-8 text-amber-500" />
            </div>

            {/* Invalid & Rejected */}
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Errors / Rejected</p>
                <p className="text-2xl font-bold text-red-900 mt-1">
                  {classification
                    ? classification.invalidCount + classification.rejectedCount
                    : validationResult.invalidRows.length}
                </p>
                <p className="text-[11px] text-red-600 mt-0.5">Blocked with reasons</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <XCircle className="h-8 w-8 text-red-500" />
                {validationResult.invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadValidationErrors}
                    className="text-[11px] font-bold text-red-700 hover:underline flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
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
                onClick={async () => {
                  setMapping(parsedFile.detectedMapping);
                  const validated = validateMappedRows(parsedFile.rawRows, currentSchema, parsedFile.detectedMapping);
                  setValidationResult(validated);
                  await runClassification(validated.validRows, selectedModule);
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

          {/* Classified Data Preview Table (Requirement 5) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Classification & Row-level Preview
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-classified row-by-row before executing to prevent duplicate or invalid posting.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 flex-wrap">
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
                  onClick={() => setPreviewFilter("new")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "new"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  }`}
                >
                  New ({classification ? classification.newCount : validationResult.validRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("duplicate")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "duplicate"
                      ? "bg-amber-600 text-white"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  Duplicates ({classification ? classification.duplicateCount : 0})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter("errors")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    previewFilter === "errors"
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                  }`}
                >
                  Errors (
                  {classification
                    ? classification.invalidCount + classification.rejectedCount
                    : validationResult.invalidRows.length}
                  )
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-14">Row #</th>
                    <th className="p-3 w-28">Status</th>
                    <th className="p-3 w-40">Identifier</th>
                    <th className="p-3 min-w-[220px]">Classification Reason</th>
                    {currentSchema.fields.slice(0, 5).map((f) => (
                      <th key={f.key} className="p-3 whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.slice(0, 100).map((row, i) => {
                    const statusClass =
                      row.classification === "NEW"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : row.classification === "DUPLICATE"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : row.classification === "REJECTED"
                        ? "bg-purple-100 text-purple-800 border-purple-200"
                        : "bg-red-100 text-red-800 border-red-200";

                    return (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-slate-500">{row.rowNumber}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${statusClass}`}
                          >
                            {row.classification}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          {row.identifier || "—"}
                        </td>
                        <td className="p-3 text-slate-600">
                          <span className={row.classification !== "NEW" ? "font-medium text-slate-800" : ""}>
                            {row.reason || "—"}
                          </span>
                        </td>
                        {currentSchema.fields.slice(0, 5).map((f) => (
                          <td key={f.key} className="p-3 whitespace-nowrap text-slate-700">
                            {row.data[f.key] !== null && row.data[f.key] !== undefined
                              ? String(row.data[f.key])
                              : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={currentSchema.fields.slice(0, 5).length + 4} className="p-8 text-center text-slate-400">
                        No rows found matching current filter ({previewFilter}).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 100 && (
              <p className="text-xs text-slate-400 text-right">
                Showing first 100 of {filteredRows.length} filtered rows.
              </p>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: RESULTS & SAFE RETRY (Requirements 6, 7, 9) */}
      {currentStep === 4 && executionResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-6">
          <div className="flex flex-col items-center justify-center">
            {executionResult.failedRows === 0 ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
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

            {/* Import Batch ID (Requirement 7) */}
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Batch ID:</span>
              <span className="font-mono font-bold text-slate-800">{executionResult.jobId}</span>
              <button
                type="button"
                onClick={handleCopyBatchId}
                title="Copy Batch ID"
                className="text-slate-400 hover:text-slate-700 transition"
              >
                {copiedBatchId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Retry notice banner */}
          {retryNotice && (
            <div className="mx-auto max-w-xl rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900 flex items-center justify-between">
              <span>{retryNotice}</span>
              <button
                type="button"
                onClick={() => setRetryNotice(null)}
                className="text-blue-500 hover:text-blue-700"
              >
                ✕
              </button>
            </div>
          )}

          {/* Counts Breakdown (Requirement 5 & 6) */}
          <div className="mx-auto max-w-xl grid grid-cols-4 gap-3 border-y border-slate-100 py-4 text-center">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Total Rows</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{executionResult.totalRows}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase">Imported</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{executionResult.importedRows}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase">Duplicates Skipped</p>
              <p className="text-xl font-bold text-amber-700 mt-1">{executionResult.skippedDuplicates ?? 0}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase">Failed</p>
              <p className="text-xl font-bold text-red-700 mt-1">{executionResult.failedRows}</p>
            </div>
          </div>

          {/* Error Report and Safe Retry Options (Requirement 9) */}
          {executionResult.failedRows > 0 && (
            <div className="mx-auto max-w-xl text-left bg-red-50/50 border border-red-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-red-900 uppercase">Failure Details</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadExecutionErrors}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 transition shadow-2xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Error Report</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRetrying}
                    onClick={handleRetryFailedRows}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition disabled:opacity-50 shadow-2xs"
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Retrying...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Safe Retry ({executionResult.failedRows} Rows)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <ul className="text-xs text-red-700 divide-y divide-red-100 max-h-48 overflow-y-auto">
                {executionResult.errors.map((err, idx) => (
                  <li key={idx} className="py-1.5 flex items-start gap-2">
                    <span className="font-mono font-bold text-red-900 shrink-0">Row {err.rowNumber}:</span>
                    <span>{err.errors.join("; ")}</span>
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
