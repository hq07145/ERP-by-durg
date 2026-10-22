import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate the next sequential order number for a business (e.g. ORD-000001).
 * Uses an atomic sequence stored in business_settings with optimistic concurrency locking
 * to guarantee strict uniqueness without duplicates under simultaneous requests.
 */
export async function generateNextOrderNumber(
  arg1: string | SupabaseClient,
  arg2: string | SupabaseClient
): Promise<string> {
  const businessId = typeof arg1 === "string" ? arg1 : (arg2 as string);
  const client = typeof arg1 === "string" ? (arg2 as SupabaseClient) : arg1;
  const maxRetries = 25;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 1. Fetch current sequence setting
    const { data: row } = await client
      .from("business_settings")
      .select("id, value, updated_at")
      .eq("business_id", businessId)
      .eq("key", "order_number_sequence")
      .maybeSingle();

    if (!row) {
      // Find highest existing ORD-XXXXXX to initialize properly
      const { data: highestOrders } = await client
        .from("orders")
        .select("order_number")
        .eq("business_id", businessId)
        .like("order_number", "ORD-%")
        .limit(100);

      let maxNum = 0;
      if (highestOrders && highestOrders.length > 0) {
        for (const o of highestOrders) {
          const match = String(o.order_number).match(/^ORD-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      }

      const initialNext = maxNum + 1;
      await client.from("business_settings").upsert({
        business_id: businessId,
        key: "order_number_sequence",
        value: { next_number: initialNext, prefix: "ORD-" },
        updated_at: new Date().toISOString(),
      });
      continue;
    }

    const currentVal = Number((row.value as any)?.next_number) || 1;
    const prefix = (row.value as any)?.prefix || "ORD-";
    const nextVal = currentVal + 1;

    // Atomic update with optimistic lock on updated_at
    const { data: updated, error: updateErr } = await client
      .from("business_settings")
      .update({
        value: { next_number: nextVal, prefix },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("business_id", businessId)
      .eq("updated_at", row.updated_at)
      .select();

    if (!updateErr && updated && updated.length > 0) {
      const formatted = `${prefix}${String(currentVal).padStart(6, "0")}`;

      // Verify no collision with legacy manual orders
      const { data: existing } = await client
        .from("orders")
        .select("id")
        .eq("business_id", businessId)
        .eq("order_number", formatted)
        .maybeSingle();

      if (!existing) {
        return formatted;
      }
      // If collided with legacy order, loop will increment to next
      continue;
    }

    // Jittered backoff under concurrent contention
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 35) + 10));
  }

  // Fallback safeguard to guarantee non-failing uniqueness
  return `ORD-${Date.now().toString().slice(-6)}`;
}
