-- Migration: Customer Outstanding Report & Enhanced Customer Ledger
-- Implements Step 4: Integrate Customer Opening Balances into Customer Ledger and Outstanding Reports

-- 1. Create or replace public.get_customer_outstanding_report
CREATE OR REPLACE FUNCTION public.get_customer_outstanding_report(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_min_due NUMERIC DEFAULT NULL,
  p_limit INTEGER DEFAULT 10000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  credit_limit NUMERIC,
  payment_terms TEXT,
  opening_balance NUMERIC,
  opening_balance_type TEXT,
  period_sales NUMERIC,
  period_payments NUMERIC,
  period_credits_adjustments NUMERIC,
  period_debits_adjustments NUMERIC,
  closing_balance NUMERIC,
  closing_balance_type TEXT,
  closing_receivable NUMERIC,
  closing_advance NUMERIC,
  last_payment_date DATE,
  last_payment_amount NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'customers.view') THEN
      RAISE EXCEPTION 'FORBIDDEN: customers.view' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH target_customers AS (
    SELECT 
      c.id AS c_id,
      c.name::text AS c_name,
      c.company_name::text AS c_company,
      c.phone::text AS c_phone,
      c.email::text AS c_email,
      COALESCE(c.credit_limit, 0) AS c_credit_limit,
      c.payment_terms::text AS c_payment_terms
    FROM public.customers c
    WHERE c.business_id = p_business_id
      AND c.status = 'ACTIVE'
      AND (p_customer_id IS NULL OR c.id = p_customer_id)
  ),
  customer_latest_cob AS (
    -- Latest opening balance configured on or before p_start_date (or all-time if p_start_date is NULL)
    SELECT DISTINCT ON (cob.customer_id)
      cob.customer_id,
      cob.amount,
      cob.balance_type,
      cob.as_on_date,
      CASE WHEN cob.balance_type = 'RECEIVABLE' THEN cob.amount ELSE -cob.amount END AS signed_amount
    FROM public.customer_opening_balances cob
    WHERE cob.business_id = p_business_id
      AND (p_start_date IS NULL OR cob.as_on_date <= p_start_date)
    ORDER BY cob.customer_id, cob.as_on_date DESC, cob.created_at DESC
  ),
  customer_pre_tx AS (
    -- Sum of transactions strictly prior to p_start_date that are NOT already captured by the opening balance cutoff
    SELECT 
      cl.customer_id,
      COALESCE(SUM(cl.debit), 0) - COALESCE(SUM(cl.credit), 0) AS pre_net
    FROM public.customer_ledger cl
    LEFT JOIN customer_latest_cob cob ON cob.customer_id = cl.customer_id
    WHERE cl.business_id = p_business_id
      AND (
        -- If p_start_date is given, transactions must be before p_start_date
        p_start_date IS NOT NULL AND cl.entry_date < p_start_date
        -- And if opening balance cutoff exists, strictly after that cutoff date
        AND (cob.as_on_date IS NULL OR cl.entry_date > cob.as_on_date)
      )
    GROUP BY cl.customer_id
  ),
  customer_period_tx AS (
    -- Transactions strictly within the period
    SELECT 
      cl.customer_id,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END), 0) AS period_sales,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'DEBIT_NOTE' THEN cl.debit ELSE 0 END), 0) AS period_debits_adj,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'PAYMENT' THEN cl.credit ELSE 0 END), 0) AS period_payments,
      COALESCE(SUM(CASE WHEN cl.entry_type IN ('CREDIT_NOTE', 'ADJUSTMENT') THEN cl.credit ELSE 0 END), 0) AS period_credits_adj
    FROM public.customer_ledger cl
    LEFT JOIN customer_latest_cob cob ON cob.customer_id = cl.customer_id
    WHERE cl.business_id = p_business_id
      AND (p_start_date IS NULL OR cl.entry_date >= p_start_date)
      AND (p_end_date IS NULL OR cl.entry_date <= p_end_date)
      AND (p_start_date IS NOT NULL OR cob.as_on_date IS NULL OR cl.entry_date > cob.as_on_date)
    GROUP BY cl.customer_id
  ),
  customer_last_pmt AS (
    SELECT DISTINCT ON (p.customer_id)
      p.customer_id,
      p.payment_date,
      p.amount
    FROM public.payments p
    WHERE p.business_id = p_business_id
      AND p.status = 'SUCCESS'
      AND (p_end_date IS NULL OR p.payment_date <= p_end_date)
    ORDER BY p.customer_id, p.payment_date DESC, p.created_at DESC
  ),
  calculated_rows AS (
    SELECT 
      tc.c_id AS customer_id,
      tc.c_name AS customer_name,
      tc.c_company AS customer_company,
      tc.c_phone AS customer_phone,
      tc.c_email AS customer_email,
      tc.c_credit_limit AS credit_limit,
      tc.c_payment_terms AS payment_terms,
      -- Opening Balance
      ROUND(COALESCE(cob.signed_amount, 0) + COALESCE(pre.pre_net, 0), 2) AS opening_balance,
      (CASE 
        WHEN (COALESCE(cob.signed_amount, 0) + COALESCE(pre.pre_net, 0)) > 0 THEN 'RECEIVABLE'
        WHEN (COALESCE(cob.signed_amount, 0) + COALESCE(pre.pre_net, 0)) < 0 THEN 'PAYABLE'
        ELSE 'NONE'
      END)::text AS opening_balance_type,
      -- Period Transactions
      ROUND(COALESCE(ptx.period_sales, 0), 2) AS period_sales,
      ROUND(COALESCE(ptx.period_payments, 0), 2) AS period_payments,
      ROUND(COALESCE(ptx.period_credits_adj, 0), 2) AS period_credits_adjustments,
      ROUND(COALESCE(ptx.period_debits_adj, 0), 2) AS period_debits_adjustments,
      -- Net Closing Balance
      ROUND(
        (COALESCE(cob.signed_amount, 0) + COALESCE(pre.pre_net, 0))
        + (COALESCE(ptx.period_sales, 0) + COALESCE(ptx.period_debits_adj, 0))
        - (COALESCE(ptx.period_payments, 0) + COALESCE(ptx.period_credits_adj, 0)),
        2
      ) AS closing_balance,
      -- Last Payment
      lpmt.payment_date AS last_payment_date,
      ROUND(COALESCE(lpmt.amount, 0), 2) AS last_payment_amount
    FROM target_customers tc
    LEFT JOIN customer_latest_cob cob ON cob.customer_id = tc.c_id
    LEFT JOIN customer_pre_tx pre ON pre.customer_id = tc.c_id
    LEFT JOIN customer_period_tx ptx ON ptx.customer_id = tc.c_id
    LEFT JOIN customer_last_pmt lpmt ON lpmt.customer_id = tc.c_id
  ),
  final_filtered AS (
    SELECT 
      cr.customer_id,
      cr.customer_name,
      cr.customer_company,
      cr.customer_phone,
      cr.customer_email,
      cr.credit_limit,
      cr.payment_terms,
      cr.opening_balance,
      cr.opening_balance_type,
      cr.period_sales,
      cr.period_payments,
      cr.period_credits_adjustments,
      cr.period_debits_adjustments,
      cr.closing_balance,
      (CASE 
        WHEN cr.closing_balance > 0 THEN 'RECEIVABLE'
        WHEN cr.closing_balance < 0 THEN 'PAYABLE'
        ELSE 'NONE'
      END)::text AS closing_balance_type,
      CASE WHEN cr.closing_balance > 0 THEN cr.closing_balance ELSE 0 END AS closing_receivable,
      CASE WHEN cr.closing_balance < 0 THEN ABS(cr.closing_balance) ELSE 0 END AS closing_advance,
      cr.last_payment_date,
      cr.last_payment_amount,
      COUNT(*) OVER() AS total_count
    FROM calculated_rows cr
    WHERE (p_min_due IS NULL OR (CASE WHEN cr.closing_balance > 0 THEN cr.closing_balance ELSE 0 END) >= p_min_due)
  )
  SELECT * FROM final_filtered
  ORDER BY customer_name ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
