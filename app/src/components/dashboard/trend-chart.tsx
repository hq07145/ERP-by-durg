"use client";

import type { SalesTrendPoint, PaymentTrendPoint, ExpenseTrendPoint } from "@/types/dashboard";

interface TrendChartProps {
  salesTrend: SalesTrendPoint[];
  paymentTrend: PaymentTrendPoint[];
  expenseTrend: ExpenseTrendPoint[];
}

const formatCurrency = (value: string | number) => {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

// Simple SVG-based line chart
function LineChart({
  data,
  getValue,
  color,
  fillColor,
  maxValue,
  height = 200,
  width = "100%",
}: {
  data: Array<{ date: string; value: number }>;
  getValue: (d: { date: string; value: number }) => number;
  color: string;
  fillColor: string;
  maxValue: number;
  height?: number;
  width?: string | number;
}) {
  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-gray-400">
        No data available
      </div>
    );
  }

  const effectiveMax = Math.max(maxValue, 1);

  const points = data.map((d, i) => {
    const x = data.length <= 1 ? 50 : (i / (data.length - 1)) * 100;
    const y = 100 - (getValue(d) / effectiveMax) * 90; // 90% height for data, 10% padding
    return { x, y };
  });

  const pathPoints =
    data.length === 1
      ? `0% ${points[0].y}% 100% ${points[0].y}%`
      : points.map((p) => `${p.x}% ${p.y}%`).join(" ");

  const areaPoints =
    data.length === 1
      ? `0% 100% 0% ${points[0].y}% 100% ${points[0].y}% 100% 100%`
      : [
          `${points[0].x}% 100%`,
          ...points.map((p) => `${p.x}% ${p.y}%`),
          `${points[points.length - 1].x}% 100%`,
        ].join(" ");

  // Generate y-axis labels
  const yLabels = [0, effectiveMax * 0.25, effectiveMax * 0.5, effectiveMax * 0.75, effectiveMax].map((v) => ({
    value: v,
    y: 100 - (v / effectiveMax) * 90,
  }));

  // Limit number of x-axis labels on small datasets or evenly spaced
  const maxLabels = data.length > 7 ? 6 : data.length;
  const labelInterval = Math.max(1, Math.floor(data.length / maxLabels));

  return (
    <div className="relative overflow-hidden" style={{ width, height: `${height}px` }}>
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-20 flex flex-col justify-between items-end pr-1 sm:pr-2 pointer-events-none">
        {yLabels.map((label) => (
          <div key={label.value} style={{ top: `${label.y}%`, transform: "translateY(50%)" }} className="text-[9px] sm:text-[10px] text-gray-500 w-full text-right truncate">
            {formatCurrency(label.value)}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <svg className="absolute left-16 sm:left-20 right-0 top-0 bottom-0" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`areaGradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Area */}
        <path
          d={`M${areaPoints}`}
          fill={`url(#areaGradient-${color.replace("#", "")})`}
          stroke="none"
        />
        {/* Line */}
        <path
          d={`M${pathPoints}`}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={`${p.x}%`}
            cy={`${p.y}%`}
            r={data.length > 15 ? "2" : "3"}
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-16 sm:left-20 right-0 flex justify-between pt-2 pointer-events-none">
        {data.map((d, i) => {
          const isVisible = data.length <= 7 || i === 0 || i === data.length - 1 || i % labelInterval === 0;
          if (!isVisible) return null;
          const leftPercent = data.length <= 1 ? 50 : (i / (data.length - 1)) * 100;
          return (
            <div
              key={d.date}
              style={{ left: `${leftPercent}%` }}
              className="text-[9px] sm:text-[10px] text-gray-400 transform -translate-x-1/2 absolute whitespace-nowrap"
            >
              {formatDate(d.date)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendCard({
  title,
  icon,
  color,
  fillColor,
  data,
  getValue,
  maxValue,
  currentValue,
  unit = "₹",
}: {
  title: string;
  icon: string;
  color: string;
  fillColor: string;
  data: Array<{ date: string; value: number }>;
  getValue: (d: { date: string; value: number }) => number;
  maxValue: number;
  currentValue: string | number;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="text-right">
          <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{unit}{formatCurrency(currentValue)}</p>
          <p className="text-[11px] text-gray-500">Period Total</p>
        </div>
      </div>
      <LineChart
        data={data}
        getValue={getValue}
        color={color}
        fillColor={fillColor}
        maxValue={maxValue}
        height={180}
      />
    </div>
  );
}

export function TrendCharts({ salesTrend, paymentTrend, expenseTrend }: TrendChartProps) {
  // Prepare sales trend data
  const salesData = salesTrend.map((d) => ({
    date: d.date,
    value: Number(d.net_sales),
  }));
  const maxSales = Math.max(...salesData.map((d) => d.value), 1);
  const totalSales = salesData.reduce((sum, d) => sum + d.value, 0);

  // Prepare payment trend data
  const paymentData = paymentTrend.map((d) => ({
    date: d.date,
    value: Number(d.received),
  }));
  const maxPayments = Math.max(...paymentData.map((d) => d.value), 1);
  const totalPayments = paymentData.reduce((sum, d) => sum + d.value, 0);

  // Prepare expense trend data
  const expenseData = expenseTrend.map((d) => ({
    date: d.date,
    value: Number(d.amount),
  }));
  const maxExpenses = Math.max(...expenseData.map((d) => d.value), 1);
  const totalExpenses = expenseData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <TrendCard
        title="Sales Trend"
        icon="📈"
        color="#22c55e"
        fillColor="#22c55e"
        data={salesData}
        getValue={(d) => d.value}
        maxValue={maxSales}
        currentValue={totalSales}
      />
      <TrendCard
        title="Payments Received"
        icon="💳"
        color="#3b82f6"
        fillColor="#3b82f6"
        data={paymentData}
        getValue={(d) => d.value}
        maxValue={maxPayments}
        currentValue={totalPayments}
      />
      <TrendCard
        title="Expenses"
        icon="💸"
        color="#ef4444"
        fillColor="#ef4444"
        data={expenseData}
        getValue={(d) => d.value}
        maxValue={maxExpenses}
        currentValue={totalExpenses}
      />
    </div>
  );
}