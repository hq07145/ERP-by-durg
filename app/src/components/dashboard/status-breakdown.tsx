"use client";

import type { OrderStatusBreakdown, ProductionStatusBreakdown } from "@/types/dashboard";

const formatCurrency = (value: string | number) => {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatNumber = (value: string | number) => {
  return Number(value).toLocaleString("en-IN");
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

const PRODUCTION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  SCHEDULED: "bg-blue-100 text-blue-800",
  MATERIAL_READY: "bg-indigo-100 text-indigo-800",
  IN_PRODUCTION: "bg-yellow-100 text-yellow-800",
  QUALITY_CHECK: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  READY_FOR_DISPATCH: "bg-cyan-100 text-cyan-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
  DELAYED: "bg-orange-100 text-orange-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
  MATERIAL_READY: "Material Ready",
  IN_PRODUCTION: "In Production",
  QUALITY_CHECK: "Quality Check",
  COMPLETED: "Completed",
  READY_FOR_DISPATCH: "Ready for Dispatch",
  ON_HOLD: "On Hold",
  DELAYED: "Delayed",
  CANCELLED: "Cancelled",
};

interface StatusBreakdownProps<T> {
  title: string;
  icon: string;
  data: T[];
  getStatus: (item: T) => string;
  getCount: (item: T) => string | number;
  getAmount: (item: T) => string | number;
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  amountLabel: string;
  isCurrency: boolean;
}

function StatusBreakdownCard<T>({
  title,
  icon,
  data,
  getStatus,
  getCount,
  getAmount,
  statusColors,
  statusLabels,
  amountLabel,
  isCurrency,
}: StatusBreakdownProps<T>) {
  const totalCount = data.reduce((sum, item) => sum + Number(getCount(item)), 0);
  const totalAmount = data.reduce((sum, item) => sum + Number(getAmount(item)), 0);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-center py-8 text-gray-500">No data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 tabular-nums">
            {isCurrency ? formatCurrency(totalAmount) : formatNumber(totalCount)}
          </p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          const status = getStatus(item);
          const count = getCount(item);
          const amount = getAmount(item);
          const percentage = totalCount > 0 ? (Number(count) / totalCount) * 100 : 0;

          return (
            <div key={status} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      statusColors[status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {statusLabels[status] || status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="font-medium text-gray-900 tabular-nums">
                    {isCurrency ? formatCurrency(amount) : formatNumber(count)}
                  </span>
                  <span className="text-gray-500 w-16 text-right">{percentage.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-300 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrderStatusBreakdown({ data }: { data: OrderStatusBreakdown[] }) {
  return (
    <StatusBreakdownCard
      title="Order Status"
      icon="📦"
      data={data}
      getStatus={(item) => item.status}
      getCount={(item) => item.count}
      getAmount={(item) => item.total_amount}
      statusColors={ORDER_STATUS_COLORS}
      statusLabels={ORDER_STATUS_LABELS}
      amountLabel="Amount"
      isCurrency={true}
    />
  );
}

export function ProductionStatusBreakdown({ data }: { data: ProductionStatusBreakdown[] }) {
  return (
    <StatusBreakdownCard
      title="Production Status"
      icon="🏭"
      data={data}
      getStatus={(item) => item.status}
      getCount={(item) => item.count}
      getAmount={(item) => item.total_quantity}
      statusColors={PRODUCTION_STATUS_COLORS}
      statusLabels={PRODUCTION_STATUS_LABELS}
      amountLabel="Quantity"
      isCurrency={false}
    />
  );
}