"use client";

import { useState, useRef, useMemo } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertCircle,
  FileCheck,
  Info,
  Check,
} from "lucide-react";
import type { CustomerOpeningBalance } from "@/types/customer-opening-balance";
import type {
  ParsedFileInfo,
  RowValidationError,
  ImportExecutionResponse,
  ImportJobRecord,
} from "@/types/import";
import { IMPORT_MODULE_SCHEMAS } from "@/lib/import/module-schemas";
import {
  parseUploadedFile,
  autoDetectMapping,
  validateMappedRows,
  downloadModuleTemplate,
  downloadErrorReportFile,
  computeFileHash,
} from "@/lib/import/file-parser";
import { checkDuplicateFileHash, executeImportAction } from "@/lib/import/actions";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customers: { id: string; name: string; company_name: string | null; phone: string | null }[];
  existingBalances: CustomerOpeningBalance[];
}

interface PrevalidatedRow {
  rowNumber: number;
  customerName: string;
  customerCode: string;
  amount: number | string;
  balanceType: string;
  asOnDate: string;
  isValid: boolean;
  errors: string[];
  matchedCustomerId?: string;
  rawData: Record<string, any>;
}

export function BulkImportModal({
  isOpen,
  onClose,
  onSuccess,
  customers,
  existingBalances,
}: BulkImportModalProps) {
  const schema = IMPORT_MODULE_SCHEMAS.customer_opening_balances;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Step: "upload" | "preview" | "importing" | "result"
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "result">("upload");
  const [dragActive, setDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // File metadata
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>("");
  const [duplicateJobNotice, setDuplicateJobNotice] = useState<ImportJobRecord | null>(null);

  // Rows and validation
  const [previewRows, setPreviewRows] = useState<PrevalidatedRow[]>([]);
  const [rowFilter, setRowFilter] = useState<"ALL" | "VALID" | "ERROR">("ALL");

  // Confirmation state
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Execution result
  const [importResult, setImportResult] = useState<ImportExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Lookup maps for validation
  const customerLookup = useMemo(() => {
    const byId = new Map<string, (typeof customers)[0]>();
    const byName = new Map<string, (typeof customers)[0]>();
    const byPhone = new Map<string, (typeof customers)[0]>();

    customers.forEach((c) => {
      if (c.id) byId.set(c.id.toLowerCase(), c);
      if (c.name) byName.set(c.name.trim().toLowerCase(), c);
      if (c.company_name) byName.set(c.company_name.trim().toLowerCase(), c);
      if (c.phone) {
        const clean = c.phone.trim().replace(/[^0-9]/g, "");
        if (clean) byPhone.set(clean, c);
      }
    });

    return { byId, byName, byPhone };
  }, [customers]);

  const existingBalanceKeys = useMemo(() => {
    const keys = new Set<string>();
    existingBalances.forEach((b) => {
      keys.add(`${b.customer_id}:::${b.as_on_date}`);
    });
    return keys;
  }, [existingBalances]);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep("upload");
    setSelectedFile(null);
    setFileHash("");
    setDuplicateJobNotice(null);
    setPreviewRows([]);
    setRowFilter("ALL");
    setIsConfirmed(false);
    setImportResult(null);
    setExecutionError(null);
    setParseError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Process uploaded file
  const handleProcessFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setDuplicateJobNotice(null);

    try {
      // 1. Compute file hash
      const buffer = await file.arrayBuffer();
      const hash = await computeFileHash(buffer);
      setFileHash(hash);
      setSelectedFile(file);

      // 2. Check for duplicate file upload
      const dupCheck = await checkDuplicateFileHash(hash, "customer_opening_balances");
      if (dupCheck.isDuplicate && dupCheck.previousJob) {
        setDuplicateJobNotice(dupCheck.previousJob);
      }

      // 3. Parse spreadsheet
      const parsedInfo: ParsedFileInfo = await parseUploadedFile(file, "customer_opening_balances");
      const mapping = parsedInfo.detectedMapping;

      // 4. Validate mapped rows using existing framework
      const validated = validateMappedRows(parsedInfo.rawRows, schema, mapping);

      // 5. Enhance with Customer Identification & DB duplicate checks
      const processed: PrevalidatedRow[] = [];
      const seenFileCombos = new Set<string>();

      parsedInfo.rawRows.forEach((row, idx) => {
        const rowNum = idx + 2; // header is row 1
        const custNameHeader = mapping.customer_name;
        const custCodeHeader = mapping.customer_code;
        const amountHeader = mapping.amount;
        const typeHeader = mapping.balance_type;
        const dateHeader = mapping.as_on_date;

        const rawCustName = custNameHeader && row[custNameHeader] !== undefined ? String(row[custNameHeader]).trim() : "";
        const rawCustCode = custCodeHeader && row[custCodeHeader] !== undefined ? String(row[custCodeHeader]).trim() : "";
        const rawAmount = amountHeader && row[amountHeader] !== undefined ? row[amountHeader] : "";
        const rawType = typeHeader && row[typeHeader] !== undefined ? String(row[typeHeader]).trim() : "";
        const rawDate = dateHeader && row[dateHeader] !== undefined ? String(row[dateHeader]).trim() : "";

        const rowErrors: string[] = [];

        // Find customer
        let matchedCustomer: (typeof customers)[0] | undefined;
        if (rawCustCode) {
          matchedCustomer = customerLookup.byId.get(rawCustCode.toLowerCase());
        }
        if (!matchedCustomer && rawCustName) {
          matchedCustomer = customerLookup.byName.get(rawCustName.toLowerCase());
        }
        if (!matchedCustomer && rawCustCode) {
          const digits = rawCustCode.replace(/[^0-9]/g, "");
          if (digits.length >= 7) {
            matchedCustomer = customerLookup.byPhone.get(digits);
          }
        }

        if (!rawCustName && !rawCustCode) {
          rowErrors.push("Customer Name or Customer Code/ID is required.");
        } else if (!matchedCustomer) {
          rowErrors.push(`Customer "${rawCustCode || rawCustName}" not found in ERP customer directory.`);
        }

        // Amount validation
        const parsedNum = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, ""));
        if (rawAmount === "" || isNaN(parsedNum)) {
          rowErrors.push("Opening Balance Amount must be a valid number.");
        } else if (parsedNum <= 0) {
          rowErrors.push("Opening Balance Amount must be a positive number greater than 0.");
        }

        // Balance Type validation
        const normType = rawType.toUpperCase();
        let finalType = "";
        if (normType === "RECEIVABLE" || normType === "DR" || normType === "DEBIT") {
          finalType = "Receivable";
        } else if (normType === "PAYABLE" || normType === "CR" || normType === "CREDIT" || normType === "ADVANCE") {
          finalType = "Payable";
        } else {
          rowErrors.push(`Balance Type must be either 'Receivable' or 'Payable' (got "${rawType}").`);
        }

        // Date validation
        let finalDate = rawDate;
        if (!rawDate) {
          rowErrors.push("As-on Date is required (YYYY-MM-DD).");
        } else {
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) {
            rowErrors.push(`Invalid date format for As-on Date: "${rawDate}".`);
          } else {
            try {
              finalDate = d.toISOString().split("T")[0];
            } catch {
              finalDate = rawDate;
            }
          }
        }

        // Check duplicate within file
        if (matchedCustomer && finalDate) {
          const combo = `${matchedCustomer.id}:::${finalDate}`;
          if (seenFileCombos.has(combo)) {
            rowErrors.push(`Duplicate entry in file: Customer already has a record for date ${finalDate}.`);
          } else {
            seenFileCombos.add(combo);
          }

          // Check duplicate against existing DB balances
          if (existingBalanceKeys.has(combo)) {
            rowErrors.push(`Duplicate entry: Opening balance already exists in ERP for this customer on ${finalDate}.`);
          }
        }

        processed.push({
          rowNumber: rowNum,
          customerName: matchedCustomer?.name || rawCustName || "(Unknown)",
          customerCode: rawCustCode || (matchedCustomer?.id ? matchedCustomer.id.slice(0, 8) + "..." : ""),
          amount: isNaN(parsedNum) ? rawAmount : parsedNum,
          balanceType: finalType || rawType,
          asOnDate: finalDate,
          isValid: rowErrors.length === 0,
          errors: rowErrors,
          matchedCustomerId: matchedCustomer?.id,
          rawData: row,
        });
      });

      setPreviewRows(processed);
      setStep("preview");
    } catch (err: any) {
      console.error("File processing error:", err);
      setParseError(err.message || "Failed to parse the file. Please ensure it is a valid Excel or CSV file.");
    } finally {
      setIsParsing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  // Row filtering for preview table
  const validRowCount = previewRows.filter((r) => r.isValid).length;
  const invalidRowCount = previewRows.filter((r) => !r.isValid).length;

  const displayedRows = useMemo(() => {
    if (rowFilter === "VALID") return previewRows.filter((r) => r.isValid);
    if (rowFilter === "ERROR") return previewRows.filter((r) => !r.isValid);
    return previewRows;
  }, [previewRows, rowFilter]);

  // Execute Import Action
  const handleExecuteImport = async () => {
    if (validRowCount === 0) return;
    setStep("importing");
    setExecutionError(null);

    // Map rows to schema keys
    const recordsToImport = previewRows
      .filter((r) => r.isValid)
      .map((r) => ({
        _rowNumber: r.rowNumber,
        customer_name: r.customerName,
        customer_code: r.matchedCustomerId || r.customerCode,
        amount: Number(r.amount),
        balance_type: r.balanceType,
        as_on_date: r.asOnDate,
      }));

    try {
      const result = await executeImportAction({
        module: "customer_opening_balances",
        filename: selectedFile?.name || "opening_balances.xlsx",
        fileHash,
        records: recordsToImport,
      });

      // Also append the preview-stage invalid rows to result.errors if any, so error report is complete
      const initialErrors: RowValidationError[] = previewRows
        .filter((r) => !r.isValid)
        .map((r) => ({
          rowNumber: r.rowNumber,
          identifier: r.customerName,
          errors: r.errors,
          rawData: r.rawData,
        }));

      const mergedErrors = [...initialErrors, ...(result.errors || [])];

      setImportResult({
        ...result,
        totalRows: previewRows.length,
        failedRows: previewRows.length - result.importedRows,
        errors: mergedErrors,
      });

      setStep("result");
      onSuccess();
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      setExecutionError(err.message || "Failed to execute bulk import.");
      setStep("preview");
    }
  };

  const handleDownloadErrors = () => {
    if (!importResult || !importResult.errors || importResult.errors.length === 0) return;
    downloadErrorReportFile(selectedFile?.name || "opening_balances_errors.xlsx", importResult.errors);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50/50 via-white to-gray-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Bulk Import Customer Opening Balances
              </h2>
              <p className="text-xs text-gray-500">
                Upload historical ledger cutoff positions via Excel or CSV with live validation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadModuleTemplate("customer_opening_balances", "xlsx")}
              className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50/60 hover:bg-teal-100/60 text-teal-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Download pre-formatted Excel template"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              Download Template (.xlsx)
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs font-medium text-gray-600">
          <div className="flex items-center gap-6">
            <div className={`flex items-center gap-1.5 ${step === "upload" ? "text-teal-700 font-bold" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === "upload" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"}`}>1</span>
              <span>Upload File</span>
            </div>
            <div className={`flex items-center gap-1.5 ${step === "preview" ? "text-teal-700 font-bold" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === "preview" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"}`}>2</span>
              <span>Preview & Confirm</span>
            </div>
            <div className={`flex items-center gap-1.5 ${step === "importing" ? "text-teal-700 font-bold" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === "importing" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"}`}>3</span>
              <span>Importing</span>
            </div>
            <div className={`flex items-center gap-1.5 ${step === "result" ? "text-teal-700 font-bold" : "text-gray-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === "result" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-700"}`}>4</span>
              <span>Results</span>
            </div>
          </div>

          {selectedFile && (
            <div className="text-xs text-gray-500 truncate max-w-xs flex items-center gap-1 font-mono">
              <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{selectedFile.name}</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <div className="space-y-5">
              {parseError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  dragActive
                    ? "border-teal-500 bg-teal-50/60 scale-[0.99]"
                    : "border-gray-200 hover:border-teal-400 bg-gray-50/50 hover:bg-gray-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={onFileInputChange}
                  className="hidden"
                />

                <div className="w-16 h-16 mx-auto rounded-2xl bg-teal-100/70 text-teal-700 flex items-center justify-center mb-3.5 shadow-xs">
                  {isParsing ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-8 h-8" />
                  )}
                </div>

                <h3 className="text-sm font-semibold text-gray-800">
                  {isParsing ? "Parsing & validating spreadsheet..." : "Click or drag and drop spreadsheet here"}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Supports Microsoft Excel (<span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>) and Comma-Separated Values (<span className="font-mono">.csv</span>)
                </p>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium shadow-xs">
                    Browse Computer
                  </span>
                </div>
              </div>

              {/* Guidelines / Template Info Card */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 space-y-2">
                <div className="font-semibold flex items-center gap-1.5 text-blue-800">
                  <Info className="w-4 h-4 text-blue-600" />
                  Required Template Format & Columns:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700 mt-2">
                  <div className="p-2 rounded bg-white border border-blue-100">
                    <span className="font-semibold text-gray-900 block">1. Customer Name / Code</span>
                    <span className="text-[11px] text-gray-500">Matches registered customer name, company, or UUID</span>
                  </div>
                  <div className="p-2 rounded bg-white border border-blue-100">
                    <span className="font-semibold text-gray-900 block">2. Opening Balance Amount</span>
                    <span className="text-[11px] text-gray-500">Positive numeric amount in ₹ (must be &gt; 0)</span>
                  </div>
                  <div className="p-2 rounded bg-white border border-blue-100">
                    <span className="font-semibold text-gray-900 block">3. Balance Type</span>
                    <span className="text-[11px] text-gray-500">&apos;Receivable&apos; (Debit) or &apos;Payable&apos; (Credit / Advance)</span>
                  </div>
                  <div className="p-2 rounded bg-white border border-blue-100">
                    <span className="font-semibold text-gray-900 block">4. As-on Date</span>
                    <span className="text-[11px] text-gray-500">Cutoff date in YYYY-MM-DD format (e.g. 2025-04-01)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & CONFIRM */}
          {step === "preview" && (
            <div className="space-y-5">
              {/* Duplicate File Warning if triggered */}
              {duplicateJobNotice && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Notice: Identical file previously imported</span>
                    <span>
                      A file with this exact SHA-256 hash was imported on{" "}
                      {new Date(duplicateJobNotice.created_at).toLocaleDateString()} (Job ID: {duplicateJobNotice.id.slice(0, 8)}...). Existing balances for duplicate customer-date pairs will be safely rejected to prevent duplication.
                    </span>
                  </div>
                </div>
              )}

              {executionError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{executionError}</span>
                </div>
              )}

              {/* Counters & Filter Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="text-xs">
                    <span className="text-gray-500">Total Rows: </span>
                    <span className="font-bold text-gray-900">{previewRows.length}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500">Ready to Import: </span>
                    <span className="font-bold text-emerald-700">{validRowCount}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500">Invalid / Errors: </span>
                    <span className={`font-bold ${invalidRowCount > 0 ? "text-red-600" : "text-gray-600"}`}>
                      {invalidRowCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 text-xs">
                  <button
                    onClick={() => setRowFilter("ALL")}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      rowFilter === "ALL" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    All ({previewRows.length})
                  </button>
                  <button
                    onClick={() => setRowFilter("VALID")}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      rowFilter === "VALID" ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-emerald-700"
                    }`}
                  >
                    Valid ({validRowCount})
                  </button>
                  <button
                    onClick={() => setRowFilter("ERROR")}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      rowFilter === "ERROR" ? "bg-red-600 text-white" : "text-gray-600 hover:text-red-700"
                    }`}
                  >
                    Errors ({invalidRowCount})
                  </button>
                </div>
              </div>

              {/* Row-wise Preview Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-100 text-gray-700 uppercase font-semibold text-[11px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 text-left w-12">Row</th>
                      <th className="py-2.5 px-3 text-left">Customer</th>
                      <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                      <th className="py-2.5 px-3 text-left">Type</th>
                      <th className="py-2.5 px-3 text-left">As-on Date</th>
                      <th className="py-2.5 px-3 text-left">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-400">
                          No rows match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((r) => (
                        <tr
                          key={r.rowNumber}
                          className={`hover:bg-gray-50/80 transition-colors ${
                            !r.isValid ? "bg-red-50/40" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-gray-500">{r.rowNumber}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">
                            <div>{r.customerName}</div>
                            {r.customerCode && (
                              <div className="text-[10px] text-gray-400 font-mono">{r.customerCode}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900">
                            {typeof r.amount === "number"
                              ? `₹${r.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                              : String(r.amount)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                r.balanceType.toUpperCase().includes("RECEIVABLE")
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {r.balanceType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-600">{r.asOnDate}</td>
                          <td className="py-2.5 px-3">
                            {r.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Valid
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {r.errors.map((err, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-100/70 px-2 py-0.5 rounded"
                                  >
                                    <XCircle className="w-3 h-3 text-red-600 shrink-0" />
                                    {err}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Requirement 6: Explicit Confirmation Summary */}
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <FileCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider">
                      Confirmation Summary Before Import
                    </h4>
                    <p className="text-xs text-teal-800 mt-1 leading-relaxed">
                      You are about to import <span className="font-extrabold">{validRowCount}</span> customer opening balance records.
                      {invalidRowCount > 0 && (
                        <span className="text-red-700 font-semibold block mt-0.5">
                          {invalidRowCount} invalid row(s) will be excluded from the import and logged in the error report.
                        </span>
                      )}
                      These records establish initial ledger cutoff positions only. They will{" "}
                      <span className="font-bold underline">never create sales, orders, payments, or receipts</span>.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 pt-1 text-xs text-gray-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-gray-300"
                  />
                  <span className="font-semibold">
                    I confirm that I have verified the preview and authorize importing these opening balances.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: IMPORTING PROGRESS */}
          {step === "importing" && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-inner">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Importing Customer Opening Balances...
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Validating customer accounts, enforcing uniqueness constraints, and recording audit entries. Please do not close this window.
              </p>
            </div>
          )}

          {/* STEP 4: IMPORT RESULTS */}
          {step === "result" && importResult && (
            <div className="space-y-5">
              {/* Outcome Status Banner */}
              <div
                className={`p-5 rounded-2xl border ${
                  importResult.importedRows > 0 && importResult.failedRows === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : importResult.importedRows > 0
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-red-50 border-red-200 text-red-900"
                }`}
              >
                <div className="flex items-start gap-3">
                  {importResult.importedRows > 0 && importResult.failedRows === 0 ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold">
                      {importResult.importedRows > 0 && importResult.failedRows === 0
                        ? "Import Completed Successfully!"
                        : importResult.importedRows > 0
                        ? "Import Partially Completed"
                        : "Import Failed"}
                    </h3>
                    <p className="text-xs mt-1 leading-relaxed opacity-90">{importResult.message}</p>
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-current/10">
                  <div className="p-2.5 rounded-xl bg-white/80 border border-current/10 text-center">
                    <span className="text-[11px] text-gray-500 uppercase font-semibold">Total Rows</span>
                    <p className="text-xl font-extrabold text-gray-900 mt-0.5">{importResult.totalRows}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/80 border border-current/10 text-center">
                    <span className="text-[11px] text-emerald-700 uppercase font-semibold">Successfully Imported</span>
                    <p className="text-xl font-extrabold text-emerald-700 mt-0.5">{importResult.importedRows}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/80 border border-current/10 text-center">
                    <span className="text-[11px] text-red-700 uppercase font-semibold">Failed / Rejected</span>
                    <p className="text-xl font-extrabold text-red-700 mt-0.5">{importResult.failedRows}</p>
                  </div>
                </div>
              </div>

              {/* Downloadable Error Report (Requirement 9) */}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="text-xs text-gray-700 font-medium">
                      Download full details for {importResult.errors.length} failed / invalid row(s) to review and fix.
                    </span>
                  </div>

                  <button
                    onClick={handleDownloadErrors}
                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-600" />
                    Download Error Report (.xlsx)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div>
            {step === "preview" && (
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Choose Different File
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step === "upload" && (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors"
              >
                Cancel
              </button>
            )}

            {step === "preview" && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteImport}
                  disabled={!isConfirmed || validRowCount === 0}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Import {validRowCount} Balances Now
                </button>
              </>
            )}

            {step === "result" && (
              <button
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
