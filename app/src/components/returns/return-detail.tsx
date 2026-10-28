"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  PackageX,
  Wrench,
  Trash2,
  FileText,
  Truck,
  CreditCard,
  User,
  Calendar,
  Building2,
  Send,
  Loader2,
  ExternalLink,
  Ban,
  ArrowLeft,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  approveGoodsReturnAction,
  rejectGoodsReturnAction,
  postGoodsReturnAction,
  cancelGoodsReturnAction,
  createReplacementDeliveryAction,
} from "@/lib/returns/actions";
import {
  RETURN_STATUS_COLORS,
  RETURN_STATUS_LABELS,
  PRODUCT_CONDITION_COLORS,
  ADJUSTMENT_TYPE_LABELS,
  type ReturnStatus,
  type ProductCondition,
  type AdjustmentType,
  type GoodsReturnWithDetails,
} from "@/types/returns";

interface ReturnDetailProps {
  returnData: GoodsReturnWithDetails;
  auditHistory: any[];
  canApprove: boolean;
  canPost: boolean;
  canCancel: boolean;
}

export function ReturnDetail({
  returnData,
  auditHistory,
  canApprove,
  canPost,
  canCancel,
}: ReturnDetailProps) {
  const router = useRouter();

  // Dialog States
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Form Inputs for Actions
  const [approveCondition, setApproveCondition] = useState<ProductCondition>(
    returnData.product_condition
  );
  const [approveAdjType, setApproveAdjType] = useState<AdjustmentType>(
    returnData.adjustment_type || "CREDIT_NOTE"
  );
  const [approveAdjAmount, setApproveAdjAmount] = useState<number>(
    returnData.adjustment_amount || 0
  );
  const [approveNotes, setApproveNotes] = useState("");

  const [rejectionReason, setRejectionReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");

  const [replVehicle, setReplVehicle] = useState("");
  const [replDriver, setReplDriver] = useState("");
  const [replNotes, setReplNotes] = useState("");

  // Loading & Alert States
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const statusColor =
    RETURN_STATUS_COLORS[returnData.status as ReturnStatus] ||
    "bg-slate-100 text-slate-700 border-slate-200";
  const condColor =
    (PRODUCT_CONDITION_COLORS as any)[returnData.product_condition] ||
    "bg-slate-100 text-slate-700 border-slate-200";

  // Action Handlers
  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsProcessing(true);

    try {
      await approveGoodsReturnAction({
        return_id: returnData.id,
        product_condition: approveCondition,
        adjustment_type: approveAdjType,
        adjustment_amount: approveAdjAmount,
        inspection_notes: approveNotes.trim() || undefined,
      });

      setActionSuccess("Goods Return approved successfully! Stock and ledger remain unchanged until posted.");
      setShowApproveModal(false);
      setTimeout(() => router.refresh(), 800);
    } catch (err: any) {
      setActionError(err?.message || "Failed to approve return.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setActionError("Please provide a rejection reason.");
      return;
    }
    setActionError(null);
    setIsProcessing(true);

    try {
      await rejectGoodsReturnAction({
        return_id: returnData.id,
        rejection_reason: rejectionReason.trim(),
      });

      setActionSuccess("Goods Return rejected. No stock or financial movements occurred.");
      setShowRejectModal(false);
      setTimeout(() => router.refresh(), 800);
    } catch (err: any) {
      setActionError(err?.message || "Failed to reject return.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePost = async () => {
    setActionError(null);
    setIsProcessing(true);

    try {
      const res: any = await postGoodsReturnAction({
        return_id: returnData.id,
      });

      const postedQty = res?.posted_quantity ?? returnData.returned_quantity;
      const updatedStock = res?.updated_current_stock;
      const stockMsg = updatedStock !== undefined && updatedStock !== null
        ? ` Restocked ${postedQty} units into finished goods inventory (Current warehouse stock: ${Number(updatedStock).toLocaleString()} units).`
        : ` Restocked ${postedQty} units into inventory.`;

      setActionSuccess(`Goods Return successfully posted!${stockMsg} Financial adjustments applied.`);
      setShowPostModal(false);
      setTimeout(() => router.refresh(), 800);
    } catch (err: any) {
      setActionError(err?.message || "Failed to post return adjustments.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsProcessing(true);

    try {
      const res = await createReplacementDeliveryAction({
        return_id: returnData.id,
        vehicle: replVehicle.trim() || undefined,
        driver: replDriver.trim() || undefined,
        notes: replNotes.trim() || undefined,
      });

      setActionSuccess(`Replacement delivery ${(res as any)?.delivery_number} created successfully!`);
      setShowReplacementModal(false);
      setTimeout(() => router.refresh(), 800);
    } catch (err: any) {
      setActionError(err?.message || "Failed to create replacement delivery.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setActionError("Please specify a cancellation reason.");
      return;
    }
    setActionError(null);
    setIsProcessing(true);

    try {
      await cancelGoodsReturnAction({
        return_id: returnData.id,
        reason: cancellationReason.trim(),
      });

      setActionSuccess("Return cancelled. Any posted stock or financial adjustments have been reversed.");
      setShowCancelModal(false);
      setTimeout(() => router.refresh(), 800);
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel return.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm font-medium shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-sm font-medium shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl sm:text-2xl font-bold text-slate-900">
              {returnData.return_number}
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusColor}`}
            >
              {RETURN_STATUS_LABELS[returnData.status as ReturnStatus] || returnData.status}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${condColor}`}
            >
              {returnData.product_condition}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
            <span>
              Return Date:{" "}
              <strong className="text-slate-700">
                {new Date(returnData.return_date).toLocaleDateString()}
              </strong>
            </span>
            <span>•</span>
            <span>
              Customer: <strong className="text-slate-700">{returnData.customer_name}</strong>
            </span>
            {returnData.order_number && (
              <>
                <span>•</span>
                <span>
                  Order:{" "}
                  <Link
                    href={`/orders/${returnData.order_id}`}
                    className="font-medium text-emerald-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    {returnData.order_number}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </span>
              </>
            )}
            {returnData.delivery_number && (
              <>
                <span>•</span>
                <span>
                  Delivery:{" "}
                  <Link
                    href={`/delivery/${returnData.delivery_id}`}
                    className="font-medium text-emerald-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    {returnData.delivery_number}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {returnData.status === "PENDING_INSPECTION" && canApprove && (
            <>
              <button
                onClick={() => setShowApproveModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Approve Return</span>
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
            </>
          )}

          {returnData.status === "APPROVED" && canPost && (
            <button
              onClick={() => setShowPostModal(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Post Adjustments</span>
            </button>
          )}

          {returnData.status === "APPROVED" &&
            returnData.adjustment_type === "REPLACEMENT" &&
            !returnData.replacement_delivery_id && (
              <button
                onClick={() => setShowReplacementModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Truck className="w-4 h-4" />
                <span>Create Replacement Delivery</span>
              </button>
            )}

          {returnData.status !== "CANCELLED" && returnData.status !== "REJECTED" && canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-3.5 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Cancel Return</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Returned Quantity</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {returnData.returned_quantity}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Physical items received</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Product Condition</div>
          <div className="mt-1">
            <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold border ${condColor}`}>
              {returnData.product_condition}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {returnData.product_condition === "SALEABLE"
              ? "Restocks to available stock"
              : "Quarantined / Non-saleable"}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Adjustment Type</div>
          <div className="text-sm font-bold text-slate-900 mt-1">
            {returnData.adjustment_type
              ? (ADJUSTMENT_TYPE_LABELS as any)[returnData.adjustment_type] || returnData.adjustment_type
              : "Not Specified"}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Amount: ₹{Number(returnData.adjustment_amount || 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-medium text-slate-500">Inventory Movement</div>
          <div className="text-sm font-bold mt-1">
            {returnData.status === "POSTED" ? (
              returnData.product_condition === "SALEABLE" ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Restocked (+{returnData.returned_quantity})
                </span>
              ) : (
                <span className="text-purple-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Quarantined ({returnData.product_condition})
                </span>
              )
            ) : returnData.status === "CANCELLED" ? (
              <span className="text-slate-400">Reversed / Cancelled</span>
            ) : returnData.status === "REJECTED" ? (
              <span className="text-rose-600">Rejected (No Stock)</span>
            ) : (
              <span className="text-amber-600">Pending Posting</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {returnData.status === "POSTED" ? (
              returnData.product_condition === "SALEABLE" ? (
                <span>
                  Current Stock:{" "}
                  <strong className="text-slate-700">
                    {returnData.product_stock?.[returnData.product_id || returnData.items?.[0]?.product_id]?.current_stock !== undefined
                      ? `${Number(returnData.product_stock[returnData.product_id || returnData.items?.[0]?.product_id].current_stock).toLocaleString()} units`
                      : "Updated in warehouse"}
                  </strong>
                </span>
              ) : (
                "Quarantine ledger recorded (Saleable stock unaffected)"
              )
            ) : returnData.status === "CANCELLED" ? (
              "Stock movement reversed"
            ) : (
              "Isolated from inventory"
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Details & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Returned Items & Reference Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Returned Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Returned Line Items</h3>
              <span className="text-xs text-slate-400">{returnData.items?.length || 1} Item(s)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-3 px-6">Product / SKU</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4">Condition</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-6 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {returnData.items && returnData.items.length > 0 ? (
                    returnData.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-3 px-6">
                          <div className="font-semibold text-slate-800">{it.product_name}</div>
                          {it.sku && <div className="text-xs text-slate-400 font-mono">{it.sku}</div>}
                          {it.reason && (
                            <div className="text-xs text-slate-500 italic mt-0.5">
                              Reason: {it.reason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">
                          {it.returned_quantity}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              (PRODUCT_CONDITION_COLORS as any)[it.product_condition] ||
                              "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {it.product_condition}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          ₹{Number(it.unit_price || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-6 text-right font-bold text-slate-800">
                          ₹{Number(it.total_amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-3 px-6 font-semibold text-slate-800">
                        {returnData.product_name || "Product"}
                        {returnData.product_sku && (
                          <div className="text-xs text-slate-400 font-mono">{returnData.product_sku}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {returnData.returned_quantity}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${condColor}`}
                        >
                          {returnData.product_condition}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        ₹
                        {returnData.returned_quantity > 0
                          ? (returnData.adjustment_amount / returnData.returned_quantity).toFixed(2)
                          : "0.00"}
                      </td>
                      <td className="py-3 px-6 text-right font-bold text-slate-800">
                        ₹{Number(returnData.adjustment_amount || 0).toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reason & Notes Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Return Reason & Inspection Notes</h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Customer Stated Reason
              </div>
              <p className="text-sm text-slate-800 font-medium">{returnData.reason}</p>
            </div>

            {returnData.notes && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Remarks / Observations
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-line">{returnData.notes}</p>
              </div>
            )}

            {returnData.inspection_notes && (
              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-1">
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Technician Inspection Notes
                </div>
                <p className="text-sm text-blue-900">{returnData.inspection_notes}</p>
              </div>
            )}

            {returnData.rejection_reason && (
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 space-y-1">
                <div className="text-xs font-bold text-rose-700 uppercase tracking-wider">
                  Rejection Reason
                </div>
                <p className="text-sm text-rose-900 font-semibold">{returnData.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: References, Financials & Audit History */}
        <div className="space-y-6">
          {/* Reference Links Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Document References
            </h3>
            <div className="space-y-2.5 text-sm divide-y divide-slate-100">
              <div className="pt-2 flex items-center justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-semibold text-slate-800">{returnData.customer_name}</span>
              </div>
              {returnData.order_number && (
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-500">Original Order</span>
                  <Link
                    href={`/orders/${returnData.order_id}`}
                    className="font-mono text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    {returnData.order_number}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
              {returnData.delivery_number && (
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-500">Original Delivery</span>
                  <Link
                    href={`/delivery/${returnData.delivery_id}`}
                    className="font-mono text-emerald-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    {returnData.delivery_number}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
              {returnData.invoice_number && (
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-500">Invoice Number</span>
                  <span className="font-mono font-medium text-slate-700">
                    {returnData.invoice_number}
                  </span>
                </div>
              )}
              {returnData.replacement_delivery_id && (
                <div className="pt-2 flex items-center justify-between bg-purple-50 p-2.5 rounded-xl border border-purple-200">
                  <span className="text-purple-700 font-medium text-xs">Replacement Delivery</span>
                  <Link
                    href={`/delivery/${returnData.replacement_delivery_id}`}
                    className="font-mono font-bold text-purple-900 hover:underline flex items-center gap-1 text-xs"
                  >
                    View Delivery
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Linked Inventory Stock Movements */}
          {returnData.inventory_transactions && returnData.inventory_transactions.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Stock Movements ({returnData.inventory_transactions.length})
                </h3>
                <Link
                  href="/inventory/transactions"
                  className="text-[11px] font-semibold text-emerald-600 hover:underline flex items-center gap-1"
                >
                  View All Tx <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="space-y-2.5">
                {returnData.inventory_transactions.map((tx: any) => {
                  const isStockIn = tx.transaction_type === "STOCK_IN";
                  const isStockOut = tx.transaction_type === "STOCK_OUT";
                  return (
                    <div
                      key={tx.id}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isStockIn
                              ? "bg-emerald-100 text-emerald-800"
                              : isStockOut
                              ? "bg-rose-100 text-rose-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {tx.transaction_type}
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {isStockIn ? "+" : isStockOut ? "-" : ""}
                          {Number(tx.quantity).toLocaleString()} units
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate" title={tx.notes || ""}>
                        {tx.notes || `Reference: ${tx.reference_type}`}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="font-mono">{tx.reference_type}</span>
                        <span>{new Date(tx.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Timeline */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Status & Audit History
            </h3>

            {auditHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No audit logs recorded yet.</p>
            ) : (
              <div className="relative pl-6 space-y-4 border-l-2 border-slate-200 mt-3">
                {auditHistory.map((item) => (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-emerald-500" />
                    <div className="text-xs font-bold text-slate-800">
                      {item.action.replace(/_/g, " ")}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      By {item.user_name} • {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Approve Goods Return</h3>
            <p className="text-xs text-slate-500 mb-4">
              Confirm product condition and settlement terms for {returnData.return_number}
            </p>

            <form onSubmit={handleApprove} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Condition
                </label>
                <select
                  value={approveCondition}
                  onChange={(e) => setApproveCondition(e.target.value as ProductCondition)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800"
                >
                  <option value="SALEABLE">Saleable (Will restock to available stock on post)</option>
                  <option value="DAMAGED">Damaged (Quarantine - no saleable restock)</option>
                  <option value="REWORK">Rework (Factory Repair)</option>
                  <option value="SCRAP">Scrap (Discard)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adjustment Type
                </label>
                <select
                  value={approveAdjType}
                  onChange={(e) => setApproveAdjType(e.target.value as AdjustmentType)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800"
                >
                  <option value="CREDIT_NOTE">Credit Note (Credit to Customer Ledger)</option>
                  <option value="REPLACEMENT">Replacement (Issue Delivery)</option>
                  <option value="REFUND">Refund</option>
                  <option value="OTHER_ADJUSTMENT">Other Adjustment</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adjustment Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={approveAdjAmount}
                  onChange={(e) => setApproveAdjAmount(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inspection Remarks
                </label>
                <textarea
                  rows={2}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Verification findings..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 resize-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl text-xs text-blue-800">
                <strong>Notice:</strong> Approval verifies the return. Inventory and financial ledger
                will only be updated when you explicitly click <em>Post Adjustments</em>.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirm Approval</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Reject Goods Return</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter mandatory rejection reason for {returnData.return_number}
            </p>

            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Returned goods broken due to customer negligence during installation..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 resize-none"
                  required
                />
              </div>

              <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800">
                <strong>Zero Financial Effect:</strong> Rejecting this return ensures no inventory or
                ledger entries will ever be posted for it.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Reject Return</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Post Modal Confirmation */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <div className="flex items-center gap-3 text-emerald-600 mb-2">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Post Goods Return</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              You are about to execute atomic stock and ledger adjustments for {returnData.return_number}:
            </p>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700 mb-4">
              <div className="flex justify-between">
                <span>Product Condition:</span>
                <strong className="font-semibold">{returnData.product_condition}</strong>
              </div>
              <div className="flex justify-between">
                <span>Stock Effect:</span>
                <strong className="text-emerald-700 font-semibold">
                  {returnData.product_condition === "SALEABLE"
                    ? `+${returnData.returned_quantity} units into active stock`
                    : "Zero increase to saleable stock (Damaged/Scrap)"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Financial Adjustment:</span>
                <strong className="text-blue-700 font-semibold">
                  {returnData.adjustment_type === "CREDIT_NOTE"
                    ? `Credit Note of ₹${Number(returnData.adjustment_amount).toLocaleString()} to Customer Ledger`
                    : returnData.adjustment_type || "None"}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePost}
                disabled={isProcessing}
                className="px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirm & Post</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Delivery Modal */}
      {showReplacementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Replacement Delivery</h3>
            <p className="text-xs text-slate-500 mb-4">
              Generate a separate delivery number (`DEL-YYYY-000001`) linked to {returnData.return_number}
            </p>

            <form onSubmit={handleCreateReplacement} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  placeholder="e.g. GJ01AB1234"
                  value={replVehicle}
                  onChange={(e) => setReplVehicle(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Driver Name</label>
                <input
                  type="text"
                  placeholder="Driver full name"
                  value={replDriver}
                  onChange={(e) => setReplDriver(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispatch Notes</label>
                <textarea
                  rows={2}
                  placeholder="Dispatch instructions..."
                  value={replNotes}
                  onChange={(e) => setReplNotes(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReplacementModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Generate Delivery</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Cancel Goods Return</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter reason to cancel return {returnData.return_number}. If previously posted, all stock
              and ledger entries will be reversed automatically.
            </p>

            <form onSubmit={handleCancel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="e.g. Return cancelled by customer request..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Cancel Return</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
