"use client";

import { format } from "date-fns";
import type { CustomerLedgerEntryWithDetails, LedgerEntryType, CustomerSummary } from "@/types/payment";
import {
  LEDGER_ENTRY_TYPE_COLORS,
  LEDGER_ENTRY_TYPE_LABELS,
} from "@/types/payment";

interface CustomerLedgerProps {
  customer: CustomerSummary;
  ledgerEntries: CustomerLedgerEntryWithDetails[];
  canView: boolean;
}

export function CustomerLedger({ customer, ledgerEntries, canView }: CustomerLedgerProps) {
  const totalDebit = ledgerEntries.reduce((sum, entry) => sum + Number(entry.debit), 0);
  const totalCredit = ledgerEntries.reduce((sum, entry) => sum + Number(entry.credit), 0);
  const currentBalance = ledgerEntries.length > 0 ? Number(ledgerEntries[0].balance) : 0;

  return (
    <div className="space-y-6">
      {/* Customer Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Total Purchases</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {Number(customer.total_purchases).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Total Paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {Number(customer.total_paid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Outstanding Due</p>
          <p className={`text-2xl font-bold mt-1 ${Number(customer.total_due) > 0 ? "text-red-700" : "text-gray-900"}`}>
            ₹{Math.max(0, Number(customer.total_due)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Available Advance</p>
          <p className={`text-2xl font-bold mt-1 ${Number(customer.available_advance ?? 0) > 0 ? "text-amber-700" : "text-gray-900"}`}>
            ₹{Math.max(0, Number(customer.available_advance ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {customer.last_payment_date && (
            <p className="text-xs text-gray-500 mt-1">
              Last payment: {format(new Date(customer.last_payment_date), "MMM d, yyyy")}
            </p>
          )}
        </div>
      </div>

      {/* Ledger Running Totals */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-500">Total Debits</p>
            <p className="font-bold text-blue-800">{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-gray-500">Total Credits</p>
            <p className="font-bold text-green-800">{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className={`p-3 rounded-lg ${currentBalance >= 0 ? "bg-red-50" : "bg-green-50"}`}>
            <p className="text-xs text-gray-500">Current Balance</p>
            <p className={`font-bold ${currentBalance >= 0 ? "text-red-800" : "text-green-800"}`}>
              {currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-1">{currentBalance >= 0 ? "Customer owes" : "Advance/credit"}</p>
          </div>
        </div>
      </div>

      {/* Ledger Entries Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Ledger History ({ledgerEntries.length})</h3>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Running balance shown in Balance column</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <div className="text-4xl mb-3">📋</div>
                    <p>No ledger entries found</p>
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry) => {
                  const balance = Number(entry.balance);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {format(new Date(entry.entry_date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${LEDGER_ENTRY_TYPE_COLORS[entry.entry_type]}`}>
                          {LEDGER_ENTRY_TYPE_LABELS[entry.entry_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-blue-800">
                        {Number(entry.debit) > 0 ? Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-green-800">
                        {Number(entry.credit) > 0 ? Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-medium">
                        <span className={balance >= 0 ? "text-red-800" : "text-green-800"}>
                          {Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {entry.order_number ? (
                          <a href={`/orders/${entry.order_id}`} className="hover:text-[var(--accent)] hover:underline">
                            {entry.order_number}
                          </a>
                        ) : entry.payment_number ? (
                          <a href={`/payments/${entry.payment_id}`} className="hover:text-[var(--accent)] hover:underline">
                            {entry.payment_number}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}