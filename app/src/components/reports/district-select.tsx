"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, X, Check, MapPin } from "lucide-react";

export interface DistrictOption {
  value: string;
  label: string;
  district?: string;
  state?: string;
  stateCode?: string;
  isDuplicate?: boolean;
}

interface DistrictSelectProps {
  options: DistrictOption[];
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function DistrictSelect({
  options,
  value = "",
  onChange,
  disabled = false,
}: DistrictSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Find currently selected label
  const selectedOption = useMemo(() => {
    if (!value || value === "All Districts") return null;
    return (
      options.find(
        (opt) =>
          opt.value.toLowerCase() === value.toLowerCase() ||
          opt.label.toLowerCase() === value.toLowerCase() ||
          (opt.district && opt.district.toLowerCase() === value.toLowerCase())
      ) || null
    );
  }, [options, value]);

  const displayLabel = selectedOption ? selectedOption.label : "All Districts";

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    return options.filter((opt) => {
      if (opt.value === "" && (q.includes("all") || "all districts".includes(q))) return true;
      if (opt.value === "Unknown District" && (q.includes("unknown") || "unknown district".includes(q))) return true;
      const districtMatch = opt.district ? opt.district.toLowerCase().includes(q) : false;
      const labelMatch = opt.label.toLowerCase().includes(q);
      const stateMatch = opt.state ? opt.state.toLowerCase().includes(q) : false;
      return districtMatch || labelMatch || stateMatch;
    });
  }, [options, searchQuery]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="relative inline-block text-left"
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1.5 rounded border border-gray-300 bg-white px-2 py-1 text-xs sm:text-sm font-medium transition focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] min-w-[155px] max-w-[210px] ${
          selectedOption ? "text-gray-900 border-teal-500/60 font-semibold" : "text-gray-700"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"}`}
        title={displayLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{displayLabel}</span>
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {selectedOption && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              title="Reset to All Districts"
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1 z-50 w-72 sm:w-80 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden animate-in fade-in-50 duration-150">
          {/* Search Box Header */}
          <div className="p-2 border-b border-gray-100 bg-slate-50/90">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 770+ districts or state..."
                className="w-full rounded border border-gray-300 bg-white pl-8 pr-7 py-1 text-xs focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-gray-400 font-medium">
              <span>{filteredOptions.length} districts found</span>
              <span>All 28 States &amp; 8 UTs</span>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50 text-xs" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-gray-400 font-medium">
                No district matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = Boolean(
                  (!value && opt.value === "") ||
                  (value && opt.value.toLowerCase() === value.toLowerCase()) ||
                  (value && opt.district && opt.district.toLowerCase() === value.toLowerCase())
                );
                const isAll = opt.value === "";
                const isUnknown = opt.value === "Unknown District";

                return (
                  <button
                    key={opt.value || "__all__"}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition hover:bg-slate-50 ${
                      isSelected
                        ? "bg-teal-50 font-semibold text-[#0F766E]"
                        : "text-gray-700"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isAll ? (
                        <span className="font-bold text-gray-900">All Districts</span>
                      ) : isUnknown ? (
                        <span className="italic text-gray-500">Unknown District</span>
                      ) : (
                        <span className="truncate">{opt.label}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {opt.state && !isAll && !isUnknown && (
                        <span className="text-[10px] text-gray-400 font-normal">
                          {opt.state}
                        </span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-[#0F766E]" />}
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
