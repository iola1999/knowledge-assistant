import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { documents, documentVersions, getDb, workspaces } from "@law-doc/db";

import { auth } from "@/auth";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
}) {
  const { workspaceId, documentId } = await params;
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

  return (
    <div className="stack">
      <div className="card">
        <h1>{doc[0].title}</h1>
        <p className="muted">{doc[0].logicalPath}</p>
        <p>状态：{doc[0].status}</p>
      </div>
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
