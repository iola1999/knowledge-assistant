import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, reports, reportSections, workspaces } from "@law-doc/db";

import { auth } from "@/auth";

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
    .where(eq(reportSections.reportId, reportId));

  return (
    <div className="stack">
      <div className="card">
        <h1>{report[0].title}</h1>
        <p className="muted">状态：{report[0].status}</p>
      </div>
      <div className="card">
        <h3>章节</h3>
        <ul className="list">
          {sections.map((section) => (
            <li key={section.id}>
              {section.title} · {section.status}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
