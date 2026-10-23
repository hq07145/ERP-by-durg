import { NextResponse } from "next/server";
import { getUnreadCount } from "@/lib/notifications/actions";

export async function GET() {
  try {
    const count = await getUnreadCount();
    return NextResponse.json(
      { count },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { count: 0 },
      { status: 200 }
    );
  }
}