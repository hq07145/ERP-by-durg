"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeliveryDates } from "@/components/orders/delivery-dates";
import { CancelOrderModal } from "@/components/orders/cancel-order-modal";
import { ChangePriorityModal } from "@/components/orders/change-priority-modal";
import { DeleteOrderModal } from "@/components/orders/delete-order-modal";
import { confirmOrderAction } from "@/lib/orders/actions";
import type {
  OrderWithCustomer,
  OrderItemWithProduct,
  OrderStatusHistory,
  DeliveryStatus,
  OrderPaymentItem,
  OrderDeliveryItem,
  OrderProductionItem,
  CustomerAdvanceAllocation,
  OrderGoodsReturnItem,
} from "@/types/order";
import {
  getOrderPaymentStatus,
  ORDER_PAYMENT_STATUS_COLORS,
  ORDER_PAYMENT_STATUS_LABELS,
} from "@/types/order";
import { createDeliveryFromOrder, downloadDeliveryChallanPdf, cancelPartialDelivery } from "@/lib/delivery/actions";
import { triggerDownload } from "@/lib/reports/export-client";
import { CreatePartialDeliveryModal } from "@/components/delivery/create-partial-delivery-modal";
import { DELIVERY_STATUS_COLORS } from "@/types/delivery";
import {
  Building2,
  Calendar,
  CreditCard,
  Truck,
  Layers,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  ArrowRight,
  Edit,
  XCircle,
  Check,
  ChevronRight,
  FileText,
  User,
  Phone,
  Mail,
  ShieldCheck,
  Loader2,
  Plus,
  Trash2,
  Printer,
  MapPin,
  Receipt,
  X,
  Wallet,
  Eye,
  Download,
  RotateCcw,
} from "lucide-react";

interface DeliveryInfo {
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  expectedDeliveryDate: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryCalculatedAt: string | null;
  deliveryCalculationVersion: number;
  productionCompletionDate?: string | null;
  explanation?: string | null;
  fulfillmentSource?: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_INSUFFICIENT" | "MATERIALS_INSUFFICIENT" | "CAPACITY_MISSING";
  hasCapacityIssue?: boolean;
  hasMaterialIssue?: boolean;
  hasMissingCapacity?: boolean;
  itemsSummary?: Array<{
    productName: string;
    qualityGrade?: string | null;
    orderedQty: number;
    stockQty: number;
    prodQty: number;
    status: string;
    notes?: string;
  }>;
}

interface OrderDetailProps {
  order: OrderWithCustomer;
  items: OrderItemWithProduct[];
  statusHistory: OrderStatusHistory[];
  payments?: OrderPaymentItem[];
  deliveries?: OrderDeliveryItem[];
  returns?: OrderGoodsReturnItem[];
  productionOrders?: OrderProductionItem[];
  advanceAllocations?: CustomerAdvanceAllocation[];
  customerAdvanceBalance?: number;
  canEdit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canChangePriority: boolean;
  canCreateDelivery?: boolean;
  isProductionComplete?: boolean;
  deliveryInfo: DeliveryInfo;
  businessDetails?: {
    name?: string;
    legal_name?: string;
    tagline?: string;
    business_type?: string;
    gst_number?: string;
    state?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return "₹0.00";
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderDetail({
  order,
  items,
  statusHistory,
  payments = [],
  deliveries = [],
  returns = [],
  productionOrders = [],
  advanceAllocations = [],
  customerAdvanceBalance,
  canEdit,
  canCancel,
  canApprove,
  canChangePriority,
  canCreateDelivery = true,
  isProductionComplete = false,
  deliveryInfo,
  businessDetails,
}: OrderDetailProps) {
  const router = useRouter();
  const [showTaxInvoiceModal, setShowTaxInvoiceModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const isConfirmingRef = useRef(false);

  const [showCreateDeliveryDialog, setShowCreateDeliveryDialog] = useState(false);
  const [showPartialDeliveryModal, setShowPartialDeliveryModal] = useState(false);
  const [downloadingChallanId, setDownloadingChallanId] = useState<string | null>(null);
  const [cancelDeliveryTarget, setCancelDeliveryTarget] = useState<any | null>(null);
  const [cancelDeliveryReason, setCancelDeliveryReason] = useState("");
  const [isCancellingDelivery, setIsCancellingDelivery] = useState(false);
  const [cancelDeliveryError, setCancelDeliveryError] = useState<string | null>(null);
  const [deliveryNumber, setDeliveryNumber] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [createDeliveryError, setCreateDeliveryError] = useState<string | null>(null);
  const [createDeliverySuccess, setCreateDeliverySuccess] = useState<string | null>(null);

  const handleDownloadChallan = async (deliveryId: string, deliveryNum: string) => {
    setDownloadingChallanId(deliveryId);
    try {
      const res = await downloadDeliveryChallanPdf(deliveryId);
      if (res.success && res.base64) {
        triggerDownload(res.base64, "application/pdf", res.filename || `Challan-${deliveryNum}.pdf`);
      } else {
        alert("Failed to generate challan PDF.");
      }
    } catch (err) {
      console.error("Error downloading challan:", err);
      alert(err instanceof Error ? err.message : "Failed to download challan.");
    } finally {
      setDownloadingChallanId(null);
    }
  };

  const handleConfirmCancelDelivery = async () => {
    if (!cancelDeliveryTarget) return;
    if (!cancelDeliveryReason.trim()) {
      setCancelDeliveryError("Cancellation reason is required.");
      return;
    }
    setIsCancellingDelivery(true);
    setCancelDeliveryError(null);
    try {
      await cancelPartialDelivery(cancelDeliveryTarget.id, cancelDeliveryReason.trim());
      setCancelDeliveryTarget(null);
      setCancelDeliveryReason("");
      router.refresh();
    } catch (err) {
      setCancelDeliveryError(err instanceof Error ? err.message : "Failed to cancel delivery.");
    } finally {
      setIsCancellingDelivery(false);
    }
  };

  const [localStatus, setLocalStatus] = useState(order.status);
  useEffect(() => {
    setLocalStatus(order.status);
  }, [order.status]);

  const hasLockedProduction = (productionOrders ?? []).some((po: any) =>
    ["IN_PROGRESS", "IN_PRODUCTION", "COMPLETED", "QUALITY_CHECK", "QUALITY_PASSED", "READY_FOR_DISPATCH"].includes(po.status)
  );
  const isDelivered = order.delivery_status === "DELIVERED";
  const canConfirm = localStatus === "DRAFT" && canApprove;
  const canCancelOrder = localStatus !== "CANCELLED" && !isDelivered && !hasLockedProduction && canCancel;

  const handleConfirmOrder = async () => {
    if (isConfirming || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    setIsConfirming(true);
    setActionError(null);
    try {
      const res = await confirmOrderAction(order.id);
      if (!res.success) {
        setActionError(res.message || res.error || "Failed to confirm order.");
      } else {
        setLocalStatus("CONFIRMED");
        router.refresh();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error confirming order.");
    } finally {
      setIsConfirming(false);
      isConfirmingRef.current = false;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "CONFIRMED":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "CANCELLED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "DELIVERED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "LOW":
        return "bg-slate-100 text-slate-600 border-slate-200";
      case "NORMAL":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "HIGH":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "URGENT":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const handleBackToOrders = () => {
    if (typeof window !== "undefined") {
      const prevRoute = sessionStorage.getItem("prev_route");
      const lastOrdersListUrl = sessionStorage.getItem("last_orders_list_url");

      let isFromOrdersList = false;
      let targetUrl = lastOrdersListUrl || "/orders";

      // 1. Check if immediate previous route in session was the Orders list
      if (prevRoute) {
        const prevPath = prevRoute.split("?")[0].replace(/\/$/, "");
        if (prevPath === "/orders") {
          isFromOrdersList = true;
          targetUrl = prevRoute;
        }
      }

      // 2. Check if document.referrer was the Orders list
      if (!isFromOrdersList && document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (
            refUrl.origin === window.location.origin &&
            refUrl.pathname.replace(/\/$/, "") === "/orders"
          ) {
            isFromOrdersList = true;
            targetUrl = refUrl.pathname + refUrl.search;
          }
        } catch {
          // ignore invalid referrer url
        }
      }

      // 3. If arrived from Orders list and browser history has a previous entry, use router.back()
      // to preserve previous search query, filters, sorting, pagination, and scroll position.
      if (isFromOrdersList && window.history.length > 1) {
        router.back();
        return;
      }

      // 4. If arrived from Orders list or has stored orders list query, navigate to targetUrl
      if (isFromOrdersList || lastOrdersListUrl) {
        router.push(targetUrl);
        return;
      }
    }

    // 5. Fallback: navigation history is unavailable or previous page was unrelated
    router.push("/orders");
  };

  return (
    <div className="space-y-6">
      {/* Back to Orders Button */}
      <div className="flex items-center justify-start">
        <button
          type="button"
          onClick={handleBackToOrders}
          id="back-to-orders-btn"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
          aria-label="Back to Orders"
        >
          <ArrowLeft className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span>Back to Orders</span>
        </button>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xl sm:text-2xl font-bold text-[#142B3B] tracking-tight">
                {order.order_number}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(localStatus)}`}>
                {localStatus}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(order.priority)}`}>
                {order.priority}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${ORDER_PAYMENT_STATUS_COLORS[getOrderPaymentStatus(order.total_amount, order.paid_amount, order.due_amount)]}`}>
                {ORDER_PAYMENT_STATUS_LABELS[getOrderPaymentStatus(order.total_amount, order.paid_amount, order.due_amount)]}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span>Order Placed: {formatDate(order.order_date)}</span>
              <span>•</span>
              <span>Customer: <strong className="text-slate-700">{order.customer?.name ?? "Unknown"}</strong></span>
            </p>
          </div>

          {/* Permitted Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {canConfirm && (
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isConfirming}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition min-h-9 disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Confirm Order</span>
                  </>
                )}
              </button>
            )}

            {canEdit && localStatus === "DRAFT" && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-9"
              >
                <Edit className="h-3.5 w-3.5 text-slate-500" />
                <span>Edit Order</span>
              </Link>
            )}

            {canEdit && localStatus === "DRAFT" && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition min-h-9"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowTaxInvoiceModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-9 shadow-xs"
              title="View GST Tax Invoice"
            >
              <FileText className="h-3.5 w-3.5 text-[#0F766E]" />
              <span>Tax Invoice</span>
            </button>

            {order.status !== "CANCELLED" && Number(order.due_amount) > 0 && (
              <Link
                href={`/payments/new?orderId=${order.id}&customerId=${order.customer_id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition min-h-9"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Record Payment</span>
              </Link>
            )}

            {canChangePriority && order.status !== "CANCELLED" && !isDelivered && (
              <button
                type="button"
                onClick={() => setShowPriorityModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition min-h-9"
              >
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Priority</span>
              </button>
            )}

            {canCancel && order.status !== "CANCELLED" && !isDelivered && (
              hasLockedProduction ? (
                <button
                  type="button"
                  disabled
                  title="Cannot cancel: production has already started or completed"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed min-h-9"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Cancel</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition min-h-9"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Cancel</span>
                </button>
              )
            )}

            {order.status === "CONFIRMED" && canCreateDelivery && order.delivery_status !== "FULLY_DISPATCHED" && order.delivery_status !== "DELIVERED" && (
              <button
                onClick={() => setShowPartialDeliveryModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition min-h-9"
              >
                <Truck className="h-4 w-4" />
                <span>Create Delivery</span>
              </button>
            )}

            {(order.delivery_status === "FULLY_DISPATCHED" || order.delivery_status === "DELIVERED") && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 min-h-9">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Fully Dispatched</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Financial Overview KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Grand Total</span>
          <p className="text-xl sm:text-2xl font-bold text-[#142B3B] mt-1">
            {formatCurrency(order.total_amount)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Subtotal: {formatCurrency(order.subtotal)}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Paid / Adjusted</span>
          <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1">
            {formatCurrency(order.paid_amount)}
          </p>
          <span className="text-[11px] text-emerald-600 mt-1 block">
            {Number(order.advance_applied || 0) > 0 ? (
              <>Includes {formatCurrency(order.advance_applied)} advance</>
            ) : (
              <>{payments.length} payment record{payments.length === 1 ? "" : "s"}</>
            )}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Balance Due</span>
          <p className={`text-xl sm:text-2xl font-bold mt-1 ${Number(order.due_amount) > 0 ? "text-rose-600" : "text-slate-800"}`}>
            {formatCurrency(order.due_amount)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {Number(order.due_amount) > 0 ? "Pending collection" : "Fully settled"}
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Delivery Status</span>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${(DELIVERY_STATUS_COLORS as any)[order.delivery_status] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
              {(order.delivery_status || "PENDING").replace(/_/g, " ")}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1.5 block">
            {order.status === "DRAFT" || order.delivery_status === "PENDING" ? "Predicted Target: " : "Committed Target: "}
            <span className="font-semibold text-slate-800">{formatDate(order.expected_delivery_date)}</span>
          </span>
        </div>
      </div>

      {/* Main Order Content: Items & Customer Details */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order Line Items Table */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0F766E]" />
              <span>Line Items ({items.length})</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left" role="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3.5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ordered</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Delivered</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Returned</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Net Retained</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Remaining to Deliver</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Unit Price</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Disc %</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Taxable Val</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">GST Rate</th>
                  <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                    {order.tax_type === "INTRA_STATE" ? "CGST + SGST" : order.tax_type === "INTER_STATE" ? "IGST" : "Tax"}
                  </th>
                  <th className="px-3.5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {items.map((item) => {
                  const qty = Number(item.quantity) || 0;
                  const totalDelivered = item.total_delivered_quantity !== undefined ? item.total_delivered_quantity : (Number(item.delivered_quantity || item.dispatched_quantity) || 0);
                  const totalReturned = item.total_returned_quantity !== undefined ? item.total_returned_quantity : 0;
                  const netRetained = item.net_retained_quantity !== undefined ? item.net_retained_quantity : Math.max(0, totalDelivered - totalReturned);
                  const remainingToDeliver = item.remaining_to_deliver !== undefined ? item.remaining_to_deliver : Math.max(0, qty - totalDelivered);
                  const price = Number(item.unit_price) || 0;
                  const discRate = Number(item.discount_rate) || 0;
                  const gross = qty * price;
                  const disc = (gross * discRate) / 100;
                  const taxable = item.taxable_amount != null ? Number(item.taxable_amount) : Math.max(0, gross - disc);
                  const isIntra = order.tax_type === "INTRA_STATE";
                  const isInter = order.tax_type === "INTER_STATE";

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-3.5 py-3">
                        <p className="font-semibold text-slate-900">{item.product_name}</p>
                        {item.quality_grade ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mt-0.5">
                            Grade: {item.quality_grade}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 mt-0.5">
                            Quality not configured
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700 text-right font-medium">
                        {qty.toFixed(2)} <span className="text-xs text-slate-500">{item.product_unit}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-teal-700">
                        {totalDelivered.toFixed(2)} <span className="text-xs text-slate-500">{item.product_unit}</span>
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold ${totalReturned > 0 ? "text-rose-600" : "text-slate-400"}`}>
                        {totalReturned.toFixed(2)} <span className="text-xs text-slate-400">{item.product_unit}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        {netRetained.toFixed(2)} <span className="text-xs text-slate-500">{item.product_unit}</span>
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold ${remainingToDeliver > 0 ? "text-amber-600" : "text-emerald-700"}`}>
                        {remainingToDeliver.toFixed(2)} <span className="text-xs text-slate-500">{item.product_unit}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-700 text-right font-mono">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="px-3 py-3 text-slate-700 text-right">
                        {discRate > 0 ? `${discRate}%` : "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-800 text-right font-mono font-medium">
                        {formatCurrency(taxable)}
                      </td>
                      <td className="px-3 py-3 text-slate-700 text-right font-medium">
                        {Number(item.tax_rate) > 0 ? `${Number(item.tax_rate)}%` : "0% (Exempt)"}
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-right text-xs">
                        {isIntra ? (
                          Number(item.tax_rate) > 0 ? (
                            <div className="space-y-0.5">
                              <div>C: {formatCurrency(item.cgst_amount || 0)} <span className="text-[10px] text-slate-400">({Number(item.cgst_rate || Number(item.tax_rate)/2)}%)</span></div>
                              <div>S: {formatCurrency(item.sgst_amount || 0)} <span className="text-[10px] text-slate-400">({Number(item.sgst_rate || Number(item.tax_rate)/2)}%)</span></div>
                            </div>
                          ) : (
                            <span className="text-slate-400">₹0.00</span>
                          )
                        ) : isInter ? (
                          Number(item.tax_rate) > 0 ? (
                            <div>
                              <span>I: {formatCurrency(item.igst_amount || 0)} <span className="text-[10px] text-slate-400">({Number(item.igst_rate || item.tax_rate)}%)</span></span>
                            </div>
                          ) : (
                            <span className="text-slate-400">₹0.00</span>
                          )
                        ) : (
                          <span className="text-slate-400">₹0.00</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-slate-900 text-right font-semibold font-mono">
                        {formatCurrency(item.line_total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer & Order Metadata Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-[#0F766E]" />
              <span>Customer Information</span>
            </h2>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Customer Name</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{order.customer?.name ?? "Unknown Customer"}</dd>
              </div>

              {order.customer?.company_name && (
                <div>
                  <dt className="text-xs text-slate-500">Company</dt>
                  <dd className="text-slate-800 mt-0.5">{order.customer.company_name}</dd>
                </div>
              )}

              <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-xs text-slate-500">Customer GSTIN</dt>
                  <dd className="font-mono text-xs font-semibold text-slate-800 mt-0.5 break-all">
                    {order.customer_gstin || order.customer?.gst_number || "Unregistered / Consumer"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Place of Supply</dt>
                  <dd className="text-xs font-semibold text-slate-800 mt-0.5">
                    {order.place_of_supply || "Not specified"}
                  </dd>
                </div>
              </div>

              <div>
                <dt className="text-xs text-slate-500">Tax Regime</dt>
                <dd className="mt-1">
                  {order.tax_type === "INTRA_STATE" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-[#0F766E] border border-teal-200">
                      Intra-State (CGST + SGST)
                    </span>
                  ) : order.tax_type === "INTER_STATE" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                      Inter-State (IGST)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      Exempt / Non-Taxable
                    </span>
                  )}
                </dd>
              </div>

              {order.customer?.phone && (
                <div>
                  <dt className="text-xs text-slate-500">Phone</dt>
                  <dd className="text-slate-800 mt-0.5 font-mono">{order.customer.phone}</dd>
                </div>
              )}

              {order.customer?.email && (
                <div>
                  <dt className="text-xs text-slate-500">Email</dt>
                  <dd className="text-slate-800 mt-0.5">{order.customer.email}</dd>
                </div>
              )}

              <div className="pt-2.5 border-t border-slate-100">
                <dt className="text-xs text-slate-500">Order Notes</dt>
                <dd className="text-xs text-slate-700 mt-1 whitespace-pre-wrap italic">
                  {order.notes || "No special notes recorded."}
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-6 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal (Gross):</span>
              <span className="font-medium text-slate-900">{formatCurrency(order.subtotal)}</span>
            </div>
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount:</span>
                <span className="font-medium">- {formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 font-medium">
              <span>Taxable Value:</span>
              <span className="text-slate-900">
                {formatCurrency(Math.max(0, Number(order.subtotal || 0) - Number(order.discount_amount || 0)))}
              </span>
            </div>

            {/* GST Tax Breakdown */}
            {order.tax_type === "INTRA_STATE" ? (
              <>
                <div className="flex justify-between text-slate-600 pl-2">
                  <span>CGST:</span>
                  <span className="font-medium text-slate-900">+ {formatCurrency(order.cgst_amount ?? (Number(order.tax_amount || 0) / 2))}</span>
                </div>
                <div className="flex justify-between text-slate-600 pl-2">
                  <span>SGST:</span>
                  <span className="font-medium text-slate-900">+ {formatCurrency(order.sgst_amount ?? (Number(order.tax_amount || 0) / 2))}</span>
                </div>
              </>
            ) : order.tax_type === "INTER_STATE" ? (
              <div className="flex justify-between text-slate-600 pl-2">
                <span>IGST:</span>
                <span className="font-medium text-slate-900">+ {formatCurrency(order.igst_amount ?? order.tax_amount)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-slate-500 pl-2">
                <span>GST:</span>
                <span className="font-medium text-slate-700">{formatCurrency(order.tax_amount || 0)} (Exempt)</span>
              </div>
            )}

            <div className="flex justify-between text-slate-700 border-t border-dashed border-slate-200 pt-1 font-medium">
              <span>Total GST:</span>
              <span className="font-semibold text-slate-900">{formatCurrency(order.tax_amount)}</span>
            </div>

            <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2">
              <span>Final Order Total:</span>
              <span className="text-[#0F766E] font-mono">{formatCurrency(order.total_amount)}</span>
            </div>
            {Number(order.advance_applied || 0) > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-semibold pt-0.5">
                <span>Less: Customer Advance Adjusted:</span>
                <span className="font-mono">-{formatCurrency(order.advance_applied)}</span>
              </div>
            )}
            {Number(order.paid_amount || 0) - Number(order.advance_applied || 0) > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-medium">
                <span>Other Payments Received:</span>
                <span className="font-mono">-{formatCurrency(Number(order.paid_amount || 0) - Number(order.advance_applied || 0))}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-rose-700 font-bold border-t border-slate-100 pt-1">
              <span>Net Amount Payable:</span>
              <span className="font-mono">{formatCurrency(order.due_amount)}</span>
            </div>
            {customerAdvanceBalance !== undefined && (
              <div className="flex justify-between items-center text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg mt-1 border border-slate-200">
                <span className="font-medium">Remaining Customer Advance:</span>
                <span className="font-mono font-bold text-slate-800">
                  {formatCurrency(customerAdvanceBalance)}{" "}
                  <span className="text-[10px] text-slate-500 font-normal">(Account Balance)</span>
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500 font-semibold">Payment Status:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ORDER_PAYMENT_STATUS_COLORS[getOrderPaymentStatus(order.total_amount, order.paid_amount, order.due_amount)]}`}>
                {ORDER_PAYMENT_STATUS_LABELS[getOrderPaymentStatus(order.total_amount, order.paid_amount, order.due_amount)]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Schedule Component */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#0F766E]" />
          <span>Delivery Schedule & Dates</span>
        </h2>
        <DeliveryDates
          orderId={order.id}
          orderStatus={order.status}
          earliestDeliveryDate={deliveryInfo.earliestDeliveryDate}
          latestDeliveryDate={deliveryInfo.latestDeliveryDate}
          expectedDeliveryDate={deliveryInfo.expectedDeliveryDate}
          deliveryStatus={deliveryInfo.deliveryStatus}
          deliveryCalculatedAt={deliveryInfo.deliveryCalculatedAt}
          deliveryCalculationVersion={deliveryInfo.deliveryCalculationVersion}
          productionCompletionDate={deliveryInfo.productionCompletionDate}
          isOverdue={deliveryInfo.deliveryStatus === "OVERDUE"}
          explanation={deliveryInfo.explanation}
          fulfillmentSource={deliveryInfo.fulfillmentSource}
          hasCapacityIssue={deliveryInfo.hasCapacityIssue}
          hasMaterialIssue={deliveryInfo.hasMaterialIssue}
          hasMissingCapacity={deliveryInfo.hasMissingCapacity}
          itemsSummary={deliveryInfo.itemsSummary}
        />
      </div>

      {/* Production Jobs Schedule (Step 3) */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#0F766E]" />
          <span>Production Jobs ({productionOrders.length})</span>
        </h2>

        {productionOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500 text-xs">
            {order.status === "DRAFT"
              ? "Production orders will be automatically scheduled once this order is confirmed."
              : "No production orders currently linked to this order."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left" role="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Required Qty</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Completed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled Start</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled End</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actual Finish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {productionOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {po.product_name}
                      {po.product_sku && <span className="font-mono text-xs text-slate-500 block">{po.product_sku}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {Number(po.quantity).toFixed(2)} {po.product_unit}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {Number(po.completed_quantity).toFixed(2)} {po.product_unit}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(po.scheduled_start_date)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(po.scheduled_end_date)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(po.actual_end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment & Advance Adjustment History */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#0F766E]" />
            <span>Payment & Settlement History</span>
          </h2>
          {order.status !== "CANCELLED" && Number(order.due_amount) > 0 && (
            <Link
              href={`/payments/new?orderId=${order.id}&customerId=${order.customer_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D655E] transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </Link>
          )}
        </div>

        {/* Customer Advance Adjustments Table if any */}
        {advanceAllocations.length > 0 && (
          <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-teal-100">
              <span className="font-bold text-teal-950 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#0F766E]" />
                <span>Customer Advance Adjusted ({advanceAllocations.length})</span>
              </span>
              <span className="font-mono font-bold text-emerald-800">
                Total Adjusted: {formatCurrency(order.advance_applied || advanceAllocations.reduce((sum, a) => sum + (Number(a.allocated_amount) || 0), 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-teal-100 text-left">
                <thead>
                  <tr className="text-[11px] font-semibold text-teal-800 uppercase">
                    <th className="py-2 px-2.5">Allocation Date</th>
                    <th className="py-2 px-2.5">Advance Receipt #</th>
                    <th className="py-2 px-2.5">Receipt Date</th>
                    <th className="py-2 px-2.5">Reference / Notes</th>
                    <th className="py-2 px-2.5 text-right">Adjusted Amount</th>
                    <th className="py-2 px-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100/60 bg-white/70">
                  {advanceAllocations.map((a) => (
                    <tr key={a.id} className="text-slate-700">
                      <td className="py-2 px-2.5">{formatDate(a.allocation_date)}</td>
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{a.payments?.payment_number || "ADV"}</td>
                      <td className="py-2 px-2.5 text-slate-500">{formatDate(a.payments?.payment_date)}</td>
                      <td className="py-2 px-2.5 text-slate-600 text-[11px]">{a.payments?.reference || a.notes || "—"}</td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-700">{formatCurrency(a.allocated_amount)}</td>
                      <td className="py-2 px-2.5 text-right">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${a.status === 'ACTIVE' ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {payments.length === 0 && advanceAllocations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500 text-xs">
            No payments recorded yet for this order. Outstanding balance: <strong className="text-slate-800">{formatCurrency(order.due_amount)}</strong>
          </div>
        ) : payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left" role="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment #</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Method</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{p.payment_number}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{p.payment_method}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.reference || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Deliveries Table (Step 3: Partial Dispatch Foundation & History) */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#0F766E]" />
            <span>Delivery History ({deliveries.length})</span>
          </h2>
          {order.status === "CONFIRMED" && canCreateDelivery && order.delivery_status !== "FULLY_DISPATCHED" && order.delivery_status !== "DELIVERED" && (
            <button
              type="button"
              onClick={() => setShowPartialDeliveryModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-teal-100 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Next Delivery</span>
            </button>
          )}
        </div>

        {deliveries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500 text-xs">
            No deliveries dispatched or created for this order yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs" role="table">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Delivery #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Transport / Driver</th>
                  <th className="px-4 py-3">Invoice Ref</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {deliveries.map((del) => {
                  const isCancelled = del.status === "CANCELLED";
                  const statusColor = (DELIVERY_STATUS_COLORS as any)[del.status] || "bg-slate-100 text-slate-700";
                  return (
                    <tr key={del.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-slate-900 block">{del.delivery_number}</span>
                        {del.linked_returns && del.linked_returns.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {del.linked_returns.map((lr) => (
                              <span
                                key={lr.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-medium"
                                title={`Linked Return: ${lr.return_number}`}
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>{lr.return_number}: {lr.returned_quantity.toLocaleString()} {lr.unit || ""} ({lr.status.replace(/_/g, " ")})</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusColor}`}>
                          {del.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(del.expected_delivery_date || del.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {del.total_quantity !== undefined ? `${del.total_quantity.toLocaleString()} ${del.unit || ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {del.vehicle || del.driver ? (
                          <span>
                            {del.vehicle ? <strong className="font-mono text-slate-900">{del.vehicle}</strong> : ""}
                            {del.driver ? ` • ${del.driver}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {(del as any).invoice_number || "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <Link
                          href={`/delivery/${del.id}`}
                          className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                          title="View Delivery Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleDownloadChallan(del.id, del.delivery_number)}
                          disabled={downloadingChallanId === del.id}
                          className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-[#0F766E] border border-teal-200 text-xs font-semibold transition disabled:opacity-50"
                          title="Print / Download Delivery Challan PDF"
                        >
                          {downloadingChallanId === del.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Printer className="w-3.5 h-3.5" />
                          )}
                          <span>Challan</span>
                        </button>

                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelDeliveryTarget(del);
                              setCancelDeliveryReason("");
                              setCancelDeliveryError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition"
                            title="Cancel Delivery"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Goods Returns History Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#0F766E]" />
            <span>Goods Returns History ({returns.length})</span>
          </h2>
          <Link
            href={`/returns?order_id=${order.id}`}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-teal-100 transition"
          >
            <span>Manage Returns</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {returns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500 text-xs">
            No goods returns recorded for this order.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs" role="table">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Return #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Delivery Ref</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Returned Qty</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Adjustment</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {returns.map((ret) => {
                  const statusColors: Record<string, string> = {
                    PENDING_INSPECTION: "bg-amber-50 text-amber-700 border-amber-200",
                    APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
                    POSTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
                    CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
                  };
                  return (
                    <tr key={ret.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {ret.return_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusColors[ret.status] || "bg-slate-100 text-slate-700"}`}>
                          {ret.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(ret.return_date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {ret.delivery_id ? (
                          <Link
                            href={`/delivery/${ret.delivery_id}`}
                            className="text-[#0F766E] hover:underline"
                          >
                            {ret.delivery_number || "Delivery Challan"}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {ret.product_name || "Product"}
                        {ret.sku ? <span className="text-[10px] font-mono text-slate-400 block">SKU: {ret.sku}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                        {ret.returned_quantity.toLocaleString()} {ret.unit || "units"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {ret.product_condition}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {ret.adjustment_type ? `${ret.adjustment_type.replace(/_/g, " ")} (₹${ret.adjustment_amount})` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/returns/${ret.id}`}
                          className="inline-flex items-center gap-1 rounded px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                          title="View Return Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status History Audit Trail (Step 2) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0F766E]" />
            <span>Audit Trail & Status History ({statusHistory.length})</span>
          </h2>
        </div>

        {statusHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No status transitions recorded yet for this order.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left" role="table">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Transition</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority Transition</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Authorized User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {statusHistory.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(h.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {h.old_status && h.old_status !== h.new_status ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(h.old_status)}`}>
                            {h.old_status}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(h.new_status)}`}>
                            {h.new_status}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {h.old_priority && h.old_priority !== h.new_priority ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(h.old_priority)}`}>
                            {h.old_priority}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getPriorityBadge(h.new_priority)}`}>
                            {h.new_priority}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-800">
                      {h.changed_by}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {h.reason ?? <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Partial Delivery Creation Modal (Step 3) */}
      <CreatePartialDeliveryModal
        isOpen={showPartialDeliveryModal}
        onClose={() => setShowPartialDeliveryModal(false)}
        orderId={order.id}
        orderNumber={order.order_number}
        customerName={order.customer?.name}
        onSuccess={(result) => {
          setShowPartialDeliveryModal(false);
          router.refresh();
        }}
      />

      {/* Cancel Delivery Confirmation Dialog (Step 3) */}
      {cancelDeliveryTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Cancel Delivery #{cancelDeliveryTarget.delivery_number}</span>
              </h3>
              <button
                type="button"
                onClick={() => setCancelDeliveryTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel this delivery? The dispatched quantities will be reversed and restored to the order balance. Delivery record will be retained as CANCELLED for audit history.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Cancellation <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={cancelDeliveryReason}
                onChange={(e) => setCancelDeliveryReason(e.target.value)}
                placeholder="e.g. Order item damaged before dispatch, truck breakdown, customer requested change..."
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                required
              />
            </div>

            {cancelDeliveryError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {cancelDeliveryError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelDeliveryTarget(null)}
                disabled={isCancellingDelivery}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep Delivery
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelDelivery}
                disabled={isCancellingDelivery || !cancelDeliveryReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {isCancellingDelivery ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      <CancelOrderModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        order={{
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer?.name,
          total_amount: order.total_amount,
          status: order.status,
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Priority Change Modal */}
      <ChangePriorityModal
        isOpen={showPriorityModal}
        onClose={() => setShowPriorityModal(false)}
        order={{
          id: order.id,
          order_number: order.order_number,
          current_priority: order.priority,
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Delete Draft Order Modal */}
      {showDeleteModal && (
        <DeleteOrderModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          order={{
            id: order.id,
            order_number: order.order_number,
            customer_name: order.customer?.name,
          }}
          onSuccess={() => {
            setShowDeleteModal(false);
            router.push("/orders?notice=order_deleted");
          }}
        />
      )}

      {/* GST Tax Invoice Modal */}
      {showTaxInvoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTaxInvoiceModal(false)}
        >
          <div
            className="relative flex flex-col w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Controls Bar (hidden during print) */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#0F766E]" />
                <h3 className="text-base font-bold text-slate-900">GST Tax Invoice Preview</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-[#0F766E] border border-teal-200 font-medium">
                  {order.tax_type === "INTRA_STATE" ? "Intra-State (CGST + SGST)" : order.tax_type === "INTER_STATE" ? "Inter-State (IGST)" : "Exempt"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0F766E] text-white hover:bg-[#0D655E] transition shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTaxInvoiceModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable GST Invoice Body */}
            <div className="p-8 text-slate-800 space-y-6 max-h-[80vh] overflow-y-auto print:max-h-none print:p-0">
              {/* Invoice Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b-2 border-slate-900">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                    {businessDetails?.legal_name || businessDetails?.name || "SANKALP IRRIGATION"}
                  </h1>
                  {businessDetails?.tagline && (
                    <p className="text-xs font-semibold text-[#0F766E] tracking-wider uppercase mt-0.5">
                      {businessDetails.tagline}
                    </p>
                  )}
                  {businessDetails?.business_type && (
                    <p className="text-[11px] text-slate-600 font-medium uppercase">
                      {businessDetails.business_type}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{businessDetails?.address || "Icchapur Road, Shahpur, Dist. Burhanpur (M.P.) 450-445"}</p>
                  <div className="text-xs text-slate-700 mt-2 space-y-0.5">
                    <p><span className="font-semibold">GSTIN:</span> <span className="font-mono font-bold text-slate-900">{order.business_gstin || businessDetails?.gst_number || "23AAMPQ5857F1ZE"}</span></p>
                    <p><span className="font-semibold">State & Code:</span> {businessDetails?.state || "Madhya Pradesh"} {order.business_gstin ? `(${order.business_gstin.slice(0, 2)})` : businessDetails?.gst_number ? `(${businessDetails.gst_number.slice(0, 2)})` : "(23)"}</p>
                    {businessDetails?.email && <p><span className="font-semibold">Email:</span> {businessDetails.email}</p>}
                    {businessDetails?.phone && <p><span className="font-semibold">Phone:</span> {businessDetails.phone}</p>}
                  </div>
                </div>

                <div className="text-right sm:min-w-[200px]">
                  <span className="inline-block px-3 py-1 rounded bg-slate-900 text-white text-xs font-bold uppercase tracking-wider mb-2">
                    Tax Invoice
                  </span>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Original for Recipient</p>
                  <div className="text-xs text-slate-700 mt-2 space-y-0.5 text-right">
                    <p><span className="font-semibold">Invoice No:</span> <span className="font-mono font-bold">INV-{order.order_number}</span></p>
                    <p><span className="font-semibold">Order Date:</span> {formatDate(order.order_date)}</p>
                    <p><span className="font-semibold">Place of Supply:</span> <span className="font-bold text-slate-900">{order.place_of_supply || "Not Specified"}</span></p>
                    <p><span className="font-semibold">Tax Regime:</span> {order.tax_type === "INTRA_STATE" ? "CGST + SGST (Intra-State)" : order.tax_type === "INTER_STATE" ? "IGST (Inter-State)" : "Exempt"}</p>
                  </div>
                </div>
              </div>

              {/* Bill To Recipient Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Details of Receiver | Billed To:</h4>
                  <p className="font-bold text-sm text-slate-900">{order.customer?.name ?? "Customer"}</p>
                  {order.customer?.company_name && <p className="text-slate-700 font-medium">{order.customer.company_name}</p>}
                  <p className="text-slate-600 mt-1"><span className="font-semibold">GSTIN / UIN:</span> <span className="font-mono font-bold text-slate-900">{order.customer_gstin || order.customer?.gst_number || "URP (Unregistered)"}</span></p>
                  <p className="text-slate-600"><span className="font-semibold">State:</span> {order.place_of_supply || "—"}</p>
                  {order.customer?.phone && <p className="text-slate-600">Phone: {order.customer.phone}</p>}
                  {order.customer?.email && <p className="text-slate-600">Email: {order.customer.email}</p>}
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Supply & Payment Terms:</h4>
                  <p className="text-slate-700"><span className="font-semibold">Payment Status:</span> {order.due_amount === 0 ? "PAID IN FULL" : Number(order.paid_amount) > 0 ? "PARTIALLY PAID" : "PENDING PAYMENT"}</p>
                  <p className="text-slate-700"><span className="font-semibold">Target Dispatch:</span> {formatDate(order.expected_delivery_date)}</p>
                  <p className="text-slate-700"><span className="font-semibold">Reverse Charge:</span> Applicable (No)</p>
                  {advanceAllocations && advanceAllocations.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-slate-200 text-teal-800">
                      <p className="font-semibold text-slate-700">Advance Adjusted:</p>
                      {advanceAllocations.map((a, i) => (
                        <p key={a.id || i} className="font-mono text-[11px] text-teal-900">
                          • {formatCurrency(a.allocated_amount)} via {a.payments?.payment_number || "ADV"} ({formatDate(a.allocation_date)})
                        </p>
                      ))}
                    </div>
                  )}
                  {order.notes && <p className="text-slate-600 mt-1 italic">Note: {order.notes}</p>}
                </div>
              </div>

              {/* Items Table with Full Indian GST Columns */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="p-2.5 text-center w-8">#</th>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Disc %</th>
                      <th className="p-2.5 text-right">Taxable Val</th>
                      {order.tax_type === "INTRA_STATE" ? (
                        <>
                          <th className="p-2.5 text-right">CGST</th>
                          <th className="p-2.5 text-right">SGST</th>
                        </>
                      ) : (
                        <th className="p-2.5 text-right">IGST</th>
                      )}
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((it, idx) => {
                      const qty = Number(it.quantity) || 0;
                      const price = Number(it.unit_price) || 0;
                      const discRate = Number(it.discount_rate) || 0;
                      const gross = qty * price;
                      const disc = (gross * discRate) / 100;
                      const taxable = it.taxable_amount != null ? Number(it.taxable_amount) : Math.max(0, gross - disc);

                      return (
                        <tr key={it.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                          <td className="p-2.5">
                            <p className="font-semibold text-slate-900">{it.product_name}</p>
                            {it.quality_grade ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mt-0.5">
                                Grade: {it.quality_grade}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 mt-0.5">
                                Quality not configured
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-medium">{qty.toFixed(2)} {it.product_unit}</td>
                          <td className="p-2.5 text-right font-mono">{formatCurrency(price)}</td>
                          <td className="p-2.5 text-right">{discRate > 0 ? `${discRate}%` : "—"}</td>
                          <td className="p-2.5 text-right font-mono font-medium">{formatCurrency(taxable)}</td>
                          {order.tax_type === "INTRA_STATE" ? (
                            <>
                              <td className="p-2.5 text-right font-mono">
                                {Number(it.tax_rate) > 0 ? (
                                  <div>
                                    <p>{formatCurrency(it.cgst_amount || 0)}</p>
                                    <p className="text-[10px] text-slate-400">@{Number(it.cgst_rate || Number(it.tax_rate)/2)}%</p>
                                  </div>
                                ) : "—"}
                              </td>
                              <td className="p-2.5 text-right font-mono">
                                {Number(it.tax_rate) > 0 ? (
                                  <div>
                                    <p>{formatCurrency(it.sgst_amount || 0)}</p>
                                    <p className="text-[10px] text-slate-400">@{Number(it.sgst_rate || Number(it.tax_rate)/2)}%</p>
                                  </div>
                                ) : "—"}
                              </td>
                            </>
                          ) : (
                            <td className="p-2.5 text-right font-mono">
                              {Number(it.tax_rate) > 0 ? (
                                <div>
                                  <p>{formatCurrency(it.igst_amount || 0)}</p>
                                  <p className="text-[10px] text-slate-400">@{Number(it.igst_rate || it.tax_rate)}%</p>
                                </div>
                              ) : "—"}
                            </td>
                          )}
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(it.line_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tax & Financial Summary Footer */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
                <div className="text-xs text-slate-500 space-y-2 max-w-sm">
                  <p className="font-semibold text-slate-700">Declaration & Terms:</p>
                  <p>1. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
                  <p>2. Subject to local jurisdiction. Goods once sold will be accepted under warranty terms only.</p>
                </div>

                <div className="w-full sm:w-72 space-y-1.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span>Total Taxable Amount:</span>
                    <span className="font-mono font-semibold">{formatCurrency(Math.max(0, Number(order.subtotal || 0) - Number(order.discount_amount || 0)))}</span>
                  </div>
                  {order.tax_type === "INTRA_STATE" ? (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Total CGST:</span>
                        <span className="font-mono">{formatCurrency(order.cgst_amount ?? (Number(order.tax_amount || 0) / 2))}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Total SGST:</span>
                        <span className="font-mono">{formatCurrency(order.sgst_amount ?? (Number(order.tax_amount || 0) / 2))}</span>
                      </div>
                    </>
                  ) : order.tax_type === "INTER_STATE" ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Total IGST:</span>
                      <span className="font-mono">{formatCurrency(order.igst_amount ?? order.tax_amount)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-slate-500">
                      <span>GST (Exempt):</span>
                      <span className="font-mono">₹0.00</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                    <span>Total Tax Amount:</span>
                    <span className="font-mono">{formatCurrency(order.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-bold text-slate-950">
                    <span>Final Invoice Total:</span>
                    <span className="font-mono text-[#0F766E]">{formatCurrency(order.total_amount)}</span>
                  </div>
                  {Number(order.advance_applied || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold pt-1">
                      <span>Less: Customer Advance Adjusted:</span>
                      <span className="font-mono">-{formatCurrency(order.advance_applied)}</span>
                    </div>
                  )}
                  {Number(order.paid_amount || 0) - Number(order.advance_applied || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 pt-0.5">
                      <span>Less: Other Payments Received:</span>
                      <span className="font-mono">-{formatCurrency(Number(order.paid_amount || 0) - Number(order.advance_applied || 0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-rose-700">
                    <span>Net Amount Payable:</span>
                    <span className="font-mono">{formatCurrency(order.due_amount)}</span>
                  </div>
                  {customerAdvanceBalance !== undefined && (
                    <div className="flex justify-between items-center text-[11px] text-slate-600 bg-white p-2 rounded-lg mt-2 border border-slate-200">
                      <span className="font-medium">Remaining Customer Advance:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency(customerAdvanceBalance)}{" "}
                        <span className="text-[10px] text-slate-500 font-normal block sm:inline">(Account Balance)</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Signatory Box */}
              <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-xs text-slate-500">
                <div>
                  <p>Electronic System Generated Invoice</p>
                  <p className="font-mono text-[10px]">Verification: {order.id}</p>
                </div>
                <div className="text-right">
                  <div className="h-12 border-b border-dashed border-slate-300 w-44 mb-1"></div>
                  <p className="font-semibold text-slate-800">Authorized Signatory</p>
                  <p className="text-[10px] text-slate-400">For {businessDetails?.legal_name || businessDetails?.name || "SANKALP IRRIGATION"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}