import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { conversations, documents, getDb, workspaces } from "@law-doc/db";

import { Composer } from "@/components/chat/composer";
import { UploadForm } from "@/components/workspaces/upload-form";
import { auth } from "@/auth";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
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

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));

  const conversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  return (
    <div className="stack">
      <div className="toolbar">
        <div>
          <h1>{workspace[0].title}</h1>
          <p className="muted">{workspace[0].description || "暂无描述"}</p>
        </div>
      </div>

      <div className="grid two">
        <div className="stack">
          {conversation[0] ? (
            <Composer conversationId={conversation[0].id} />
          ) : (
            <div className="card">
              <p>还没有对话。</p>
              <p className="muted">调用 `POST /api/workspaces/{workspaceId}/conversations` 后即可提问。</p>
            </div>
          )}

          <div className="card">
            <h3>文档列表</h3>
            <ul className="list">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/workspaces/${workspaceId}/documents/${doc.id}`}>
                    {doc.title}
                  </Link>
                  <span className="muted"> · {doc.logicalPath}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack">
          <UploadForm workspaceId={workspaceId} />
          <div className="card">
            <h3>最近文档</h3>
            <ul className="list">
              {docs.slice(0, 5).map((doc) => (
                <li key={doc.id}>
                  {doc.title} <span className="muted">({doc.status})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
