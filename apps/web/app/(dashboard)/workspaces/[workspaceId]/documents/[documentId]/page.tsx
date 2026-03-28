import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import {
  citationAnchors,
  documentBlocks,
  documentJobs,
  documents,
  documentVersions,
  getDb,
  workspaces,
} from "@law-doc/db";

import { auth } from "@/auth";
import { buildDocumentViewerPages } from "@/lib/api/document-view";

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

  let anchor: {
    documentPath: string;
    pageNo: number;
    anchorText: string;
  } | null = null;
  let blocks: Array<{
    id: string;
    pageNo: number;
    orderIndex: number;
    blockType: string;
    text: string;
    headingPath: string[] | null;
    sectionLabel: string | null;
  }> = [];
  let pageAnchors: Array<{
    id: string;
    pageNo: number;
    blockId: string | null;
    anchorText: string;
    anchorLabel: string;
  }> = [];

  if (latestVersion) {
    [anchor, blocks, pageAnchors] = await Promise.all([
      anchorId
        ? db
            .select({
              documentPath: citationAnchors.documentPath,
              pageNo: citationAnchors.pageNo,
              anchorText: citationAnchors.anchorText,
            })
            .from(citationAnchors)
            .where(
              and(
                eq(citationAnchors.id, anchorId),
                eq(citationAnchors.documentId, documentId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      db
        .select({
          id: documentBlocks.id,
          pageNo: documentBlocks.pageNo,
          orderIndex: documentBlocks.orderIndex,
          blockType: documentBlocks.blockType,
          text: documentBlocks.text,
          headingPath: documentBlocks.headingPath,
          sectionLabel: documentBlocks.sectionLabel,
        })
        .from(documentBlocks)
        .where(eq(documentBlocks.documentVersionId, latestVersion.id)),
      db
        .select({
          id: citationAnchors.id,
          pageNo: citationAnchors.pageNo,
          blockId: citationAnchors.blockId,
          anchorText: citationAnchors.anchorText,
          anchorLabel: citationAnchors.anchorLabel,
        })
        .from(citationAnchors)
        .where(eq(citationAnchors.documentVersionId, latestVersion.id)),
    ]);
  }

  const viewerPages = buildDocumentViewerPages({
    blocks,
    anchors: pageAnchors,
    highlightedAnchorId: anchorId,
  });

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
      <div className="card stack">
        <div className="toolbar">
          <h3>解析内容</h3>
          <span className="muted">
            {viewerPages.length > 0
              ? `${viewerPages.length} 页`
              : latestVersion?.parseStatus === "ready"
                ? "暂无解析内容"
                : "等待解析完成"}
          </span>
        </div>
        {viewerPages.length > 0 ? (
          viewerPages.map((page) => (
            <section key={page.pageNo} className="page-section">
              <div className="page-header">
                <strong>第 {page.pageNo} 页</strong>
                <span className="muted">{page.anchors.length} 条引用锚点</span>
              </div>
              {page.anchors.length > 0 ? (
                <div className="citation-list">
                  {page.anchors.map((item) => (
                    <Link
                      key={item.id}
                      href={`/workspaces/${workspaceId}/documents/${documentId}?anchorId=${item.id}`}
                      className={`citation-link${item.isHighlighted ? " is-highlighted" : ""}`}
                    >
                      {item.anchorLabel}
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="stack">
                {page.blocks.map((block) => (
                  <article
                    key={block.id}
                    className={`document-block${block.isHighlighted ? " is-highlighted" : ""}`}
                  >
                    <div className="toolbar">
                      <strong>{block.blockType}</strong>
                      <span className="muted">
                        {block.sectionLabel ?? block.headingPath.at(-1) ?? "正文"}
                        {block.anchorCount > 0 ? ` · ${block.anchorCount} 个引用` : ""}
                      </span>
                    </div>
                    {block.headingPath.length > 0 ? (
                      <div className="muted">
                        {block.headingPath.join(" / ")}
                      </div>
                    ) : null}
                    <div>{block.text}</div>
                  </article>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="muted">
            当前还没有可展示的解析内容。若状态仍在处理中，稍后刷新即可。
          </p>
        )}
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
