"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  History,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Calendar,
  Building2,
  Users,
  ShieldAlert,
  ArrowRight,
  Info,
  Clock,
  ChevronRight,
  Download,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import type { AppUser } from "@/types/business";
import type {
  CustomerOpeningBalance,
  CustomerBalanceType,
  CustomerOpeningBalanceAuditItem,
  CustomerOption,
} from "@/types/customer-opening-balance";
import {
  setCustomerOpeningBalanceAction,
  deleteCustomerOpeningBalanceAction,
  getAllCustomerOpeningBalancesAction,
  getOpeningBalanceAuditHistoryAction,
} from "@/lib/customers/opening-balance-actions";
import { downloadModuleTemplate } from "@/lib/import/file-parser";
import { BulkImportModal } from "./bulk-import-modal";

interface Props {
  user: AppUser;
  businessName: string;
  initialBalances: CustomerOpeningBalance[];
  customers: CustomerOption[];
  initialAuditLogs: CustomerOpeningBalanceAuditItem[];
}

export function CustomerOpeningBalancesClient({
  user,
  businessName,
  initialBalances,
  customers,
  initialAuditLogs,
}: Props) {
  const [balances, setBalances] = useState<CustomerOpeningBalance[]>(initialBalances);
  const [auditLogs, setAuditLogs] = useState<CustomerOpeningBalanceAuditItem[]>(initialAuditLogs);
  const [isRefreshing, startRefreshTransition] = useTransition();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "RECEIVABLE" | "PAYABLE">("ALL");

  // Form Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [balanceType, setBalanceType] = useState<CustomerBalanceType>("RECEIVABLE");
  const [asOnDate, setAsOnDate] = useState(() => {
    // Default to April 1st of current year or today
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
  });
  const [notesInput, setNotesInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CustomerOpeningBalance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Audit History drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [selectedAuditCustomer, setSelectedAuditCustomer] = useState<{ id: string; name: string } | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Bulk Import Modal state
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

  // Customer dropdown filter
  const filteredCustomerOptions = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customers, customerSearch]);

  const selectedCustomerInfo = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Filtered opening balances list
  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      const matchesSearch =
        searchQuery === "" ||
        (b.customer_name && b.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.customer_company && b.customer_company.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.notes && b.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType = typeFilter === "ALL" || b.balance_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [balances, searchQuery, typeFilter]);

  // Statistics
  const stats = useMemo(() => {
    let totalReceivable = 0;
    let totalPayable = 0;
    for (const b of balances) {
      if (b.balance_type === "RECEIVABLE") {
        totalReceivable += b.amount;
      } else {
        totalPayable += b.amount;
      }
    }
    const net = totalReceivable - totalPayable;
    return {
      count: balances.length,
      totalReceivable,
      totalPayable,
      net,
    };
  }, [balances]);

  // Refresh data from server
  const handleRefresh = () => {
    startRefreshTransition(async () => {
      try {
        const [updatedBalances, updatedAudit] = await Promise.all([
          getAllCustomerOpeningBalancesAction(),
          getOpeningBalanceAuditHistoryAction(),
        ]);
        setBalances(updatedBalances);
        setAuditLogs(updatedAudit);
      } catch (err) {
        console.error("Refresh failed:", err);
      }
    });
  };

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingId(null);
    setSelectedCustomerId("");
    setCustomerSearch("");
    setAmountInput("");
    setBalanceType("RECEIVABLE");
    setNotesInput("");
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (b: CustomerOpeningBalance) => {
    setEditingId(b.id);
    setSelectedCustomerId(b.customer_id);
    setCustomerSearch(b.customer_name || "");
    setAmountInput(String(b.amount));
    setBalanceType(b.balance_type);
    setAsOnDate(b.as_on_date);
    setNotesInput(b.notes || "");
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  // Open Audit history
  const handleOpenAudit = async (b?: CustomerOpeningBalance) => {
    if (b) {
      setSelectedAuditCustomer({ id: b.customer_id, name: b.customer_name || "Customer" });
    } else {
      setSelectedAuditCustomer(null);
    }
    setAuditDrawerOpen(true);
    setIsLoadingAudit(true);
    try {
      const logs = await getOpeningBalanceAuditHistoryAction(b?.customer_id);
      setAuditLogs(logs);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Save (Create or Update) Opening Balance
  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Validation
    if (!selectedCustomerId) {
      setFormError("Please select a customer.");
      return;
    }

    const numAmount = parseFloat(amountInput);
    if (Number.isNaN(numAmount) || numAmount < 0) {
      setFormError("Opening balance amount must be a valid non-negative number.");
      return;
    }

    if (!asOnDate) {
      setFormError("Please select an as-on date.");
      return;
    }

    // Check client-side duplicate prevention if creating new
    if (!editingId) {
      const exists = balances.some(
        (b) => b.customer_id === selectedCustomerId && b.as_on_date === asOnDate
      );
      if (exists) {
        setFormError(
          `An opening balance is already registered for this customer on ${asOnDate}. You can edit the existing entry instead.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await setCustomerOpeningBalanceAction({
        customerId: selectedCustomerId,
        amount: numAmount,
        balanceType,
        asOnDate,
        notes: notesInput.trim() || null,
      });

      if (!res.success) {
        setFormError(res.error || "Failed to save opening balance.");
      } else {
        setFormSuccess(
          editingId
            ? "Customer opening balance updated successfully!"
            : "Customer opening balance created successfully!"
        );
        // Refresh local data
        const [updatedBalances, updatedAudit] = await Promise.all([
          getAllCustomerOpeningBalancesAction(),
          getOpeningBalanceAuditHistoryAction(),
        ]);
        setBalances(updatedBalances);
        setAuditLogs(updatedAudit);

        setTimeout(() => {
          setModalOpen(false);
          setFormSuccess(null);
        }, 1200);
      }
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteCustomerOpeningBalanceAction(
        deleteTarget.customer_id,
        deleteTarget.as_on_date
      );
      if (!res.success) {
        setDeleteError(res.error || "Failed to delete opening balance record.");
      } else {
        setDeleteTarget(null);
        handleRefresh();
      }
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete opening balance.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb & Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500" aria-label="Breadcrumb">
        <Link href="/customers" className="hover:text-teal-700 transition-colors flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          <span>Customers</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        <span className="font-semibold text-gray-900">Opening Balances</span>
      </nav>

      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-600" />
              Financial Master Data
            </span>
            <span className="text-xs text-gray-400 font-mono">Admin Only</span>
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Wallet className="w-7 h-7 text-teal-700" />
            Customer Opening Balances
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Define net opening receivable or payable ledger positions as of migration cutoff dates for{" "}
            <span className="font-semibold text-gray-900">{businessName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => downloadModuleTemplate("customer_opening_balances", "xlsx")}
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            title="Download Customer Opening Balances Excel template"
          >
            <Download className="w-4 h-4 text-gray-500" />
            Template (.xlsx)
          </button>

          <button
            onClick={() => setBulkImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50/60 hover:bg-teal-100/60 text-teal-800 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Upload className="w-4 h-4 text-teal-700" />
            Bulk Import
          </button>

          <button
            onClick={() => handleOpenAudit()}
            className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <History className="w-4 h-4 text-gray-500" />
            Audit History
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-teal-600" : ""}`} />
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all hover:shadow"
          >
            <Plus className="w-4 h-4" />
            Add Opening Balance
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Records */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Configured Customers</span>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{stats.count}</p>
          <span className="text-xs text-gray-400 mt-0.5 block">Unique cutoff snapshots</span>
        </div>

        {/* Total Opening Receivables */}
        <div className="p-4 bg-white rounded-2xl border border-amber-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-800 uppercase tracking-wider">Total Receivables</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold uppercase">Debit</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-900">
            ₹{stats.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-amber-700 mt-0.5 block">Amount owed by customers</span>
        </div>

        {/* Total Opening Payables */}
        <div className="p-4 bg-white rounded-2xl border border-emerald-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-800 uppercase tracking-wider">Total Payables / Advances</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase">Credit</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-900">
            ₹{stats.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-xs text-emerald-700 mt-0.5 block">Opening customer advances</span>
        </div>

        {/* Net Opening Position */}
        <div className="p-4 bg-white rounded-2xl border border-teal-200 shadow-sm">
          <span className="text-xs font-medium text-teal-800 uppercase tracking-wider">Net Opening Position</span>
          <p className={`mt-2 text-2xl font-extrabold ${stats.net >= 0 ? "text-teal-900" : "text-emerald-900"}`}>
            ₹{Math.abs(stats.net).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs font-semibold ml-1.5 text-gray-500 font-mono">
              ({stats.net >= 0 ? "Dr" : "Cr"})
            </span>
          </p>
          <span className="text-xs text-gray-500 mt-0.5 block">
            {stats.net >= 0 ? "Net Amount Receivable" : "Net Customer Advance"}
          </span>
        </div>
      </div>

      {/* Accounting Notice Banner */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs sm:text-sm text-slate-700">
        <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900">Accounting Foundation Rule</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Opening balance represents the customer&apos;s net closing balance on the migration as-on date. It does <strong>NOT</strong> record fake orders, sales, payments, or receipts, nor does it inflate lifetime sales. Closing dues and advances are calculated as:{" "}
            <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">
              Closing = Opening Balance + New Sales − Payments Received − Adjustments
            </code>.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer name, company, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium hidden sm:inline">Type:</span>
          <div className="inline-flex rounded-xl p-1 bg-gray-100 border border-gray-200 text-xs font-semibold">
            <button
              onClick={() => setTypeFilter("ALL")}
              className={`px-3 py-1 rounded-lg transition-all ${
                typeFilter === "ALL" ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All ({balances.length})
            </button>
            <button
              onClick={() => setTypeFilter("RECEIVABLE")}
              className={`px-3 py-1 rounded-lg transition-all ${
                typeFilter === "RECEIVABLE"
                  ? "bg-amber-100 text-amber-900 shadow-xs font-bold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Receivable ({balances.filter((b) => b.balance_type === "RECEIVABLE").length})
            </button>
            <button
              onClick={() => setTypeFilter("PAYABLE")}
              className={`px-3 py-1 rounded-lg transition-all ${
                typeFilter === "PAYABLE"
                  ? "bg-emerald-100 text-emerald-900 shadow-xs font-bold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Payable ({balances.filter((b) => b.balance_type === "PAYABLE").length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {filteredBalances.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
              <Wallet className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900">No Opening Balances Found</h3>
            <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
              {searchQuery || typeFilter !== "ALL"
                ? "No customer opening balances matched your current filter criteria."
                : "No customer opening balances have been defined yet. Create your first opening balance to initialize customer ledgers."}
            </p>
            {!searchQuery && typeFilter === "ALL" && (
              <button
                onClick={handleOpenAdd}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Add First Opening Balance
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 sm:px-6">Customer</th>
                  <th className="py-3.5 px-4">Amount (₹)</th>
                  <th className="py-3.5 px-4">Balance Type</th>
                  <th className="py-3.5 px-4">As-on Date</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">Created By</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                {filteredBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-teal-50/20 transition-colors group">
                    {/* Customer */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-bold text-gray-900 group-hover:text-teal-700 transition-colors">
                        <Link href={`/customers/${b.customer_id}`} className="hover:underline">
                          {b.customer_name}
                        </Link>
                      </div>
                      {b.customer_company && (
                        <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-gray-400" />
                          <span>{b.customer_company}</span>
                        </div>
                      )}
                      {b.notes && (
                        <p className="text-[11px] text-gray-400 italic mt-0.5 max-w-xs truncate" title={b.notes}>
                          Note: {b.notes}
                        </p>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      ₹{b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4">
                      {b.balance_type === "RECEIVABLE" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Receivable (Dr)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Payable / Adv (Cr)
                        </span>
                      )}
                    </td>

                    {/* As-on Date */}
                    <td className="py-3.5 px-4 text-gray-700 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{b.as_on_date}</span>
                      </div>
                    </td>

                    {/* Created By */}
                    <td className="py-3.5 px-4 text-xs text-gray-500 hidden md:table-cell">
                      <span>{b.creator_name || "Admin"}</span>
                      <span className="block text-[10px] text-gray-400">
                        {new Date(b.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right sm:pr-6">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleOpenAudit(b)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-700 hover:bg-gray-100 transition-colors"
                          title="View audit history"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-700 hover:bg-gray-100 transition-colors"
                          title="Edit opening balance"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(b)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete opening balance"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL: ADD / EDIT OPENING BALANCE */}
      {/* ==================================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {editingId ? "Edit Customer Opening Balance" : "Add Customer Opening Balance"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {editingId
                      ? "Update baseline cutoff net balance and audit trail."
                      : "Initialize customer opening ledger position on cutoff date."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isSubmitting && setModalOpen(false)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveOpeningBalance} className="p-6 space-y-4">
              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Customer <span className="text-rose-500">*</span>
                </label>
                {editingId ? (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 font-semibold flex items-center justify-between">
                    <span>{selectedCustomerInfo?.name || "Customer"}</span>
                    <span className="text-xs text-gray-500 font-normal">{selectedCustomerInfo?.company_name}</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customer name or company..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      required
                    >
                      <option value="">-- Choose Customer ({filteredCustomerOptions.length} available) --</option>
                      {filteredCustomerOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.company_name ? `(${c.company_name})` : ""} {c.hasOpeningBalance ? "• [Has OB]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Amount (₹) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Opening Balance Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    required
                  />
                </div>
              </div>

              {/* Balance Type (Receivable vs Payable) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Balance Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBalanceType("RECEIVABLE")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      balanceType === "RECEIVABLE"
                        ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/20 shadow-xs"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">Receivable</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-200/80 text-amber-900">Dr</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Customer owes money to business</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBalanceType("PAYABLE")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      balanceType === "PAYABLE"
                        ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-400/20 shadow-xs"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">Payable / Advance</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-200/80 text-emerald-900">Cr</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Customer has pre-paid / advance</p>
                  </button>
                </div>
              </div>

              {/* As-on Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  As-on Cutoff Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={asOnDate}
                    onChange={(e) => setAsOnDate(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs sm:text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    required
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Transactions occurring after this date will dynamically accrue on top of this opening baseline.
                </span>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Notes / Audit Reference
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Tally opening cutoff balance FY 2026-27"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 resize-none"
                  maxLength={2000}
                />
              </div>

              {/* Feedback Banners */}
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Unable to save</p>
                    <p>{formError}</p>
                  </div>
                </div>
              )}

              {formSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="font-semibold">{formSuccess}</p>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {editingId ? "Update Opening Balance" : "Save Opening Balance"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ==================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Opening Balance?</h3>
                <p className="text-xs text-gray-500">This action will be logged in the audit trail.</p>
              </div>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
              <div><strong>Customer:</strong> {deleteTarget.customer_name}</div>
              <div><strong>Amount:</strong> ₹{deleteTarget.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({deleteTarget.balance_type})</div>
              <div><strong>As-on Date:</strong> {deleteTarget.as_on_date}</div>
            </div>

            {deleteError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {deleteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DRAWER: AUDIT HISTORY */}
      {/* ==================================================================== */}
      {auditDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col justify-between border-l border-gray-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-teal-700" />
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {selectedAuditCustomer ? `Audit History: ${selectedAuditCustomer.name}` : "Opening Balance Audit Log"}
                  </h3>
                  <p className="text-xs text-gray-500">Security event log of creations, edits, and deletions.</p>
                </div>
              </div>
              <button
                onClick={() => setAuditDrawerOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              {isLoadingAudit ? (
                <div className="p-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  Loading audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">
                  No audit logs recorded for opening balances yet.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        log.action.includes("CREATED")
                          ? "bg-emerald-100 text-emerald-800"
                          : log.action.includes("UPDATED")
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {new Date(log.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>

                    <div className="text-gray-700">
                      <strong>Operator:</strong> {log.user_name || log.user_email || "System"}
                    </div>

                    {log.new_data && (
                      <div className="p-2 rounded bg-white border border-gray-200 font-mono text-[11px] text-gray-700 space-y-0.5">
                        {log.new_data.amount != null && (
                          <div>Amount: <strong>₹{Number(log.new_data.amount).toLocaleString("en-IN")}</strong> ({log.new_data.balance_type})</div>
                        )}
                        {log.new_data.as_on_date && (
                          <div>As-on Date: {log.new_data.as_on_date}</div>
                        )}
                        {log.new_data.notes && <div>Notes: {log.new_data.notes}</div>}
                      </div>
                    )}

                    {log.old_data && log.action.includes("UPDATED") && (
                      <div className="text-[10px] text-gray-400 font-mono">
                        Previous: ₹{log.old_data.amount} ({log.old_data.balance_type})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => setAuditDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={bulkImportModalOpen}
        onClose={() => setBulkImportModalOpen(false)}
        onSuccess={() => {
          handleRefresh();
        }}
        customers={customers}
        existingBalances={balances}
      />
    </div>
  );
}
