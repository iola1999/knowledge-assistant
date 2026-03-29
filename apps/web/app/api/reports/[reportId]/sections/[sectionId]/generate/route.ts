import { and, eq, ne } from "drizzle-orm";
import { REPORT_STATUS } from "@anchordesk/contracts";
import { writeReportSectionHandler } from "@anchordesk/agent-tools";

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
  {
    params,
  }: {
    params: Promise<{ reportId: string; sectionId: string }>;
  },
) {
  const { reportId, sectionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await requireOwnedReport(reportId, userId);
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  const db = getDb();
  await db
    .update(reports)
    .set({
      status: REPORT_STATUS.GENERATING,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  const [section] = await db
    .select({
      id: reportSections.id,
      title: reportSections.title,
    })
    .from(reportSections)
    .where(and(eq(reportSections.id, sectionId), eq(reportSections.reportId, reportId)))
    .limit(1);

  if (!section) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    instruction?: string;
    evidenceAnchorIds?: string[];
  };

  const evidenceAnchorIds = Array.isArray(body.evidenceAnchorIds)
    ? body.evidenceAnchorIds.map((item) => String(item))
    : [];

  const instruction =
    String(body.instruction ?? "").trim() || `围绕「${section.title}」整理核心结论。`;
  const result = await writeReportSectionHandler({
    report_id: reportId,
    section_id: sectionId,
    instruction,
    evidence_anchor_ids: evidenceAnchorIds,
  });

  if ("error" in result) {
    await db
      .update(reportSections)
      .set({
        status: REPORT_STATUS.FAILED,
        updatedAt: new Date(),
      })
      .where(eq(reportSections.id, sectionId));

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

  await db
    .update(reportSections)
    .set({
      status: REPORT_STATUS.READY,
      contentMarkdown: result.section.markdown,
      citationsJson: result.section.citations.map(
        (citation: { anchor_id: string; label: string }) => ({
          anchorId: citation.anchor_id,
          label: citation.label,
        }),
      ),
      updatedAt: new Date(),
    })
    .where(eq(reportSections.id, sectionId));

  const pendingSections = await db
    .select({ id: reportSections.id })
    .from(reportSections)
    .where(
      and(eq(reportSections.reportId, reportId), ne(reportSections.status, REPORT_STATUS.READY)),
    )
    .limit(1);

  await db
    .update(reports)
    .set({
      status:
        pendingSections.length === 0 ? REPORT_STATUS.READY : REPORT_STATUS.GENERATING,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  return Response.json({
    section: {
      id: sectionId,
      markdown: result.section.markdown,
      citations: result.section.citations,
    },
  });
}
