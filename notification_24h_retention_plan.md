# IMPLEMENTATION PLAN: AUTOMATIC 24-HOUR NOTIFICATION RETENTION & CLEANUP

**Project:** SANKALP IRRIGATION ERP  
**Module:** System → Notifications  
**Status:** **PLANNING COMPLETE — AWAITING USER APPROVAL**  
**Audit Date:** November 18, 2026  
**Target Environment:** Local PostgreSQL / Supabase Pooler (\`aws-0-ap-south-1.pooler.supabase.com:6543\`)  

---

## 1. Existing Notifications Retention Audit (Deletion Count Report)

A read-only audit of the \`notifications\` table was performed against the current database clock (\`NOW()\`).

### A. Current Retention Breakdown

| Retention Window | Condition | Record Count | % of Table | Action upon Execution |
|:---|:---|:---:|:---:|:---|
| **Older than 24 Hours** | \`created_at <= NOW() - INTERVAL '24 hours'\` | **1,202** | **97.88%** | **Will be permanently deleted** |
| — *Read Notifications Older than 24h* | \`is_read = true\` | 830 | 67.59% | Permanently deleted |
| — *Unread Notifications Older than 24h* | \`is_read = false\` | 372 | 30.29% | Permanently deleted |
| **Within Last 24 Hours (Active)** | \`created_at > NOW() - INTERVAL '24 hours'\` | **26** | **2.12%** | **Survives / Remains Active** |
| — *Recent Read Notifications* | \`is_read = true\` | 0 | 0.00% | Survives |
| — *Recent Unread Notifications* | \`is_read = false\` | 26 | 2.12% | Survives in User Inboxes |
| **TOTAL NOTIFICATIONS** | — | **1,228** | **100.00%** | — |

> [!IMPORTANT]
> **Existing Record Deletion Count:**  
> Exactly **1,202 notification rows** will be permanently deleted upon initial execution of the cleanup policy.  
> Exactly **26 notification rows** will survive and remain visible in the active UI, representing recent business events from the last 24 hours (\`ORD-000034\`, \`ORD-000019\`, \`ORD-000032\`, \`ORD-000033\`, \`PAY-2026-000020\`).

---

### B. Breakdown of Expiring Records (1,202 Rows) by Module & Event Type

| Module | Event Type | Total Expiring | Read | Unread | Oldest Record | Cutoff Timestamp |
|:---|:---|---:|---:|---:|:---:|:---:|
| **Orders** | \`ORDER_NEW\` | 416 | 302 | 114 | 2026-10-31 07:35 UTC | 2026-11-17 19:21 UTC |
| **Orders** | \`ORDER_CONFIRMED\` | 168 | 117 | 51 | 2026-10-31 12:21 UTC | 2026-11-16 11:40 UTC |
| **Orders** | \`ORDER_CANCELLED\` | 28 | 19 | 9 | 2026-11-01 18:59 UTC | 2026-11-16 11:23 UTC |
| **Production** | \`PRODUCTION_COMPLETED\` | 191 | 116 | 75 | 2026-10-31 12:22 UTC | 2026-11-17 06:19 UTC |
| **Production** | \`PRODUCTION_STARTED\` | 9 | 6 | 3 | 2026-10-31 12:43 UTC | 2026-11-03 12:50 UTC |
| **Production** | \`PRODUCTION_DELAYED\` | 8 | 4 | 4 | 2026-11-11 11:20 UTC | 2026-11-16 11:23 UTC |
| **Delivery** | \`DELIVERY_DISPATCHED\` | 138 | 90 | 48 | 2026-10-31 12:32 UTC | 2026-11-17 06:21 UTC |
| **Delivery** | \`DELIVERY_DELIVERED\` | 92 | 66 | 26 | 2026-10-31 12:37 UTC | 2026-11-15 13:40 UTC |
| **Payments** | \`PAYMENT_RECEIVED\` | 152 | 110 | 42 | 2026-10-31 12:19 UTC | 2026-11-16 11:19 UTC |
| **TOTAL** | — | **1,202** | **830** | **372** | — | — |

---

### C. Breakdown of Expiring Records by Recipient Inbox

| User Name | Role | Expiring Read | Expiring Unread | Total Expiring Records | Surviving Active Records (<24h) |
|:---|:---|---:|---:|---:|---:|
| **Shaikh Sohel** | Manager | 0 | 309 | **309** | **6** |
| **Sachin Bari** | Staff | 258 | 49 | **307** | **6** |
| **Super Admin** | Admin | 291 | 5 | **296** | **6** |
| **Zoeaf Qureshi** | User | 281 | 9 | **290** | **8** |
| **TOTAL** | — | **830** | **372** | **1,202** | **26** |

---

## 2. Technical Implementation Architecture

The solution uses a three-tier architecture ensuring permanent deletion, zero overlap, 24/7 background execution without active user sessions, and instantaneous UI response:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 1: Scheduled Native Database Job (pg_cron)             │
│ Runs every 5 minutes (*/5 * * * *) directly in PostgreSQL   │
│ Operates 24/7 even when web server is off or users logged out│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 2: Atomic Batch Procedure & Non-Overlapping Lock       │
│ • pg_try_advisory_lock(884729103) prevents overlap           │
│ • Batch deletion (1,000 rows/loop) prevents locks & bloat   │
│ • Execution logs written to notification_cleanup_logs        │
│ • STRICT SCOPE: Only deletes from "notifications" table     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Tier 3: Next.js Query-Time Safeguard                        │
│ getNotifications() & getUnreadCount() apply query filter:   │
│ WHERE created_at > NOW() - INTERVAL '24 hours'              │
│ Guaranteeing zero expired items ever render between sweeps   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Migration Specification

### Step 1: Execution Logging Table (\`notification_cleanup_logs\`)
Tracks every automated cleanup cycle for complete system observability:
\`\`\`sql
CREATE TABLE IF NOT EXISTS public.notification_cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cutoff_timestamp TIMESTAMPTZ NOT NULL,
  deleted_count INT NOT NULL DEFAULT 0,
  execution_duration_ms INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_cleanup_logs_executed_at
  ON public.notification_cleanup_logs (executed_at DESC);
\`\`\`

---

### Step 2: Atomic Cleanup Function with Advisory Lock (\`cleanup_expired_notifications\`)
\`\`\`sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications(p_batch_size INT DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_obtained BOOLEAN;
  v_start_time TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
  v_total_deleted INT := 0;
  v_batch_deleted INT := 0;
  v_duration_ms INT;
BEGIN
  -- 1. Prevent overlapping executions via dedicated 64-bit advisory lock
  v_lock_obtained := pg_try_advisory_lock(884729103);
  IF NOT v_lock_obtained THEN
    RETURN jsonb_build_object(
      'status', 'SKIPPED',
      'message', 'Previous cleanup job is still executing. Overlap prevented.'
    );
  END IF;

  v_start_time := clock_timestamp();
  v_cutoff := NOW() - INTERVAL '24 hours';

  -- 2. Batch deletion loop to avoid long locks and vacuum pressure
  LOOP
    WITH to_delete AS (
      SELECT id
      FROM notifications
      WHERE created_at <= v_cutoff
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM notifications
    WHERE id IN (SELECT id FROM to_delete);

    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_batch_deleted;

    EXIT WHEN v_batch_deleted = 0;
  END LOOP;

  v_duration_ms := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::INT;

  -- 3. Log execution
  INSERT INTO notification_cleanup_logs (
    cutoff_timestamp,
    deleted_count,
    execution_duration_ms,
    status
  ) VALUES (
    v_cutoff,
    v_total_deleted,
    v_duration_ms,
    'SUCCESS'
  );

  -- 4. Release lock
  PERFORM pg_advisory_unlock(884729103);

  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'deleted_count', v_total_deleted,
    'duration_ms', v_duration_ms,
    'cutoff', v_cutoff
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(884729103);
  INSERT INTO notification_cleanup_logs (
    cutoff_timestamp,
    deleted_count,
    execution_duration_ms,
    status,
    error_message
  ) VALUES (
    NOW() - INTERVAL '24 hours',
    v_total_deleted,
    0,
    'FAILED',
    SQLERRM
  );
  RAISE;
END;
$$;
\`\`\`

---

### Step 3: Native Scheduled Job via \`pg_cron\` (Every 5 Minutes)
\`\`\`sql
-- Register scheduled cron job in PostgreSQL
SELECT cron.schedule(
  'cleanup-expired-notifications',
  '*/5 * * * *',
  'SELECT public.cleanup_expired_notifications(1000);'
);
\`\`\`

---

## 4. UI Query Safeguard (Next.js Layer)

In \`app/src/lib/notifications/actions.ts\`, the \`getNotifications()\` and \`getUnreadCount()\` server actions will include a 24-hour cutoff condition:

\`\`\`typescript
const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// In getNotifications():
query = query.gt("created_at", cutoff24h);

// In getUnreadCount():
query = query.eq("is_read", false).gt("created_at", cutoff24h);
\`\`\`

### Benefits:
- **Instantaneous Expiration:** If a notification reaches 24 hours and 1 second of age, it disappears from the user's UI immediately, even if the next scheduled database sweep is 3 minutes away.
- **Cache & Pagination Immune:** Pagination offset queries and cached lists cannot resurrect expired records.

---

## 5. Strict Business Data Protection Proof

The deletion logic is strictly scoped to the \`notifications\` table:

\`\`\`sql
-- VERIFIED SAFE SCOPE:
DELETE FROM notifications WHERE id IN (SELECT id FROM to_delete);
\`\`\`

### Integrity Invariants Guaranteed:
- **Zero cascading impact:** No foreign keys reference \`notifications(id)\`.
- **Untouched Core Tables:**
  - \`orders\` (35 records) — 100% untouched
  - \`deliveries\` (29 records) — 100% untouched
  - \`production_orders\` (56 records) — 100% untouched
  - \`payments\` (20 records) — 100% untouched
  - \`customers\` & \`customer_ledgers\` — 100% untouched
  - \`inventory_items\` & stock ledgers — 100% untouched

---

## 6. End-to-End Verification Test Plan

Upon approval, the automated verification suite will execute the following tests:

| Test Case | Scenario | Verification Method |
|:---|:---|:---|
| **Test 1** | Notification created < 24h ago | Verify it remains visible in UI and database. |
| **Test 2** | Notification created > 24h ago | Execute cleanup; verify row is permanently deleted from DB. |
| **Test 3** | Read notifications > 24h old | Verify read status does not prevent deletion (deleted as required). |
| **Test 4** | Unread notifications > 24h old | Verify unread status does not prevent deletion (deleted as required). |
| **Test 5** | Bell badge count update | Verify unread count decreases accurately after expiration. |
| **Test 6** | New notification creation | Create a new order; verify new notification generates and displays properly. |
| **Test 7** | Non-overlapping execution | Run 2 concurrent cleanup calls; verify advisory lock catches and logs the second call as \`SKIPPED\`. |
| **Test 8** | Business records integrity | Verify exact counts for \`orders\`, \`deliveries\`, \`production_orders\`, \`payments\` remain completely identical before and after cleanup. |
| **Test 9** | Session independence | Verify \`cron.job\` executes and writes to \`notification_cleanup_logs\` without any active browser session. |

---

## 7. Next Step: Awaiting User Approval

Per strict constraints, **no records have been deleted** and **no database changes have been applied**.

Please review this implementation plan and provide your approval to execute the migration and automated cleanup.
