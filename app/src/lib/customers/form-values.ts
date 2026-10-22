import type { Customer, CustomerAddress, CustomerFormValues } from "@/types/customer";

export const EMPTY_CUSTOMER_FORM_VALUES: CustomerFormValues = {
  name: "",
  company_name: "",
  phone: "",
  email: "",
  gst_number: "",
  payment_terms: "",
  credit_limit: "0",
  address_id: "",
  address: "",
  city: "",
  district: "",
  state: "",
  postal_code: "",
};

export function customerToFormValues(
  customer?: Customer,
  address?: CustomerAddress,
): CustomerFormValues {
  if (!customer) return { ...EMPTY_CUSTOMER_FORM_VALUES };

  return {
    name: customer.name,
    company_name: customer.company_name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    gst_number: customer.gst_number ?? "",
    payment_terms: customer.payment_terms ?? "",
    credit_limit: String(customer.credit_limit),
    address_id: address?.id ?? "",
    address: address?.address ?? "",
    city: address?.city ?? "",
    district: address?.district ?? "",
    state: address?.state ?? "",
    postal_code: address?.postal_code ?? "",
  };
}