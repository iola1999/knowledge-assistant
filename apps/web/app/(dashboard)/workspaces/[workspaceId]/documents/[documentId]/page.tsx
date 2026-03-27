import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  citationAnchors,
  documentJobs,
  documents,
  documentVersions,
  getDb,
  workspaces,
} from "@law-doc/db";

import { auth } from "@/auth";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
  searchParams: Promise<{ anchorId?: string }>;
}) {
  const { workspaceId, documentId } = await params;
  const { anchorId } = await searchParams;
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

  const doc = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)))
    .limit(1);

  if (!doc[0]) {
    notFound();
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId));

  const latestVersion = doc[0].latestVersionId
    ? versions.find((version) => version.id === doc[0].latestVersionId) ?? null
    : versions[versions.length - 1] ?? null;

  const latestJob = latestVersion
    ? (
        await db
          .select()
          .from(documentJobs)
          .where(eq(documentJobs.documentVersionId, latestVersion.id))
          .limit(1)
      )[0] ?? null
    : null;

  const anchor = anchorId
    ? (
        await db
          .select()
          .from(citationAnchors)
          .where(
            and(
              eq(citationAnchors.id, anchorId),
              eq(citationAnchors.documentId, documentId),
            ),
          )
          .limit(1)
      )[0]
    : null;

  return (
    <div className="stack">
      <div className="card">
        <h1>{doc[0].title}</h1>
        <p className="muted">{doc[0].logicalPath}</p>
        <p>状态：{doc[0].status}</p>
        {latestVersion ? (
          <p className="muted">
            当前版本：v{latestVersion.version} · {latestVersion.parseStatus}
            {latestJob ? ` · ${latestJob.stage} · ${latestJob.progress}%` : ""}
          </p>
        ) : null}
      </div>
      {anchor ? (
        <div className="card">
          <h3>当前引用定位</h3>
          <p className="muted">
            {anchor.documentPath} · 第{anchor.pageNo}页
          </p>
          <p>{anchor.anchorText}</p>
        </div>
      ) : null}
      <div className="card">
        <h3>版本</h3>
        <ul className="list">
          {versions.map((version) => (
            <li key={version.id}>
              版本 {version.version} · {version.parseStatus} · sha256 {version.sha256}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
