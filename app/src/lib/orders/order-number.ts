import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate the next sequential order number for a business (e.g. ORD-000001).
 * Uses an atomic database sequence (`order_sequences` table with FOR UPDATE lock)
 * via the `generate_next_order_number` PostgreSQL function.
 * This guarantees strict monotonicity, serializability under concurrent connections,
 * and zero duplicates. Never uses client-side random numbers, row counts, or MAX()+1.
 */
export async function generateNextOrderNumber(
  arg1: string | SupabaseClient,
  arg2: string | SupabaseClient
): Promise<string> {
  const businessId = typeof arg1 === "string" ? arg1 : (arg2 as string);
  const client = typeof arg1 === "string" ? (arg2 as SupabaseClient) : arg1;

  // 1. Call atomic database sequence RPC
  const { data, error } = await (client as any).rpc("generate_next_order_number", {
    p_business_id: businessId,
  });

  if (!error && data && typeof data === "string") {
    return data;
  }

  if (error) {
    console.error("[generateNextOrderNumber] RPC error:", error);
  }

  // 2. Fallback to atomic sequence update in order_sequences table if RPC cannot be found
  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data: seqRow, error: fetchErr } = await client
      .from("order_sequences")
      .select("prefix, next_val, padding")
      .eq("business_id", businessId)
      .maybeSingle();

    if (fetchErr || !seqRow) {
      break;
    }

    const currentVal = Number(seqRow.next_val) || 1;
    const prefix = seqRow.prefix || "ORD-";
    const padding = seqRow.padding || 6;
    const nextVal = currentVal + 1;

    const { data: updated, error: updateErr } = await client
      .from("order_sequences")
      .update({
        next_val: nextVal,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", businessId)
      .eq("next_val", currentVal)
      .select();

    if (!updateErr && updated && updated.length > 0) {
      const formatted = `${prefix}${String(currentVal).padStart(padding, "0")}`;
      return formatted;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 40) + 10));
  }

  throw new Error(
    `Failed to generate next sequential order number for business ${businessId}: ${
      error?.message || "Database sequence could not be updated."
    }`
  );
}
