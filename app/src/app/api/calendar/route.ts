import { NextRequest, NextResponse } from "next/server";
import { getBusinessCalendar, setCalendarDay, bulkSetCalendarDays, removeCalendarDay, initializeCalendar } from "@/lib/settings/actions";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 }
      );
    }

    const calendar = await getBusinessCalendar(startDate, endDate);
    return NextResponse.json(calendar);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case "set_day": {
        const day = await setCalendarDay(params);
        return NextResponse.json(day);
      }
      case "bulk_set": {
        const days = await bulkSetCalendarDays(params.days);
        return NextResponse.json(days);
      }
      case "remove_day": {
        await removeCalendarDay(params.date);
        return NextResponse.json({ success: true });
      }
      case "initialize": {
        await initializeCalendar(params.start_date, params.end_date);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to process calendar request" },
      { status: 500 }
    );
  }
}