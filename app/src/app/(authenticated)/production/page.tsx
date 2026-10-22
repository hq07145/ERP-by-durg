import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProductionQueue } from "@/components/production/production-queue";
import { ProductionSchedule } from "@/components/production/production-schedule";
import { ProductionCalendar } from "@/components/production/production-calendar";
import { getProductionQueue, getProductionSchedule, getBusinessCalendar, upsertCalendarDay } from "@/lib/production/actions";

export default async function ProductionPage() {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) redirect("/dashboard?error=forbidden");

  const canCreate = hasPermission({ permissions: context.permissions }, "production.create");
  const canSchedule = hasPermission({ permissions: context.permissions }, "production.schedule");
  const canEdit = hasPermission({ permissions: context.permissions }, "production.edit");
  const canStart = hasPermission({ permissions: context.permissions }, "production.start") || canEdit || canCreate;
  const canQualityCheck = hasPermission({ permissions: context.permissions }, "production.quality_check") || canEdit || canCreate;
  const canComplete = hasPermission({ permissions: context.permissions }, "production.complete") || canEdit || canCreate;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 90);

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const [queue, schedule, calendarDays] = await Promise.all([
    getProductionQueue(),
    getProductionSchedule(startDateStr, endDateStr),
    getBusinessCalendar(startDateStr, endDateStr),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
          <p className="text-gray-500">Manage production orders, scheduling, and capacity</p>
        </div>
        {canCreate && (
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 rounded-sm bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent)]/90"
          >
            Create Orders
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ProductionQueue
            queue={queue}
            canCreate={canCreate}
            canSchedule={canSchedule}
            canEdit={canEdit}
            canStart={canStart}
            canQualityCheck={canQualityCheck}
            canComplete={canComplete}
          />
          <ProductionSchedule schedules={schedule} startDate={startDateStr} endDate={endDateStr} />
        </div>
        <div>
          <ProductionCalendar
            calendarDays={calendarDays}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}