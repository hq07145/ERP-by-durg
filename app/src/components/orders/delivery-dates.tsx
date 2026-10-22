"use client";

import { format } from "date-fns";
import type { DeliveryStatus } from "@/types/order";

const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  ON_TIME: "bg-blue-100 text-blue-800",
  OVERDUE: "bg-red-100 text-red-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Pending Calculation",
  ON_TIME: "On Time",
  OVERDUE: "Overdue",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

interface DeliveryDatesProps {
  orderId: string;
  orderStatus?: "DRAFT" | "CONFIRMED" | "CANCELLED";
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  expectedDeliveryDate: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryCalculatedAt: string | null;
  deliveryCalculationVersion: number;
  productionCompletionDate?: string | null;
  isOverdue?: boolean;
  explanation?: string | null;
  fulfillmentSource?: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_INSUFFICIENT" | "MATERIALS_INSUFFICIENT" | "CAPACITY_MISSING";
  hasCapacityIssue?: boolean;
  hasMaterialIssue?: boolean;
  hasMissingCapacity?: boolean;
  itemsSummary?: Array<{
    productName: string;
    orderedQty: number;
    stockQty: number;
    prodQty: number;
    status: string;
    notes?: string;
  }>;
}

export function DeliveryDates({
  orderId,
  orderStatus = "DRAFT",
  earliestDeliveryDate,
  latestDeliveryDate,
  expectedDeliveryDate,
  deliveryStatus,
  deliveryCalculatedAt,
  deliveryCalculationVersion,
  productionCompletionDate,
  isOverdue,
  explanation,
  fulfillmentSource,
  hasCapacityIssue,
  hasMaterialIssue,
  hasMissingCapacity,
  itemsSummary,
}: DeliveryDatesProps) {
  const formatDate = (dateStr: string | null) => (dateStr ? format(new Date(dateStr), "MMM d, yyyy") : "—");
  const formatDateTime = (dateStr: string | null) => (dateStr ? format(new Date(dateStr), "MMM d, yyyy HH:mm") : "—");
  const isOverdueStatus = deliveryStatus === "OVERDUE";

  const isPredicted = orderStatus === "DRAFT" || deliveryStatus === "PENDING";
  const isProvisional = Boolean(hasMissingCapacity || explanation?.includes("PROVISIONAL_ESTIMATE"));

  const renderWarningAlerts = () => (
    <div className="space-y-3 mb-4">
      {/* Distinction between Predicted and Committed */}
      {isPredicted && expectedDeliveryDate && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-3.5 text-xs text-teal-900 flex items-start gap-3">
          <span className="text-teal-600 font-bold text-sm mt-0.5">ℹ</span>
          <div>
            <p className="font-semibold text-teal-900">
              {isProvisional ? "Provisional Delivery Estimate" : "Predicted Delivery Date (Pre-Confirmation)"}
            </p>
            <p className="text-teal-800 mt-0.5 leading-relaxed">
              {isProvisional
                ? "Daily capacity for one or more items is unconfigured; a baseline duration is used instead of a guaranteed date."
                : "This date is an engineering estimate based on product daily capacity, usable stock, working calendar, and existing queue. Production capacity has NOT been reserved and will be scheduled upon order confirmation."}
            </p>
          </div>
        </div>
      )}

      {orderStatus === "CONFIRMED" && !isPredicted && expectedDeliveryDate && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-900 flex items-start gap-3">
          <span className="text-sky-600 font-bold text-sm mt-0.5">✓</span>
          <div>
            <p className="font-semibold text-sky-900">Committed Production & Delivery Schedule</p>
            <p className="text-sky-800 mt-0.5 leading-relaxed">
              Order is confirmed. Production capacity and finished-goods stock have been secured on the shop floor.
            </p>
          </div>
        </div>
      )}

      {hasCapacityIssue && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 flex items-start gap-3">
          <span className="text-red-500 font-bold text-base mt-0.5">⚠</span>
          <div>
            <p className="font-semibold text-red-800">Production Capacity Notice (No-Split Rule)</p>
            <p className="text-xs text-red-700 mt-1">
              One or more order lines require multi-day production batches. The predicted delivery date accounts for consecutive production days; individual shop-floor slots will be confirmed by production dispatch.
            </p>
          </div>
        </div>
      )}

      {hasMissingCapacity && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
          <span className="text-amber-500 font-bold text-base mt-0.5">⚠</span>
          <div>
            <p className="font-semibold text-amber-800">Production Capacity Not Configured (Provisional)</p>
            <p className="text-xs text-amber-700 mt-1">
              One or more products have a daily capacity of 0. Configure daily capacity in product settings to generate a fully calibrated delivery date.
            </p>
          </div>
        </div>
      )}

      {hasMaterialIssue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3">
          <span className="text-amber-500 font-bold text-base mt-0.5">⚠</span>
          <div>
            <p className="font-semibold text-amber-800">Insufficient Raw Materials (BOM Check)</p>
            <p className="text-xs text-amber-700 mt-1">
              Required raw materials are currently out of stock. Production and delivery cannot proceed until raw materials are restocked.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (!earliestDeliveryDate && !latestDeliveryDate && !expectedDeliveryDate) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100">
              <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900">Delivery Schedule & Dates</h2>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Pending Calculation
          </span>
        </div>

        {renderWarningAlerts()}

        <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <div className="text-4xl mb-2">📦</div>
          <p className="text-gray-700 font-medium text-sm">Delivery dates pending calculation</p>
          <p className="text-xs text-gray-500 mt-1">
            {hasCapacityIssue
              ? "Cannot finalize delivery date due to capacity restrictions."
              : hasMaterialIssue
              ? "Cannot finalize delivery date due to raw material shortage."
              : hasMissingCapacity
              ? "Cannot calculate delivery date because product daily capacity is unconfigured."
              : "Dates will be scheduled once order line items are evaluated."}
          </p>
        </div>

        {explanation && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Scheduling Note: </span>
            {explanation}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100">
            <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">Delivery Dates</h2>
            <p className="text-xs text-slate-500">
              {isPredicted ? "Predicted estimate • Capacity not reserved" : "Committed shop-floor schedule"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProvisional ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              Provisional Estimate
            </span>
          ) : isPredicted ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
              Predicted Delivery Date
            </span>
          ) : (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[deliveryStatus]}`}>
              {DELIVERY_STATUS_LABELS[deliveryStatus]}
              {isOverdue && <span className="ml-1.5 animate-pulse">⚠</span>}
            </span>
          )}
          {deliveryCalculationVersion > 1 && (
            <span className="text-[11px] text-gray-500 px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
              v{deliveryCalculationVersion}
            </span>
          )}
        </div>
      </div>

      {renderWarningAlerts()}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {earliestDeliveryDate && (
          <div className="rounded-lg bg-gray-50 p-4 border border-slate-100">
            <dt className="text-xs text-gray-500 font-medium mb-1">Earliest Arrival</dt>
            <dd className="text-base font-bold text-gray-900">{formatDate(earliestDeliveryDate)}</dd>
            <dd className="text-[11px] text-gray-500 mt-1">Minimum transit days</dd>
          </div>
        )}

        {expectedDeliveryDate && (
          <div className={`rounded-lg p-4 ${isOverdueStatus ? "bg-red-50 border border-red-200" : isPredicted ? "bg-teal-50/60 border border-teal-200" : "bg-blue-50 border border-blue-200"}`}>
            <dt className="text-xs text-gray-600 font-semibold mb-1">
              {isOverdueStatus
                ? "Expected (OVERDUE)"
                : isProvisional
                ? "Provisional Estimate"
                : isPredicted
                ? "Predicted Delivery Date"
                : "Committed Delivery Date"}
            </dt>
            <dd className={`text-lg font-bold ${isOverdueStatus ? "text-red-700" : isPredicted ? "text-teal-900" : "text-blue-700"}`}>
              {formatDate(expectedDeliveryDate)}
            </dd>
            <dd className={`text-[11px] mt-1 font-medium ${isOverdueStatus ? "text-red-600" : isPredicted ? "text-teal-700" : "text-blue-600"}`}>
              {isOverdueStatus
                ? "Past target arrival"
                : isPredicted
                ? "Predicted (not reserved)"
                : "Committed delivery target"}
            </dd>
          </div>
        )}

        {latestDeliveryDate && (
          <div className="rounded-lg bg-gray-50 p-4 border border-slate-100">
            <dt className="text-xs text-gray-500 font-medium mb-1">Latest Arrival</dt>
            <dd className="text-base font-bold text-gray-900">{formatDate(latestDeliveryDate)}</dd>
            <dd className="text-[11px] text-gray-500 mt-1">Maximum transit days</dd>
          </div>
        )}
      </div>

      {/* Fulfillment Source & Explanation Section */}
      {(explanation || fulfillmentSource) && (
        <div className="mt-5 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Fulfillment & Stock Breakdown</span>
            {fulfillmentSource === "STOCK" && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                100% In-Stock Fulfillment
              </span>
            )}
            {fulfillmentSource === "PARTIAL" && (
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                Partial Stock + Manufacturing
              </span>
            )}
            {fulfillmentSource === "PRODUCTION" && (
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                FIFO Production Queue
              </span>
            )}
          </div>
          {explanation && (
            <p className="text-xs text-slate-600 leading-relaxed">
              {explanation}
            </p>
          )}

          {itemsSummary && itemsSummary.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
              {itemsSummary.map((item, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between text-xs text-slate-700 py-1 border-b border-slate-100 last:border-b-0">
                  <span className="font-medium text-slate-900">{item.productName} ({item.orderedQty} units)</span>
                  <div className="flex items-center gap-2 text-[11px]">
                    {item.stockQty > 0 && (
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {item.stockQty} from stock
                      </span>
                    )}
                    {item.prodQty > 0 && (
                      <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {item.prodQty} to produce
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(productionCompletionDate || deliveryCalculatedAt) && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Timeline</h3>
          <div className="space-y-2 text-sm">
            {productionCompletionDate && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Production Completion</span>
                <span className="font-medium text-gray-900">{formatDate(productionCompletionDate)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Calculated At</span>
              <span className="font-medium text-gray-900">{formatDateTime(deliveryCalculatedAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Calculation Version</span>
              <span className="font-medium text-gray-900">{deliveryCalculationVersion}</span>
            </div>
          </div>
        </div>
      )}

      {isOverdue && (
        <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">This order is overdue</p>
              <p className="text-sm text-red-600 mt-1">Expected delivery was {formatDate(expectedDeliveryDate)}. Consider contacting the customer.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}