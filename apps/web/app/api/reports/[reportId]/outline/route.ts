import { asc, eq } from "drizzle-orm";

import { getDb, reports, reportSections } from "@law-doc/db";

import { auth } from "@/auth";
import { requireOwnedReport } from "@/lib/guards/resources";

export const runtime = "nodejs";

const defaultOutline = [
  { sectionKey: "background", title: "一、背景与范围" },
  { sectionKey: "analysis", title: "二、核心分析" },
  { sectionKey: "conclusion", title: "三、结论与建议" },
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await requireOwnedReport(reportId, userId);
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    task?: string;
  };

  const nextTitle = String(body.title ?? "").trim() || report.title;
  const db = getDb();

  await db
    .update(reports)
    .set({
      title: nextTitle,
      status: "generating",
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  const existingSections = await db
    .select({ id: reportSections.id })
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId))
    .orderBy(asc(reportSections.orderIndex));

  if (existingSections.length === 0) {
    await db.insert(reportSections).values(
      defaultOutline.map((section, index) => ({
        reportId,
        sectionKey: section.sectionKey,
        title: section.title,
        orderIndex: index,
        status: "draft" as const,
      })),
    );
  }

  await db
    .update(reports)
    .set({
      status: "draft",
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  const sections = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId))
    .orderBy(asc(reportSections.orderIndex));

  return Response.json({
    outline: {
      title: nextTitle,
      task: String(body.task ?? "").trim() || null,
      sections,
    },
  });
}
