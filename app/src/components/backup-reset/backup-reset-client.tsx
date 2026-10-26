"use client";

import React, { useState, useTransition } from "react";
import {
  ShieldAlert,
  Database,
  Download,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Clock,
  Layers,
  Users,
  Package,
  ShoppingCart,
  CreditCard,
  Building2,
  Lock,
  ChevronRight,
  ArrowRight,
  X,
  RefreshCw,
  Info,
  Calendar,
  FileArchive,
  ExternalLink,
} from "lucide-react";
import type { AppUser } from "@/types/business";
import type { BackupResetSummary, BackupExecutionResponse, ResetExecutionResponse } from "@/types/backup";
import {
  getSystemDataSummaryAction,
  generateImportBackupAction,
  generateReportsBackupAction,
  executeDataResetAction,
} from "@/lib/backup/actions";

interface BackupResetClientProps {
  user: AppUser;
  businessName: string;
  initialSummary: BackupResetSummary;
}

export function BackupResetClient({
  user,
  businessName,
  initialSummary,
}: BackupResetClientProps) {
  const [summary, setSummary] = useState<BackupResetSummary>(initialSummary);
  const [isRefreshingSummary, startRefreshTransition] = useTransition();

  // Active verified backup token in memory/state
  const [verifiedBackupToken, setVerifiedBackupToken] = useState<string | null>(
    initialSummary.lastVerifiedBackup?.backupToken || null
  );
  const [verifiedBackupTime, setVerifiedBackupTime] = useState<string | null>(
    initialSummary.lastVerifiedBackup?.verifiedAt || null
  );
  const [lastBackupFilename, setLastBackupFilename] = useState<string | null>(
    initialSummary.lastVerifiedBackup?.filename || null
  );

  // Modal controls
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupTab, setBackupTab] = useState<"import" | "reports">("import");
  const [reportPeriod, setReportPeriod] = useState<1 | 3 | 6 | 12>(1);

  // Backup generation progress state
  const [isGeneratingBackup, setIsGeneratingBackup] = useState(false);
  const [backupProgressMsg, setBackupProgressMsg] = useState("");
  const [backupResult, setBackupResult] = useState<BackupExecutionResponse | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2 | 3 | 4>(1);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [acknowledgedCheckbox, setAcknowledgedCheckbox] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetExecutionResponse | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Refresh summary data
  const handleRefreshSummary = () => {
    startRefreshTransition(async () => {
      try {
        const fresh = await getSystemDataSummaryAction();
        setSummary(fresh);
        if (fresh.lastVerifiedBackup) {
          setVerifiedBackupToken(fresh.lastVerifiedBackup.backupToken);
          setVerifiedBackupTime(fresh.lastVerifiedBackup.verifiedAt);
          setLastBackupFilename(fresh.lastVerifiedBackup.filename);
        }
      } catch (err: any) {
        console.error("Failed to refresh summary:", err);
      }
    });
  };

  // Trigger browser download of base64 zip buffer
  const triggerZipDownload = (base64Content: string, filename: string) => {
    try {
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error triggering download:", e);
    }
  };

  // Generate Import Format Backup
  const handleGenerateImportBackup = async () => {
    setIsGeneratingBackup(true);
    setBackupError(null);
    setBackupResult(null);
    setBackupProgressMsg("Querying database records across all 9 import modules...");

    try {
      setBackupProgressMsg("Building Excel templates, CSV files, and relational database snapshots...");
      const res = await generateImportBackupAction();

      setBackupResult(res);
      setVerifiedBackupToken(res.backupToken);
      setVerifiedBackupTime(res.generatedAt);
      setLastBackupFilename(res.filename);

      if (res.zipBase64) {
        triggerZipDownload(res.zipBase64, res.filename);
      }

      setBackupProgressMsg("Download started! Backup verified and recorded in security log.");
      handleRefreshSummary();
    } catch (err: any) {
      let msg = err?.message || "Failed to generate complete import format backup.";
      try {
        if (typeof msg === "string" && msg.startsWith("{")) {
          const parsed = JSON.parse(msg);
          if (parsed.message) msg = `${parsed.message}${parsed.hint ? ` (${parsed.hint})` : ""}`;
        }
      } catch {}
      setBackupError(msg);
    } finally {
      setIsGeneratingBackup(false);
    }
  };

  // Generate Reports Format Backup
  const handleGenerateReportsBackup = async () => {
    setIsGeneratingBackup(true);
    setBackupError(null);
    setBackupResult(null);
    setBackupProgressMsg(`Compiling all 12 operational & sales reports for the last ${reportPeriod} month(s)...`);

    try {
      const res = await generateReportsBackupAction(reportPeriod);
      setBackupResult(res);

      if (res.zipBase64) {
        triggerZipDownload(res.zipBase64, res.filename);
      }

      setBackupProgressMsg(`Download started! All ${reportPeriod}-month reports packaged into ZIP archive.`);
      handleRefreshSummary();
    } catch (err: any) {
      let msg = err?.message || `Failed to generate ${reportPeriod}-month reports archive.`;
      try {
        if (typeof msg === "string" && msg.startsWith("{")) {
          const parsed = JSON.parse(msg);
          if (parsed.message) msg = `${parsed.message}${parsed.hint ? ` (${parsed.hint})` : ""}`;
        }
      } catch {}
      setBackupError(msg);
    } finally {
      setIsGeneratingBackup(false);
    }
  };

  // Execute Destructive Reset Action
  const handleExecuteReset = async () => {
    if (confirmationInput !== "RESET ALL DATA") return;
    if (!verifiedBackupToken) {
      setResetError("A verified backup token is required before reset can be initiated.");
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const res = await executeDataResetAction({
        confirmationText: confirmationInput,
        backupToken: verifiedBackupToken,
      });

      setResetResult(res);
      setResetStep(4);
      handleRefreshSummary();
    } catch (err: any) {
      setResetError(err.message || "Failed to execute database reset procedure.");
    } finally {
      setIsResetting(false);
    }
  };

  const hasRecentVerifiedBackup = Boolean(verifiedBackupToken);

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Super Admin Top Badge & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Super Admin Console
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Lock className="w-3 h-3" /> Strict Isolation
            </span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Data Backup & System Reset
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Enterprise database backups, multi-period audit reporting, and controlled transactional reset for{" "}
            <span className="font-semibold text-gray-900">{businessName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshSummary}
            disabled={isRefreshingSummary}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSummary ? "animate-spin text-teal-600" : ""}`} />
            Refresh Data Counts
          </button>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/80 flex items-start gap-3 text-amber-900 shadow-xs">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm space-y-1">
          <p className="font-semibold">Super Admin Safety Protocol Enforced</p>
          <p className="text-amber-800 leading-relaxed">
            Downloading a complete backup does not modify or delete any database rows. The data reset procedure is strictly protected by mandatory approval gates: it requires a verified backup in the current session, explicit preview of affected counts, and exact confirmation text. Master records, GST settings, and user accounts remain 100% untouched by default.
          </p>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Transactional Records</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {summary.transactional.totalTransactionalRecords.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {summary.transactional.orders} orders, {summary.transactional.payments} payments, {summary.transactional.productionOrders} production
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Protected Master Entities</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {(
              summary.masterData.customers +
              summary.masterData.suppliers +
              summary.masterData.products +
              summary.masterData.categories +
              summary.masterData.rawMaterials
            ).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {summary.masterData.customers} customers, {summary.masterData.products} products, {summary.masterData.categories} categories
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Accounts & Config</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">
            {summary.masterData.users} Users
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Protected Admin/Staff accounts &amp; business profile
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Backup Verification</span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                hasRecentVerifiedBackup
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {hasRecentVerifiedBackup ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
          </div>
          <p className="mt-3 text-sm font-bold text-gray-900 truncate">
            {hasRecentVerifiedBackup ? "Verified & Ready" : "Backup Required"}
          </p>
          <p className="mt-1 text-xs text-gray-500 truncate">
            {verifiedBackupTime
              ? `Last: ${new Date(verifiedBackupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "No backup downloaded yet"}
          </p>
        </div>
      </div>

      {/* Main Two Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ACTION CARD 1: DOWNLOAD COMPLETE BACKUP */}
        <div className="p-6 sm:p-7 bg-white rounded-2xl border-2 border-teal-600/30 hover:border-teal-600/60 shadow-sm transition-all flex flex-col justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50/50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-100 text-teal-800">
                <Database className="w-3.5 h-3.5 text-teal-700" />
                Data Protection
              </span>
              <span className="text-xs text-gray-400 font-mono">Archive & Export</span>
            </div>

            <h2 className="mt-4 text-xl font-bold text-gray-900 group-hover:text-teal-700 transition-colors">
              Download Complete Backup
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
              Export all business records in either <strong>Import Format</strong> (compatible with existing import templates and relational restoration) or <strong>Reports Format</strong> (multi-period PDF/Excel/CSV audit packages for 1, 3, 6, or 12 months).
            </p>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>9 module templates (Customers, Suppliers, Products, Stock, Orders, Payments, Purchases, Expenses)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Full relational database tables JSON snapshot with foreign keys</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <span>One-click multi-period report compilation (PDF/Excel/CSV packaged into ZIP)</span>
              </div>
            </div>
          </div>

          <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">Zero system downtime</span>
            <button
              onClick={() => {
                setBackupModalOpen(true);
                setBackupError(null);
                setBackupResult(null);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Backup Modal
            </button>
          </div>
        </div>

        {/* ACTION CARD 2: RESET ALL DATA */}
        <div className="p-6 sm:p-7 bg-white rounded-2xl border-2 border-rose-200 hover:border-rose-400 shadow-sm transition-all flex flex-col justify-between group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50/60 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                Destructive Action
              </span>
              <span className="text-xs text-rose-600 font-semibold uppercase">Super Admin Only</span>
            </div>

            <h2 className="mt-4 text-xl font-bold text-gray-900 group-hover:text-rose-700 transition-colors">
              Reset All Data
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">
              Safely purges transactional records (Orders, Items, Payments, Customer Ledger, Deliveries, Production, and Stock logs) in correct foreign-key sequence while strictly preserving Master Data, User Accounts, GST Configuration, and Business Profile.
            </p>

            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Preserves Schema, Super Admin/Admin accounts, and GST configuration</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Preserves Master Catalogs (Customers, Suppliers, Products, Categories, BOM)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Mandatory pre-reset verified backup requirement &amp; audit logging</span>
              </div>
            </div>
          </div>

          <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-rose-600 font-medium">Irreversible without verified backup</span>
            <button
              onClick={() => {
                setResetModalOpen(true);
                setResetStep(1);
                setConfirmationInput("");
                setAcknowledgedCheckbox(false);
                setResetError(null);
                setResetResult(null);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reset All Data
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: DOWNLOAD COMPLETE BACKUP MODAL */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Download Complete Backup</h3>
                  <p className="text-xs text-gray-500">Choose between Import Format (Restoration) or Reports Format (Audit)</p>
                </div>
              </div>
              <button
                onClick={() => setBackupModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs Header */}
            <div className="flex border-b border-gray-200 bg-white px-6">
              <button
                onClick={() => {
                  setBackupTab("import");
                  setBackupResult(null);
                  setBackupError(null);
                }}
                className={`py-3.5 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                  backupTab === "import"
                    ? "border-teal-700 text-teal-800"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Format A: Import Format (Restoration)
              </button>
              <button
                onClick={() => {
                  setBackupTab("reports");
                  setBackupResult(null);
                  setBackupError(null);
                }}
                className={`py-3.5 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                  backupTab === "reports"
                    ? "border-teal-700 text-teal-800"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                <FileText className="w-4 h-4" />
                Format B: Reports Format (Multi-Period Audit)
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {backupTab === "import" ? (
                // TAB A: IMPORT FORMAT
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 text-teal-900 text-xs sm:text-sm">
                    <p className="font-semibold text-teal-950">Restoration-Ready Archive Format</p>
                    <p className="mt-1 text-teal-800 leading-relaxed">
                      Downloads all 9 supported ERP modules using exact import template headers, filled with real database records. Also includes raw relational database tables in JSON format so data can be restored completely via the existing Import module.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                      Included Modules &amp; Live Records
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { title: "Customers", count: summary.masterData.customers, file: "customers_template_filled.xlsx" },
                        { title: "Suppliers", count: summary.masterData.suppliers, file: "suppliers_template_filled.xlsx" },
                        { title: "Products & Categories", count: summary.masterData.products, file: "products_template_filled.xlsx" },
                        { title: "Opening Finished Goods Stock", count: summary.masterData.products, file: "opening_finished_goods_template_filled.xlsx" },
                        { title: "Opening Raw Material Stock", count: summary.masterData.rawMaterials, file: "opening_raw_materials_template_filled.xlsx" },
                        { title: "Historical Sales Orders", count: summary.transactional.orders, file: "historical_orders_template_filled.xlsx" },
                        { title: "Historical Payments & Balances", count: summary.transactional.payments, file: "historical_payments_template_filled.xlsx" },
                        { title: "Purchases & POs", count: summary.transactional.purchaseOrders, file: "purchases_template_filled.xlsx" },
                        { title: "Expenses", count: summary.transactional.expenses, file: "expenses_template_filled.xlsx" },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-gray-900">{item.title}</span>
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">{item.file}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-white border border-gray-200 rounded font-semibold text-teal-700">
                            {item.count} rows
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center gap-2">
                    <FileArchive className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>Also bundles <code>database_relational_tables/</code> JSON dump and <code>backup_manifest.json</code> with SHA-256 integrity checksums.</span>
                  </div>
                </div>
              ) : (
                // TAB B: REPORTS FORMAT
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs sm:text-sm">
                    <p className="font-semibold text-blue-950">One-Click Multi-Period Audit Archive</p>
                    <p className="mt-1 text-blue-800 leading-relaxed">
                      Generates every existing system report for your chosen period, formatted using professional accounting standards. Packages all PDFs into a single ZIP file alongside companion Excel and CSV spreadsheets.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                      Select Reporting Period
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { period: 1, label: "1 Month", desc: "Last 30 Days" },
                        { period: 3, label: "3 Months", desc: "Last 90 Days" },
                        { period: 6, label: "6 Months", desc: "Last 180 Days" },
                        { period: 12, label: "12 Months", desc: "Full Fiscal Year" },
                      ].map((p) => (
                        <button
                          key={p.period}
                          type="button"
                          onClick={() => setReportPeriod(p.period as any)}
                          className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                            reportPeriod === p.period
                              ? "border-teal-600 bg-teal-50/60 text-teal-900"
                              : "border-gray-200 hover:border-gray-300 text-gray-700"
                          }`}
                        >
                          <div className="font-bold text-sm">{p.label}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                      12 Reports Generated In This Archive
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700">
                      {[
                        "Sales Report (with District Summary & Ledger)",
                        "State-Wise GST Summary Report",
                        "Sale Details / Product-Wise Report",
                        "Detailed Sales Transactions",
                        "Sales Orders Register",
                        "Payments & Collections Report",
                        "Customer Due & Ledger Statement",
                        "Expenses Report by Category",
                        "Profit & Loss Financial Statement",
                        "Production Orders & Schedule Report",
                        "Inventory & Stock Availability Report",
                        "Logistics & Delivery Dispatch Report",
                      ].map((name, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-gray-50 border border-gray-100">
                          <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span className="truncate">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Progress / Status / Error Display */}
              {isGeneratingBackup && (
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-teal-700 animate-spin shrink-0" />
                  <div className="text-xs sm:text-sm text-teal-900 font-medium">
                    {backupProgressMsg || "Generating backup archive..."}
                  </div>
                </div>
              )}

              {backupError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-rose-900">Backup Failed</p>
                      <p className="font-mono text-xs text-rose-700 break-all">{backupError}</p>
                    </div>
                  </div>
                  <button
                    onClick={backupTab === "import" ? handleGenerateImportBackup : handleGenerateReportsBackup}
                    disabled={isGeneratingBackup}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}

              {backupResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-950">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Backup Verified &amp; Saved Successfully!</span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-800 bg-white/70 p-2.5 rounded border border-emerald-200 space-y-1">
                    <div><strong>File:</strong> {backupResult.filename} ({(backupResult.fileSizeBytes / 1024).toFixed(1)} KB)</div>
                    <div><strong>Token:</strong> {backupResult.backupToken}</div>
                    {backupResult.checksumSha256 && (
                      <div className="truncate"><strong>SHA-256:</strong> {backupResult.checksumSha256}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {backupTab === "import" ? "Format: Timestamped ZIP with XLSX, CSV & JSON" : `Period: ${reportPeriod} Month(s) PDF Archive`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBackupModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>

                {backupTab === "import" ? (
                  <button
                    onClick={handleGenerateImportBackup}
                    disabled={isGeneratingBackup}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingBackup ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Generating Archive...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Generate &amp; Download Import Backup (.zip)
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateReportsBackup}
                    disabled={isGeneratingBackup}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingBackup ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Packaging Reports...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Generate &amp; Package All Reports (.zip)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: RESET ALL DATA MANDATORY APPROVAL FLOW MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-rose-300">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Reset All Data — Approval Flow (Step {resetStep} of 4)
                  </h3>
                  <p className="text-xs text-rose-700 font-medium">Destructive Operation &bull; Mandatory Verification Gates</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Tabs */}
            <div className="grid grid-cols-4 border-b border-gray-200 text-center text-xs font-semibold bg-gray-50/50">
              <div className={`py-2.5 border-b-2 ${resetStep >= 1 ? "border-rose-600 text-rose-800" : "border-transparent text-gray-400"}`}>
                1. Verification
              </div>
              <div className={`py-2.5 border-b-2 ${resetStep >= 2 ? "border-rose-600 text-rose-800" : "border-transparent text-gray-400"}`}>
                2. Preview
              </div>
              <div className={`py-2.5 border-b-2 ${resetStep >= 3 ? "border-rose-600 text-rose-800" : "border-transparent text-gray-400"}`}>
                3. Confirmation
              </div>
              <div className={`py-2.5 border-b-2 ${resetStep >= 4 ? "border-rose-600 text-rose-800" : "border-transparent text-gray-400"}`}>
                4. Audit Receipt
              </div>
            </div>

            {/* Step Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {resetStep === 1 && (
                // STEP 1: WARNING & BACKUP PREREQUISITE
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-rose-950">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      Warning: Irreversible Data Deletion
                    </p>
                    <p className="text-rose-800 leading-relaxed">
                      Resetting the database will permanently delete all transactional records across Orders, Payments, Customer Ledgers, Production Orders, and Deliveries. This operation cannot be undone unless you possess a complete, verified backup.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Mandatory Pre-requisite: Verified Backup
                    </h4>

                    {hasRecentVerifiedBackup ? (
                      <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Verified Backup Detected</p>
                          <p className="font-mono text-[11px] text-emerald-800 mt-0.5">Token: {verifiedBackupToken}</p>
                          {verifiedBackupTime && (
                            <p className="text-[11px] text-emerald-700 mt-0.5">
                              Verified at: {new Date(verifiedBackupTime).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">No Verified Backup Found in Current Session</p>
                          <p className="mt-0.5 text-amber-800">
                            Safety rule: You must download a complete backup before the system unlocks the data reset procedure.
                          </p>
                          <button
                            onClick={() => {
                              setResetModalOpen(false);
                              setBackupModalOpen(true);
                              setBackupTab("import");
                            }}
                            className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Complete Backup Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {resetStep === 2 && (
                // STEP 2: PREVIEW OF AFFECTED TABLES & DATA
                <div className="space-y-4">
                  <p className="text-xs sm:text-sm text-gray-600">
                    Review the exact record counts that will be purged versus the master configurations that will remain untouched:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* TO BE DELETED */}
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-3">
                      <div className="flex items-center gap-1.5 text-rose-800 font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        Will Be Deleted ({summary.transactional.totalTransactionalRecords} rows)
                      </div>
                      <div className="space-y-1.5 text-gray-700">
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Sales Orders &amp; Items</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.orders} orders ({summary.transactional.orderItems} items)</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Payments &amp; Ledger</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.payments} payments ({summary.transactional.customerLedger} ledger rows)</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Production Orders</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.productionOrders} orders &amp; schedules</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Deliveries</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.deliveries} deliveries</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Purchase Orders</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.purchaseOrders} POs</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Stock Logs &amp; Current Counts</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.inventoryTransactions} transactions (stock resets to 0)</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-rose-100">
                          <span>Expenses &amp; Import Logs</span>
                          <span className="font-semibold text-rose-800">{summary.transactional.expenses} expenses, {summary.transactional.importJobs} import logs</span>
                        </div>
                      </div>
                    </div>

                    {/* WILL REMAIN INTACT */}
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Will Remain Intact (Preserved)
                      </div>
                      <div className="space-y-1.5 text-gray-700">
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Database Schema &amp; Tables</span>
                          <span className="font-semibold text-emerald-800">100% Preserved</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Super Admin &amp; Staff Accounts</span>
                          <span className="font-semibold text-emerald-800">{summary.masterData.users} Users</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Company Profile &amp; GSTIN</span>
                          <span className="font-semibold text-emerald-800">Preserved</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Customer Directory</span>
                          <span className="font-semibold text-emerald-800">{summary.masterData.customers} Customers</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Supplier Directory</span>
                          <span className="font-semibold text-emerald-800">{summary.masterData.suppliers} Suppliers</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Products &amp; Categories</span>
                          <span className="font-semibold text-emerald-800">{summary.masterData.products} Products, {summary.masterData.categories} Cats</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-emerald-100">
                          <span>Raw Materials &amp; BOM Config</span>
                          <span className="font-semibold text-emerald-800">{summary.masterData.rawMaterials} Materials</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {resetStep === 3 && (
                // STEP 3: EXPLICIT CONFIRMATION INPUT
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2 text-xs">
                    <p className="font-bold text-gray-900">Operator Authentication &amp; Token Stamp</p>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                      <div>Operator: <span className="font-semibold text-gray-900">{user.name} ({user.email})</span></div>
                      <div>Role: <span className="font-semibold text-rose-700">Super Admin</span></div>
                      <div>Target Business: <span className="font-semibold text-gray-900">{businessName}</span></div>
                      <div className="truncate">Backup Token: <span className="font-mono text-emerald-700 font-semibold">{verifiedBackupToken}</span></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-800">
                      Type <span className="font-mono bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">RESET ALL DATA</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      placeholder="RESET ALL DATA"
                      className="w-full px-3.5 py-2.5 border-2 border-gray-300 rounded-xl text-sm font-mono tracking-wider focus:border-rose-600 focus:outline-hidden"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={acknowledgedCheckbox}
                      onChange={(e) => setAcknowledgedCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>
                      I understand that all transactional records listed will be permanently purged in safe foreign-key sequence, and I have verified the backup archive.
                    </span>
                  </label>

                  {resetError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{resetError}</span>
                    </div>
                  )}
                </div>
              )}

              {resetStep === 4 && resetResult && (
                // STEP 4: SUCCESS & AUDIT RECEIPT
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Transactional Reset Executed Successfully
                    </div>
                    <p className="text-xs text-emerald-800">{resetResult.message}</p>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/80 space-y-3 text-xs">
                    <div className="font-bold uppercase tracking-wider text-gray-600">
                      Audit Log Event Generated
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                      <div>Timestamp: <span className="font-semibold text-gray-900">{new Date(resetResult.timestamp).toLocaleString()}</span></div>
                      <div>Action: <span className="font-mono font-semibold text-rose-700">SYSTEM_DATA_RESET</span></div>
                      <div>Operator: <span className="font-semibold text-gray-900">{user.name}</span></div>
                      <div className="truncate">Backup Token: <span className="font-mono text-emerald-700">{verifiedBackupToken}</span></div>
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                      <span className="font-semibold text-gray-700 block mb-1.5">Purged Table Summary:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] font-mono text-gray-600">
                        {Object.entries(resetResult.clearedCounts || {}).map(([key, count]) => (
                          <div key={key} className="bg-white p-1.5 rounded border border-gray-200">
                            {key}: <span className="font-bold text-gray-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              {resetStep === 1 && (
                <>
                  <button
                    onClick={() => setResetModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setResetStep(2)}
                    disabled={!hasRecentVerifiedBackup}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Proceed to Data Preview <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {resetStep === 2 && (
                <>
                  <button
                    onClick={() => setResetStep(1)}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    &larr; Back
                  </button>
                  <button
                    onClick={() => setResetStep(3)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Proceed to Confirmation <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {resetStep === 3 && (
                <>
                  <button
                    onClick={() => setResetStep(2)}
                    disabled={isResetting}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    &larr; Back
                  </button>
                  <button
                    onClick={handleExecuteReset}
                    disabled={confirmationInput !== "RESET ALL DATA" || !acknowledgedCheckbox || isResetting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Executing Reset Transaction...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Permanently Reset All Transactional Data
                      </>
                    )}
                  </button>
                </>
              )}

              {resetStep === 4 && (
                <div className="w-full flex justify-end">
                  <button
                    onClick={() => {
                      setResetModalOpen(false);
                      handleRefreshSummary();
                    }}
                    className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Done &amp; Return to Console
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
