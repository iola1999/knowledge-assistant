import JSZip from "jszip";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  documents,
  documentVersions,
  getDb,
  workspaceDirectories,
} from "@anchordesk/db";
import { getObjectBytes } from "@anchordesk/storage";

import { auth } from "@/auth";
import { compactKnowledgeBaseSelection } from "@/lib/api/knowledge-base-operations";
import { isSameOrDescendantPath } from "@/lib/api/directory-paths";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

const downloadSchema = z.object({
  directoryIds: z.array(z.string().min(1)).max(200).default([]),
  documentIds: z.array(z.string().min(1)).max(200).default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await requireOwnedWorkspace(workspaceId, userId);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = downloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "下载参数无效" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [selectedDirectories, selectedDocuments, allDocuments] = await Promise.all([
    parsed.data.directoryIds.length > 0
      ? db
          .select()
          .from(workspaceDirectories)
          .where(
            and(
              eq(workspaceDirectories.workspaceId, workspaceId),
              isNull(workspaceDirectories.deletedAt),
              inArray(workspaceDirectories.id, parsed.data.directoryIds),
            ),
          )
      : Promise.resolve([]),
    parsed.data.documentIds.length > 0
      ? db
          .select()
          .from(documents)
          .where(
            and(eq(documents.workspaceId, workspaceId), inArray(documents.id, parsed.data.documentIds)),
          )
      : Promise.resolve([]),
    db.select().from(documents).where(eq(documents.workspaceId, workspaceId)),
  ]);

  const compactedSelection = compactKnowledgeBaseSelection({
    directories: selectedDirectories.map((directory) => ({
      id: directory.id,
      path: directory.path,
      name: directory.name,
    })),
    documents: selectedDocuments.map((document) => ({
      id: document.id,
      logicalPath: document.logicalPath,
      directoryPath: document.directoryPath,
      sourceFilename: document.sourceFilename,
    })),
  });

  const selectedDocumentRows = allDocuments.filter((document) => {
    if (compactedSelection.documents.some((selectedDocument) => selectedDocument.id === document.id)) {
      return true;
    }

    return compactedSelection.directories.some((directory) =>
      isSameOrDescendantPath(document.directoryPath, directory.path),
    );
  });

  const latestVersionIds = selectedDocumentRows
    .map((document) => document.latestVersionId)
    .filter((value): value is string => Boolean(value));

  const versions =
    latestVersionIds.length > 0
      ? await db
          .select({
            id: documentVersions.id,
            storageKey: documentVersions.storageKey,
          })
          .from(documentVersions)
          .where(inArray(documentVersions.id, latestVersionIds))
      : [];
  const versionById = new Map(versions.map((version) => [version.id, version] as const));

  if (selectedDocumentRows.length === 0) {
    return Response.json({ error: "没有可下载的资料" }, { status: 400 });
  }

  const zip = new JSZip();

  for (const document of selectedDocumentRows) {
    const version = document.latestVersionId
      ? versionById.get(document.latestVersionId) ?? null
      : null;
    if (!version) {
      continue;
    }

    const bytes = await getObjectBytes(version.storageKey);
    if (!bytes) {
      continue;
    }

    zip.file(document.logicalPath, bytes);
  }

  const archive = await zip.generateAsync({ type: "uint8array" });
  const archiveBuffer = Buffer.from(archive);
  const filename = `${workspace.slug || "knowledge-base"}-${Date.now()}.zip`;

  return new Response(archiveBuffer, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
