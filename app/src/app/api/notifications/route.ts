import { NextRequest, NextResponse } from "next/server";
import { getNotifications } from "@/lib/notifications/actions";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Number(searchParams.get("limit")) || 50;
    const offset = Number(searchParams.get("offset")) || 0;
    const unread_only = searchParams.get("unread_only") === "true";

    const result = await getNotifications({ limit, offset, unread_only });
    return NextResponse.json(result);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}