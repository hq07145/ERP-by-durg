"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  ShoppingCart,
  UserPlus,
  Layers,
  CreditCard,
  Factory,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { CreateOrderModal } from "@/components/orders/create-order-modal";

export interface QuickActionItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: "order_create" | "customer_add" | "stock_adjust" | "payment_record" | "production_open" | "orders_view";
  highlight?: boolean;
}

export interface OrderFormDataProps {
  customers: { id: string; name: string; company_name: string | null; gst_number?: string | null; state?: string | null; district?: string | null }[];
  products: any[];
  workingDays?: Record<string, boolean>;
  calendarOverrides?: Record<string, boolean>;
  businessDetails?: any;
}

interface ManagerQuickActionsFabProps {
  actions: QuickActionItem[];
  orderFormData?: OrderFormDataProps;
}

const ACTION_ICONS = {
  order_create: ShoppingCart,
  customer_add: UserPlus,
  stock_adjust: Layers,
  payment_record: CreditCard,
  production_open: Factory,
  orders_view: ClipboardList,
};

export function ManagerQuickActionsFab({ actions, orderFormData }: ManagerQuickActionsFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const router = useRouter();

  // If no actions are permitted for this Manager, do not render the FAB
  if (!actions || actions.length === 0) {
    return null;
  }

  const handleClose = useCallback(() => {
    setIsOpen(false);
    fabButtonRef.current?.focus();
  }, []);

  // Close on Click Outside or Touch Outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Handle Keyboard Navigation (Escape, ArrowUp, ArrowDown, Home, End)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      const items = menuItemsRef.current.filter(Boolean) as HTMLAnchorElement[];
      if (items.length === 0) return;

      const activeIndex = items.findIndex((item) => item === document.activeElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        items[nextIndex]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        items[prevIndex]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus the first menu item when opened via keyboard
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        menuItemsRef.current[0]?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleActionClick = (action: QuickActionItem) => {
    setIsOpen(false);
    if (action.id === "create_order" && orderFormData) {
      setIsCreateOrderModalOpen(true);
      return;
    }
    router.push(action.href);
  };

  return (
    <>
      <div
        ref={containerRef}
        className="fixed z-40 right-4 sm:right-8 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(2rem+env(safe-area-inset-bottom,0px))] flex flex-col items-end"
        data-testid="manager-quick-actions-fab-container"
      >
      {/* Upward Quick Actions Menu */}
      <div
        id="manager-quick-actions-menu"
        role="menu"
        aria-label="Manager Quick Actions"
        aria-hidden={!isOpen}
        className={`absolute bottom-full mb-3 right-0 w-[calc(100vw-2.5rem)] sm:w-80 max-w-sm rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl p-2.5 transition-all duration-200 ease-out origin-bottom-right ${
          isOpen
            ? "scale-100 opacity-100 translate-y-0 pointer-events-auto"
            : "scale-95 opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        {/* Header Label */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Quick Actions</span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
            {actions.length} Available
          </span>
        </div>

        {/* Action List */}
        <div className="space-y-1 max-h-[calc(100dvh-180px)] overflow-y-auto py-1">
          {actions.map((action, index) => {
            const Icon = ACTION_ICONS[action.icon] || Plus;
            const isHighlight = action.highlight;

            return (
              <Link
                key={action.id}
                ref={(el) => {
                  menuItemsRef.current[index] = el;
                }}
                href={action.href}
                role="menuitem"
                tabIndex={isOpen ? 0 : -1}
                onClick={(e) => {
                  e.preventDefault();
                  handleActionClick(action);
                }}
                className={`group flex items-center gap-3 w-full rounded-xl p-2.5 text-left transition-all duration-150 cursor-pointer ${
                  isHighlight
                    ? "bg-teal-50/70 hover:bg-teal-100/80 border border-teal-200/70 text-teal-950 shadow-2xs"
                    : "hover:bg-slate-100/80 text-slate-800"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105 ${
                    isHighlight
                      ? "bg-[#0F766E] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs sm:text-sm font-semibold truncate ${
                        isHighlight ? "text-teal-950 font-bold" : "text-slate-900"
                      }`}
                    >
                      {action.label}
                    </p>
                    {isHighlight && (
                      <span className="ml-1.5 shrink-0 rounded bg-teal-600 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Floating Circular Teal Button */}
      <button
        ref={fabButtonRef}
        type="button"
        onClick={toggleOpen}
        aria-label="Quick Actions"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="manager-quick-actions-menu"
        className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-[#0F766E] text-white shadow-lg shadow-teal-950/25 transition-all duration-200 hover:bg-[#0D655E] hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 cursor-pointer"
        data-testid="manager-quick-actions-fab-button"
      >
        <span className="sr-only">Toggle Quick Actions Menu</span>
        <Plus
          className={`h-7 w-7 transition-transform duration-200 ease-in-out ${
            isOpen ? "rotate-45" : "rotate-0"
          }`}
          aria-hidden="true"
        />
      </button>
    </div>

    {/* Existing Responsive Create Order Modal Hydrated Directly on Dashboard */}
    {orderFormData && isCreateOrderModalOpen && (
      <CreateOrderModal
        isOpen={isCreateOrderModalOpen}
        onClose={() => setIsCreateOrderModalOpen(false)}
        customers={orderFormData.customers}
        products={orderFormData.products}
        workingDays={orderFormData.workingDays}
        calendarOverrides={orderFormData.calendarOverrides}
        businessDetails={orderFormData.businessDetails}
        returnTo="manager_dashboard"
      />
    )}
  </>
  );
}
