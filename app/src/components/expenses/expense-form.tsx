"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseStatus } from "@/types/expense";
import { EXPENSE_STATUS_LABELS } from "@/types/expense";
import { createExpense, updateExpense } from "@/lib/expenses/actions";
import { AlertCircle, Loader2 } from "lucide-react";

interface ExpenseFormProps {
  initialData?: {
    id: string;
    category: string;
    amount: string | number;
    expense_date: string;
    description: string | null;
    reference: string | null;
    status: ExpenseStatus;
  };
  isEditing?: boolean;
  categories: string[];
  onSubmit?: (data: {
    category: string;
    amount: string;
    expense_date: string;
    description: string;
    reference: string;
    status: ExpenseStatus;
  }) => Promise<void>;
  onCancel?: () => void;
}

interface FormErrors {
  category?: string;
  amount?: string;
  expense_date?: string;
}

export function ExpenseForm({
  initialData,
  isEditing = false,
  categories,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const router = useRouter();

  const [isCustomCategory, setIsCustomCategory] = useState(
    Boolean(initialData?.category && !categories.includes(initialData.category))
  );
  const [customCategory, setCustomCategory] = useState(
    initialData?.category && !categories.includes(initialData.category)
      ? initialData.category
      : ""
  );

  const [formData, setFormData] = useState({
    category: initialData?.category || "",
    amount: initialData?.amount ?? "",
    expense_date: initialData?.expense_date || new Date().toISOString().split("T")[0],
    description: initialData?.description || "",
    reference: initialData?.reference || "",
    status: initialData?.status || "POSTED",
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFormErrors((prev) => ({ ...prev, category: undefined }));
    if (val === "__new__") {
      setIsCustomCategory(true);
      setFormData((prev) => ({ ...prev, category: customCategory }));
    } else {
      setIsCustomCategory(false);
      setFormData((prev) => ({ ...prev, category: val }));
    }
  };

  const handleCustomCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomCategory(val);
    setFormData((prev) => ({ ...prev, category: val }));
    if (val.trim()) {
      setFormErrors((prev) => ({ ...prev, category: undefined }));
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    const effectiveCategory = (isCustomCategory ? customCategory : formData.category).trim();

    if (!effectiveCategory) {
      errors.category = "Category is required.";
    }

    const numAmount = parseFloat(String(formData.amount));
    if (formData.amount === "" || isNaN(numAmount) || numAmount <= 0) {
      errors.amount = "Please enter a valid amount greater than ₹0.00.";
    }

    if (!formData.expense_date) {
      errors.expense_date = "Expense date is required.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) {
      return;
    }

    const effectiveCategory = (isCustomCategory ? customCategory : formData.category).trim();
    const numAmount = parseFloat(String(formData.amount));

    setIsSubmitting(true);

    try {
      const payload = {
        category: effectiveCategory,
        amount: String(numAmount),
        expense_date: formData.expense_date,
        description: formData.description.trim(),
        reference: formData.reference.trim(),
        status: formData.status as ExpenseStatus,
      };

      if (onSubmit) {
        await onSubmit(payload);
      } else if (isEditing && initialData?.id) {
        await updateExpense({
          expense_id: initialData.id,
          ...payload,
        });
        router.push(`/expenses/${initialData.id}?notice=expense_updated`);
        router.refresh();
      } else {
        await createExpense(payload);
        router.push("/expenses?notice=expense_created");
        router.refresh();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else if (isEditing && initialData?.id) {
      router.push(`/expenses/${initialData.id}`);
    } else {
      router.push("/expenses");
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {submitError && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{submitError}</div>
        </div>
      )}

      {/* Basic Voucher Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Voucher Information
        </h3>
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={isCustomCategory ? "__new__" : formData.category}
              onChange={handleCategorySelectChange}
              className={`w-full rounded-sm border p-3 text-sm transition focus:outline-none focus:ring-1 ${
                formErrors.category
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50/20"
                  : "border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] bg-white"
              }`}
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="__new__">+ Add new category...</option>
            </select>

            {isCustomCategory && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customCategory}
                  onChange={handleCustomCategoryChange}
                  placeholder="Enter new category name"
                  className={`flex-1 rounded-sm border p-2.5 text-sm transition focus:outline-none focus:ring-1 ${
                    formErrors.category
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)]"
                  }`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false);
                    setFormData((prev) => ({ ...prev, category: "" }));
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {formErrors.category && (
              <p className="mt-1.5 text-xs text-red-600 font-medium">{formErrors.category}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Amount (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-500 font-medium text-sm">
                ₹
              </span>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={handleChange}
                placeholder="0.00"
                className={`w-full rounded-sm border pl-8 pr-3 py-3 text-sm transition focus:outline-none focus:ring-1 ${
                  formErrors.amount
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50/20"
                    : "border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] bg-white"
                }`}
              />
            </div>
            {formErrors.amount && (
              <p className="mt-1.5 text-xs text-red-600 font-medium">{formErrors.amount}</p>
            )}
          </div>

          {/* Expense Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Expense Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="expense_date"
              value={formData.expense_date}
              onChange={handleChange}
              className={`w-full rounded-sm border p-3 text-sm transition focus:outline-none focus:ring-1 ${
                formErrors.expense_date
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50/20"
                  : "border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] bg-white"
              }`}
            />
            {formErrors.expense_date && (
              <p className="mt-1.5 text-xs text-red-600 font-medium">{formErrors.expense_date}</p>
            )}
          </div>

          {/* Reference / Voucher # */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Reference / Voucher #
            </label>
            <input
              type="text"
              name="reference"
              value={formData.reference}
              onChange={handleChange}
              placeholder="e.g. INV-8921, Receipt #, Bill no."
              className="w-full rounded-sm border border-gray-300 p-3 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      {/* Description & Additional Info */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
          Details & Justification
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Description / Purpose
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Add operational details, payment method, or vendor notes..."
            className="w-full rounded-sm border border-gray-300 p-3 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition"
          />
        </div>

        {isEditing && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full sm:w-1/2 rounded-sm border border-gray-300 p-3 text-sm bg-white focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none transition"
            >
              {(["DRAFT", "POSTED", "VOIDED"] as ExpenseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EXPENSE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="rounded-sm border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition shadow-sm min-w-[130px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : isEditing ? (
            "Update Expense"
          ) : (
            "Save Expense"
          )}
        </button>
      </div>
    </form>
  );
}