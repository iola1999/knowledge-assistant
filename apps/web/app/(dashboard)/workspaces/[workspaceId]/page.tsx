import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  conversations,
  documentJobs,
  documentVersions,
  documents,
  getDb,
  messageCitations,
  messages,
  workspaces,
} from "@law-doc/db";

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

  const [workspace, docs, conversation] = await Promise.all([
    db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
      .limit(1),
    db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(desc(conversations.createdAt))
      .limit(1),
  ]);

  if (!workspace[0]) {
    notFound();
  }

  const latestVersionIds = docs
    .map((doc) => doc.latestVersionId)
    .filter((value): value is string => Boolean(value));

  const [latestVersions, latestJobs] = await Promise.all([
    latestVersionIds.length > 0
      ? db
          .select()
          .from(documentVersions)
          .where(inArray(documentVersions.id, latestVersionIds))
      : Promise.resolve([]),
    latestVersionIds.length > 0
      ? db
          .select()
          .from(documentJobs)
          .where(inArray(documentJobs.documentVersionId, latestVersionIds))
      : Promise.resolve([]),
  ]);

  const versionById = new Map(latestVersions.map((version) => [version.id, version]));
  const jobByVersionId = new Map(
    latestJobs.map((job) => [job.documentVersionId, job]),
  );

  const docsWithProgress = docs.map((doc) => {
    const latestVersion = doc.latestVersionId
      ? versionById.get(doc.latestVersionId) ?? null
      : null;
    const latestJob = latestVersion ? jobByVersionId.get(latestVersion.id) ?? null : null;

    return {
      ...doc,
      latestVersion,
      latestJob,
    };
  });

  const thread = conversation[0]
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation[0].id))
        .orderBy(asc(messages.createdAt))
    : [];

  const citations =
    thread.length > 0
      ? await db
          .select()
          .from(messageCitations)
          .where(inArray(messageCitations.messageId, thread.map((message) => message.id)))
          .orderBy(asc(messageCitations.ordinal))
      : [];

  const citationsByMessage = new Map<string, Array<(typeof citations)[number]>>();
  for (const citation of citations) {
    const group = citationsByMessage.get(citation.messageId) ?? [];
    group.push(citation);
    citationsByMessage.set(citation.messageId, group);
  }

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
            <>
              <div className="card stack">
                <div className="toolbar">
                  <h3>当前对话</h3>
                  <span className="muted">{conversation[0].title}</span>
                </div>
                <div className="thread">
                  {thread.length > 0 ? (
                    thread.map((message) => (
                      <article key={message.id} className="message-card">
                        <div className="message-meta">
                          <strong>
                            {message.role === "assistant"
                              ? "AI 助手"
                              : message.role === "user"
                                ? "你"
                                : message.role}
                          </strong>
                          <span className="muted">{message.status}</span>
                        </div>
                        <div>{message.contentMarkdown}</div>
                        {(citationsByMessage.get(message.id) ?? []).length > 0 ? (
                          <div className="citation-list">
                            {(citationsByMessage.get(message.id) ?? []).map((citation) => (
                              <Link
                                key={citation.id}
                                href={`/workspaces/${workspaceId}/documents/${citation.documentId}?anchorId=${citation.anchorId}`}
                                className="citation-link"
                              >
                                {citation.label}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <p className="muted">还没有消息。</p>
                  )}
                </div>
              </div>
              <Composer conversationId={conversation[0].id} />
            </>
          ) : (
            <div className="card">
              <p>还没有对话。</p>
              <p className="muted">调用 `POST /api/workspaces/{workspaceId}/conversations` 后即可提问。</p>
            </div>
          )}

          <div className="card">
            <h3>文档列表</h3>
            <ul className="list">
              {docsWithProgress.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/workspaces/${workspaceId}/documents/${doc.id}`}>
                    {doc.title}
                  </Link>
                  <span className="muted">
                    {" "}
                    · {doc.logicalPath}
                    {doc.latestJob
                      ? ` · ${doc.latestJob.stage} · ${doc.latestJob.progress}%`
                      : doc.latestVersion
                        ? ` · ${doc.latestVersion.parseStatus}`
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack">
          <UploadForm workspaceId={workspaceId} />
          <div className="card">
            <h3>处理队列</h3>
            <ul className="list">
              {docsWithProgress
                .filter((doc) => doc.latestJob || doc.status !== "ready")
                .slice(0, 6)
                .map((doc) => (
                  <li key={doc.id}>
                    <strong>{doc.title}</strong>
                    <span className="muted">
                      {" "}
                      · {doc.latestJob?.stage ?? doc.latestVersion?.parseStatus ?? doc.status}
                      {doc.latestJob ? ` · ${doc.latestJob.progress}%` : ""}
                    </span>
                  </li>
                ))}
              {docsWithProgress.filter((doc) => doc.latestJob || doc.status !== "ready")
                .length === 0 ? <li className="muted">当前没有进行中的处理任务。</li> : null}
            </ul>
          </div>
          <div className="card">
            <h3>最近文档</h3>
            <ul className="list">
              {docsWithProgress.slice(0, 5).map((doc) => (
                <li key={doc.id}>
                  {doc.title}{" "}
                  <span className="muted">
                    ({doc.latestJob?.stage ?? doc.latestVersion?.parseStatus ?? doc.status}
                    {doc.latestJob ? ` · ${doc.latestJob.progress}%` : ""})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
