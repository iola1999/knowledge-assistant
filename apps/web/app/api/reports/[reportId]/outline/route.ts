import { eq } from "drizzle-orm";
import { REPORT_STATUS } from "@anchordesk/contracts";
import { createReportOutlineHandler } from "@anchordesk/agent-tools";

import { getDb, reports, reportSections } from "@anchordesk/db";

import { auth } from "@/auth";
import { requireOwnedReport } from "@/lib/guards/resources";

export const runtime = "nodejs";

function statusFromToolError(error: { code: string; retryable: boolean }) {
  if (error.code.endsWith("_NOT_FOUND")) {
    return 404;
  }

  if (error.code.endsWith("_NOT_CONFIGURED")) {
    return 503;
  }

  return error.retryable ? 503 : 400;
}

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
  const task =
    String(body.task ?? "").trim() ||
    `围绕「${nextTitle}」整理工作空间中的核心事实、分析与建议。`;
  const db = getDb();

  await db
    .update(reports)
    .set({
      title: nextTitle,
      status: REPORT_STATUS.GENERATING,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  const result = await createReportOutlineHandler({
    workspace_id: report.workspaceId,
    title: nextTitle,
    task,
    evidence_anchor_ids: [],
  });

  if ("error" in result) {
    await db
      .update(reports)
      .set({
        status: REPORT_STATUS.FAILED,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    return Response.json(
      {
        error: result.error.message,
        code: result.error.code,
      },
      { status: statusFromToolError(result.error) },
    );
  }

  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(reportSections).where(eq(reportSections.reportId, reportId));
    await tx.insert(reportSections).values(
      result.outline.sections.map(
        (
          section: { section_key: string; title: string },
          index: number,
        ) => ({
          reportId,
          sectionKey: section.section_key,
          title: section.title,
          orderIndex: index,
          status: REPORT_STATUS.DRAFT,
        }),
      ),
    );
    await tx
      .update(reports)
      .set({
        title: result.outline.title,
        status: REPORT_STATUS.DRAFT,
        updatedAt,
      })
      .where(eq(reports.id, reportId));
  });

  const sections = result.outline.sections.map(
    (
      section: { section_key: string; title: string },
      index: number,
    ) => ({
      reportId,
      sectionKey: section.section_key,
      title: section.title,
      orderIndex: index,
      status: REPORT_STATUS.DRAFT,
    }),
  );

  return Response.json({
    outline: {
      title: result.outline.title,
      task,
      sections,
    },
  });
}
