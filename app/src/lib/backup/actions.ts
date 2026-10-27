"use server";

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  BackupResetSummary,
  BackupExecutionResponse,
  ResetExecutionResponse,
} from "@/types/backup";
import {
  generateImportFormatBackupArchive,
  generateReportsFormatBackupArchive,
} from "./service";

/**
 * Guard that strictly enforces Super Admin privileges.
 */
async function requireSuperAdmin() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const isSuperAdmin =
    context.roleKey === "super_admin" ||
    context.role?.name?.toLowerCase().includes("super");

  if (!isSuperAdmin) {
    throw new Error(
      "Forbidden: Data Backup & Reset module is strictly restricted to Super Admin."
    );
  }

  return context;
}

/**
 * Fetches real-time summary of all master and transactional tables
 */
export async function getSystemDataSummaryAction(): Promise<BackupResetSummary> {
  const context = await requireSuperAdmin();
  const businessId = context.user.business_id;

  const adminClient = createAdminSupabaseClient();
  const serverClient = await createServerSupabaseClient();
  const supabase = adminClient || serverClient;

  if (!supabase) {
    throw new Error("Supabase client is not available.");
  }

  // Call the atomic get_system_data_summary RPC
  const { data, error } = await supabase.rpc("get_system_data_summary", {
    p_business_id: businessId,
  });

  if (error || !data) {
    console.error("Error in get_system_data_summary:", error);
    // Fallback: direct query
    const [
      orders,
      orderItems,
      payments,
      customerLedger,
      productionOrders,
      deliveries,
      invTx,
      purchases,
      expenses,
      imports,
      customers,
      suppliers,
      products,
      categories,
      rawMaterials,
      users,
      settings,
    ] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("order_items").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("customer_ledger").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("production_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("import_jobs").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("categories").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("raw_materials").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("business_settings").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    ]);

    const { data: lastBkp } = await supabase
      .from("data_backup_log")
      .select("backup_token, backup_type, verified_at, filename")
      .eq("business_id", businessId)
      .eq("status", "COMPLETED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const oCount = orders.count || 0;
    const oiCount = orderItems.count || 0;
    const pCount = payments.count || 0;
    const clCount = customerLedger.count || 0;
    const poCount = productionOrders.count || 0;
    const dCount = deliveries.count || 0;
    const itCount = invTx.count || 0;
    const puCount = purchases.count || 0;
    const eCount = expenses.count || 0;
    const impCount = imports.count || 0;

    return {
      timestamp: new Date().toISOString(),
      businessId,
      transactional: {
        orders: oCount,
        orderItems: oiCount,
        payments: pCount,
        customerLedger: clCount,
        productionOrders: poCount,
        deliveries: dCount,
        inventoryTransactions: itCount,
        purchaseOrders: puCount,
        expenses: eCount,
        importJobs: impCount,
        totalTransactionalRecords:
          oCount + oiCount + pCount + clCount + poCount + dCount + itCount + puCount + eCount + impCount,
      },
      masterData: {
        customers: customers.count || 0,
        suppliers: suppliers.count || 0,
        products: products.count || 0,
        categories: categories.count || 0,
        rawMaterials: rawMaterials.count || 0,
        users: users.count || 0,
        businessSettings: settings.count || 0,
      },
      lastVerifiedBackup: lastBkp
        ? {
            backupToken: lastBkp.backup_token,
            backupType: lastBkp.backup_type,
            verifiedAt: lastBkp.verified_at,
            filename: lastBkp.filename,
          }
        : null,
    };
  }

  return {
    timestamp: data.timestamp,
    businessId: data.business_id,
    transactional: {
      orders: Number(data.transactional?.orders || 0),
      orderItems: Number(data.transactional?.order_items || 0),
      payments: Number(data.transactional?.payments || 0),
      customerLedger: Number(data.transactional?.customer_ledger || 0),
      productionOrders: Number(data.transactional?.production_orders || 0),
      deliveries: Number(data.transactional?.deliveries || 0),
      inventoryTransactions: Number(data.transactional?.inventory_transactions || 0),
      purchaseOrders: Number(data.transactional?.purchase_orders || 0),
      expenses: Number(data.transactional?.expenses || 0),
      importJobs: Number(data.transactional?.import_jobs || 0),
      totalTransactionalRecords: Number(data.transactional?.total_transactional_records || 0),
    },
    masterData: {
      customers: Number(data.master_data?.customers || 0),
      suppliers: Number(data.master_data?.suppliers || 0),
      products: Number(data.master_data?.products || 0),
      categories: Number(data.master_data?.categories || 0),
      rawMaterials: Number(data.master_data?.raw_materials || 0),
      users: Number(data.master_data?.users || 0),
      businessSettings: Number(data.master_data?.business_settings || 0),
    },
    lastVerifiedBackup: data.last_verified_backup
      ? {
          backupToken: data.last_verified_backup.backup_token,
          backupType: data.last_verified_backup.backup_type,
          verifiedAt: data.last_verified_backup.verified_at,
          filename: data.last_verified_backup.filename,
        }
      : null,
  };
}

/**
 * Generates and downloads the full Import Format backup archive
 */
export async function generateImportBackupAction(): Promise<BackupExecutionResponse> {
  const context = await requireSuperAdmin();

  return await generateImportFormatBackupArchive({
    id: context.user.id,
    name: context.user.name,
    email: context.user.email,
    businessName: context.businessName || "SANKALP IRRIGATION",
  });
}

/**
 * Generates and downloads the Reports Format ZIP for the selected period
 */
export async function generateReportsBackupAction(
  periodMonths: 1 | 3 | 6 | 12
): Promise<BackupExecutionResponse> {
  const context = await requireSuperAdmin();

  return await generateReportsFormatBackupArchive(
    {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      businessName: context.businessName || "SANKALP IRRIGATION",
    },
    periodMonths
  );
}

/**
 * Executes destructive transactional data reset under the strict approval flow
 */
export async function executeDataResetAction(payload: {
  confirmationText: string;
  backupToken: string;
}): Promise<ResetExecutionResponse> {
  try {
    const context = await requireSuperAdmin();
    const businessId = context.user.business_id;

    if (payload.confirmationText !== "RESET ALL DATA") {
      return {
        success: false,
        error:
          'Confirmation text mismatch. You must type the exact phrase "RESET ALL DATA" in capital letters to proceed.',
        message:
          'Confirmation text mismatch. You must type the exact phrase "RESET ALL DATA" in capital letters to proceed.',
        clearedCounts: {},
        timestamp: new Date().toISOString(),
      };
    }

    if (!payload.backupToken || payload.backupToken.trim() === "") {
      return {
        success: false,
        error:
          "Safety Error: A verified complete backup token is mandatory before data reset can be executed.",
        message:
          "Safety Error: A verified complete backup token is mandatory before data reset can be executed.",
        clearedCounts: {},
        timestamp: new Date().toISOString(),
      };
    }

    const adminClient = createAdminSupabaseClient();
    const serverClient = await createServerSupabaseClient();
    const supabase = adminClient || serverClient;

    if (!supabase) {
      return {
        success: false,
        error: "Database service is temporarily unavailable. Please try again later.",
        message: "Database service is temporarily unavailable. Please try again later.",
        clearedCounts: {},
        timestamp: new Date().toISOString(),
      };
    }

    // Execute the atomic reset procedure
    const { data, error } = await supabase.rpc("reset_all_business_data", {
      p_business_id: businessId,
      p_operator_id: context.user.id,
      p_backup_token: payload.backupToken.trim(),
    });

    if (error) {
      console.error("Reset procedure error:", error);
      let errMsg = error.message || "Failed to execute database reset procedure.";
      if (errMsg.includes("Safety Violation")) {
        errMsg =
          "Safety Violation: Your backup has expired (> 48 hours old) or the token is invalid. Please download a fresh backup archive before resetting.";
      }
      return {
        success: false,
        error: errMsg,
        message: errMsg,
        clearedCounts: {},
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      message:
        data?.message ||
        "All transactional data successfully reset. Schema, admin accounts, and master data were preserved.",
      clearedCounts: data?.cleared_counts || {},
      timestamp: data?.timestamp || new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("executeDataResetAction catch error:", err);
    let errMsg = err?.message || "An unexpected error occurred during data reset.";
    if (errMsg.includes("Safety Violation")) {
      errMsg =
        "Safety Violation: Your backup has expired (> 48 hours old) or the token is invalid. Please download a fresh backup archive before resetting.";
    }
    return {
      success: false,
      error: errMsg,
      message: errMsg,
      clearedCounts: {},
      timestamp: new Date().toISOString(),
    };
  }
}
