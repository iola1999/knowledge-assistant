import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatCitationLocator, PARSE_STATUS } from "@knowledge-assistant/contracts";

import {
  citationAnchors,
  documentBlocks,
  documentJobs,
  documents,
  documentVersions,
  getDb,
  workspaces,
} from "@knowledge-assistant/db";

import { auth } from "@/auth";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { DocumentJobPanel } from "@/components/documents/document-job-panel";
import { DocumentMetadataForm } from "@/components/documents/document-metadata-form";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { readCitationLocator } from "@/lib/api/document-metadata";
import { buildDocumentViewerPages } from "@/lib/api/document-view";
import { documentTypeOptions } from "@/lib/api/document-metadata";
import { cn, ui } from "@/lib/ui";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
  searchParams: Promise<{ anchorId?: string; page?: string }>;
}) {
  const { workspaceId, documentId } = await params;
  const { anchorId, page } = await searchParams;
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
    anchorLabel: string;
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
    metadataJson?: Record<string, unknown> | null;
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
              anchorLabel: citationAnchors.anchorLabel,
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
          metadataJson: documentBlocks.metadataJson,
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
  const requestedPage = Number.parseInt(page ?? "", 10);
  const docTypeLabel =
    documentTypeOptions.find((item) => item.value === doc[0].docType)?.label ?? doc[0].docType;
  const tags = doc[0].tagsJson ?? [];
  const canRenderPdf = doc[0].mimeType.includes("pdf") && Boolean(latestVersion);

  return (
    <div className={ui.pageNarrow}>
      <div className={cn(ui.panelLarge, "grid gap-4")}>
        <div className={ui.toolbar}>
          <div className="space-y-1">
            <h1>{doc[0].title}</h1>
            <p className={ui.muted}>{doc[0].logicalPath}</p>
            <p>
              状态：{doc[0].status} · 类型：{docTypeLabel}
            </p>
            {tags.length > 0 ? <p className={ui.muted}>标签：{tags.join("、")}</p> : null}
            {latestVersion ? (
              <p className={ui.muted}>
                当前版本：v{latestVersion.version} · {latestVersion.parseStatus}
                {latestJob ? ` · ${latestJob.stage} · ${latestJob.progress}%` : ""}
              </p>
            ) : null}
          </div>
          <DeleteDocumentButton workspaceId={workspaceId} documentId={documentId} />
        </div>
      </div>
      <DocumentMetadataForm
        workspaceId={workspaceId}
        document={{
          id: documentId,
          title: doc[0].title,
          directoryPath: doc[0].directoryPath,
          docType: doc[0].docType,
          tags,
        }}
      />
      <DocumentJobPanel job={latestJob} />
      {canRenderPdf ? (
        <PdfViewer
          fileUrl={`/api/workspaces/${workspaceId}/documents/${documentId}/content`}
          title={doc[0].title}
          initialPage={anchor?.pageNo ?? (Number.isFinite(requestedPage) ? requestedPage : 1)}
          highlightedText={anchor?.anchorText ?? ""}
        />
      ) : null}
      {anchor ? (
        <div className={cn(ui.panel, "grid gap-2")}>
          <h3>当前引用定位</h3>
          <p className={ui.muted}>
            {anchor.anchorLabel}
          </p>
          <p>{anchor.anchorText}</p>
        </div>
      ) : null}
      <div className={cn(ui.panel, "grid gap-4")}>
        <div className={ui.toolbar}>
          <h3>解析内容</h3>
          <span className={ui.muted}>
            {viewerPages.length > 0
              ? `${viewerPages.length} 页`
              : latestVersion?.parseStatus === PARSE_STATUS.READY
                ? "暂无解析内容"
                : "等待解析完成"}
          </span>
        </div>
        {viewerPages.length > 0 ? (
          viewerPages.map((page) => (
            <section
              key={page.pageNo}
              className="grid gap-4 rounded-3xl border border-app-border bg-app-surface-soft/80 p-4"
            >
              <div className={ui.toolbar}>
                <strong>第 {page.pageNo} 页</strong>
                <span className={ui.muted}>{page.anchors.length} 条引用锚点</span>
              </div>
              {page.anchors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {page.anchors.map((item) => (
                    <Link
                      key={item.id}
                      href={`/workspaces/${workspaceId}/documents/${documentId}?anchorId=${item.id}`}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-[13px]",
                        item.isHighlighted
                          ? "border-app-border-strong bg-white"
                          : "border-app-border bg-app-surface-soft hover:border-app-border-strong",
                      )}
                    >
                      {item.anchorLabel}
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3">
                {page.blocks.map((block) => (
                  <article
                    key={block.id}
                    className={cn(
                      "grid gap-3 rounded-2xl border p-4",
                      block.isHighlighted
                        ? "border-app-border-strong bg-white shadow-soft"
                        : "border-app-border bg-white/84",
                    )}
                  >
                    <div className={ui.toolbar}>
                      <strong>{block.blockType}</strong>
                      <span className={ui.muted}>
                        {block.sectionLabel ?? block.headingPath.at(-1) ?? "正文"}
                        {block.anchorCount > 0 ? ` · ${block.anchorCount} 个引用` : ""}
                        {formatCitationLocator(
                          readCitationLocator(
                            (block.metadataJson as Record<string, unknown> | null | undefined) ??
                              null,
                          ),
                        )
                          ? ` · ${formatCitationLocator(
                              readCitationLocator(
                                (block.metadataJson as
                                  | Record<string, unknown>
                                  | null
                                  | undefined) ?? null,
                              ),
                            )}`
                          : ""}
                      </span>
                    </div>
                    {block.headingPath.length > 0 ? (
                      <div className={ui.muted}>
                        {block.headingPath.join(" / ")}
                      </div>
                    ) : null}
                    <div className="leading-7">{block.text}</div>
                  </article>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className={ui.muted}>
            当前还没有可展示的解析内容。若状态仍在处理中，稍后刷新即可。
          </p>
        )}
      </div>
      <div className={cn(ui.panel, "grid gap-3")}>
        <h3>版本</h3>
        <ul className="grid gap-2 pl-5 text-sm leading-6 text-app-muted-strong">
          {versions.map((version) => (
            <li key={version.id} className="list-disc">
              版本 {version.version} · {version.parseStatus} · sha256 {version.sha256}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
