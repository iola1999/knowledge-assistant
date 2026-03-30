import { and, asc, eq, ne } from "drizzle-orm";

import {
  documents,
  documentVersions,
  findWorkspaceAccessibleDocument,
  getDb,
} from "@anchordesk/db";

import { auth } from "@/auth";
import {
  deleteDocumentSearchIndexAndAssets,
  syncDocumentCitationMetadata,
  syncDocumentSearchIndex,
} from "@/lib/api/document-index";
import {
  buildDocumentMetadataUpdate,
  documentMetadataPatchSchema,
} from "@/lib/api/document-metadata";
import { ensureWorkspaceDirectoryPath } from "@/lib/api/workspace-directories";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const { workspaceId, documentId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await requireOwnedWorkspace(workspaceId, userId);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const document = await findWorkspaceAccessibleDocument(workspaceId, documentId, db);

  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(asc(documentVersions.version));

  return Response.json({ document, versions });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const { workspaceId, documentId } = await params;
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
  const parsed = documentMetadataPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid document metadata patch" },
      { status: 400 },
    );
  }

  const db = getDb();
  const document = await findWorkspaceAccessibleDocument(workspaceId, documentId, db);

  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.workspaceId !== workspaceId) {
    return Response.json(
      { error: "Subscribed global library documents are read-only" },
      { status: 403 },
    );
  }

  const next = buildDocumentMetadataUpdate(
    {
      title: document.title,
      sourceFilename: document.sourceFilename,
      directoryPath: document.directoryPath,
      logicalPath: document.logicalPath,
      docType: document.docType,
      tags: document.tagsJson ?? [],
    },
    parsed.data,
  );

  if (
    next.logicalPath !== document.logicalPath &&
    (
      await db
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.logicalPath, next.logicalPath),
            ne(documents.id, documentId),
          ),
        )
        .limit(1)
    )[0]
  ) {
    return Response.json(
      { error: "A document already exists at the target path" },
      { status: 409 },
    );
  }

  if (!next.metadataChanged) {
    return Response.json({ document });
  }

  if (next.pathChanged) {
    await ensureWorkspaceDirectoryPath(workspaceId, next.directoryPath, db);
  }

  const [updatedDocument] = await db
    .update(documents)
    .set({
      title: next.title,
      sourceFilename: next.sourceFilename,
      directoryPath: next.directoryPath,
      logicalPath: next.logicalPath,
      docType: next.docType,
      tagsJson: next.tags,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))
    .returning();

  if (next.pathChanged) {
    await syncDocumentCitationMetadata({
      documentId,
      title: next.title,
      logicalPath: next.logicalPath,
    });
  }

  if (next.searchPayloadChanged) {
    await syncDocumentSearchIndex(documentId);
  }

  return Response.json({ document: updatedDocument });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const { workspaceId, documentId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await requireOwnedWorkspace(workspaceId, userId);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const document = await findWorkspaceAccessibleDocument(workspaceId, documentId, db);

  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.workspaceId !== workspaceId) {
    return Response.json(
      { error: "Subscribed global library documents are read-only" },
      { status: 403 },
    );
  }

  await deleteDocumentSearchIndexAndAssets(documentId);
  await db.delete(documents).where(eq(documents.id, documentId));

  return Response.json({ ok: true });
}
