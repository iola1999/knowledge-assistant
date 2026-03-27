import crypto from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  documents,
  documentJobs,
  documentVersions,
  getDb,
} from "@law-doc/db";
import { enqueueIngestFlow } from "@law-doc/queue";

import { auth } from "@/auth";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

function getWorkspaceStoragePrefix(workspaceId: string) {
  return `workspaces/${workspaceId}/`;
}

export async function GET(
  _request: Request,
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

  const db = getDb();
  const items = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));

  return Response.json({ documents: items });
}

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

  const body = (await request.json()) as {
    storageKey?: string;
    sourceFilename?: string;
    mimeType?: string;
    directoryPath?: string;
    clientMd5?: string;
  };

  const storageKey = String(body.storageKey ?? "").trim();
  const sourceFilename = String(body.sourceFilename ?? "").trim();
  const directoryPath =
    String(body.directoryPath ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/") || "资料库";
  const mimeType = String(body.mimeType ?? "application/octet-stream");

  if (!storageKey || !sourceFilename) {
    return Response.json(
      { error: "storageKey and sourceFilename are required" },
      { status: 400 },
    );
  }

  if (!storageKey.startsWith(getWorkspaceStoragePrefix(workspaceId))) {
    return Response.json(
      { error: "storageKey does not belong to this workspace" },
      { status: 400 },
    );
  }

  const logicalPath = `${directoryPath}/${sourceFilename}`.replace(/\/+/g, "/");
  const title = sourceFilename.replace(/\.[^.]+$/, "");
  const db = getDb();

  const existingDocument = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.logicalPath, logicalPath)))
    .limit(1);

  let document = existingDocument[0];
  if (!document) {
    [document] = await db
      .insert(documents)
      .values({
        workspaceId,
        title,
        sourceFilename,
        logicalPath,
        directoryPath,
        mimeType,
        status: "processing",
      })
      .returning();
  }

  const latestVersion = await db
    .select({ version: documentVersions.version })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, document.id))
    .orderBy(desc(documentVersions.version))
    .limit(1);

  const versionNumber = (latestVersion[0]?.version ?? 0) + 1;
  const [documentVersion] = await db
    .insert(documentVersions)
    .values({
      documentId: document.id,
      version: versionNumber,
      storageKey,
      sha256: crypto.createHash("sha256").update(storageKey).digest("hex"),
      clientMd5: body.clientMd5 ? String(body.clientMd5) : null,
      parseStatus: "queued",
      metadataJson: {},
    })
    .returning();

  await db
    .update(documents)
    .set({
      latestVersionId: documentVersion.id,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));

  const [documentJob] = await db
    .insert(documentJobs)
    .values({
      documentVersionId: documentVersion.id,
      queueJobId: `${documentVersion.id}:parse`,
      stage: "queued",
      status: "queued",
      progress: 0,
    })
    .returning();

  await enqueueIngestFlow({
    workspaceId,
    documentId: document.id,
    documentVersionId: documentVersion.id,
  });

  return Response.json(
    {
      document,
      documentVersion,
      documentJob,
    },
    { status: 201 },
  );
}
