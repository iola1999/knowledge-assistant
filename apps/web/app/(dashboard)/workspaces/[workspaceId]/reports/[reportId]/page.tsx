import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, reports, reportSections, workspaces } from "@anchordesk/db";

import { auth } from "@/auth";
import { GenerateSectionButton } from "@/components/reports/generate-section-button";
import { OutlineButton } from "@/components/reports/outline-button";
import { buttonStyles, cn, ui } from "@/lib/ui";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ workspaceId: string; reportId: string }>;
}) {
  const { workspaceId, reportId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const db = getDb();

  const workspace = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  if (!workspace[0]) {
    notFound();
  }

  const report = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.workspaceId, workspaceId)))
    .limit(1);

  if (!report[0]) {
    notFound();
  }

  const sections = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId))
    .orderBy(asc(reportSections.orderIndex));

  return (
    <div className={ui.pageNarrow}>
      <div className={cn(ui.panelLarge, "grid gap-4")}>
        <div className={ui.toolbar}>
          <div className="space-y-1">
            <h1>{report[0].title}</h1>
            <p className={ui.muted}>状态：{report[0].status}</p>
          </div>
          <Link
            href={`/api/reports/${reportId}/export-docx`}
            className={buttonStyles({ variant: "secondary" })}
          >
            导出 DOCX
          </Link>
        </div>
        <div className={ui.toolbar}>
          <OutlineButton reportId={reportId} />
          <p className={ui.muted}>先生成大纲，再按章节逐步补全文本。</p>
        </div>
      </div>
      <div className={cn(ui.panel, "grid gap-4")}>
        <h3>章节</h3>
        <ul className="grid gap-3">
          {sections.map((section) => (
            <li key={section.id} className="grid gap-3 rounded-3xl border border-app-border bg-app-surface-soft/80 p-4">
              <div className={ui.toolbar}>
                <div>
                  <strong>{section.title}</strong> · {section.status}
                </div>
                <GenerateSectionButton
                  reportId={reportId}
                  sectionId={section.id}
                  sectionTitle={section.title}
                />
              </div>
              {section.contentMarkdown ? (
                <div className={cn(ui.muted, "whitespace-pre-wrap")}>{section.contentMarkdown}</div>
              ) : null}
            </li>
          ))}
        </ul>
        {sections.length === 0 ? <p className={ui.muted}>当前还没有章节，请先生成大纲。</p> : null}
      </div>
    </div>
  );
}
