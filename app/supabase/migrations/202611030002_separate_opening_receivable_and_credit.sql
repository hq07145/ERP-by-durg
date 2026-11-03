-- ====================================================================
-- MIGRATION: 202611030002_separate_opening_receivable_and_credit.sql
-- PURPOSE:
--   1. Fix Customer Opening Balance Negative Display in Customer Due Report:
--      - Opening balance maintains an explicit type (RECEIVABLE or CREDIT/PAYABLE).
--      - Both are presented as POSITIVE monetary amounts in their respective columns:
--          * opening_receivable: Positive amount when balance_type = 'RECEIVABLE', else 0.00.
--          * opening_credit:     Positive amount when balance_type = 'PAYABLE', else 0.00.
--          * opening_balance:    Always positive absolute amount (initial_amount >= 0), never negative.
--      - No negative values are used in customer reports.
--   2. Reconciled Accounting Formulas:
--      - Closing Receivable: Unpaid balance owed by customer as of p_end_date (> 0).
--      - Closing Advance / Credit: Excess advance held by business as of p_end_date (< 0).
--      - Preserves all historical ledger entries and prevents double counting of advances.
-- ====================================================================

DROP FUNCTION IF EXISTS public.get_customer_outstanding_report(UUID, DATE, DATE, UUID, NUMERIC, INTEGER, INTEGER);

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
  opening_receivable NUMERIC,
  opening_credit NUMERIC,
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
  customer_permanent_cob AS (
    -- Customer's permanent baseline opening balance
    -- Separates Receivable and Credit into distinct, positive monetary amounts
    SELECT DISTINCT ON (cob.customer_id)
      cob.customer_id,
      COALESCE(cob.initial_amount, cob.amount, 0) AS initial_amount,
      COALESCE(cob.initial_balance_type, cob.balance_type, 'NONE') AS initial_balance_type,
      COALESCE(cob.initial_as_on_date, cob.as_on_date) AS initial_as_on_date,
      CASE 
        WHEN COALESCE(cob.initial_balance_type, cob.balance_type) = 'RECEIVABLE'
          THEN COALESCE(cob.initial_amount, cob.amount, 0)
        ELSE 0
      END AS permanent_receivable,
      CASE 
        WHEN COALESCE(cob.initial_balance_type, cob.balance_type) = 'PAYABLE'
          THEN COALESCE(cob.initial_amount, cob.amount, 0)
        ELSE 0
      END AS permanent_credit,
      CASE 
        WHEN COALESCE(cob.initial_balance_type, cob.balance_type) = 'RECEIVABLE'
          THEN COALESCE(cob.initial_amount, cob.amount, 0)
        WHEN COALESCE(cob.initial_balance_type, cob.balance_type) = 'PAYABLE'
          THEN -COALESCE(cob.initial_amount, cob.amount, 0)
        ELSE 0
      END AS permanent_signed_amount
    FROM public.customer_opening_balances cob
    WHERE cob.business_id = p_business_id
    ORDER BY cob.customer_id, cob.as_on_date DESC, cob.created_at DESC
  ),
  customer_effective_cob_as_of AS (
    -- Latest effective opening balance snapshot on or before p_end_date (or all-time if p_end_date is NULL)
    SELECT DISTINCT ON (cob.customer_id)
      cob.customer_id,
      cob.amount,
      cob.balance_type,
      cob.as_on_date,
      CASE WHEN cob.balance_type = 'RECEIVABLE' THEN cob.amount ELSE -cob.amount END AS signed_amount
    FROM public.customer_opening_balances cob
    WHERE cob.business_id = p_business_id
      AND (p_end_date IS NULL OR cob.as_on_date <= p_end_date)
    ORDER BY cob.customer_id, cob.as_on_date DESC, cob.created_at DESC
  ),
  customer_closing_tx AS (
    -- All ledger transactions up to p_end_date that occur strictly after the opening balance cutoff
    SELECT 
      cl.customer_id,
      COALESCE(SUM(cl.debit), 0) - COALESCE(SUM(cl.credit), 0) AS net_ledger
    FROM public.customer_ledger cl
    LEFT JOIN customer_effective_cob_as_of cob ON cob.customer_id = cl.customer_id
    WHERE cl.business_id = p_business_id
      AND (p_end_date IS NULL OR cl.entry_date <= p_end_date)
      AND (cob.as_on_date IS NULL OR cl.entry_date > cob.as_on_date)
    GROUP BY cl.customer_id
  ),
  customer_period_tx AS (
    -- Transactions strictly within the period [p_start_date, p_end_date]
    SELECT 
      cl.customer_id,
      GREATEST(0,
        COALESCE(SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN cl.entry_type = 'ADJUSTMENT' AND (cl.order_id IS NOT NULL OR cl.delivery_id IS NOT NULL) THEN cl.credit ELSE 0 END), 0)
      ) AS period_sales,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'DEBIT_NOTE' THEN cl.debit ELSE 0 END), 0) AS period_debits_adj,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'PAYMENT' THEN cl.credit ELSE 0 END), 0) AS period_payments,
      COALESCE(SUM(CASE WHEN cl.entry_type = 'CREDIT_NOTE' OR (cl.entry_type = 'ADJUSTMENT' AND cl.order_id IS NULL AND cl.delivery_id IS NULL) THEN cl.credit ELSE 0 END), 0)
      + CASE 
          WHEN COALESCE(SUM(CASE WHEN cl.entry_type = 'ADJUSTMENT' AND (cl.order_id IS NOT NULL OR cl.delivery_id IS NOT NULL) THEN cl.credit ELSE 0 END), 0) >
               COALESCE(SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END), 0)
          THEN COALESCE(SUM(CASE WHEN cl.entry_type = 'ADJUSTMENT' AND (cl.order_id IS NOT NULL OR cl.delivery_id IS NOT NULL) THEN cl.credit ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END), 0)
          ELSE 0
        END AS period_credits_adj
    FROM public.customer_ledger cl
    LEFT JOIN customer_effective_cob_as_of cob ON cob.customer_id = cl.customer_id
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
      -- Permanent Baseline Opening Balance: Always positive monetary amount
      ROUND(COALESCE(cob.initial_amount, 0), 2) AS opening_balance,
      COALESCE(cob.initial_balance_type, 'NONE')::text AS opening_balance_type,
      ROUND(COALESCE(cob.permanent_receivable, 0), 2) AS opening_receivable,
      ROUND(COALESCE(cob.permanent_credit, 0), 2) AS opening_credit,
      -- Period Transactions
      ROUND(COALESCE(ptx.period_sales, 0), 2) AS period_sales,
      ROUND(COALESCE(ptx.period_payments, 0), 2) AS period_payments,
      ROUND(COALESCE(ptx.period_credits_adj, 0), 2) AS period_credits_adjustments,
      ROUND(COALESCE(ptx.period_debits_adj, 0), 2) AS period_debits_adjustments,
      -- True Closing Balance as of p_end_date
      ROUND(COALESCE(ecob.signed_amount, 0) + COALESCE(ctx.net_ledger, 0), 2) AS closing_balance,
      -- Last Payment
      lpmt.payment_date AS last_payment_date,
      ROUND(COALESCE(lpmt.amount, 0), 2) AS last_payment_amount
    FROM target_customers tc
    LEFT JOIN customer_permanent_cob cob ON cob.customer_id = tc.c_id
    LEFT JOIN customer_effective_cob_as_of ecob ON ecob.customer_id = tc.c_id
    LEFT JOIN customer_closing_tx ctx ON ctx.customer_id = tc.c_id
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
      cr.opening_receivable,
      cr.opening_credit,
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

REVOKE ALL ON FUNCTION public.get_customer_outstanding_report(UUID, DATE, DATE, UUID, NUMERIC, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_outstanding_report(UUID, DATE, DATE, UUID, NUMERIC, INTEGER, INTEGER) TO authenticated, service_role;

