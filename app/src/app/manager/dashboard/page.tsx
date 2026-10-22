import Link from "next/link";
import { requireManagerAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { ERP_MODULES } from "@/lib/permissions/modules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ManagerQuickActionsFab,
  type QuickActionItem,
} from "@/components/dashboard/manager-quick-actions-fab";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  User,
  Building,
  Key,
  LayoutDashboard,
  ShoppingCart,
  Factory,
  Warehouse,
  Truck,
  Package,
  Users,
  CreditCard,
  Receipt,
  BarChart3,
  Settings,
  Bell,
  Lock,
  AlertCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manager Dashboard — Manufacturing Workspace",
  description: "Operations dashboard and assigned module overview for managers",
};

// Route mapping for ERP modules
const MODULE_ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  customers: "/customers",
  products: "/products",
  inventory: "/inventory",
  raw_materials: "/raw-materials",
  suppliers: "/suppliers",
  purchases: "/purchases",
  orders: "/orders",
  production: "/production",
  delivery: "/delivery",
  payments: "/payments",
  expenses: "/expenses",
  reports: "/reports",
  settings: "/settings",
  notifications: "/notifications",
  users: "/users",
};

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; notice?: string }>;
}) {
  const context = await requireManagerAuthContext();
  const params = searchParams ? await searchParams : undefined;

  // Evaluate assigned modules
  const moduleStatus = ERP_MODULES.map((mod) => {
    const isProcurement = mod.id === "purchases" || mod.id === "suppliers";
    const hasView = isProcurement
      ? isProcurementAuthorized(context, `${mod.id}.view`)
      : hasPermission({ permissions: context.permissions }, `${mod.id}.view`);

    const grantedItems = isProcurement && !hasView
      ? []
      : mod.items.filter((item) =>
          hasPermission({ permissions: context.permissions }, item.key)
        );
    const href = MODULE_ROUTES[mod.id] || "/";

    return {
      ...mod,
      href,
      isAccessible: hasView,
      grantedItems,
      totalItems: mod.items.length,
    };
  });

  const accessibleModules = moduleStatus.filter((m) => m.isAccessible);
  const restrictedModules = moduleStatus.filter((m) => !m.isAccessible);

  // Compute authorized quick actions based strictly on existing Manager permissions
  const quickActions: QuickActionItem[] = [];

  // 1. Create New Order (highlighted primary commercial action)
  if (hasPermission({ permissions: context.permissions }, "orders.create")) {
    quickActions.push({
      id: "create_order",
      label: "Create New Order",
      description: "Start sales order with stock check",
      href: "/orders?new=true",
      icon: "order_create",
      highlight: true,
    });
  }

  // 2. Add Customer
  const canAddCustomer =
    hasPermission({ permissions: context.permissions }, "customers.create") &&
    hasPermission({ permissions: context.permissions }, "customers.view");
  if (canAddCustomer) {
    quickActions.push({
      id: "add_customer",
      label: "Add Customer",
      description: "Register new customer profile",
      href: "/customers/new",
      icon: "customer_add",
    });
  }

  // 3. Add Ready Stock / Stock Adjustment (only if explicitly permitted)
  const canAddStock = hasPermission({ permissions: context.permissions }, "inventory.add_stock");
  const canAdjustStock = hasPermission({ permissions: context.permissions }, "inventory.adjust");
  const canViewInventory = hasPermission({ permissions: context.permissions }, "inventory.view");
  if ((canAddStock || canAdjustStock) && canViewInventory) {
    quickActions.push({
      id: "stock_adjustment",
      label: "Add Ready Stock / Adjustment",
      description: "Update finished goods stock levels",
      href: "/inventory?tab=ready-stock",
      icon: "stock_adjust",
    });
  }

  // 4. Record Payment (only if explicitly permitted)
  const canRecordPayment =
    hasPermission({ permissions: context.permissions }, "payments.add") ||
    hasPermission({ permissions: context.permissions }, "payments.create");
  if (canRecordPayment) {
    quickActions.push({
      id: "record_payment",
      label: "Record Payment",
      description: "Record customer receipt against invoices",
      href: "/payments/new",
      icon: "payment_record",
    });
  }

  // 5. Open Production (if permitted)
  if (hasPermission({ permissions: context.permissions }, "production.view")) {
    quickActions.push({
      id: "open_production",
      label: "Open Production",
      description: "Monitor manufacturing schedule and batches",
      href: "/production",
      icon: "production_open",
    });
  }

  // 6. View Orders
  if (hasPermission({ permissions: context.permissions }, "orders.view")) {
    quickActions.push({
      id: "view_orders",
      label: "View Orders",
      description: "Track sales orders, priorities & fulfillment",
      href: "/orders",
      icon: "orders_view",
    });
  }

  const canCreateOrder = hasPermission({ permissions: context.permissions }, "orders.create");
  let orderFormData: {
    customers: { id: string; name: string; company_name: string | null; gst_number?: string | null; state?: string | null }[];
    products: any[];
    workingDays?: Record<string, boolean>;
    calendarOverrides?: Record<string, boolean>;
    businessDetails?: any;
  } | undefined = undefined;

  if (canCreateOrder) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const [
        customersRes,
        productsRes,
        inventoryRowsRes,
        wdSettingRes,
        calRowsRes,
        businessDetailsRes,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, company_name, gst_number, customer_addresses(district, state, address_type)")
          .eq("business_id", context.user.business_id)
          .eq("status", "ACTIVE")
          .order("name"),
        supabase
          .from("products")
          .select("id, name, sku, unit, selling_price, tax_rate, daily_capacity, production_min_days, setup_minutes, delivery_min_days, delivery_max_days")
          .eq("business_id", context.user.business_id)
          .eq("active", true)
          .order("name"),
        supabase
          .from("inventory")
          .select("item_id, available_stock")
          .eq("business_id", context.user.business_id)
          .eq("item_type", "finished_good"),
        supabase
          .from("business_settings")
          .select("value")
          .eq("business_id", context.user.business_id)
          .eq("key", "working_days")
          .maybeSingle(),
        supabase
          .from("business_calendar")
          .select("calendar_date, is_working_day")
          .eq("business_id", context.user.business_id),
        supabase
          .from("business_settings")
          .select("value")
          .eq("business_id", context.user.business_id)
          .eq("key", "business_details")
          .maybeSingle(),
      ]);

      const stockMap = new Map<string, number>();
      (inventoryRowsRes.data ?? []).forEach((row: any) => {
        stockMap.set(row.item_id, Number(row.available_stock) || 0);
      });

      const productsWithStock = (productsRes.data ?? []).map((p: any) => ({
        ...p,
        available_stock: stockMap.get(p.id) ?? 0,
      }));

      const calMap: Record<string, boolean> = {};
      (calRowsRes.data ?? []).forEach((r: any) => {
        calMap[r.calendar_date] = Boolean(r.is_working_day);
      });

      orderFormData = {
        customers: (customersRes.data ?? []).map((c: any) => {
          const addrs = c.customer_addresses || [];
          const primary = addrs.find((a: any) => a.address_type === "PRIMARY") || addrs[0];
          return {
            id: c.id,
            name: c.name,
            company_name: c.company_name,
            gst_number: c.gst_number || null,
            state: primary?.state || null,
            district: primary?.district || null,
          };
        }),
        products: productsWithStock,
        workingDays: wdSettingRes.data?.value as any,
        calendarOverrides: calMap,
        businessDetails: businessDetailsRes.data?.value as any,
      };
    }
  }

  return (
    <div className="space-y-8">
      {/* Access Denied Alert if redirected */}
      {params?.error === "forbidden" && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <span>Access denied: The Suppliers and Purchases modules are restricted for Manager accounts.</span>
        </div>
      )}

      {/* Order Created Success Banner */}
      {params?.notice === "order_created" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 shadow-xs"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>Order created successfully and queued for manufacturing & delivery scheduling.</span>
        </div>
      )}

      {/* 1. Header Banner */}
      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2">
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  Manager Portal
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  Account: Active
                </span>
              </div>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
                Welcome, {context.user.name}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[var(--muted)]">
                Manager Workspace &bull; {context.user.email} &bull; Multi-Tenant Isolated
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--muted)]">
              Authorized Modules: <strong className="text-[var(--foreground)]">{accessibleModules.length}</strong> of {ERP_MODULES.length}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Accessible Modules Overview */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Assigned Operational Modules
          </h2>
          <p className="text-xs text-[var(--muted)]">
            These modules have been configured for your account by the Business Administrator.
          </p>
        </div>

        {accessibleModules.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
            <p className="font-semibold">No Operational Modules Currently Assigned</p>
            <p className="mt-1 text-xs text-amber-700">
              Your account is active, but no granular module permissions have been enabled yet.
              Please ask your Administrator to configure your access in User Management.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accessibleModules.map((mod) => (
              <div
                key={mod.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--line)] bg-white p-5 shadow-2xs transition hover:border-[var(--accent)] hover:shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--foreground)] text-sm">
                      {mod.name}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                      Authorized
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                    {mod.description}
                  </p>

                  {/* Actions Granted */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {mod.grantedItems.map((item) => (
                      <span
                        key={item.key}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200"
                        title={item.description}
                      >
                        {item.category}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted)]">
                    {mod.grantedItems.length} active permission{mod.grantedItems.length === 1 ? "" : "s"}
                  </span>
                  <Link
                    href={mod.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    <span>Open Module</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Restricted Modules Notice */}
      {restrictedModules.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Restricted Modules ({restrictedModules.length})
            </h2>
            <span className="text-[11px] text-[var(--muted)]">
              Direct access blocked on server
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {restrictedModules.map((mod) => (
              <div
                key={mod.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-500"
              >
                <span className="font-medium">{mod.name}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Modern Floating Quick Actions Button (FAB) & Upward Menu */}
      <ManagerQuickActionsFab actions={quickActions} orderFormData={orderFormData} />
    </div>
  );
}
