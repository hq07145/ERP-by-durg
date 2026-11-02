"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
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
  ArrowDownRight,
  ArrowUpRight,
  Check,
} from "lucide-react";
import type { AppUser } from "@/types/business";
import type {
  CustomerOpeningBalance,
  CustomerBalanceType,
  CustomerOpeningBalanceAuditItem,
  CustomerOpeningBalanceHistoryItem,
  CustomerOption,
} from "@/types/customer-opening-balance";
import {
  setCustomerOpeningBalanceAction,
  correctCustomerOpeningBalanceAction,
  deleteCustomerOpeningBalanceAction,
  getAllCustomerOpeningBalancesAction,
  getOpeningBalanceAuditHistoryAction,
  getCustomerOpeningBalanceHistoryAction,
} from "@/lib/customers/opening-balance-actions";
import { downloadModuleTemplate } from "@/lib/import/file-parser";
import { BulkImportModal } from "./bulk-import-modal";

interface Props {
  user: AppUser;
  businessName: string;
  initialBalances: CustomerOpeningBalance[];
  customers: CustomerOption[];
  initialAuditLogs: CustomerOpeningBalanceAuditItem[];
  initialCorrectionHistory?: CustomerOpeningBalanceHistoryItem[];
}

export function CustomerOpeningBalancesClient({
  user,
  businessName,
  initialBalances,
  customers,
  initialAuditLogs,
  initialCorrectionHistory = [],
}: Props) {
  const [balances, setBalances] = useState<CustomerOpeningBalance[]>(initialBalances);
  const [auditLogs, setAuditLogs] = useState<CustomerOpeningBalanceAuditItem[]>(initialAuditLogs);
  const [correctionHistory, setCorrectionHistory] = useState<CustomerOpeningBalanceHistoryItem[]>(initialCorrectionHistory);
  const [isRefreshing, startRefreshTransition] = useTransition();

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "RECEIVABLE" | "PAYABLE">("ALL");
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Form Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<CustomerOpeningBalance | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const custSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [amountInput, setAmountInput] = useState("");
  const [balanceType, setBalanceType] = useState<CustomerBalanceType>("RECEIVABLE");
  const [asOnDate, setAsOnDate] = useState(() => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
  });
  const [correctionReason, setCorrectionReason] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation Modal state for corrections
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CustomerOpeningBalance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Audit History drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [selectedAuditCustomer, setSelectedAuditCustomer] = useState<{ id: string; name: string } | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Opening Balance Correction History Drawer state
  const [correctionDrawerOpen, setCorrectionDrawerOpen] = useState(false);
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState<{ id: string; name: string } | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Bulk Import Modal state
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (custSearchTimerRef.current) clearTimeout(custSearchTimerRef.current);
    };
  }, []);

  const handleSearchInputChange = (val: string) => {
    setSearchInput(val);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (!val.trim()) {
      setSearchQuery("");
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(val.trim());
    }, 300);
  };

  const handleClearSearch = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setSearchInput("");
    setSearchQuery("");
  };

  const handleCustSearchChange = (val: string) => {
    setCustomerSearchInput(val);
    if (custSearchTimerRef.current) {
      clearTimeout(custSearchTimerRef.current);
      custSearchTimerRef.current = null;
    }
    if (!val.trim()) {
      setCustomerSearch("");
      return;
    }
    custSearchTimerRef.current = setTimeout(() => {
      setCustomerSearch(val.trim());
    }, 300);
  };

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

  // Dynamic difference calculation for edit / correction
  const diffPreview = useMemo(() => {
    if (!editingTarget) return null;
    const newAmt = parseFloat(amountInput);
    if (Number.isNaN(newAmt) || newAmt < 0) return null;

    const oldSigned = editingTarget.balance_type === "RECEIVABLE" ? editingTarget.amount : -editingTarget.amount;
    const newSigned = balanceType === "RECEIVABLE" ? newAmt : -newAmt;
    const delta = newSigned - oldSigned;

    let adjType: "DEBIT" | "CREDIT" | "NONE" = "NONE";
    let adjAmount = 0;

    if (delta > 0) {
      adjType = "DEBIT";
      adjAmount = delta;
    } else if (delta < 0) {
      adjType = "CREDIT";
      adjAmount = Math.abs(delta);
    }

    return {
      oldAmount: editingTarget.amount,
      oldBalanceType: editingTarget.balance_type,
      oldAsOnDate: editingTarget.as_on_date,
      oldSigned,
      newAmount: newAmt,
      newBalanceType: balanceType,
      newAsOnDate: asOnDate,
      newSigned,
      delta,
      adjType,
      adjAmount,
      isIdentical: delta === 0 && asOnDate === editingTarget.as_on_date,
    };
  }, [editingTarget, amountInput, balanceType, asOnDate]);

  // Filtered correction history
  const filteredCorrectionHistory = useMemo(() => {
    return correctionHistory.filter((h) => {
      if (selectedHistoryCustomer && h.customer_id !== selectedHistoryCustomer.id) {
        return false;
      }
      if (!historySearchQuery.trim()) return true;
      const q = historySearchQuery.toLowerCase().trim();
      return (
        h.customer_name.toLowerCase().includes(q) ||
        (h.customer_company && h.customer_company.toLowerCase().includes(q)) ||
        h.reason.toLowerCase().includes(q) ||
        h.corrected_by_name.toLowerCase().includes(q)
      );
    });
  }, [correctionHistory, selectedHistoryCustomer, historySearchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let totalReceivable = 0;
    let totalPayable = 0;
    let correctedCount = 0;
    for (const b of balances) {
      if (b.balance_type === "RECEIVABLE") {
        totalReceivable += b.amount;
      } else {
        totalPayable += b.amount;
      }
      if (b.is_corrected) {
        correctedCount++;
      }
    }
    const net = totalReceivable - totalPayable;
    return {
      count: balances.length,
      totalReceivable,
      totalPayable,
      net,
      correctedCount,
    };
  }, [balances]);

  // Refresh data from server
  const handleRefresh = () => {
    startRefreshTransition(async () => {
      try {
        const [updatedBalances, updatedAudit, updatedHistory] = await Promise.all([
          getAllCustomerOpeningBalancesAction(),
          getOpeningBalanceAuditHistoryAction(),
          getCustomerOpeningBalanceHistoryAction(),
        ]);
        setBalances(updatedBalances);
        setAuditLogs(updatedAudit);
        setCorrectionHistory(updatedHistory);
      } catch (err) {
        console.error("Refresh failed:", err);
      }
    });
  };

  // Open Add modal (new opening balance)
  const handleOpenAdd = () => {
    setEditingTarget(null);
    setSelectedCustomerId("");
    setCustomerSearch("");
    setAmountInput("");
    setBalanceType("RECEIVABLE");
    setCorrectionReason("");
    setNotesInput("");
    setFormError(null);
    setFormSuccess(null);
    setConfirmationOpen(false);
    setModalOpen(true);
  };

  // Open Edit modal (correct existing opening balance)
  const handleOpenEdit = (b: CustomerOpeningBalance) => {
    setEditingTarget(b);
    setSelectedCustomerId(b.customer_id);
    setCustomerSearch(b.customer_name || "");
    setAmountInput(String(b.amount));
    setBalanceType(b.balance_type);
    setAsOnDate(b.as_on_date);
    setCorrectionReason("");
    setNotesInput(b.notes || "");
    setFormError(null);
    setFormSuccess(null);
    setConfirmationOpen(false);
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

  // Open Correction History
  const handleOpenCorrectionHistory = async (b?: CustomerOpeningBalance) => {
    if (b) {
      setSelectedHistoryCustomer({ id: b.customer_id, name: b.customer_name || "Customer" });
    } else {
      setSelectedHistoryCustomer(null);
    }
    setCorrectionDrawerOpen(true);
    setIsLoadingHistory(true);
    try {
      const history = await getCustomerOpeningBalanceHistoryAction(b?.customer_id);
      setCorrectionHistory(history);
    } catch (err) {
      console.error("Failed to fetch correction history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Handle Form Submission: Edit requires confirmation step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

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

    // In Edit / Correction Mode:
    if (editingTarget) {
      const cleanReason = correctionReason.trim();
      if (!cleanReason || cleanReason.length < 3) {
        setFormError("Correction reason is mandatory (minimum 3 characters). Please describe why this balance is being adjusted.");
        return;
      }

      if (diffPreview?.isIdentical) {
        setFormError("The entered amount, balance type, and date are identical to current values. No correction needed.");
        return;
      }

      // Open confirmation dialog
      setConfirmationOpen(true);
      return;
    }

    // In Add Mode:
    const exists = balances.some(
      (b) => b.customer_id === selectedCustomerId && b.as_on_date === asOnDate
    );
    if (exists) {
      setFormError(
        `An opening balance is already registered for this customer on ${asOnDate}. You can edit the existing entry instead.`
      );
      return;
    }

    // Direct save for new opening balance
    handleSaveNewOpeningBalance();
  };

  // Save New Opening Balance (Initial)
  const handleSaveNewOpeningBalance = async () => {
    setIsSubmitting(true);
    try {
      const numAmount = parseFloat(amountInput);
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
        setFormSuccess("Customer opening balance created successfully!");
        handleRefresh();
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

  // Confirm and Apply Opening Balance Correction
  const handleConfirmCorrection = async () => {
    if (!editingTarget) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const numAmount = parseFloat(amountInput);
      const res = await correctCustomerOpeningBalanceAction({
        customerId: editingTarget.customer_id,
        newAmount: numAmount,
        newBalanceType: balanceType,
        newAsOnDate: asOnDate,
        reason: correctionReason.trim(),
      });

      if (!res.success) {
        setFormError(res.error || "Failed to apply correction.");
        setConfirmationOpen(false);
      } else {
        setFormSuccess(
          diffPreview?.adjType === "CREDIT"
            ? `Opening balance corrected! ₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Credit Adjustment posted to customer ledger.`
            : diffPreview?.adjType === "DEBIT"
            ? `Opening balance corrected! ₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Debit Adjustment posted to customer ledger.`
            : "Opening balance updated successfully!"
        );
        handleRefresh();
        setConfirmationOpen(false);
        setTimeout(() => {
          setModalOpen(false);
          setFormSuccess(null);
          setEditingTarget(null);
        }, 1500);
      }
    } catch (err: any) {
      setFormError(err.message || "An unexpected error occurred while applying correction.");
      setConfirmationOpen(false);
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

  const handleDownloadTemplate = async () => {
    try {
      await downloadModuleTemplate("customer_opening_balances", "xlsx");
    } catch (err) {
      console.error("Failed to download template:", err);
      alert("Failed to download template. Please check your network connection and try again.");
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
            Define and correct net opening receivable or payable ledger positions as of migration cutoff dates for{" "}
            <span className="font-semibold text-gray-900">{businessName}</span>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => handleOpenCorrectionHistory()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors"
            title="View complete opening balance corrections history"
          >
            <History className="w-4 h-4 text-teal-600" />
            <span>Correction History</span>
            {correctionHistory.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-teal-100 text-teal-800 font-bold">
                {correctionHistory.length}
              </span>
            )}
          </button>

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-xs transition-colors"
            title="Download Excel Template for Opening Balances"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span className="hidden sm:inline">Template</span>
          </button>

          <button
            onClick={() => setBulkImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100/80 text-teal-800 text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-4 h-4 text-teal-700" />
            <span>Bulk Import</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-sm transition-all shadow-teal-700/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Opening Balance</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers with OB */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Configured Balances</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{stats.count}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.correctedCount > 0 ? (
                <span className="text-amber-600 font-semibold">{stats.correctedCount} corrected</span>
              ) : (
                "Master opening entries"
              )}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Total Receivable */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
              <span>Total Receivable (Dr)</span>
            </p>
            <p className="text-2xl font-black text-amber-700 font-mono mt-1">
              ₹{stats.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Owed by customers</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        {/* Total Payable / Advance */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
              <span>Total Payable / Adv (Cr)</span>
            </p>
            <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
              ₹{stats.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Customer pre-payments</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ArrowDownRight className="w-6 h-6" />
          </div>
        </div>

        {/* Net Opening Position */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Position</p>
            <p
              className={`text-2xl font-black font-mono mt-1 ${
                stats.net > 0 ? "text-amber-700" : stats.net < 0 ? "text-emerald-700" : "text-gray-900"
              }`}
            >
              ₹{Math.abs(stats.net).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 font-semibold">
              {stats.net > 0 ? "Net Receivable (Dr)" : stats.net < 0 ? "Net Advance (Cr)" : "Balanced"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center font-bold">
            <Wallet className="w-6 h-6 text-teal-700" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-gray-200 bg-gray-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by customer name, company, notes..."
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
            {searchInput && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Filters & Refresh */}
          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-gray-200/60 text-xs font-semibold">
              <button
                onClick={() => setTypeFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  typeFilter === "ALL" ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All ({balances.length})
              </button>
              <button
                onClick={() => setTypeFilter("RECEIVABLE")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  typeFilter === "RECEIVABLE"
                    ? "bg-amber-100/80 text-amber-900 shadow-xs"
                    : "text-gray-600 hover:text-amber-900"
                }`}
              >
                Receivable
              </button>
              <button
                onClick={() => setTypeFilter("PAYABLE")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  typeFilter === "PAYABLE"
                    ? "bg-emerald-100/80 text-emerald-900 shadow-xs"
                    : "text-gray-600 hover:text-emerald-900"
                }`}
              >
                Payable / Adv
              </button>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
              title="Refresh balances"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-teal-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Table View */}
        {filteredBalances.length === 0 ? (
          <div className="py-16 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-gray-900">No customer opening balances found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {searchQuery || typeFilter !== "ALL"
                ? "Try adjusting your search criteria or filter options."
                : "Initialize customer opening balances individually or via bulk import."}
            </p>
            {!searchQuery && typeFilter === "ALL" && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={handleOpenAdd}
                  className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition-colors"
                >
                  Add First Opening Balance
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:pl-6">Customer</th>
                  <th className="py-3.5 px-4">Effective Balance</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">As-on Date</th>
                  <th className="py-3.5 px-4 hidden lg:table-cell">Status / Audit</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">Created By</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                {filteredBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-teal-50/20 transition-colors group">
                    {/* Customer */}
                    <td className="py-3.5 px-4 sm:pl-6">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <Link
                          href={`/customers/${b.customer_id}`}
                          className="hover:text-teal-700 hover:underline flex items-center gap-1"
                        >
                          {b.customer_name}
                        </Link>
                      </div>
                      {b.customer_company && (
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-gray-400" />
                          <span>{b.customer_company}</span>
                        </div>
                      )}
                    </td>

                    {/* Effective Opening Balance Amount */}
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900 text-sm">
                      <span className={b.balance_type === "RECEIVABLE" ? "text-amber-700" : "text-emerald-700"}>
                        ₹{b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      {b.is_corrected && b.initial_amount != null && b.initial_amount !== b.amount && (
                        <span className="block text-[10px] font-normal text-gray-400 line-through">
                          Orig: ₹{b.initial_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>

                    {/* Balance Type */}
                    <td className="py-3.5 px-4">
                      {b.balance_type === "RECEIVABLE" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          <ArrowUpRight className="w-3 h-3 text-amber-700" />
                          <span>Receivable (Dr)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                          <ArrowDownRight className="w-3 h-3 text-emerald-700" />
                          <span>Payable / Adv (Cr)</span>
                        </span>
                      )}
                    </td>

                    {/* As-on Date */}
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-700">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{b.as_on_date}</span>
                      </div>
                    </td>

                    {/* Status / Corrections */}
                    <td className="py-3.5 px-4 hidden lg:table-cell">
                      {b.is_corrected ? (
                        <button
                          onClick={() => handleOpenCorrectionHistory(b)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                          title="Click to view correction history"
                        >
                          <History className="w-3 h-3 text-amber-600" />
                          <span>Corrected ({b.correction_count || 1}x)</span>
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 font-mono">Original</span>
                      )}
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
                          onClick={() => handleOpenCorrectionHistory(b)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-teal-700 hover:bg-gray-100 transition-colors"
                          title="View correction history"
                        >
                          <History className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-teal-700 hover:bg-teal-50 transition-colors font-semibold flex items-center gap-1"
                          title="Correct opening balance"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span className="hidden sm:inline text-xs font-semibold">Correct</span>
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
      {/* MODAL: ADD / EDIT / CORRECT OPENING BALANCE */}
      {/* ==================================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  editingTarget ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
                }`}>
                  {editingTarget ? <Edit2 className="w-5 h-5 text-amber-700" /> : <Wallet className="w-5 h-5 text-teal-700" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {editingTarget ? "Edit / Correct Opening Balance" : "Add Customer Opening Balance"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {editingTarget
                      ? "Auditable correction: Difference will be posted to the customer ledger."
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
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Customer <span className="text-rose-500">*</span>
                </label>
                {editingTarget ? (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-900 font-semibold flex items-center justify-between">
                    <div>
                      <span>{editingTarget.customer_name}</span>
                      {editingTarget.customer_company && (
                        <span className="block text-xs text-gray-500 font-normal">{editingTarget.customer_company}</span>
                      )}
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-200/70 text-gray-700">
                      Current: ₹{editingTarget.amount.toLocaleString("en-IN")} ({editingTarget.balance_type})
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customer name or company..."
                        value={customerSearchInput}
                        onChange={(e) => handleCustSearchChange(e.target.value)}
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
                  {editingTarget ? "Corrected Opening Balance Amount (₹)" : "Opening Balance Amount (₹)"}{" "}
                  <span className="text-rose-500">*</span>
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
                  {editingTarget ? "Corrected Balance Type" : "Balance Type"} <span className="text-rose-500">*</span>
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
                  {editingTarget ? "Corrected As-on Cutoff Date" : "As-on Cutoff Date"} <span className="text-rose-500">*</span>
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
              </div>

              {/* LIVE DIFFERENCE PREVIEW CARD (FOR EDIT / CORRECTION) */}
              {editingTarget && diffPreview && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                      Auditable Ledger Adjustment Impact
                    </span>
                    <span className="text-[11px] font-mono text-gray-500">Auto-calculated</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2 bg-white rounded-lg border border-amber-100">
                      <span className="text-[10px] text-gray-500 block">Original Opening</span>
                      <span className="font-mono font-bold text-gray-800">
                        ₹{diffPreview.oldAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({diffPreview.oldBalanceType})
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-100">
                      <span className="text-[10px] text-gray-500 block">Corrected Opening</span>
                      <span className="font-mono font-bold text-gray-900">
                        ₹{diffPreview.newAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({diffPreview.newBalanceType})
                      </span>
                    </div>
                  </div>

                  {/* Calculated Resulting Adjustment */}
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {diffPreview.adjType === "CREDIT" ? (
                        <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                      ) : diffPreview.adjType === "DEBIT" ? (
                        <ArrowUpRight className="w-4 h-4 text-blue-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-xs font-semibold text-gray-700">Ledger Entry to Post:</span>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold ${
                        diffPreview.adjType === "CREDIT"
                          ? "text-emerald-700"
                          : diffPreview.adjType === "DEBIT"
                          ? "text-blue-700"
                          : "text-gray-500"
                      }`}
                    >
                      {diffPreview.adjType === "CREDIT"
                        ? `₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Credit Adjustment`
                        : diffPreview.adjType === "DEBIT"
                        ? `₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Debit Adjustment`
                        : "No Financial Change"}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-tight">
                    * The original opening ledger entry will never be deleted. An adjustment entry will be posted for the difference and running balances recalculated safely.
                  </p>
                </div>
              )}

              {/* Correction Reason (MANDATORY IN EDIT MODE) */}
              {editingTarget && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Correction Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Mandatory: e.g. Rectified balance mismatch per audited bank statement"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 resize-none"
                    maxLength={2000}
                    required
                  />
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                    <span>Explain why this opening balance is being adjusted</span>
                    <span>{correctionReason.length}/2000</span>
                  </div>
                </div>
              )}

              {/* Optional Notes (in Add mode) */}
              {!editingTarget && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Notes / Audit Reference
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Migration opening cutoff balance FY 2026-27"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 resize-none"
                    maxLength={2000}
                  />
                </div>
              )}

              {/* Feedback Banners */}
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Unable to proceed</p>
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
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 ${
                    editingTarget ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-600 hover:bg-teal-700"
                  }`}
                >
                  {editingTarget ? (
                    <>
                      <span>Review Correction</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  ) : isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Opening Balance</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CONFIRMATION FOR CORRECTION */}
      {/* ==================================================================== */}
      {confirmationOpen && editingTarget && diffPreview && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Confirm Opening Balance Correction</h3>
                  <p className="text-xs text-gray-500">Please review the financial adjustment before applying.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-semibold">Customer:</span>
                  <span className="font-bold text-gray-900">{editingTarget.customer_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-semibold">Original Balance:</span>
                  <span className="font-mono text-gray-700">
                    ₹{diffPreview.oldAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({diffPreview.oldBalanceType})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-semibold">Corrected Balance:</span>
                  <span className="font-mono font-bold text-gray-900">
                    ₹{diffPreview.newAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({diffPreview.newBalanceType})
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                  <span className="text-gray-700 font-bold">Ledger Adjustment:</span>
                  <span
                    className={`font-mono font-bold ${
                      diffPreview.adjType === "CREDIT"
                        ? "text-emerald-700"
                        : diffPreview.adjType === "DEBIT"
                        ? "text-blue-700"
                        : "text-gray-600"
                    }`}
                  >
                    {diffPreview.adjType === "CREDIT"
                      ? `₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Credit Adjustment`
                      : diffPreview.adjType === "DEBIT"
                      ? `₹${diffPreview.adjAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Debit Adjustment`
                      : "No Financial Change"}
                  </span>
                </div>
                <div className="flex items-start justify-between pt-1 border-t border-gray-200">
                  <span className="text-gray-500 font-semibold">Reason:</span>
                  <span className="text-gray-800 text-right max-w-[200px] italic">
                    &ldquo;{correctionReason.trim()}&rdquo;
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-tight">
                <strong>Accounting Safety Notice:</strong> This action will safely post an auditable adjustment to the customer ledger and recalculate all subsequent running balances.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmationOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold disabled:opacity-50"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCorrection}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Posting Correction...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Post Correction</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DRAWER: OPENING BALANCE CORRECTION HISTORY */}
      {/* ==================================================================== */}
      {correctionDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col justify-between border-l border-gray-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <History className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {selectedHistoryCustomer
                      ? `Correction History: ${selectedHistoryCustomer.name}`
                      : "Opening Balance Correction History"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Immutable ledger of all opening balance corrections and adjustments.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCorrectionDrawerOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter / Search Bar */}
            <div className="p-4 border-b border-gray-200 bg-white flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter corrections by customer, reason, admin..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
              {selectedHistoryCustomer && (
                <button
                  onClick={() => setSelectedHistoryCustomer(null)}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Show All Customers
                </button>
              )}
            </div>

            {/* Drawer Content */}
            <div className="p-5 flex-1 overflow-y-auto space-y-3.5">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  Loading correction history...
                </div>
              ) : filteredCorrectionHistory.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-400">
                  <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="font-semibold text-gray-600">No correction history recorded</p>
                  <p className="mt-0.5">Opening balances have not been adjusted yet.</p>
                </div>
              ) : (
                filteredCorrectionHistory.map((h) => (
                  <div
                    key={h.history_id}
                    className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs text-xs space-y-2 hover:border-teal-200 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-gray-900 text-sm">
                        {h.customer_name}
                        {h.customer_company && (
                          <span className="text-xs text-gray-500 font-normal ml-1">({h.customer_company})</span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {new Date(h.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>

                    {/* Balance Transition */}
                    <div className="grid grid-cols-2 gap-2 text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-semibold">PREVIOUS</span>
                        <span className="font-mono text-gray-700">
                          ₹{h.old_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({h.old_balance_type})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-teal-700 block font-semibold">CORRECTED</span>
                        <span className="font-mono font-bold text-gray-900">
                          ₹{h.new_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({h.new_balance_type})
                        </span>
                      </div>
                    </div>

                    {/* Adjustment Badge */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-gray-500">Adjustment Entry:</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                          h.adjustment_type === "CREDIT"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : h.adjustment_type === "DEBIT"
                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {h.adjustment_type === "CREDIT" ? (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        ) : h.adjustment_type === "DEBIT" ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : null}
                        ₹{h.adjustment_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} {h.adjustment_type}
                      </span>
                    </div>

                    {/* Reason */}
                    <div className="p-2 rounded bg-amber-50/60 border border-amber-200 text-amber-900 text-xs">
                      <span className="font-bold text-[10px] uppercase text-amber-700 block tracking-wider">Reason:</span>
                      <p className="mt-0.5 italic">&ldquo;{h.reason}&rdquo;</p>
                    </div>

                    {/* Admin / Footer */}
                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                      <span>Corrected by: <strong>{h.corrected_by_name}</strong></span>
                      {h.ledger_entry_id && (
                        <span className="font-mono text-[10px] text-gray-400">Ledger Entry Recorded</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => setCorrectionDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold transition-colors"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ==================================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Opening Balance</h3>
                <p className="text-xs text-gray-500">This action will remove the opening cutoff position.</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <p>
                Customer: <strong>{deleteTarget.customer_name}</strong>
              </p>
              <p>
                Amount: <strong>₹{deleteTarget.amount.toLocaleString("en-IN")}</strong> ({deleteTarget.balance_type})
              </p>
              <p>
                As-on Date: <strong>{deleteTarget.as_on_date}</strong>
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-rose-100 text-rose-800 text-xs">
                {deleteError}
              </div>
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
      {/* DRAWER: SECURITY AUDIT LOGS */}
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
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          log.action.includes("CREATED")
                            ? "bg-emerald-100 text-emerald-800"
                            : log.action.includes("CORRECTED") || log.action.includes("UPDATED")
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
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
                          <div>
                            Amount: <strong>₹{Number(log.new_data.amount).toLocaleString("en-IN")}</strong> ({log.new_data.balance_type})
                          </div>
                        )}
                        {log.new_data.as_on_date && <div>As-on Date: {log.new_data.as_on_date}</div>}
                        {log.new_data.reason && <div>Reason: {log.new_data.reason}</div>}
                        {log.new_data.adjustment_type && (
                          <div>
                            Adjustment: {log.new_data.adjustment_type} ₹{Number(log.new_data.adjustment_amount || 0).toLocaleString("en-IN")}
                          </div>
                        )}
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
