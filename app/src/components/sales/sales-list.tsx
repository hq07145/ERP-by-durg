"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SalesSummary, OrderListItem } from "@/types/expense";
import type { Customer } from "@/types/customer";

interface SalesListProps {
  summary: SalesSummary | null;
  orders: OrderListItem[];
  customers: Customer[];
  canView: boolean;
  startDate?: string;
  endDate?: string;
  customerId?: string;
  status?: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  onDateChange?: (startDate: string | undefined, endDate: string | undefined) => void;
  onCustomerChange?: (customerId: string | undefined) => void;
  onStatusChange?: (status: string | undefined) => void;
}

export function SalesList({
  summary,
  orders,
  customers,
  canView,
  startDate,
  endDate,
  customerId,
  status,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onDateChange,
  onCustomerChange,
  onStatusChange,
}: SalesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusMessage, setStatusMessage] = useState<{ success: boolean; message: string } | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const updateParam = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    router.push(`/sales?${params.toString()}`);
  };

  const handlePage = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
    } else {
      updateParam((p) => p.set("page", String(page)));
    }
  };

  const handleDate = (start?: string, end?: string) => {
    if (onDateChange) {
      onDateChange(start, end);
    } else {
      updateParam((p) => {
        if (start) p.set("startDate", start);
        else p.delete("startDate");
        if (end) p.set("endDate", end);
        else p.delete("endDate");
        p.set("page", "1");
      });
    }
  };

  const handleCustomer = (cId?: string) => {
    if (onCustomerChange) {
      onCustomerChange(cId);
    } else {
      updateParam((p) => {
        if (cId) p.set("customerId", cId);
        else p.delete("customerId");
        p.set("page", "1");
      });
    }
  };

  const handleStatus = (st?: string) => {
    if (onStatusChange) {
      onStatusChange(st);
    } else {
      updateParam((p) => {
        if (st) p.set("status", st);
        else p.delete("status");
        p.set("page", "1");
      });
    }
  };

  const handleResetFilters = () => {
    router.push("/sales");
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case "DRAFT": return "bg-gray-100 text-gray-800 border-gray-200";
      case "CONFIRMED": return "bg-green-100 text-green-800 border-green-200";
      case "CANCELLED": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const hasActiveFilters = Boolean(startDate || endDate || customerId || status);

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {statusMessage && (
        <div className={`rounded-lg p-4 ${statusMessage.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {statusMessage.message}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Gross Sales</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary.gross_sales)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Sum of order subtotals</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Discounts</p>
            <p className="text-2xl font-bold text-red-600 mt-1">-{formatCurrency(summary.discounts)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Total deductions</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Tax</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">+{formatCurrency(summary.tax)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Total taxes</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Net Sales (Revenue)</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(summary.net_sales)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Accrual recognized sales</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Payments Received</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(summary.payments_received)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Cash collected</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Outstanding Dues</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{formatCurrency(summary.outstanding)}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Accounts receivable</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
            <div className="flex items-center gap-2">
              <label htmlFor="salesStartDate" className="text-xs font-medium text-gray-600">From:</label>
              <input
                id="salesStartDate"
                type="date"
                value={startDate ?? ""}
                onChange={(e) => handleDate(e.target.value || undefined, endDate)}
                className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="salesEndDate" className="text-xs font-medium text-gray-600">To:</label>
              <input
                id="salesEndDate"
                type="date"
                value={endDate ?? ""}
                onChange={(e) => handleDate(startDate, e.target.value || undefined)}
                className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <select
              aria-label="Filter by customer"
              value={customerId ?? ""}
              onChange={(e) => handleCustomer(e.target.value || undefined)}
              className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              aria-label="Filter by Order Status"
              value={status ?? ""}
              onChange={(e) => handleStatus(e.target.value || undefined)}
              className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">All (Confirmed Revenue)</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="DRAFT">Draft Quotes</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-gray-600 hover:text-gray-900 underline whitespace-nowrap self-start sm:self-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tax</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">
                    No sales orders found matching selected filters.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {order.order_date ? order.order_date : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {order.order_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {order.customer_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                      {formatCurrency(order.gross_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-600 whitespace-nowrap">
                      {Number(order.discount_amount) > 0 ? `-${formatCurrency(order.discount_amount)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                      {formatCurrency(order.tax_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(order.net_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-blue-700 whitespace-nowrap">
                      {formatCurrency(order.paid_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-orange-700 whitespace-nowrap">
                      {formatCurrency(order.outstanding_amount)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded border ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-[var(--accent)] hover:underline font-medium text-xs"
                      >
                        View Order
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => handlePage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                  <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> of{" "}
                  <span className="font-medium">{totalCount}</span> results
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="flex items-center px-3 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}