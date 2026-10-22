"use client";

import { useState, useEffect } from "react";
import { Package, Layers } from "lucide-react";

interface InventoryTabsClientProps {
  initialTab?: "ready-stock" | "raw-materials";
  readyStockContent: React.ReactNode;
  rawMaterialsContent: React.ReactNode;
  headerTitleReadyStock?: string;
  headerSubtitleReadyStock?: string;
  headerTitleRawMaterials?: string;
  headerSubtitleRawMaterials?: string;
  transactionHistoryLink?: React.ReactNode;
}

export function InventoryTabsClient({
  initialTab = "ready-stock",
  readyStockContent,
  rawMaterialsContent,
  transactionHistoryLink,
}: InventoryTabsClientProps) {
  const [activeTab, setActiveTab] = useState<"ready-stock" | "raw-materials">(initialTab);

  // Sync with URL query on mount if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "raw-materials" || tabParam === "ready-stock") {
        setActiveTab(tabParam);
      }
    }
  }, []);

  const handleTabChange = (newTab: "ready-stock" | "raw-materials") => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);

    // Update browser URL immediately without server re-render
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", newTab);
      // Clean up single-page param if switching away from raw materials
      if (newTab === "ready-stock") {
        url.searchParams.delete("page");
      }
      window.history.replaceState(null, "", url.toString());
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION - Dynamically updates based on active tab */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">Inventory Management</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
            {activeTab === "ready-stock" ? "Ready Stock (Finished Goods)" : "Raw Material Stock"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {activeTab === "ready-stock"
              ? "Finished products ready for order fulfillment. Available stock = physical finished goods − active reservations."
              : "Raw materials tracked for manufacturing bills of materials and production execution."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {transactionHistoryLink}
        </div>
      </div>

      {/* INSTANT TAB SWITCHER (0ms click response) */}
      <div className="flex border-b border-slate-200" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ready-stock"}
          onClick={() => handleTabChange("ready-stock")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition cursor-pointer select-none ${
            activeTab === "ready-stock"
              ? "border-[#0F766E] text-[#0F766E]"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>Ready Stock (Finished Goods)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "raw-materials"}
          onClick={() => handleTabChange("raw-materials")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition cursor-pointer select-none ${
            activeTab === "raw-materials"
              ? "border-[#0F766E] text-[#0F766E]"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Raw Materials Stock</span>
        </button>
      </div>

      {/* TAB CONTENT PANELS - Switched instantaneously in memory */}
      <div className={activeTab === "ready-stock" ? "block" : "hidden"}>
        {readyStockContent}
      </div>

      <div className={activeTab === "raw-materials" ? "block" : "hidden"}>
        {rawMaterialsContent}
      </div>
    </div>
  );
}
