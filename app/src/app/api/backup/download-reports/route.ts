import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { generateReportsFormatBackupArchive } from "@/lib/backup/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSuperAdmin =
      context.roleKey === "super_admin" ||
      context.role?.name?.toLowerCase().includes("super");

    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only Super Admin can export report archives" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get("period");
    const period = (
      periodParam === "1" ? 1 : periodParam === "3" ? 3 : periodParam === "6" ? 6 : 12
    ) as 1 | 3 | 6 | 12;

    const backup = await generateReportsFormatBackupArchive(
      {
        id: context.user.id,
        name: context.user.name,
        email: context.user.email,
        businessName: context.businessName || "SANKALP IRRIGATION",
      },
      period
    );

    if (!backup.zipBase64) {
      return NextResponse.json({ error: "Failed to generate report archive" }, { status: 500 });
    }

    const buffer = Buffer.from(backup.zipBase64, "base64");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Content-Length": buffer.length.toString(),
        "X-Backup-Token": backup.backupToken,
        "X-Period-Months": period.toString(),
      },
    });
  } catch (err: any) {
    console.error("Error in download-reports route:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate reports archive" },
      { status: 500 }
    );
  }
}
