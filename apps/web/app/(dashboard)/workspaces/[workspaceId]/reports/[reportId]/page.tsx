import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, reports, reportSections, workspaces } from "@law-doc/db";

import { auth } from "@/auth";
import { GenerateSectionButton } from "@/components/reports/generate-section-button";
import { OutlineButton } from "@/components/reports/outline-button";

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
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
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
    <div className="stack">
      <div className="card">
        <div className="toolbar">
          <div>
            <h1>{report[0].title}</h1>
            <p className="muted">状态：{report[0].status}</p>
          </div>
          <Link href={`/api/reports/${reportId}/export-docx`} className="card">
            导出 DOCX
          </Link>
        </div>
        <div className="toolbar">
          <OutlineButton reportId={reportId} />
          <p className="muted">先生成大纲，再按章节逐步补全文本。</p>
        </div>
      </div>
      <div className="card">
        <h3>章节</h3>
        <ul className="list">
          {sections.map((section) => (
            <li key={section.id}>
              <div className="toolbar">
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
                <div className="muted">{section.contentMarkdown}</div>
              ) : null}
            </li>
          ))}
        </ul>
        {sections.length === 0 ? <p className="muted">当前还没有章节，请先生成大纲。</p> : null}
      </div>
    </div>
  );
}
