export function validateAndNormalizeVehicleNumber(val: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = val ? val.trim().toUpperCase().replace(/\s+/g, " ") : "";
  if (!trimmed) {
    return {
      isValid: false,
      normalized: "",
      error: "Vehicle registration number is required.",
    };
  }

  // Remove spaces and hyphens for regex checking
  const clean = trimmed.replace(/[- ]/g, "");
  // Standard Indian vehicle registration format:
  // e.g., MH12AB1234, DL1CAA1111, KA01F1234, GJ01AA0001, HR26DQ5551
  const indianFormatRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

  if (!indianFormatRegex.test(clean)) {
    // Also allow general commercial/industrial fleet identifiers (5-16 alphanumeric chars)
    const generalRegex = /^[A-Z0-9- ]{5,16}$/;
    if (!generalRegex.test(trimmed)) {
      return {
        isValid: false,
        normalized: trimmed,
        error: "Invalid vehicle registration format. Expected Indian format like MH12AB1234, MH-12-AB-1234, or valid registration.",
      };
    }
  }

  return { isValid: true, normalized: trimmed };
}

export function validateDriverMobile(val?: string | null): {
  isValid: boolean;
  normalized: string | null;
  error?: string;
} {
  if (!val || !val.trim()) {
    return { isValid: true, normalized: null };
  }

  const trimmed = val.trim().replace(/[- \(\)]/g, "");
  // Match 10-digit Indian mobile number with optional +91 or 0 prefix
  const match = trimmed.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  if (!match) {
    return {
      isValid: false,
      normalized: val.trim(),
      error: "Driver mobile number must be a valid 10-digit Indian phone number starting with 6, 7, 8, or 9.",
    };
  }

  return { isValid: true, normalized: match[1] };
}

/**
 * Strict validation for required Driver Name.
 * Rejects empty or whitespace-only values, trims leading/trailing whitespace.
 */
export function validateDriverName(val?: string | null): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = (val ?? "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalized: "",
      error: "Driver name is required.",
    };
  }
  if (trimmed.length < 2) {
    return {
      isValid: false,
      normalized: trimmed,
      error: "Driver name must be at least 2 characters.",
    };
  }
  if (trimmed.length > 100) {
    return {
      isValid: false,
      normalized: trimmed,
      error: "Driver name cannot exceed 100 characters.",
    };
  }

  return { isValid: true, normalized: trimmed };
}

/**
 * Strict validation for required Driver Mobile Number.
 * Validates 10-digit Indian mobile format (starting with 6, 7, 8, or 9),
 * allows optional +91, 91, or 0 prefixes, and normalizes consistently to 10 digits.
 */
export function validateRequiredDriverMobile(val?: string | null): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = (val ?? "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalized: "",
      error: "Driver mobile number is required.",
    };
  }

  const clean = trimmed.replace(/[- \(\)]/g, "");
  const match = clean.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  if (!match) {
    return {
      isValid: false,
      normalized: trimmed,
      error: "Driver mobile number must be a valid 10-digit Indian phone number starting with 6, 7, 8, or 9 (e.g., 9876543210 or +919876543210).",
    };
  }

  return { isValid: true, normalized: match[1] };
}

export function validateInvoiceNumber(val?: string | null): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = val ? val.trim() : "";
  if (!trimmed) {
    return {
      isValid: false,
      normalized: "",
      error: "Invoice number is required.",
    };
  }

  // Accept letters, numbers, hyphens, slashes, and mixed formats (e.g. SAN/26-27/154)
  const invoiceRegex = /^[A-Za-z0-9\/\-_.\s]{1,64}$/;
  if (!invoiceRegex.test(trimmed)) {
    return {
      isValid: false,
      normalized: trimmed,
      error: "Invalid invoice number format. Allowed characters: letters, numbers, hyphens, and slashes.",
    };
  }

  return { isValid: true, normalized: trimmed };
}
