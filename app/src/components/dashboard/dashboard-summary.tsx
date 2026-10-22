"use client";

import type { DashboardSummary } from "@/types/dashboard";

interface DashboardSummaryProps {
  summary: DashboardSummary | null;
}

const formatCurrency = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-IN");
};

const summaryCards = [
  {
    key: "total_sales",
    label: "Net Sales (Revenue)",
    subtext: "Accrual sales from confirmed orders",
    icon: "💰",
    color: "bg-green-500",
    positive: true,
  },
  {
    key: "payments_received",
    label: "Payments Received",
    subtext: "Cash collection (not sales revenue)",
    icon: "💳",
    color: "bg-blue-500",
    positive: true,
  },
  {
    key: "outstanding_due",
    label: "Outstanding / Due",
    subtext: "Accounts receivable from customers",
    icon: "⏳",
    color: "bg-amber-500",
    positive: false,
  },
  {
    key: "total_expenses",
    label: "Operating Expenses",
    subtext: "Posted business expenses",
    icon: "💸",
    color: "bg-red-500",
    positive: false,
  },
  {
    key: "profit",
    label: "Estimated Profit",
    subtext: "Estimate (Net Sales − OpEx; excludes COGS)",
    icon: "📈",
    color: "bg-emerald-500",
    positive: true,
  },
  {
    key: "total_orders",
    label: "Total Orders",
    icon: "📦",
    color: "bg-indigo-500",
    positive: true,
  },
  {
    key: "pending_orders",
    label: "Pending Orders",
    icon: "⏰",
    color: "bg-orange-500",
    positive: false,
  },
  {
    key: "in_production",
    label: "In Production",
    icon: "🏭",
    color: "bg-purple-500",
    positive: true,
  },
  {
    key: "ready_for_dispatch",
    label: "Ready for Dispatch",
    icon: "🚚",
    color: "bg-cyan-500",
    positive: true,
  },
  {
    key: "delivered",
    label: "Delivered",
    icon: "✅",
    color: "bg-teal-500",
    positive: true,
  },
  {
    key: "low_stock_items",
    label: "Low Stock Items",
    icon: "⚠️",
    color: "bg-red-600",
    positive: false,
  },
  {
    key: "overdue_deliveries",
    label: "Overdue Deliveries",
    icon: "🚨",
    color: "bg-rose-600",
    positive: false,
  },
] as const;

interface DashboardSummaryProps {
  summary: DashboardSummary | null;
  userPermissions?: string[];
  userRole?: string | null;
}

const cardPermissionMap: Record<string, string> = {
  total_sales: "reports.view",
  payments_received: "reports.view",
  outstanding_due: "reports.view",
  total_expenses: "reports.view",
  profit: "reports.view",
  total_orders: "orders.view",
  pending_orders: "orders.view",
  in_production: "production.view",
  ready_for_dispatch: "production.view",
  delivered: "production.view",
  low_stock_items: "inventory.view",
  overdue_deliveries: "delivery.view",
};

export function DashboardSummaryCards({ summary, userPermissions, userRole }: DashboardSummaryProps) {
  const isAdminOrSuper = userRole === "admin" || userRole === "super_admin";
  const financialKeys = new Set(["total_sales", "payments_received", "outstanding_due", "total_expenses", "profit"]);

  const visibleCards = summaryCards.filter((card) => {
    if (financialKeys.has(card.key)) {
      return isAdminOrSuper;
    }
    if (!userPermissions) return true;
    const required = cardPermissionMap[card.key];
    return !required || userPermissions.includes(required);
  });

  if (!summary) {
    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleCards.map((card) => (
          <div key={card.key} className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-4 w-3/4 bg-gray-200 rounded"></div>
              <div className={`h-8 w-8 rounded-lg ${card.color}`}></div>
            </div>
            <div className="mt-4 h-8 w-1/2 bg-gray-200 rounded"></div>
            <div className="mt-2 h-4 w-1/3 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visibleCards.map((card) => {
        const value = summary[card.key as keyof DashboardSummary];
        const isCurrency = ["total_sales", "payments_received", "outstanding_due", "total_expenses", "profit"].includes(card.key);
        const formattedValue = isCurrency ? formatCurrency(value) : formatNumber(value);

        // For profit, determine color based on positive/negative
        let valueColor = "text-gray-900";
        if (card.key === "profit") {
          valueColor = Number(value) >= 0 ? "text-emerald-600" : "text-red-600";
        } else if (!card.positive) {
          valueColor = "text-amber-600";
        }

        const subtext = "subtext" in card ? (card as any).subtext : null;

        return (
          <div key={card.key} className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500 tracking-wide">{card.label}</p>
                <p className={`mt-2 text-xl sm:text-2xl font-bold tabular-nums ${valueColor}`}>{formattedValue}</p>
                {subtext && (
                  <p className="mt-1 text-[11px] text-gray-500 font-normal leading-tight">{subtext}</p>
                )}
              </div>
              <div className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center text-white shrink-0 ml-3 ${card.color}`}>
                <span className="text-lg sm:text-xl">{card.icon}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}