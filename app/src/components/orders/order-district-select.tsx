"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, X, Check, MapPin } from "lucide-react";
import {
  ALL_INDIAN_DISTRICTS,
  getStateForDistrict,
  getBaseDistrictName,
  type IndianDistrictOption,
} from "@/lib/reports/indian-districts";

interface OrderDistrictSelectProps {
  value?: string;
  onChange: (district: string, state: string) => void;
  disabled?: boolean;
  defaultStateHint?: string;
  placeholder?: string;
}

export function OrderDistrictSelect({
  value = "",
  onChange,
  disabled = false,
  defaultStateHint,
  placeholder = "Select customer district (e.g. Pune, Indore, Jaipur...)",
}: OrderDistrictSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (!value || !value.trim()) return null;
    const clean = value.trim().toLowerCase();
    const base = getBaseDistrictName(value).trim().toLowerCase();
    return (
      ALL_INDIAN_DISTRICTS.find(
        (opt) =>
          opt.value.toLowerCase() === clean ||
          opt.district.toLowerCase() === clean ||
          opt.district.toLowerCase() === base
      ) || null
    );
  }, [value]);

  const displayLabel = selectedOption
    ? selectedOption.district
    : value
    ? value
    : "";

  const selectedState = selectedOption
    ? selectedOption.state
    : getStateForDistrict(value) || "";

  // Filter options based on user search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_INDIAN_DISTRICTS;

    return ALL_INDIAN_DISTRICTS.filter((opt) => {
      const matchDistrict = opt.district.toLowerCase().includes(q);
      const matchState = opt.state.toLowerCase().includes(q);
      const matchCode = opt.stateCode ? opt.stateCode.toLowerCase().includes(q) : false;
      return matchDistrict || matchState || matchCode;
    });
  }, [searchQuery]);

  const handleSelect = (opt: IndianDistrictOption) => {
    onChange(opt.district, opt.state);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("", "");
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="relative w-full text-left"
    >
      {/* Hidden input to pass district via native FormData if needed */}
      <input type="hidden" name="district" value={value || ""} />

      {/* Trigger Button */}
      <button
        type="button"
        id="order_district_select_btn"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px] flex items-center justify-between gap-2 text-left transition ${
          disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "cursor-pointer hover:bg-slate-50/50"
        } ${selectedOption ? "text-slate-900 font-medium" : "text-slate-500"}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 truncate">
          <MapPin className={`w-4 h-4 shrink-0 ${selectedOption ? "text-[#0F766E]" : "text-slate-400"}`} />
          {displayLabel ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-slate-900">{displayLabel}</span>
              {selectedState && (
                <span className="text-xs text-slate-400 font-normal">
                  ({selectedState})
                </span>
              )}
            </div>
          ) : defaultStateHint ? (
            <span className="text-slate-400 italic">
              Auto ({defaultStateHint}) — click to select district
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {displayLabel && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              title="Clear district"
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/70 transition"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1 z-50 w-full sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/90">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search district or state (e.g. Pune, Indore, Jaipur)..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 py-1.5 text-xs sm:text-sm focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1 text-[11px] text-slate-400 font-medium">
              <span>{filteredOptions.length} districts found</span>
              <span>All 28 States &amp; 8 UTs</span>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 text-xs sm:text-sm" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-slate-400 font-medium">
                No district matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = Boolean(
                  displayLabel &&
                  (opt.district.toLowerCase() === displayLabel.toLowerCase() ||
                    opt.value.toLowerCase() === value.toLowerCase())
                );

                return (
                  <button
                    key={`${opt.district}-${opt.state}`}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-left transition hover:bg-slate-50 cursor-pointer ${
                      isSelected
                        ? "bg-teal-50/80 font-semibold text-[#0F766E]"
                        : "text-slate-700"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="truncate">{opt.district}</span>
                      {opt.isDuplicate && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded font-normal">
                          {opt.state}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-slate-400 font-normal">
                        {opt.state}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-[#0F766E] shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
