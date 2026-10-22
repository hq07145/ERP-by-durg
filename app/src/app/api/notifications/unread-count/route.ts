import { NextResponse } from "next/server";
import { getUnreadCount } from "@/lib/notifications/actions";

export async function GET() {
  try {
    const count = await getUnreadCount();
    return NextResponse.json({ count });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}