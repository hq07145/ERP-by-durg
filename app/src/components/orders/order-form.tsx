"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { createOrderAction, updateOrderAction } from "@/lib/orders/actions";
import { Loader2, AlertCircle, Plus, Trash2, Truck, Clock, CheckCircle2, AlertTriangle, ShieldCheck, MapPin } from "lucide-react";
import { INDIAN_STATES, determineGstTaxType, calculateItemGst, calculateOrderGst, type TaxType } from "@/lib/financials/gst";
import { OrderDistrictSelect } from "./order-district-select";
import { getStateForDistrict, getBaseDistrictName } from "@/lib/reports/indian-districts";

interface OrderFormProps {
  orderId?: string;
  initialValues?: {
    customer_id: string;
    order_number: string;
    order_date: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    district?: string;
    place_of_supply?: string;
    notes: string;
  };
  initialItems?: Array<{
    product_id: string;
    quantity: string;
    unit_price: string;
    discount_rate: string;
    tax_rate: string;
    sgst_rate?: string;
    cgst_rate?: string;
    igst_rate?: string;
  }>;
  customers: {
    id: string;
    name: string;
    company_name: string | null;
    gst_number?: string | null;
    state?: string | null;
    district?: string | null;
  }[];
  businessDetails?: {
    name?: string;
    legal_name?: string;
    gst_number?: string;
    state?: string;
  };
  products: {
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    selling_price: string | number;
    tax_rate: string | number;
    daily_capacity?: number | string | null;
    production_min_days?: number | string | null;
    setup_minutes?: number | string | null;
    delivery_min_days?: number | string | null;
    delivery_max_days?: number | string | null;
    available_stock?: number | string | null;
  }[];
  workingDays?: Record<string, boolean>;
  calendarOverrides?: Record<string, boolean>;
  isModal?: boolean;
  onClose?: () => void;
  returnTo?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_customer: "Please select a valid customer.",
  invalid_order_number: "Order number is required and must not exceed 64 characters.",
  invalid_order_date: "Please specify a valid order date.",
  no_items: "Please add at least one line item to the order.",
  invalid_product: "Please select a product for each line item.",
  invalid_quantity: "All item quantities must be greater than zero.",
  invalid_unit_price: "Unit price cannot be negative.",
  invalid_discount_rate: "Discount rate must be between 0% and 100%.",
  invalid_tax_rate: "Tax rate must be between 0% and 100%.",
  invalid_sgst_rate: "SGST rate must be between 0% and 100%.",
  invalid_cgst_rate: "CGST rate must be between 0% and 100%.",
  invalid_igst_rate: "LGST rate must be between 0% and 100%.",
  mixed_gst_rates: "Cannot apply both SGST/CGST and LGST to the same taxable amount as this would double-charge tax. Please use SGST+CGST for intra-state or LGST for inter-state.",
  tax_validation_failed: "Tax rate validation failed. Please review your GST rates and transaction type.",
  duplicate_order_number: "An order with this order number already exists in your workspace.",
  notes_too_long: "Notes must not exceed 2000 characters.",
  forbidden: "You do not have permission to perform this action. Missing required permission: orders.create (or orders.edit for updates). Please ask an Administrator to assign this permission.",
  auth_unconfigured: "Authentication or database service is unavailable.",
  order_not_found: "The requested order was not found in your business workspace.",
  order_cancelled_locked: "This order is cancelled and is locked from editing.",
  order_delivered_locked: "This order has already been delivered and is locked from editing.",
  production_in_progress_locked: "Production for this order is already in progress or completed and cannot be silently modified.",
  invalid_values: "Please check your item quantities, prices and rates for valid numbers.",
  create_failed: "Failed to create order. Please check your inputs and try again.",
  update_failed: "Failed to update order. Please check your inputs and try again.",
};

export function OrderForm({
  orderId,
  initialValues,
  initialItems,
  customers,
  products,
  businessDetails,
  workingDays,
  calendarOverrides,
  isModal = false,
  onClose,
  returnTo,
  onDirtyChange,
}: OrderFormProps) {
  const [items, setItems] = useState<Array<{
    product_id: string;
    quantity: string;
    unit_price: string;
    discount_rate: string;
    tax_rate: string;
    sgst_rate: string;
    cgst_rate: string;
    igst_rate: string;
  }>>(
    initialItems && initialItems.length > 0
      ? initialItems.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_rate: it.discount_rate || "0",
          tax_rate: it.tax_rate || "0",
          sgst_rate: it.sgst_rate ?? "0",
          cgst_rate: it.cgst_rate ?? "0",
          igst_rate: it.igst_rate ?? "0",
        }))
      : [
          {
            product_id: "",
            quantity: "",
            unit_price: "",
            discount_rate: "0",
            tax_rate: "0",
            sgst_rate: "0",
            cgst_rate: "0",
            igst_rate: "0",
          },
        ]
  );

  const [customerId, setCustomerId] = useState<string>(initialValues?.customer_id ?? "");
  const [orderNumber, setOrderNumber] = useState<string>(initialValues?.order_number ?? "");
  const [orderDate, setOrderDate] = useState<string>(
    initialValues?.order_date ?? new Date().toISOString().split("T")[0]
  );
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">(
    initialValues?.priority ?? "NORMAL"
  );
  const [district, setDistrict] = useState<string>(
    initialValues?.district ?? ""
  );
  const [placeOfSupply, setPlaceOfSupply] = useState<string>(
    initialValues?.place_of_supply ?? ""
  );
  const [notes, setNotes] = useState<string>(initialValues?.notes ?? "");

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  useEffect(() => {
    if (customerId && selectedCustomer) {
      if (selectedCustomer.district && !initialValues?.district) {
        setDistrict(selectedCustomer.district);
      }
      if (selectedCustomer.state && !initialValues?.place_of_supply) {
        setPlaceOfSupply(selectedCustomer.state);
      }
    }
  }, [customerId, selectedCustomer, initialValues]);

  const handleDistrictChange = (selectedDistrict: string, selectedState: string) => {
    setDistrict(selectedDistrict);
    if (selectedState) {
      setPlaceOfSupply(selectedState);
    } else if (selectedDistrict) {
      const derived = getStateForDistrict(selectedDistrict);
      if (derived) setPlaceOfSupply(derived);
    }
  };

  const supplierState = businessDetails?.state || "Maharashtra";
  const supplierGstin = businessDetails?.gst_number || null;
  const effectivePos =
    placeOfSupply ||
    getStateForDistrict(district) ||
    selectedCustomer?.state ||
    supplierState;

  const currentTaxType = useMemo(
    () =>
      determineGstTaxType({
        supplierState,
        supplierGstin,
        customerState: selectedCustomer?.state,
        customerGstin: selectedCustomer?.gst_number,
        placeOfSupply: effectivePos,
      }),
    [supplierState, supplierGstin, selectedCustomer, effectivePos]
  );

  const action = orderId ? updateOrderAction.bind(null, orderId) : createOrderAction;
  const [state, formAction, isServerPending] = useActionState(action, { error: undefined });
  const [isClientPending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);

  const isPending = isServerPending || isClientPending;
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isPending) {
      isSubmittingRef.current = false;
    }
  }, [isPending]);

  // Track unsaved changes
  const isDirty = useMemo(() => {
    if (!initialValues) {
      const hasCustomer = Boolean(customerId);
      const hasOrderNumber = Boolean(orderNumber.trim());
      const hasNotes = Boolean(notes.trim());
      const hasModifiedDate = orderDate !== new Date().toISOString().split("T")[0];
      const hasModifiedPriority = priority !== "NORMAL";
      const hasModifiedItems = items.some(
        (it) => Boolean(it.product_id) || Boolean(it.quantity.trim()) || (it.discount_rate.trim() !== "" && it.discount_rate.trim() !== "0") || (it.tax_rate.trim() !== "" && it.tax_rate.trim() !== "0")
      ) || items.length > 1;
      return hasCustomer || hasOrderNumber || hasNotes || hasModifiedDate || hasModifiedPriority || hasModifiedItems;
    }
    const customerChanged = customerId !== (initialValues.customer_id || "");
    const numberChanged = orderNumber.trim() !== (initialValues.order_number || "");
    const dateChanged = orderDate !== (initialValues.order_date || "");
    const priorityChanged = priority !== (initialValues.priority || "NORMAL");
    const notesChanged = notes.trim() !== (initialValues.notes || "");
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(initialItems ?? []);
    return customerChanged || numberChanged || dateChanged || priorityChanged || notesChanged || itemsChanged;
  }, [customerId, orderNumber, orderDate, priority, notes, items, initialValues, initialItems]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleCancelOrClose = () => {
    if (isPending) return;
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes in this order. Are you sure you want to discard them?"
      );
      if (!confirmed) return;
    }
    if (onClose) {
      onClose();
    } else {
      window.location.href = orderId ? `/orders/${orderId}` : "/orders";
    }
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_id: "",
        quantity: "",
        unit_price: "",
        discount_rate: "0",
        tax_rate: "0",
        sgst_rate: "0",
        cgst_rate: "0",
        igst_rate: "0",
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleProductChange = (index: number, productId: string) => {
    const selected = products.find((p) => p.id === productId);
    const prodTaxRate = selected?.tax_rate != null ? Number(selected.tax_rate) : 0;

    let defaultSgst = "0";
    let defaultCgst = "0";
    let defaultIgst = "0";

    if (currentTaxType === "INTRA_STATE") {
      defaultSgst = String(prodTaxRate / 2);
      defaultCgst = String(prodTaxRate / 2);
      defaultIgst = "0";
    } else if (currentTaxType === "INTER_STATE") {
      defaultSgst = "0";
      defaultCgst = "0";
      defaultIgst = String(prodTaxRate);
    }

    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          product_id: productId,
          unit_price: selected?.selling_price != null ? String(selected.selling_price) : item.unit_price,
          tax_rate: String(prodTaxRate),
          sgst_rate: defaultSgst,
          cgst_rate: defaultCgst,
          igst_rate: defaultIgst,
        };
      })
    );
  };

  const handleCombinedTaxRateChange = (index: number, newTaxRateStr: string) => {
    const rate = parseFloat(newTaxRateStr) || 0;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (currentTaxType === "INTRA_STATE") {
          return {
            ...item,
            tax_rate: newTaxRateStr,
            sgst_rate: String(rate / 2),
            cgst_rate: String(rate / 2),
            igst_rate: "0",
          };
        } else if (currentTaxType === "INTER_STATE") {
          return {
            ...item,
            tax_rate: newTaxRateStr,
            sgst_rate: "0",
            cgst_rate: "0",
            igst_rate: String(rate),
          };
        } else {
          return {
            ...item,
            tax_rate: newTaxRateStr,
            sgst_rate: "0",
            cgst_rate: "0",
            igst_rate: "0",
          };
        }
      })
    );
  };

  const handleSgstChange = (index: number, val: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const s = parseFloat(val) || 0;
        const c = parseFloat(item.cgst_rate) || 0;
        const ig = parseFloat(item.igst_rate) || 0;
        return {
          ...item,
          sgst_rate: val,
          tax_rate: String(Math.round((s + c + ig) * 100) / 100),
        };
      })
    );
  };

  const handleCgstChange = (index: number, val: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const c = parseFloat(val) || 0;
        const s = parseFloat(item.sgst_rate) || 0;
        const ig = parseFloat(item.igst_rate) || 0;
        return {
          ...item,
          cgst_rate: val,
          tax_rate: String(Math.round((s + c + ig) * 100) / 100),
        };
      })
    );
  };

  const handleIgstChange = (index: number, val: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const ig = parseFloat(val) || 0;
        const s = parseFloat(item.sgst_rate) || 0;
        const c = parseFloat(item.cgst_rate) || 0;
        return {
          ...item,
          igst_rate: val,
          tax_rate: String(Math.round((s + c + ig) * 100) / 100),
        };
      })
    );
  };
  const handleLgstChange = handleIgstChange;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending || isSubmittingRef.current) return;
    setClientError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const customerIdVal = String(formData.get("customer_id") ?? "");
    const orderNumberVal = String(formData.get("order_number") ?? "").trim();
    const orderDateVal = String(formData.get("order_date") ?? "").trim();

    if (!customerIdVal) {
      setClientError("Please select a customer.");
      return;
    }
    if (orderId && !orderNumberVal) {
      setClientError("Please provide an order number.");
      return;
    }
    if (!orderDateVal) {
      setClientError("Please specify an order date.");
      return;
    }
    if (items.length === 0) {
      setClientError("Please add at least one line item.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_id) {
        setClientError(`Please select a product for line item #${i + 1}.`);
        return;
      }
      const q = parseFloat(it.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        setClientError(`Quantity must be greater than 0 for item #${i + 1}.`);
        return;
      }
      const p = parseFloat(it.unit_price);
      if (!Number.isFinite(p) || p < 0) {
        setClientError(`Unit price cannot be negative for item #${i + 1}.`);
        return;
      }
      const d = it.discount_rate.trim() === "" ? 0 : parseFloat(it.discount_rate);
      if (!Number.isFinite(d) || d < 0 || d > 100) {
        setClientError(`Discount rate must be between 0% and 100% for item #${i + 1}.`);
        return;
      }
      const t = it.tax_rate.trim() === "" ? 0 : parseFloat(it.tax_rate);
      if (!Number.isFinite(t) || t < 0 || t > 100) {
        setClientError(`Tax rate must be between 0% and 100% for item #${i + 1}.`);
        return;
      }

      const sgst = it.sgst_rate.trim() === "" ? 0 : parseFloat(it.sgst_rate);
      if (!Number.isFinite(sgst) || sgst < 0 || sgst > 100) {
        setClientError(`SGST rate must be between 0% and 100% for item #${i + 1}.`);
        return;
      }
      const cgst = it.cgst_rate.trim() === "" ? 0 : parseFloat(it.cgst_rate);
      if (!Number.isFinite(cgst) || cgst < 0 || cgst > 100) {
        setClientError(`CGST rate must be between 0% and 100% for item #${i + 1}.`);
        return;
      }
      const lgst = it.igst_rate.trim() === "" ? 0 : parseFloat(it.igst_rate);
      if (!Number.isFinite(lgst) || lgst < 0 || lgst > 100) {
        setClientError(`LGST rate must be between 0% and 100% for item #${i + 1}.`);
        return;
      }

      // Mixed tax mode validation (prevent double-charging tax)
      if ((sgst > 0 || cgst > 0) && lgst > 0) {
        setClientError(`Line item #${i + 1}: Cannot apply both SGST/CGST and LGST to the same taxable amount as this would double-charge tax. Please use SGST+CGST for intra-state or LGST for inter-state.`);
        return;
      }

      // State conflict validation
      if (currentTaxType === "INTRA_STATE" && lgst > 0 && sgst === 0 && cgst === 0) {
        setClientError(`Line item #${i + 1}: The customer is intra-state (same state). Please use SGST and CGST instead of LGST.`);
        return;
      }
      if (currentTaxType === "INTER_STATE" && (sgst > 0 || cgst > 0) && lgst === 0) {
        setClientError(`Line item #${i + 1}: The customer is inter-state (cross-border). Please use LGST instead of SGST and CGST.`);
        return;
      }
    }

    const sanitizedItems = items.map((it) => ({
      ...it,
      quantity: it.quantity.trim(),
      unit_price: it.unit_price.trim(),
      discount_rate: it.discount_rate.trim() === "" ? "0" : it.discount_rate.trim(),
      tax_rate: it.tax_rate.trim() === "" ? "0" : it.tax_rate.trim(),
      sgst_rate: it.sgst_rate.trim() === "" ? "0" : it.sgst_rate.trim(),
      cgst_rate: it.cgst_rate.trim() === "" ? "0" : it.cgst_rate.trim(),
      igst_rate: it.igst_rate.trim() === "" ? "0" : it.igst_rate.trim(),
      lgst_rate: it.igst_rate.trim() === "" ? "0" : it.igst_rate.trim(),
    }));
    formData.set("items", JSON.stringify(sanitizedItems));
    formData.set("district", district ? getBaseDistrictName(district) : "");
    formData.set("place_of_supply", effectivePos);

    if (returnTo) {
      formData.set("return_to", returnTo);
    }

    isSubmittingRef.current = true;
    startTransition(() => {
      formAction(formData);
    });
  };

  const activeError =
    clientError ||
    (state?.error
      ? state.message || ERROR_MESSAGES[state.error] || `Error: ${state.error}`
      : null);

  const gstSummary = useMemo(
    () =>
      calculateOrderGst({
        items: items.map((it) => ({
          productId: it.product_id,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          discountRate: it.discount_rate,
          taxRate: it.tax_rate,
          sgstRate: it.sgst_rate,
          cgstRate: it.cgst_rate,
          igstRate: it.igst_rate,
        })),
        supplierState,
        supplierGstin,
        customerState: selectedCustomer?.state,
        customerGstin: selectedCustomer?.gst_number,
        placeOfSupply: effectivePos,
      }),
    [items, supplierState, supplierGstin, selectedCustomer, effectivePos]
  );

  const summary = {
    subtotal: gstSummary.subtotal,
    discount: gstSummary.discountAmount,
    taxable: gstSummary.taxableSubtotal,
    cgst: gstSummary.cgstAmount,
    sgst: gstSummary.sgstAmount,
    igst: gstSummary.igstAmount,
    tax: gstSummary.taxAmount,
    grandTotal: gstSummary.totalAmount,
    taxType: gstSummary.taxType,
  };

  const deliveryPreview = (() => {
    let hasItems = false;
    let missingCapacity = false;
    let totalOrdered = 0;
    let totalStock = 0;
    let totalRemainingToProduce = 0;
    let maxProdDays = 0;
    let overallEarliestDate: Date | null = null;
    let overallLatestDate: Date | null = null;
    let overallExpectedDate: Date | null = null;

    const isWd = (d: Date): boolean => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${day}`;
      if (calendarOverrides && typeof calendarOverrides[key] === "boolean") {
        return calendarOverrides[key];
      }
      const dow = d.getDay();
      if (workingDays) {
        const dowMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
        const k = dowMap[dow];
        if (typeof workingDays[k] === "boolean") return workingDays[k];
      }
      return dow >= 1 && dow <= 5;
    };

    const addWd = (startD: Date, count: number): Date => {
      const res = new Date(startD);
      if (count <= 0) {
        while (!isWd(res)) {
          res.setDate(res.getDate() + 1);
        }
        return res;
      }
      let added = 0;
      while (added < count) {
        res.setDate(res.getDate() + 1);
        if (isWd(res)) added++;
      }
      return res;
    };

    const parsedOrderDate = orderDate ? new Date(orderDate + "T00:00:00") : new Date();

    const lines: Array<{
      productName: string;
      unit: string;
      qty: number;
      availableStock: number;
      dailyCapacity: number;
      stockPortion: number;
      remainingToProduce: number;
      productionDays: number;
      deliveryMinDays: number;
      deliveryMaxDays: number;
      expectedTransitDays: number;
      predictedDeliveryDateStr: string | null;
      status: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_MISSING";
      isMultiDay: boolean;
      notes: string;
    }> = [];

    for (const item of items) {
      if (!item.product_id) continue;
      const qty = parseFloat(item.quantity) || 0;
      if (qty <= 0) continue;
      hasItems = true;

      const prod = products.find((p) => p.id === item.product_id);
      const prodName = prod?.name || "Product";
      const unit = prod?.unit || "units";
      const availableStock = Math.max(0, Number(prod?.available_stock) || 0);
      const dailyCap = Number(prod?.daily_capacity) || 0;
      const minTransit = Number(prod?.delivery_min_days) || 0;
      const maxTransit = Math.max(minTransit, Number(prod?.delivery_max_days) || 0);
      const expectedTransit = minTransit === maxTransit ? minTransit : Math.ceil((minTransit + maxTransit) / 2);

      totalOrdered += qty;
      const stockPortion = Math.min(qty, availableStock);
      const remainingToProduce = Math.max(0, Number((qty - stockPortion).toFixed(4)));
      totalStock += stockPortion;
      totalRemainingToProduce += remainingToProduce;

      let prodDays = 0;
      let status: "STOCK" | "PRODUCTION" | "PARTIAL" | "CAPACITY_MISSING" = "STOCK";
      let notes = "";
      let itemReadyDate: Date;
      let isMultiDay = false;

      if (remainingToProduce === 0) {
        status = "STOCK";
        itemReadyDate = parsedOrderDate;
        notes = `100% available in ready stock (${stockPortion} ${unit}). Dispatches immediately.`;
      } else if (dailyCap <= 0) {
        missingCapacity = true;
        status = "CAPACITY_MISSING";
        prodDays = 3;
        itemReadyDate = addWd(parsedOrderDate, prodDays);
        notes = `Daily capacity unconfigured (0). Provisional estimate using standard 3-day baseline.`;
      } else {
        prodDays = Math.ceil(remainingToProduce / dailyCap);
        if (remainingToProduce > dailyCap) {
          isMultiDay = true;
        }
        itemReadyDate = addWd(parsedOrderDate, prodDays);
        if (stockPortion > 0) {
          status = "PARTIAL";
          notes = `${stockPortion} ${unit} from ready stock, ${remainingToProduce} ${unit} to produce (${prodDays} working day${prodDays > 1 ? "s" : ""} @ ${dailyCap}/day).`;
        } else {
          status = "PRODUCTION";
          notes = `${remainingToProduce} ${unit} to produce (${prodDays} working day${prodDays > 1 ? "s" : ""} @ ${dailyCap}/day).`;
        }
      }

      if (prodDays > maxProdDays) maxProdDays = prodDays;

      const itemEarliest = addWd(itemReadyDate, minTransit);
      const itemLatest = addWd(itemReadyDate, maxTransit);
      const itemExpected = addWd(itemReadyDate, expectedTransit);

      if (!overallEarliestDate || itemEarliest > overallEarliestDate) overallEarliestDate = itemEarliest;
      if (!overallLatestDate || itemLatest > overallLatestDate) overallLatestDate = itemLatest;
      if (!overallExpectedDate || itemExpected > overallExpectedDate) overallExpectedDate = itemExpected;

      const formatDateShort = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      lines.push({
        productName: prodName,
        unit,
        qty,
        availableStock,
        dailyCapacity: dailyCap,
        stockPortion,
        remainingToProduce,
        productionDays: prodDays,
        deliveryMinDays: minTransit,
        deliveryMaxDays: maxTransit,
        expectedTransitDays: expectedTransit,
        predictedDeliveryDateStr: formatDateShort(itemExpected),
        status,
        isMultiDay,
        notes,
      });
    }

    const formatDateShort = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return {
      hasItems,
      missingCapacity,
      lines,
      totalOrdered,
      totalStock,
      totalRemainingToProduce,
      maxProdDays,
      predictedDeliveryDate: overallExpectedDate ? formatDateShort(overallExpectedDate) : null,
      earliestDeliveryDate: overallEarliestDate ? formatDateShort(overallEarliestDate) : null,
      latestDeliveryDate: overallLatestDate ? formatDateShort(overallLatestDate) : null,
      isProvisional: missingCapacity,
    };
  })();

  return (
    <form onSubmit={handleSubmit} className={isModal ? "flex flex-col h-full overflow-hidden" : "space-y-6"}>
      <div className={isModal ? "flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6" : "space-y-6"}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="customer_id" className="block text-sm font-semibold text-slate-700 mb-1">
              Customer <span className="text-rose-500">*</span>
            </label>
            <select
              id="customer_id"
              name="customer_id"
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company_name ? `(${c.company_name})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="order_number" className="block text-sm font-semibold text-slate-700">
                Order Number {orderId ? <span className="text-rose-500">*</span> : null}
              </label>
              {!orderId && (
                <span className="text-xs text-teal-700 font-medium bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  Auto-generated (e.g. ORD-000001)
                </span>
              )}
            </div>
            <input
              type="text"
              id="order_number"
              name="order_number"
              required={Boolean(orderId)}
              readOnly={Boolean(orderId)}
              maxLength={64}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px] ${
                orderId ? "bg-slate-100 text-slate-600 cursor-not-allowed" : "bg-white text-slate-900"
              }`}
              placeholder={orderId ? initialValues?.order_number : "Auto-generated on save (e.g. ORD-000001)"}
            />
          </div>

          <div>
            <label htmlFor="order_date" className="block text-sm font-semibold text-slate-700 mb-1">
              Order Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              id="order_date"
              name="order_date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-semibold text-slate-700 mb-1">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div>
            <label htmlFor="order_district_select_btn" className="block text-sm font-semibold text-slate-700 mb-1">
              Customer District
            </label>
            <OrderDistrictSelect
              value={district}
              onChange={handleDistrictChange}
              defaultStateHint={selectedCustomer?.state || supplierState}
            />
          </div>

          {/* GST Rule & Tax Regime Banner */}
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-xs sm:text-sm">GST Tax Type:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs shadow-2xs ${
                    currentTaxType === "INTRA_STATE"
                      ? "bg-teal-100 text-teal-900 border border-teal-300"
                      : "bg-indigo-100 text-indigo-900 border border-indigo-300"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {currentTaxType === "INTRA_STATE" ? "Intra-State (CGST 50% + SGST 50%)" : "Inter-State (IGST 100%)"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Place of Supply: <strong className="text-slate-800">{effectivePos}</strong></span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-slate-600">
              <div>
                <span className="text-slate-400 block text-[11px]">Business Registered State:</span>
                <span className="font-semibold text-slate-800">{supplierState}</span>
                {supplierGstin && <span className="block font-mono text-[10px] text-slate-500 uppercase">GSTIN: {supplierGstin}</span>}
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Customer Location:</span>
                <span className="font-semibold text-slate-800">
                  {district ? `${district} (${effectivePos})` : effectivePos}
                </span>
                {selectedCustomer?.gst_number ? (
                  <span className="block font-mono text-[10px] text-teal-700 uppercase">GSTIN: {selectedCustomer.gst_number}</span>
                ) : (
                  <span className="block text-[10px] text-slate-400 italic">Unregistered / Consumer</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Tax Applicable:</span>
                <span className="font-semibold text-slate-800">
                  {currentTaxType === "INTRA_STATE"
                    ? "CGST + SGST (Split Equally)"
                    : "IGST (Full Applicable Rate)"}
                </span>
                <span className="block text-[10px] text-slate-500">
                  {currentTaxType === "INTRA_STATE" ? "Same state transaction" : "Cross-border interstate supply"}
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="notes" className="block text-sm font-semibold text-slate-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              maxLength={2000}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
              placeholder="Add delivery instructions or specifications..."
            />
          </div>
        </div>

      <div className="border-t border-slate-200 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Order Items</h3>
            <p className="text-xs text-slate-500">Specify products, quantities, prices, discounts, and taxes</p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-3.5 py-2 text-sm font-semibold text-[#0F766E] hover:bg-teal-100 min-h-[44px] transition active:scale-98 shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Item</span>
          </button>
        </div>

        {/* MOBILE STACKED CARDS (< 768px) */}
        <div className="md:hidden space-y-3">
          {items.map((item, index) => {
            const q = parseFloat(item.quantity) || 0;
            const p = parseFloat(item.unit_price) || 0;
            const d = parseFloat(item.discount_rate) || 0;
            const t = parseFloat(item.tax_rate) || 0;
            const sub = q * p;
            const disc = sub * (d / 100);
            const tax = (sub - disc) * (t / 100);
            const lineTotal = sub - disc + tax;

            return (
              <div key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Line Item #{index + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition cursor-pointer"
                      aria-label={`Remove line item ${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name={`items[${index}][product_id]`}
                    value={item.product_id}
                    onChange={(e) => handleProductChange(index, e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                  >
                    <option value="">Select Product</option>
                    {products.map((prod) => {
                      const avail = prod.available_stock != null ? Number(prod.available_stock) : 0;
                      return (
                        <option key={prod.id} value={prod.id}>
                          {prod.sku ? `${prod.sku} - ` : ""}{prod.name} ({prod.unit}) — Ready Stock: {avail.toLocaleString("en-IN")}
                        </option>
                      );
                    })}
                  </select>
                  {(() => {
                    const selectedProd = products.find((p) => p.id === item.product_id);
                    if (!selectedProd) return null;
                    const avail = selectedProd.available_stock != null ? Number(selectedProd.available_stock) : 0;
                    const enteredQty = parseFloat(item.quantity) || 0;
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-500 font-medium">Ready Stock:</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            avail > 0
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {avail > 0 ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Clock className="w-3 h-3 text-amber-600" />
                          )}
                          {avail.toLocaleString("en-IN")} {selectedProd.unit} ready
                        </span>
                        {enteredQty > 0 && avail > 0 && enteredQty > avail && (
                          <span className="text-[10px] text-amber-700 font-medium">
                            ({avail} reserved, {(enteredQty - avail).toLocaleString("en-IN")} produced)
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][quantity]`}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      required
                      step="0.001"
                      min="0.001"
                      placeholder="1"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unit Price (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][unit_price]`}
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                      required
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Disc %, SGST %, CGST %, LGST % inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Disc %
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][discount_rate]`}
                      value={item.discount_rate}
                      onChange={(e) => updateItem(index, "discount_rate", e.target.value)}
                      required
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      SGST %
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][sgst_rate]`}
                      value={item.sgst_rate}
                      onChange={(e) => handleSgstChange(index, e.target.value)}
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      CGST %
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][cgst_rate]`}
                      value={item.cgst_rate}
                      onChange={(e) => handleCgstChange(index, e.target.value)}
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      LGST %
                    </label>
                    <input
                      type="number"
                      name={`items[${index}][igst_rate]`}
                      value={item.igst_rate}
                      onChange={(e) => handleLgstChange(index, e.target.value)}
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                    />
                    <input type="hidden" name={`items[${index}][tax_rate]`} value={item.tax_rate} />
                  </div>
                </div>

                {(() => {
                  const s = parseFloat(item.sgst_rate) || 0;
                  const c = parseFloat(item.cgst_rate) || 0;
                  const lg = parseFloat(item.igst_rate) || 0;
                  if ((s > 0 || c > 0) && lg > 0) {
                    return (
                      <div className="flex items-center gap-1 text-[11px] text-rose-600 font-medium pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Mixed tax mode: Cannot apply both SGST/CGST and LGST to the same item (would double-charge tax).</span>
                      </div>
                    );
                  }
                  if (currentTaxType === "INTRA_STATE" && lg > 0 && s === 0 && c === 0) {
                    return (
                      <div className="flex items-center gap-1 text-[11px] text-amber-700 font-medium pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Intra-state order: SGST and CGST expected instead of LGST.</span>
                      </div>
                    );
                  }
                  if (currentTaxType === "INTER_STATE" && (s > 0 || c > 0) && lg === 0) {
                    return (
                      <div className="flex items-center gap-1 text-[11px] text-amber-700 font-medium pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Inter-state order: LGST expected instead of SGST and CGST.</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {(() => {
                  const itemGst = calculateItemGst({
                    productId: item.product_id,
                    quantity: Number(item.quantity) || 0,
                    unitPrice: Number(item.unit_price) || 0,
                    discountRate: Number(item.discount_rate) || 0,
                    gstRate: Number(item.tax_rate) || 0,
                    sgstRate: item.sgst_rate,
                    cgstRate: item.cgst_rate,
                    igstRate: item.igst_rate,
                    taxType: currentTaxType,
                  });
                  return (
                    <div className="pt-2 border-t border-slate-100 text-xs space-y-1">
                      <div className="flex justify-between text-slate-500">
                        <span>Taxable Amount:</span>
                        <span className="font-semibold font-mono text-slate-700">₹{itemGst.taxableAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>GST ({itemGst.taxRate}%):</span>
                        <span className="font-semibold text-slate-700">
                          {itemGst.taxRate === 0 ? (
                            "0% (Exempt)"
                          ) : itemGst.igstRate > 0 && itemGst.sgstRate === 0 && itemGst.cgstRate === 0 ? (
                            `LGST (${itemGst.igstRate}%): ₹${itemGst.igstAmount.toFixed(2)}`
                          ) : (
                            `CGST (${itemGst.cgstRate}%): ₹${itemGst.cgstAmount.toFixed(2)} + SGST (${itemGst.sgstRate}%): ₹${itemGst.sgstAmount.toFixed(2)}`
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                        <span className="text-slate-500 font-medium">Line Total:</span>
                        <span className="font-bold text-sm text-[#0F766E] font-mono">
                          ₹{itemGst.lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* DESKTOP/TABLET TABLE VIEW (>= 768px) */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200" role="table">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[200px]">Product</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">Qty</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">Unit Price (₹)</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">Disc %</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">SGST %</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">CGST %</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">LGST %</th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">Taxable (₹)</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-36">GST Breakdown</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">Line Total</th>
                <th className="px-2 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-10"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {items.map((item, index) => {
                const itemGst = calculateItemGst({
                  productId: item.product_id,
                  quantity: Number(item.quantity) || 0,
                  unitPrice: Number(item.unit_price) || 0,
                  discountRate: Number(item.discount_rate) || 0,
                  gstRate: Number(item.tax_rate) || 0,
                  sgstRate: item.sgst_rate,
                  cgstRate: item.cgst_rate,
                  igstRate: item.igst_rate,
                  taxType: currentTaxType,
                });

                const numS = parseFloat(item.sgst_rate) || 0;
                const numC = parseFloat(item.cgst_rate) || 0;
                const numIg = parseFloat(item.igst_rate) || 0;
                const hasMixedTax = (numS > 0 || numC > 0) && numIg > 0;
                const hasStateMismatch =
                  (currentTaxType === "INTRA_STATE" && numIg > 0 && numS === 0 && numC === 0) ||
                  (currentTaxType === "INTER_STATE" && (numS > 0 || numC > 0) && numIg === 0);

                return (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5">
                      <select
                        name={`items[${index}][product_id]`}
                        value={item.product_id}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        required
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      >
                        <option value="">Select Product</option>
                        {products.map((prod) => {
                          const avail = prod.available_stock != null ? Number(prod.available_stock) : 0;
                          return (
                            <option key={prod.id} value={prod.id}>
                              {prod.sku ? `${prod.sku} - ` : ""}{prod.name} ({prod.unit}) — GST: {Number(prod.tax_rate)}%
                            </option>
                          );
                        })}
                      </select>
                      {(() => {
                        const selectedProd = products.find((p) => p.id === item.product_id);
                        if (!selectedProd) return null;
                        const avail = selectedProd.available_stock != null ? Number(selectedProd.available_stock) : 0;
                        const enteredQty = parseFloat(item.quantity) || 0;
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                avail > 0
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {avail > 0 ? (
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              ) : (
                                <Clock className="w-2.5 h-2.5 text-amber-600" />
                              )}
                              Ready: {avail.toLocaleString("en-IN")} {selectedProd.unit}
                            </span>
                            {enteredQty > 0 && avail > 0 && enteredQty > avail && (
                              <span className="text-[10px] text-amber-700 font-medium">
                                ({avail} reserved, {(enteredQty - avail).toLocaleString("en-IN")} to produce)
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][quantity]`}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        required
                        step="0.001"
                        min="0.001"
                        placeholder="1"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][unit_price]`}
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                        required
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][discount_rate]`}
                        value={item.discount_rate}
                        onChange={(e) => updateItem(index, "discount_rate", e.target.value)}
                        required
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                    </td>
                    {/* SGST % */}
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][sgst_rate]`}
                        value={item.sgst_rate}
                        onChange={(e) => handleSgstChange(index, e.target.value)}
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                    </td>
                    {/* CGST % */}
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][cgst_rate]`}
                        value={item.cgst_rate}
                        onChange={(e) => handleCgstChange(index, e.target.value)}
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                    </td>
                    {/* LGST % */}
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        name={`items[${index}][igst_rate]`}
                        value={item.igst_rate}
                        onChange={(e) => handleLgstChange(index, e.target.value)}
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-2xs focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] min-h-[44px]"
                      />
                      <input type="hidden" name={`items[${index}][tax_rate]`} value={item.tax_rate} />
                    </td>
                    <td className="px-2 py-2.5 text-xs font-mono font-medium text-slate-700">
                      ₹{itemGst.taxableAmount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {itemGst.taxRate === 0 ? (
                        <span className="text-slate-400 font-medium">0% (Exempt)</span>
                      ) : itemGst.igstRate > 0 && itemGst.sgstRate === 0 && itemGst.cgstRate === 0 ? (
                        <div className="text-[11px] text-indigo-800 font-medium">
                          LGST ({itemGst.igstRate}%): <span className="font-mono font-semibold">₹{itemGst.igstAmount.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="space-y-0.5 text-[11px] leading-tight text-teal-800">
                          {itemGst.cgstRate > 0 && <div>CGST ({itemGst.cgstRate}%): <span className="font-mono font-semibold">₹{itemGst.cgstAmount.toFixed(2)}</span></div>}
                          {itemGst.sgstRate > 0 && <div>SGST ({itemGst.sgstRate}%): <span className="font-mono font-semibold">₹{itemGst.sgstAmount.toFixed(2)}</span></div>}
                          {itemGst.cgstRate === 0 && itemGst.sgstRate === 0 && (
                            <span className="text-slate-400 font-medium">0%</span>
                          )}
                        </div>
                      )}
                      {hasMixedTax && (
                        <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">Mixed tax error!</span>
                      )}
                      {!hasMixedTax && hasStateMismatch && (
                        <span className="block text-[10px] text-amber-700 font-medium mt-0.5">State mismatch</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-slate-900 font-mono">
                      ₹{itemGst.lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center transition cursor-pointer"
                          aria-label={`Remove line item ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <p className="text-center text-slate-500 py-8">No items added yet. Click &ldquo;Add Item&rdquo; to start.</p>
        )}

        {/* Financial Summary Card with Full GST Breakdown */}
        {items.length > 0 && (
          <div className="flex justify-end pt-4">
            <div className="w-full sm:max-w-md rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-3 text-sm shadow-2xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Gross):</span>
                <span className="font-semibold text-slate-900 font-mono">
                  ₹{summary.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {summary.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span className="font-semibold font-mono">
                    -₹{summary.discount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-800 font-medium border-t border-slate-200 pt-2">
                <span>Taxable Amount:</span>
                <span className="font-semibold font-mono">
                  ₹{summary.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* GST Breakdown Box */}
              <div className="rounded-lg bg-white border border-slate-200/80 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="font-semibold text-slate-700">Tax Type:</span>
                  <span className="font-bold text-teal-800">
                    {summary.taxType === "INTRA_STATE" ? "Intra-State (CGST + SGST)" : "Inter-State (LGST)"}
                  </span>
                </div>
                {summary.cgst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Central GST (CGST):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      +₹{summary.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {summary.sgst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>State GST (SGST):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      +₹{summary.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {summary.igst > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>LGST (Inter-State):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      +₹{summary.igst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {summary.cgst === 0 && summary.sgst === 0 && summary.igst === 0 && (
                  <div className="flex justify-between text-slate-400 italic">
                    <span>Taxes:</span>
                    <span>₹0.00 (Exempt / 0%)</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100 font-medium">
                  <span>Total GST Amount:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    +₹{summary.tax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                <span>Grand Total:</span>
                <span className="text-[#0F766E] font-mono text-lg font-bold">
                  ₹{summary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Delivery & Capacity Scheduling Preview */}
      {deliveryPreview.hasItems && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Truck className="w-4 h-4 text-[#0F766E]" />
              <span>Estimated Delivery & Capacity Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1.5 ${
                  deliveryPreview.isProvisional
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-teal-100 text-[#0F766E] border border-teal-300"
                }`}
              >
                {deliveryPreview.isProvisional ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Provisional Estimate
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    Predicted Delivery Date
                  </>
                )}
              </span>
            </div>
          </div>

          {/* 5 KEY REQUIRED METRICS DISPLAY */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Available Ready Stock
              </span>
              <p className="mt-1 text-base font-bold text-slate-900">
                {deliveryPreview.totalStock.toLocaleString("en-IN")}{" "}
                <span className="text-xs font-normal text-slate-500">units</span>
              </p>
              <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Usable physical stock</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Remaining to Produce
              </span>
              <p className="mt-1 text-base font-bold text-slate-900">
                {deliveryPreview.totalRemainingToProduce.toLocaleString("en-IN")}{" "}
                <span className="text-xs font-normal text-slate-500">units</span>
              </p>
              <p className="text-[10px] text-blue-600 font-medium mt-0.5">Order qty minus ready stock</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Daily Capacity
              </span>
              <p className="mt-1 text-base font-bold text-slate-900">
                {deliveryPreview.lines.length === 1
                  ? `${deliveryPreview.lines[0].dailyCapacity.toLocaleString("en-IN")}`
                  : "Per Item"}
                <span className="text-xs font-normal text-slate-500"> /day</span>
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">Max permitted daily output</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Production Duration
              </span>
              <p className="mt-1 text-base font-bold text-slate-900">
                {deliveryPreview.maxProdDays}{" "}
                <span className="text-xs font-normal text-slate-500">
                  working day{deliveryPreview.maxProdDays !== 1 ? "s" : ""}
                </span>
              </p>
              <p className="text-[10px] text-indigo-600 font-medium mt-0.5">Estimated manufacturing span</p>
            </div>

            <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 col-span-2 sm:col-span-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
                {deliveryPreview.isProvisional ? "Provisional Date" : "Predicted Delivery Date"}
              </span>
              <p className="mt-1 text-base font-bold text-teal-950">
                {deliveryPreview.predictedDeliveryDate || "Pending Calculation"}
              </p>
              {deliveryPreview.earliestDeliveryDate &&
                deliveryPreview.latestDeliveryDate &&
                deliveryPreview.earliestDeliveryDate !== deliveryPreview.latestDeliveryDate && (
                  <p className="text-[10px] text-teal-700 font-medium mt-0.5">
                    Range: {deliveryPreview.earliestDeliveryDate} – {deliveryPreview.latestDeliveryDate}
                  </p>
                )}
            </div>
          </div>

          {/* PROVISIONAL EXPLANATION IF MISSING CAPACITY */}
          {deliveryPreview.missingCapacity && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Provisional Estimate: Unconfigured Production Capacity</p>
                <p className="text-amber-800 mt-0.5">
                  One or more products requiring production have daily capacity set to 0. A provisional estimate has been generated based on standard lead times. For a guaranteed date, configure product daily capacity.
                </p>
              </div>
            </div>
          )}

          {/* MULTI-DAY NOTIFICATION WITHOUT ERROR BLOCKER */}
          {deliveryPreview.lines.some((l) => l.isMultiDay) && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Multi-Day Production Batch</p>
                <p className="text-sky-800 mt-0.5">
                  Order quantity exceeds single-day production capacity. Production is estimated across consecutive working days without exceeding permitted daily output. Actual production allocation follows FIFO queue upon confirmation.
                </p>
              </div>
            </div>
          )}

          {/* ITEM-BY-ITEM DETAILED TABLE */}
          <div className="space-y-2">
            {deliveryPreview.lines.map((line, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{line.productName}</span>
                    <span className="text-slate-500 font-medium">
                      ({line.qty.toLocaleString("en-IN")} {line.unit})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{line.notes}</p>
                </div>

                <div className="flex items-center gap-2.5">
                  {line.status === "STOCK" && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> In-Stock Fulfillment
                    </span>
                  )}
                  {line.status === "PARTIAL" && (
                    <span className="inline-flex items-center gap-1 text-indigo-700 font-medium bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      <Clock className="w-3 h-3" /> Partial Stock + Production
                    </span>
                  )}
                  {line.status === "PRODUCTION" && (
                    <span className="inline-flex items-center gap-1 text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      <Clock className="w-3 h-3" /> Manufacturing ({line.productionDays}d)
                    </span>
                  )}
                  {line.status === "CAPACITY_MISSING" && (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      <AlertTriangle className="w-3 h-3" /> Provisional (No Capacity)
                    </span>
                  )}

                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase">Predicted Delivery</span>
                    <span className="text-xs font-bold text-slate-800">
                      {line.predictedDeliveryDateStr || "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 italic">
            * Draft orders do not reserve inventory stock or booking slots. Showing a predicted date does not schedule the order. Stock reservation and production queue allocation will be committed upon order confirmation.
          </p>
        </div>
      )}

      {/* Actionable Error Alert */}
      {activeError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3 shadow-2xs" role="alert">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-rose-900">{orderId ? "Unable to Update Order" : "Unable to Create Order"}</p>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed break-words">{activeError}</p>
            {state?.missingPermission && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-rose-200 text-xs text-rose-900 space-y-1.5 shadow-2xs">
                <div>
                  <span className="font-bold">Required Permission:</span>{" "}
                  <code className="font-mono bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-semibold text-[11px]">
                    {state.missingPermission}
                  </code>
                </div>
                <p className="text-rose-700">
                  <span className="font-semibold">Required Administrator Action:</span> An Administrator must log in to the workspace and navigate to <span className="font-semibold">Admin &gt; User Management</span> to grant the <code className="font-mono text-rose-900">&quot;{state.missingPermission}&quot;</code> permission to this account.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      </div>

      {/* Action Buttons */}
      <div className={isModal ? "shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 bg-slate-50/95 backdrop-blur-sm z-10" : "flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-slate-200"}>
        <button
          type="button"
          onClick={handleCancelOrClose}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 min-h-[44px] transition text-center cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-[#0F766E] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0D655E] focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition min-h-[44px] cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span>{orderId ? "Updating Order..." : "Creating Order..."}</span>
            </>
          ) : (
            orderId ? "Update Order" : "Create Order"
          )}
        </button>
      </div>
    </form>
  );
}