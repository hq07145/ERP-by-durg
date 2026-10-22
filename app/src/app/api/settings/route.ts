import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings, updateSettings } from "@/lib/settings/actions";

export async function GET() {
  try {
    const settings = await getBusinessSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await updateSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}