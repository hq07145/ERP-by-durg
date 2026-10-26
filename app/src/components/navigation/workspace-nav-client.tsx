"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  ShoppingCart,
  TrendingUp,
  Package,
  FolderTree,
  Warehouse,
  Layers,
  Truck,
  ShoppingBag,
  Factory,
  Send,
  CreditCard,
  Receipt,
  PieChart,
  BarChart3,
  UserCog,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileSpreadsheet,
  Database,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { signOutAction } from "@/lib/auth/actions";
import type { AppRole, AppUser } from "@/types/business";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  visible: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface WorkspaceNavClientProps {
  user: AppUser;
  role: AppRole | null;
  businessName: string;
  permissions: {
    canManageUsers: boolean;
    canViewProducts: boolean;
    canViewCustomers: boolean;
    canViewRawMaterials: boolean;
    canViewInventory: boolean;
    canViewSuppliers: boolean;
    canViewPurchases: boolean;
    canViewOrders: boolean;
    canViewSales: boolean;
    canViewProfit: boolean;
    canViewProduction: boolean;
    canViewDeliveries: boolean;
    canViewPayments: boolean;
    canViewExpenses: boolean;
    canViewDashboard: boolean;
    canViewReports: boolean;
    canViewSettings: boolean;
    canViewCalendar: boolean;
    canViewNotifications: boolean;
    canBackupReset?: boolean;
  };
  children: React.ReactNode;
}

export function WorkspaceNavClient({
  user,
  role,
  businessName,
  permissions,
  children,
}: WorkspaceNavClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Auto-clear navigation progress bar after safety timeout so it never hangs
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => setIsNavigating(false), 3500);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  // Tablet responsive default: collapse on tablet screens (768px - 1023px), expanded on desktop (>=1024px)
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth >= 768 && window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        setSidebarCollapsed(false);
      }
    }
  }, []);

  // Close mobile drawer on route change & track route history & reset navigation progress
  useEffect(() => {
    setMobileDrawerOpen(false);
    setIsNavigating(false);
    if (typeof window !== "undefined") {
      const current = window.location.pathname + window.location.search;
      const prev = sessionStorage.getItem("current_route");
      if (prev && prev !== current) {
        sessionStorage.setItem("prev_route", prev);
      }
      sessionStorage.setItem("current_route", current);
      if (window.location.pathname === "/orders") {
        sessionStorage.setItem("last_orders_list_url", current);
      }
    }
  }, [pathname, searchParams]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDrawerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileDrawerOpen]);

  const isManager = Boolean(role?.name?.toLowerCase().includes("manager"));
  const isAdminOrSuper = Boolean(
    role?.name?.toLowerCase().includes("admin") ||
    role?.name?.toLowerCase().includes("super")
  );
  const isSuperAdmin = Boolean(
    permissions.canBackupReset ||
    role?.name?.toLowerCase().includes("super")
  );

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "Overview",
        items: [
          {
            name: "Dashboard",
            href: isManager ? "/manager/dashboard" : "/dashboard",
            icon: LayoutDashboard,
            visible: permissions.canViewDashboard,
          },
          {
            name: "Business Profile",
            href: "/",
            icon: Building2,
            visible: true,
          },
        ],
      },
      {
        label: "Commercial",
        items: [
          {
            name: "Customers",
            href: "/customers",
            icon: Users,
            visible: permissions.canViewCustomers,
          },
          {
            name: "Orders",
            href: "/orders",
            icon: ShoppingCart,
            visible: permissions.canViewOrders,
          },
          {
            name: "Sales",
            href: "/sales",
            icon: TrendingUp,
            visible: permissions.canViewSales,
          },
        ],
      },
      {
        label: "Inventory & Sourcing",
        items: [
          {
            name: "Products",
            href: "/products",
            icon: Package,
            visible: permissions.canViewProducts,
          },
          {
            name: "Categories",
            href: "/categories",
            icon: FolderTree,
            visible: permissions.canViewProducts,
          },
          {
            name: "Inventory",
            href: "/inventory",
            icon: Warehouse,
            visible: permissions.canViewInventory,
          },
          {
            name: "Raw Materials",
            href: "/raw-materials",
            icon: Layers,
            visible: permissions.canViewRawMaterials,
          },
          ...(!isManager
            ? [
                {
                  name: "Suppliers",
                  href: "/suppliers",
                  icon: Truck,
                  visible: permissions.canViewSuppliers,
                },
                {
                  name: "Purchases",
                  href: "/purchases",
                  icon: ShoppingBag,
                  visible: permissions.canViewPurchases,
                },
              ]
            : []),
        ],
      },
      {
        label: "Operations",
        items: [
          {
            name: "Production",
            href: "/production",
            icon: Factory,
            visible: permissions.canViewProduction,
          },
          {
            name: "Deliveries",
            href: "/delivery",
            icon: Send,
            visible: permissions.canViewDeliveries,
          },
        ],
      },
      {
        label: "Financials",
        items: [
          {
            name: "Payments",
            href: "/payments",
            icon: CreditCard,
            visible: permissions.canViewPayments,
          },
          {
            name: "Expenses",
            href: "/expenses",
            icon: Receipt,
            visible: permissions.canViewExpenses,
          },
          {
            name: "Profit & Loss",
            href: "/profit",
            icon: PieChart,
            visible: permissions.canViewProfit,
          },
          {
            name: "Reports",
            href: "/reports",
            icon: BarChart3,
            visible: permissions.canViewReports,
          },
        ],
      },
      {
        label: "System",
        items: [
          {
            name: "User Management",
            href: "/users",
            icon: UserCog,
            visible: permissions.canManageUsers,
          },
          {
            name: "Settings & Calendar",
            href: "/settings",
            icon: Settings,
            visible: permissions.canViewSettings || permissions.canViewCalendar,
          },
          {
            name: "Import Data",
            href: "/import",
            icon: FileSpreadsheet,
            visible: isAdminOrSuper,
          },
          {
            name: "Backup & Reset",
            href: "/backup-reset",
            icon: Database,
            visible: isSuperAdmin,
          },
          {
            name: "Notifications",
            href: "/notifications",
            icon: Bell,
            visible: permissions.canViewNotifications,
          },
        ],
      },
    ],
    [permissions, isManager, isAdminOrSuper, isSuperAdmin],
  );

  function isLinkActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Active section title for breadcrumbs
  const currentTitle = useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (isLinkActive(item.href)) {
          return { group: group.label, name: item.name };
        }
      }
    }
    return { group: "Workspace", name: "Overview" };
  }, [pathname, navGroups]);

  // Initials for avatar
  const userInitials = useMemo(() => {
    if (!user.name) return "U";
    return user.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [user.name]);

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#0F172A] antialiased selection:bg-[#0F766E]/20 selection:text-[#0F766E] w-full">
      {/* ============================================================== */}
      {/* DESKTOP & TABLET SIDEBAR (Deep Navy #142B3B)                    */}
      {/* ============================================================== */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-[100dvh] bg-[#142B3B] text-slate-200 border-r border-[#1D3D52] transition-[width] duration-300 ease-in-out shrink-0 z-30 ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
        aria-label="Sidebar navigation"
      >
        {/* Brand / Logo Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#1D3D52] shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded-lg p-1"
          >
            <div className="w-9 h-9 rounded-lg bg-[#0F766E] flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
              <span className="grid grid-cols-2 gap-0.5 w-4 h-4" aria-hidden="true">
                <span className="bg-white rounded-2xs" />
                <span className="bg-white/70 rounded-2xs" />
                <span className="bg-white/70 rounded-2xs" />
                <span className="bg-white rounded-2xs" />
              </span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex flex-col leading-tight">
                <span className="font-semibold text-white tracking-tight text-sm truncate">
                  Manufacturing ERP
                </span>
                <span className="text-[11px] text-[#94A3B8] font-medium truncate">
                  Enterprise Workspace
                </span>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-slate-400 hover:text-white hover:bg-white/10 p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Scrollable Navigation Groups */}
        <nav className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-5 sidebar-scroll">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="space-y-1">
                {!sidebarCollapsed ? (
                  <p className="px-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                    {group.label}
                  </p>
                ) : (
                  <div className="w-6 h-px bg-[#1D3D52] mx-auto my-2" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isLinkActive(item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        onClick={() => {
                          if (!active) setIsNavigating(true);
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group relative ${
                          active
                            ? "bg-[#0F766E] text-white shadow-xs font-semibold"
                            : "text-slate-300 hover:text-white hover:bg-white/8"
                        } ${sidebarCollapsed ? "justify-center px-2" : ""}`}
                        title={sidebarCollapsed ? item.name : undefined}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                            active ? "text-white" : "text-slate-400 group-hover:text-white"
                          }`}
                        />
                        {!sidebarCollapsed && (
                          <span className="truncate">{item.name}</span>
                        )}
                        {item.badge && !sidebarCollapsed && (
                          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-900/60 text-teal-300 border border-teal-700/50">
                            {item.badge}
                          </span>
                        )}
                        {active && sidebarCollapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r-full" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User Card / Footer */}
        <div className="p-3 border-t border-[#1D3D52] shrink-0 bg-[#0E1F2B]">
          <div
            className={`flex items-center gap-3 p-2 rounded-lg ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-[#0F766E]/30 border border-[#0F766E]/60 text-teal-300 font-semibold text-xs flex items-center justify-center shrink-0">
              {userInitials}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Shield className="w-3 h-3 text-[#0F766E]" />
                  <p className="text-[11px] text-[#94A3B8] truncate">
                    {role?.name ?? "Super Admin"}
                  </p>
                </div>
              </div>
            )}
            <form action={signOutAction} className={sidebarCollapsed ? "hidden" : "shrink-0"}>
              <button
                type="submit"
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* MOBILE DRAWER OVERLAY & MENU (< 768px)                         */}
      {/* ============================================================== */}
      {mobileDrawerOpen && (
        <div
          id="mobile-nav-drawer"
          className="md:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-[#142B3B] text-slate-200 h-[100dvh] shadow-2xl z-50">
            {/* Drawer Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-[#1D3D52] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center shadow-sm">
                  <span className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5" aria-hidden="true">
                    <span className="bg-white rounded-2xs" />
                    <span className="bg-white/70 rounded-2xs" />
                    <span className="bg-white/70 rounded-2xs" />
                    <span className="bg-white rounded-2xs" />
                  </span>
                </div>
                <span className="font-semibold text-white tracking-tight text-sm">
                  Manufacturing ERP
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] cursor-pointer"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Nav Items */}
            <nav className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-5 sidebar-scroll">
              {navGroups.map((group) => {
                const visibleItems = group.items.filter((item) => item.visible);
                if (visibleItems.length === 0) return null;

                return (
                  <div key={group.label} className="space-y-1">
                    <p className="px-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => {
                        const active = isLinkActive(item.href);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={true}
                            onClick={() => {
                              setMobileDrawerOpen(false);
                              if (!active) setIsNavigating(true);
                            }}
                            className={`min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? "bg-[#0F766E] text-white shadow-xs font-semibold"
                                : "text-slate-300 hover:text-white hover:bg-white/8"
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                active ? "text-white" : "text-slate-400"
                              }`}
                            />
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Drawer Footer User Profile */}
            <div className="p-4 border-t border-[#1D3D52] bg-[#0E1F2B] shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#0F766E]/30 border border-[#0F766E]/60 text-teal-300 font-semibold text-xs flex items-center justify-center shrink-0">
                    {userInitials}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-[#94A3B8] truncate">{role?.name ?? "Super Admin"}</p>
                  </div>
                </div>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 cursor-pointer"
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Instant Navigation Progress Bar */}
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-teal-100/60 overflow-hidden pointer-events-none">
          <div className="h-full bg-teal-600 top-progress-bar rounded-full" />
        </div>
      )}

      {/* ============================================================== */}
      {/* MAIN CONTENT AREA WITH STICKY TOP HEADER                        */}
      {/* ============================================================== */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-screen transition-[padding] duration-300 ease-in-out ${
          sidebarCollapsed ? "md:pl-20" : "md:pl-64"
        }`}
      >
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-[#E2E8F0] sticky top-0 z-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 shadow-2xs">
          {/* Left: Mobile hamburger & Breadcrumb */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] cursor-pointer"
              aria-label="Open navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Indicator */}
            <nav className="flex items-center text-xs sm:text-sm font-medium text-slate-500 min-w-0" aria-label="Breadcrumb">
              <span className="hidden sm:inline text-slate-400">{currentTitle.group}</span>
              <span className="hidden sm:inline mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {currentTitle.name}
              </span>
            </nav>
          </div>

          {/* Right: Business Pill, Notifications, User Badge, Sign Out */}
          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
            {/* Active Business Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs text-slate-700 font-medium">
              <Building2 className="w-3.5 h-3.5 text-[#0F766E]" />
              <span className="max-w-[200px] truncate">{businessName}</span>
            </div>

            {/* Notification Bell Component */}
            <NotificationBell />

            {/* Divider */}
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            {/* User Profile Pill */}
            <div className="hidden sm:flex items-center gap-2.5 pl-1">
              <div className="w-8 h-8 rounded-full bg-[#0F766E] text-white font-semibold text-xs flex items-center justify-center shadow-xs">
                {userInitials}
              </div>
              <div className="hidden xl:block text-left leading-tight">
                <p className="text-xs font-semibold text-slate-900 truncate max-w-[140px]">
                  {user.name}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {role?.name ?? "Super Admin"}
                </p>
              </div>
            </div>

            {/* Desktop Sign Out Action */}
            <form action={signOutAction} className="hidden sm:block">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
                title="Sign out of system"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
