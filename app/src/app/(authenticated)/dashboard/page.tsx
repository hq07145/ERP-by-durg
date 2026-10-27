import { requireAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard/actions";
import { DashboardSummaryCards } from "@/components/dashboard/dashboard-summary";
import { TrendCharts } from "@/components/dashboard/trend-chart";
import { OrderStatusBreakdown, ProductionStatusBreakdown } from "@/components/dashboard/status-breakdown";
import { TopProductsList, TopCustomersList, LowStockItemsList, UpcomingDeliveriesList } from "@/components/dashboard/top-lists";
import { DateFilter } from "@/components/dashboard/date-filter";
import { AlertCircle } from "lucide-react";
import type { DashboardFilters } from "@/types/dashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard - Enterprise ERP",
  description: "Enterprise dashboard with business metrics and analytics",
};

interface PageProps {
  searchParams: Promise<{
    dateRange?: string;
    customStartDate?: string;
    customEndDate?: string;
    error?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const context = await requireAuthContext();

  const params = await searchParams;
  const dateRange = (params.dateRange as DashboardFilters["dateRange"]) || "30d";
  const customStartDate = params.customStartDate;
  const customEndDate = params.customEndDate;

  const filters: DashboardFilters = {
    dateRange,
    customStartDate,
    customEndDate,
  };

  // Check section-level permissions
  const canViewReports = hasPermission({ permissions: context.permissions }, "reports.view");
  const canViewOrders = hasPermission({ permissions: context.permissions }, "orders.view");
  const canViewProduction = hasPermission({ permissions: context.permissions }, "production.view");
  const canViewInventory = hasPermission({ permissions: context.permissions }, "inventory.view");
  const canViewCustomers = hasPermission({ permissions: context.permissions }, "customers.view");
  const canViewDelivery = hasPermission({ permissions: context.permissions }, "delivery.view");

  const canAccessDashboard =
    canViewReports ||
    canViewOrders ||
    canViewProduction ||
    canViewInventory ||
    canViewDelivery ||
    canViewCustomers;

  if (!canAccessDashboard) {
    redirect("/?error=forbidden");
  }

  // Fetch all dashboard data with resilient fallback
  let dashboardData;
  try {
    dashboardData = await getDashboardData(filters, context);
  } catch (err) {
    console.error("Dashboard page failed to fetch dashboardData:", err);
    dashboardData = {
      summary: null,
      salesTrend: [],
      paymentTrend: [],
      expenseTrend: [],
      orderStatusBreakdown: [],
      productionStatusBreakdown: [],
      topProducts: [],
      topCustomers: [],
      lowStockItems: [],
      upcomingDeliveries: [],
    };
  }

  const isAdminOrSuper = context.roleKey === "admin" || context.roleKey === "super_admin";
  const dashboardTitle = isAdminOrSuper ? "Admin Dashboard" : "Operations Dashboard";
  const dashboardSubtitle = canViewReports
    ? "Business performance metrics, production and operational analytics"
    : "Operational metrics and production tracking";

  return (
    <div className="max-w-full mx-auto space-y-6 p-4 sm:p-6 overflow-x-hidden">
      {params.error === "forbidden" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
          <span>Access denied: You do not have permission to access that resource.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)] tracking-wider">Dashboard</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900">{dashboardTitle}</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">{dashboardSubtitle}</p>
        </div>
      </div>

      {/* Date Filter */}
      <DateFilter filters={filters} />

      {/* Summary Cards */}
      <DashboardSummaryCards summary={dashboardData.summary} userPermissions={context.permissions} userRole={context.roleKey} />

      {/* Trend Charts */}
      {isAdminOrSuper && (
        <TrendCharts
          salesTrend={dashboardData.salesTrend}
          paymentTrend={dashboardData.paymentTrend}
          expenseTrend={dashboardData.expenseTrend}
        />
      )}

      {/* Status Breakdowns */}
      {(canViewOrders || canViewProduction) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {canViewOrders && <OrderStatusBreakdown data={dashboardData.orderStatusBreakdown} />}
          {canViewProduction && <ProductionStatusBreakdown data={dashboardData.productionStatusBreakdown} />}
        </div>
      )}

      {/* Top Lists */}
      {(canViewOrders || canViewCustomers) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {canViewOrders && <TopProductsList products={dashboardData.topProducts} />}
          {canViewCustomers && <TopCustomersList customers={dashboardData.topCustomers} />}
        </div>
      )}

      {/* Low Stock & Upcoming Deliveries */}
      {(canViewInventory || canViewDelivery) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {canViewInventory && <LowStockItemsList items={dashboardData.lowStockItems} />}
          {canViewDelivery && <UpcomingDeliveriesList deliveries={dashboardData.upcomingDeliveries} />}
        </div>
      )}
    </div>
  );
}