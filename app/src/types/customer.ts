export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  payment_terms: string | null;
  credit_limit: string | number;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  address_type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  district: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerFormValues {
  name: string;
  company_name: string;
  phone: string;
  email: string;
  gst_number: string;
  payment_terms: string;
  credit_limit: string;
  address_id: string;
  address: string;
  city: string;
  district: string;
  state: string;
  postal_code: string;
}