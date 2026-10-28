"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  CreateGoodsReturnInput,
  ApproveGoodsReturnInput,
  RejectGoodsReturnInput,
  PostGoodsReturnInput,
  CancelGoodsReturnInput,
  GoodsReturnWithDetails,
  ReturnStatus,
} from "@/types/returns";

export async function createGoodsReturnAction(input: CreateGoodsReturnInput) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("create_goods_return", {
    p_business_id: context.user.business_id,
    p_customer_id: input.customer_id,
    p_order_id: input.order_id || null,
    p_delivery_id: input.delivery_id || null,
    p_invoice_number: input.invoice_number || null,
    p_product_id: input.product_id || null,
    p_order_item_id: input.order_item_id || null,
    p_returned_quantity: input.returned_quantity || null,
    p_product_condition: input.product_condition || "SALEABLE",
    p_reason: input.reason,
    p_notes: input.notes || null,
    p_adjustment_type: input.adjustment_type || null,
    p_adjustment_amount: input.adjustment_amount || 0,
    p_return_date: input.return_date || new Date().toISOString().split("T")[0],
    p_items: input.items && input.items.length > 0 ? JSON.parse(JSON.stringify(input.items)) : null,
    p_allow_override: input.allow_override || false,
    p_override_reason: input.override_reason || null,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (input.delivery_id) revalidatePath(`/delivery/${input.delivery_id}`);
  revalidatePath("/delivery");
  revalidatePath("/returns");
  revalidatePath("/inventory");
  if (input.order_id) revalidatePath(`/orders/${input.order_id}`);

  return data;
}

async function revalidateReturnRelations(supabase: any, returnId: string) {
  try {
    const { data: ret } = await supabase
      .from("goods_returns")
      .select("id, order_id, delivery_id")
      .eq("id", returnId)
      .maybeSingle();

    if (ret) {
      if (ret.order_id) revalidatePath(`/orders/${ret.order_id}`);
      if (ret.delivery_id) revalidatePath(`/delivery/${ret.delivery_id}`);
    }
    revalidatePath("/delivery");
    revalidatePath("/orders");
    revalidatePath(`/returns/${returnId}`);
  } catch (err) {
    console.error("Failed to revalidate return relations:", err);
  }
}

export async function approveGoodsReturnAction(input: ApproveGoodsReturnInput) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("approve_goods_return", {
    p_business_id: context.user.business_id,
    p_return_id: input.return_id,
    p_product_condition: input.product_condition || null,
    p_adjustment_type: input.adjustment_type || null,
    p_adjustment_amount: input.adjustment_amount !== undefined ? input.adjustment_amount : null,
    p_inspection_notes: input.inspection_notes || null,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await revalidateReturnRelations(supabase, input.return_id);
  revalidatePath("/returns");
  return data;
}

export async function rejectGoodsReturnAction(input: RejectGoodsReturnInput) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("reject_goods_return", {
    p_business_id: context.user.business_id,
    p_return_id: input.return_id,
    p_rejection_reason: input.rejection_reason,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await revalidateReturnRelations(supabase, input.return_id);
  revalidatePath("/returns");
  return data;
}

export async function postGoodsReturnAction(input: PostGoodsReturnInput) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("post_goods_return", {
    p_business_id: context.user.business_id,
    p_return_id: input.return_id,
    p_adjustment_type: input.adjustment_type || null,
    p_adjustment_amount: input.adjustment_amount !== undefined ? input.adjustment_amount : null,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await revalidateReturnRelations(supabase, input.return_id);
  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/reports/ledger");
  return data;
}

export async function cancelGoodsReturnAction(input: CancelGoodsReturnInput) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("cancel_goods_return", {
    p_business_id: context.user.business_id,
    p_return_id: input.return_id,
    p_reason: input.reason,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await revalidateReturnRelations(supabase, input.return_id);
  revalidatePath("/returns");
  revalidatePath("/inventory");
  return data;
}

export async function createReplacementDeliveryAction(params: {
  return_id: string;
  vehicle?: string;
  driver?: string;
  notes?: string;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("create_return_replacement_delivery", {
    p_business_id: context.user.business_id,
    p_return_id: params.return_id,
    p_vehicle: params.vehicle || null,
    p_driver: params.driver || null,
    p_notes: params.notes || null,
    p_operator_id: context.user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/returns");
  revalidatePath("/delivery");
  return data;
}

export async function getGoodsReturnById(returnId: string): Promise<GoodsReturnWithDetails | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data: ret, error } = await supabase
    .from("goods_returns")
    .select(`
      *,
      customers (name),
      orders (order_number),
      deliveries!delivery_id (delivery_number),
      products (name, sku)
    `)
    .eq("id", returnId)
    .eq("business_id", context.user.business_id)
    .single();

  if (error || !ret) return null;

  const { data: items } = await supabase
    .from("goods_return_items")
    .select(`
      *,
      products (name, sku)
    `)
    .eq("goods_return_id", returnId)
    .order("created_at", { ascending: true });

  const formattedItems = (items || []).map((it: any) => ({
    ...it,
    product_name: it.products?.name || "Product",
    sku: it.products?.sku || "",
  }));

  // Fetch linked inventory stock movements for audit trail and UI verification
  const { data: invTx } = await supabase
    .from("inventory_transactions")
    .select("id, item_type, transaction_type, quantity, reference_type, notes, created_at")
    .eq("reference_id", returnId)
    .order("created_at", { ascending: false });

  // Fetch current finished goods stock for involved products
  const pids = formattedItems.map((it: any) => it.product_id).filter(Boolean);
  if (ret.product_id && !pids.includes(ret.product_id)) pids.push(ret.product_id);
  const productStock: Record<string, { current_stock: number; available_stock: number }> = {};

  if (pids.length > 0) {
    const { data: stockRows } = await supabase
      .from("inventory")
      .select("item_id, current_stock, available_stock")
      .eq("business_id", context.user.business_id)
      .eq("item_type", "finished_good")
      .in("item_id", pids);

    (stockRows || []).forEach((r: any) => {
      productStock[r.item_id] = {
        current_stock: Number(r.current_stock || 0),
        available_stock: Number(r.available_stock || 0),
      };
    });
  }

  return {
    ...ret,
    customer_name: ret.customers?.name || "Unknown Customer",
    order_number: ret.orders?.order_number || null,
    delivery_number: ret.deliveries?.delivery_number || null,
    product_name: ret.products?.name || null,
    product_sku: ret.products?.sku || null,
    items: formattedItems,
    inventory_transactions: (invTx as any) || [],
    product_stock: productStock,
  };
}

export async function listGoodsReturns(filters?: {
  status?: ReturnStatus;
  customerId?: string;
  orderId?: string;
  limit?: number;
  offset?: number;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("goods_returns")
    .select(`
      *,
      customers (name),
      orders (order_number),
      deliveries!delivery_id (delivery_number),
      products (name, sku)
    `)
    .eq("business_id", context.user.business_id)
    .order("return_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters?.orderId) {
    query = query.eq("order_id", filters.orderId);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((ret: any) => ({
    ...ret,
    customer_name: ret.customers?.name || "Unknown Customer",
    order_number: ret.orders?.order_number || null,
    delivery_number: ret.deliveries?.delivery_number || null,
    product_name: ret.products?.name || null,
    product_sku: ret.products?.sku || null,
  }));
}

export async function getReturnStatusCounts(): Promise<Record<string, number>> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("goods_returns")
    .select("status")
    .eq("business_id", context.user.business_id);

  const counts: Record<string, number> = {
    ALL: data?.length ?? 0,
    PENDING_INSPECTION: 0,
    APPROVED: 0,
    REJECTED: 0,
    POSTED: 0,
    CANCELLED: 0,
  };

  if (!error && data) {
    for (const row of data) {
      if (counts[row.status] !== undefined) {
        counts[row.status]++;
      }
    }
  }

  return counts;
}

export async function getReturnAuditHistory(returnId: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data,
      created_at,
      user_id,
      users (name, email)
    `)
    .eq("business_id", context.user.business_id)
    .eq("entity_id", returnId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching return audit history:", error);
    return [];
  }

  return (data || []).map((entry: any) => ({
    id: entry.id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    old_data: entry.old_data,
    new_data: entry.new_data,
    created_at: entry.created_at,
    user_name: entry.users?.name || entry.users?.email || "System",
  }));
}

export async function getCustomerDeliveredOrders(customerId: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Fetch customer orders with line items and delivered quantities
  const [ordersRes, returnsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        order_date,
        total_amount,
        status,
        delivery_status,
        order_items (
          id,
          product_id,
          quantity,
          unit_price,
          dispatched_quantity,
          delivered_quantity,
          products (id, name, sku, unit)
        ),
        deliveries (
          id,
          delivery_number,
          delivery_date,
          invoice_number,
          status,
          delivery_items (
            id,
            order_item_id,
            product_id,
            ordered_quantity,
            delivered_quantity
          )
        )
      `)
      .eq("business_id", context.user.business_id)
      .eq("customer_id", customerId)
      .neq("status", "CANCELLED")
      .order("order_date", { ascending: false }),
    supabase
      .from("goods_returns")
      .select(`
        id,
        return_number,
        status,
        order_id,
        delivery_id,
        order_item_id,
        returned_quantity,
        goods_return_items (
          id,
          order_item_id,
          delivery_item_id,
          product_id,
          returned_quantity
        )
      `)
      .eq("business_id", context.user.business_id)
      .eq("customer_id", customerId)
      .not("status", "in", '("CANCELLED","REJECTED")'),
  ]);

  const orders = ordersRes.data || [];
  const activeReturns = returnsRes.data || [];

  return orders.map((o: any) => {
    const validDeliveries = (o.deliveries || []).filter((d: any) => d.status !== "CANCELLED");

    const items = (o.order_items || []).map((oi: any) => {
      // Calculate total delivered across all valid, non-cancelled deliveries
      let deliveredQty = 0;
      validDeliveries.forEach((del: any) => {
        (del.delivery_items || []).forEach((di: any) => {
          if (di.order_item_id === oi.id) {
            deliveredQty += Number(di.delivered_quantity || 0);
          }
        });
      });

      if (deliveredQty === 0) {
        deliveredQty = Number(oi.delivered_quantity || oi.dispatched_quantity || 0);
      }

      // Calculate previously returned quantities for this order item
      // Requirement 5: Show Prev Returned from valid, successfully Posted returns only
      let postedReturned = 0;
      let pendingReturned = 0;

      activeReturns.forEach((ret: any) => {
        if (ret.order_id === o.id) {
          if (ret.goods_return_items && ret.goods_return_items.length > 0) {
            ret.goods_return_items.forEach((gri: any) => {
              if (gri.order_item_id === oi.id) {
                const q = Number(gri.returned_quantity || 0);
                if (ret.status === "POSTED") {
                  postedReturned += q;
                } else if (ret.status === "PENDING_INSPECTION" || ret.status === "APPROVED") {
                  pendingReturned += q;
                }
              }
            });
          } else if (ret.order_item_id === oi.id) {
            const q = Number(ret.returned_quantity || 0);
            if (ret.status === "POSTED") {
              postedReturned += q;
            } else if (ret.status === "PENDING_INSPECTION" || ret.status === "APPROVED") {
              pendingReturned += q;
            }
          }
        }
      });

      const maxReturnQuantity = Math.max(0, deliveredQty - postedReturned - pendingReturned);

      return {
        id: oi.id,
        product_id: oi.product_id,
        product_name: oi.products?.name || "Product",
        sku: oi.products?.sku || "",
        unit: oi.products?.unit || "units",
        ordered_quantity: Number(oi.quantity || 0),
        delivered_quantity: deliveredQty,
        already_returned_quantity: postedReturned,
        pending_returned_quantity: pendingReturned,
        net_retained_quantity: Math.max(0, deliveredQty - postedReturned),
        max_return_quantity: maxReturnQuantity,
        unit_price: oi.unit_price,
      };
    });

    const deliveries = validDeliveries.map((del: any) => {
      const delItems = (del.delivery_items || []).map((di: any) => {
        const itemDelivered = Number(di.delivered_quantity || 0);
        let delPostedReturned = 0;
        let delPendingReturned = 0;

        activeReturns.forEach((ret: any) => {
          if (ret.delivery_id === del.id) {
            if (ret.goods_return_items && ret.goods_return_items.length > 0) {
              ret.goods_return_items.forEach((gri: any) => {
                if (gri.order_item_id === di.order_item_id || gri.delivery_item_id === di.id) {
                  const q = Number(gri.returned_quantity || 0);
                  if (ret.status === "POSTED") {
                    delPostedReturned += q;
                  } else if (ret.status === "PENDING_INSPECTION" || ret.status === "APPROVED") {
                    delPendingReturned += q;
                  }
                }
              });
            } else if (ret.order_item_id === di.order_item_id) {
              const q = Number(ret.returned_quantity || 0);
              if (ret.status === "POSTED") {
                delPostedReturned += q;
              } else if (ret.status === "PENDING_INSPECTION" || ret.status === "APPROVED") {
                delPendingReturned += q;
              }
            }
          }
        });

        const maxDelReturn = Math.max(0, itemDelivered - delPostedReturned - delPendingReturned);

        return {
          id: di.id,
          order_item_id: di.order_item_id,
          product_id: di.product_id,
          delivered_quantity: itemDelivered,
          already_returned_quantity: delPostedReturned,
          pending_returned_quantity: delPendingReturned,
          max_return_quantity: maxDelReturn,
        };
      });

      return {
        id: del.id,
        delivery_number: del.delivery_number,
        delivery_date: del.delivery_date,
        invoice_number: del.invoice_number,
        status: del.status,
        items: delItems,
      };
    });

    return {
      id: o.id,
      order_number: o.order_number,
      order_date: o.order_date,
      total_amount: o.total_amount,
      delivery_status: o.delivery_status,
      items,
      deliveries,
    };
  });
}

export async function getReturnProducts() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, unit, selling_price")
    .eq("business_id", context.user.business_id)
    .eq("active", true)
    .order("name", { ascending: true });

  return products || [];
}

export async function reconcileGoodsReturnInventoryAction(dryRun: boolean = true) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  const supabase = createAdminSupabaseClient();
  if (!supabase) throw new Error("Supabase admin client not available");

  const { data, error } = await supabase.rpc("reconcile_goods_return_inventory", {
    p_business_id: context.user.business_id,
    p_dry_run: dryRun,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  revalidatePath("/returns");
  return data;
}
