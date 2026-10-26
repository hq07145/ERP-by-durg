import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { generateImportFormatBackupArchive } from "@/lib/backup/service";

export const dynamic = "force-dynamic";

export async function GET() {
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
        { error: "Forbidden: Only Super Admin can download full backups" },
        { status: 403 }
      );
    }

    const backup = await generateImportFormatBackupArchive({
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      businessName: context.businessName || "SANKALP IRRIGATION",
    });

    if (!backup.zipBase64) {
      return NextResponse.json({ error: "Failed to generate archive" }, { status: 500 });
    }

    const buffer = Buffer.from(backup.zipBase64, "base64");

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Content-Length": buffer.length.toString(),
        "X-Backup-Token": backup.backupToken,
        "X-Checksum-Sha256": backup.checksumSha256,
      },
    });
  } catch (err: any) {
    console.error("Error in download-import route:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate complete backup archive" },
      { status: 500 }
    );
  }
}
