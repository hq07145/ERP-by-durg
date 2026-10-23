"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  X,
  Truck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  Search,
  Package,
  Clock,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import type { CustomerDropdownItem, CustomerOrderForDelivery } from "@/types/delivery";
import {
  getCustomerOrdersForDelivery,
  createManualDelivery,
} from "@/lib/delivery/actions";
import {
  validateAndNormalizeVehicleNumber,
  validateInvoiceNumber,
} from "@/lib/delivery/validation";

interface CreateDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerDropdownItem[];
  onSuccess: (result: {
    delivery_id: string;
    delivery_number: string;
    order_number: string;
    message: string;
  }) => void;
}

export function CreateDeliveryModal({
  isOpen,
  onClose,
  customers,
  onSuccess,
}: CreateDeliveryModalProps) {
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  const [customerOrders, setCustomerOrders] = useState<CustomerOrderForDelivery[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false);

  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Track dirty state
  const isDirty = useMemo(() => {
    return (
      !!selectedCustomerId ||
      !!selectedOrderId ||
      !!vehicleNumber.trim() ||
      !!driverName.trim() ||
      !!invoiceNumber.trim() ||
      !!notes.trim()
    );
  }, [selectedCustomerId, selectedOrderId, vehicleNumber, driverName, invoiceNumber, notes]);

  const handleAttemptClose = useCallback(() => {
    if (isSubmitting) return;
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in this delivery entry. Are you sure you want to discard them?"
      );
      if (!confirmed) return;
    }
    onClose();
  }, [isSubmitting, isDirty, onClose]);

  // Keyboard shortcut: Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleAttemptClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleAttemptClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      setSelectedCustomerId("");
      setCustomerSearchQuery("");
      setCustomerOrders([]);
      setSelectedOrderId("");
      setOrderSearchQuery("");
      setDeliveryDate(new Date().toISOString().split("T")[0]);
      setVehicleNumber("");
      setDriverName("");
      setInvoiceNumber("");
      setNotes("");
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle Customer Selection -> Fetch Customer Orders
  const handleSelectCustomer = async (cust: CustomerDropdownItem) => {
    setSelectedCustomerId(cust.id);
    setCustomerSearchQuery(cust.company_name ? `${cust.name} (${cust.company_name})` : cust.name);
    setIsCustomerDropdownOpen(false);

    // Reset order
    setSelectedOrderId("");
    setOrderSearchQuery("");
    setFormError(null);

    // Fetch customer orders
    setIsLoadingOrders(true);
    try {
      const orders = await getCustomerOrdersForDelivery(cust.id);
      setCustomerOrders(orders);
      if (orders.length === 1 && orders[0].is_fully_ready) {
        setSelectedOrderId(orders[0].id);
        setOrderSearchQuery(orders[0].order_number);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to load customer orders");
      setCustomerOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.gst_number && c.gst_number.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  // Selected Customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Filtered Orders for selected customer
  const filteredOrders = useMemo(() => {
    if (!orderSearchQuery.trim()) return customerOrders;
    const q = orderSearchQuery.toLowerCase();
    return customerOrders.filter((o) => o.order_number.toLowerCase().includes(q));
  }, [customerOrders, orderSearchQuery]);

  // Selected Order details
  const selectedOrder = useMemo(() => {
    return customerOrders.find((o) => o.id === selectedOrderId);
  }, [customerOrders, selectedOrderId]);

  // Real-time Vehicle Validation
  const vehicleValidation = useMemo(() => {
    if (!vehicleNumber.trim()) return { isValid: false, normalized: "" };
    return validateAndNormalizeVehicleNumber(vehicleNumber);
  }, [vehicleNumber]);

  // Real-time Invoice Number Validation
  const invoiceValidation = useMemo(() => {
    if (!invoiceNumber.trim()) return { isValid: false, normalized: "", error: "Invoice number is required." };
    return validateInvoiceNumber(invoiceNumber);
  }, [invoiceNumber]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);

    // Validation
    if (!selectedCustomerId) {
      setFormError("Please select a customer.");
      return;
    }
    if (!selectedOrderId) {
      setFormError("Please select an order to deliver.");
      return;
    }
    if (!selectedOrder) {
      setFormError("Selected order was not found.");
      return;
    }
    if (!selectedOrder.is_fully_ready) {
      setFormError(
        selectedOrder.not_ready_reason ||
          "This order is not fully ready for delivery. All items must be completed or available in stock."
      );
      return;
    }
    if (!deliveryDate) {
      setFormError("Please select a valid delivery date.");
      return;
    }
    if (!invoiceNumber.trim()) {
      setFormError("Invoice number is required.");
      return;
    }
    if (!invoiceValidation.isValid) {
      setFormError(invoiceValidation.error || "Please enter a valid invoice number.");
      return;
    }
    if (!vehicleValidation.isValid) {
      setFormError(vehicleValidation.error || "Please enter a valid vehicle registration number.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createManualDelivery({
        customer_id: selectedCustomerId,
        order_id: selectedOrderId,
        delivery_date: deliveryDate,
        vehicle_number: vehicleValidation.normalized,
        invoice_number: invoiceValidation.normalized,
        driver_name: driverName.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onSuccess(res);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record delivery entry.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-delivery-modal-title"
      onClick={handleAttemptClose}
    >
      <div
        className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[92vh] sm:w-[94vw] lg:max-w-5xl rounded-none sm:rounded-2xl bg-white shadow-2xl border-0 sm:border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* STICKY HEADER */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/95 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200/80">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-[#0F766E] border border-teal-200 uppercase tracking-wider">
                  Logistics &amp; Fulfillment
                </span>
              </div>
              <h2
                id="create-delivery-modal-title"
                className="text-base sm:text-lg font-bold text-[#142B3B] leading-tight"
              >
                Create Delivery
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Record manual dispatch and completed delivery for customer orders with stock reconciliation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE FORM BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3 shadow-2xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">{formError}</div>
            </div>
          )}

          {/* SECTION 1: CUSTOMER & ORDER SELECTION */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-[#0F766E]" />
                Customer &amp; Sales Order Selection
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Searchable Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setIsCustomerDropdownOpen(true);
                        if (selectedCustomerId) {
                          setSelectedCustomerId("");
                          setCustomerOrders([]);
                          setSelectedOrderId("");
                        }
                      }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      placeholder="Search active customer by name, company, or GSTIN..."
                      className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-8 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearchQuery("");
                          setSelectedCustomerId("");
                          setCustomerOrders([]);
                          setSelectedOrderId("");
                          setIsCustomerDropdownOpen(true);
                        }}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {isCustomerDropdownOpen && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs">
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-3 text-center text-slate-500">
                          No active customers found matching &quot;{customerSearchQuery}&quot;
                        </div>
                      ) : (
                        filteredCustomers.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className={`cursor-pointer px-3.5 py-2 hover:bg-teal-50/60 transition flex flex-col gap-0.5 ${
                              selectedCustomerId === c.id ? "bg-teal-50 font-semibold" : ""
                            }`}
                          >
                            <span className="text-slate-900 font-medium">
                              {c.name}
                              {c.company_name && c.company_name !== c.name && (
                                <span className="text-slate-500 font-normal"> ({c.company_name})</span>
                              )}
                            </span>
                            {c.gst_number && (
                              <span className="text-[10px] font-mono text-slate-400">
                                GST: {c.gst_number}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Order Selection Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Order Number <span className="text-rose-500">*</span>
                </label>
                {!selectedCustomerId ? (
                  <div className="flex items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-400">
                    <span>Select a customer above first to view their orders</span>
                  </div>
                ) : isLoadingOrders ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0F766E]" />
                    <span>Loading customer orders...</span>
                  </div>
                ) : customerOrders.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>No pending orders found for this customer.</span>
                  </div>
                ) : (
                  <div className="relative">
                    <div
                      onClick={() => setIsOrderDropdownOpen(!isOrderDropdownOpen)}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 hover:border-slate-400 focus:border-[#0F766E]"
                    >
                      <span className={selectedOrder ? "font-bold text-slate-900" : "text-slate-400"}>
                        {selectedOrder
                          ? `${selectedOrder.order_number} (${selectedOrder.total_quantity} units) • ${selectedOrder.status}`
                          : "Select an order to deliver..."}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>

                    {isOrderDropdownOpen && (
                      <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg text-xs">
                        {customerOrders.map((ord) => (
                          <div
                            key={ord.id}
                            onClick={() => {
                              setSelectedOrderId(ord.id);
                              setOrderSearchQuery(ord.order_number);
                              setIsOrderDropdownOpen(false);
                            }}
                            className={`cursor-pointer px-3.5 py-2.5 hover:bg-teal-50/60 transition border-b border-slate-50 last:border-b-0 ${
                              selectedOrderId === ord.id ? "bg-teal-50/80 font-semibold" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-900">
                                {ord.order_number}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  ord.is_fully_ready
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                {ord.is_fully_ready ? "Ready" : "Partially Ready / Pending"}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                              <span>Date: {format(new Date(ord.order_date), "dd-MMM-yyyy")}</span>
                              <span>Total Qty: {ord.total_quantity} units</span>
                            </div>
                            {ord.not_ready_reason && (
                              <p className="mt-1 text-[10px] text-amber-700 font-normal">
                                ⚠️ {ord.not_ready_reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: SELECTED ORDER PREVIEW */}
          {selectedOrder && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Selected Order Preview
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h4 className="font-mono text-base font-bold text-slate-900">
                      {selectedOrder.order_number}
                    </h4>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                <div>
                  {selectedOrder.is_fully_ready ? (
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Ready for Full Delivery</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Order Not Ready for Full Delivery</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Meta Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Customer
                  </span>
                  <span className="font-semibold text-slate-900 truncate block">
                    {selectedCustomer?.name || "Customer"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Order Date
                  </span>
                  <span className="font-medium text-slate-800">
                    {format(new Date(selectedOrder.order_date), "MMM d, yyyy")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Expected Delivery
                  </span>
                  <span className="font-medium text-slate-800">
                    {selectedOrder.expected_delivery_date
                      ? format(new Date(selectedOrder.expected_delivery_date), "MMM d, yyyy")
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                    Actual Delivery Date
                  </span>
                  <span className="font-bold text-[#0F766E]">
                    {deliveryDate ? format(new Date(deliveryDate), "MMM d, yyyy") : "—"}
                  </span>
                </div>
              </div>

              {/* Not Ready Explanation Notice */}
              {!selectedOrder.is_fully_ready && selectedOrder.not_ready_reason && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
                  <strong>Notice:</strong> {selectedOrder.not_ready_reason}
                </div>
              )}

              {/* Products Breakdown Table */}
              <div>
                <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Line Items &amp; Fulfillment Status ({selectedOrder.items.length})
                </h5>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <tr>
                        <th className="px-3.5 py-2">Product Name</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2 text-right">Ordered Qty</th>
                        <th className="px-3 py-2 text-right">Production Ready</th>
                        <th className="px-3 py-2 text-right">Warehouse Stock</th>
                        <th className="px-3.5 py-2 text-center">Delivered Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="px-3.5 py-2.5 font-medium">{item.product_name}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">
                            {item.product_sku || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            <span
                              className={
                                item.completed_quantity >= item.quantity
                                  ? "text-emerald-700 font-semibold"
                                  : "text-amber-700 font-medium"
                              }
                            >
                              {item.completed_quantity} / {item.quantity}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            <span
                              className={
                                item.current_stock >= item.quantity
                                  ? "text-slate-800"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {item.current_stock}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30">
                            {item.quantity} {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: DELIVERY & LOGISTICS DETAILS */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-[#0F766E]" />
                Logistics &amp; Dispatch Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Delivery Date */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Delivery Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Past dates supported for historical records</p>
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Vehicle Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g. MH12AB1234"
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                    vehicleNumber.trim() && !vehicleValidation.isValid
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
                      : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]"
                  }`}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {vehicleNumber.trim() && !vehicleValidation.isValid ? (
                    <span className="text-rose-600 font-medium">{vehicleValidation.error}</span>
                  ) : (
                    "Normalized Indian registration"
                  )}
                </p>
              </div>

              {/* Driver Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Driver Name <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Invoice Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  required
                  placeholder="e.g. SAN/26-27/154"
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 ${
                    invoiceNumber.trim() && !invoiceValidation.isValid
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500"
                      : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]"
                  }`}
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  {invoiceNumber.trim() && !invoiceValidation.isValid ? (
                    <span className="text-rose-600 font-medium">{invoiceValidation.error}</span>
                  ) : (
                    "Letters, numbers, hyphens, and slashes accepted"
                  )}
                </p>
              </div>
            </div>

            {/* Delivery Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Delivery Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Gate pass number, site contact, delivery remarks or proof reference..."
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>
          </div>
        </div>

        {/* STICKY FOOTER */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-200 px-4 sm:px-6 py-3.5 bg-slate-50/95 backdrop-blur-sm z-20">
          <div className="text-xs text-slate-500 hidden sm:block">
            {selectedOrder ? (
              <span>
                Fulfilling <strong>{selectedOrder.total_quantity} units</strong> for Order{" "}
                <span className="font-mono font-bold text-slate-700">{selectedOrder.order_number}</span>
              </span>
            ) : (
              <span>Select an order to begin delivery entry</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !selectedCustomerId ||
                !selectedOrderId ||
                !selectedOrder?.is_fully_ready ||
                !vehicleValidation.isValid ||
                !invoiceValidation.isValid
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0D655E] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Delivery...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Delivery</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
