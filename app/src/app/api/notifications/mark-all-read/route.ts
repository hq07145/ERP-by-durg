import { NextResponse } from "next/server";
import { markAllNotificationsRead } from "@/lib/notifications/actions";

export async function POST() {
  try {
    const result = await markAllNotificationsRead();
    return NextResponse.json(result);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to mark all notifications as read" },
      { status: 500 }
    );
  }
}