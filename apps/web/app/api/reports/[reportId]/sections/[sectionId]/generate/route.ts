import { and, eq, inArray, ne } from "drizzle-orm";

import { citationAnchors, getDb, reports, reportSections } from "@law-doc/db";

import { auth } from "@/auth";
import { requireOwnedReport } from "@/lib/guards/resources";

export const runtime = "nodejs";

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
      status: "generating",
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  const [section] = await db
    .select()
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

  const anchors =
    evidenceAnchorIds.length > 0
      ? await db
          .select({
            id: citationAnchors.id,
            documentPath: citationAnchors.documentPath,
            pageNo: citationAnchors.pageNo,
            quoteText: citationAnchors.anchorText,
          })
          .from(citationAnchors)
          .where(
            and(
              eq(citationAnchors.workspaceId, report.workspaceId),
              inArray(citationAnchors.id, evidenceAnchorIds),
            ),
          )
      : [];

  const instruction =
    String(body.instruction ?? "").trim() || `围绕「${section.title}」整理核心结论。`;

  const evidenceBlock =
    anchors.length > 0
      ? `\n\n### 依据资料\n${anchors
          .map(
            (anchor) =>
              `- ${anchor.documentPath} · 第${anchor.pageNo}页\n\n> ${anchor.quoteText}`,
          )
          .join("\n\n")}`
      : "\n\n### 依据资料\n- 当前章节尚未绑定明确引用，请补充后再完善。";

  const markdown = `## ${section.title}\n\n${instruction}${evidenceBlock}\n`;

  await db
    .update(reportSections)
    .set({
      status: "ready",
      contentMarkdown: markdown,
      citationsJson: anchors.map((anchor) => ({
        anchorId: anchor.id,
        label: `${anchor.documentPath} · 第${anchor.pageNo}页`,
      })),
      updatedAt: new Date(),
    })
    .where(eq(reportSections.id, sectionId));

  const pendingSections = await db
    .select({ id: reportSections.id })
    .from(reportSections)
    .where(and(eq(reportSections.reportId, reportId), ne(reportSections.status, "ready")))
    .limit(1);

  await db
    .update(reports)
    .set({
      status: pendingSections.length === 0 ? "ready" : "generating",
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId));

  return Response.json({
    section: {
      id: sectionId,
      markdown,
      citations: anchors,
    },
  });
}
