import { and, desc, eq } from "drizzle-orm";
import {
  DEFAULT_PARSE_STATUS,
  DOCUMENT_STATUS,
  RUN_STATUS,
} from "@anchordesk/contracts";
import {
  buildContentAddressedStorageKey,
  matchesContentAddressedStorageKey,
  normalizeSha256Hex,
  objectExists,
} from "@anchordesk/storage";

import {
  ensureWorkspacePrivateLibrary,
  documents,
  documentJobs,
  documentVersions,
  getDb,
} from "@anchordesk/db";
import { enqueueIngestFlow } from "@anchordesk/queue";
import { withProducerSpan } from "@anchordesk/tracing";

import { auth } from "@/auth";
import { ensureWorkspaceDirectoryPath } from "@/lib/api/workspace-directories";
import { validateUploadSupport } from "@/lib/api/upload-policy";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

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
    sha256?: string;
    sourceFilename?: string;
    mimeType?: string;
    directoryPath?: string;
    clientMd5?: string;
  };

  const storageKey = String(body.storageKey ?? "").trim();
  const sha256 = String(body.sha256 ?? "").trim();
  const sourceFilename = String(body.sourceFilename ?? "").trim();
  const directoryPath =
    String(body.directoryPath ?? "")
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/\/+/g, "/") || "资料库";
  const mimeType = String(body.mimeType ?? "application/octet-stream");

  if (!sha256 || !sourceFilename) {
    return Response.json(
      { error: "sha256 and sourceFilename are required" },
      { status: 400 },
    );
  }

  const support = validateUploadSupport({
    filename: sourceFilename,
    contentType: mimeType,
  });
  if (!support.ok) {
    return Response.json({ error: support.message, code: support.code }, { status: 400 });
  }

  let canonicalStorageKey: string;
  let normalizedSha256: string;
  try {
    normalizedSha256 = normalizeSha256Hex(sha256);
    canonicalStorageKey = buildContentAddressedStorageKey(normalizedSha256);
  } catch {
    return Response.json({ error: "sha256 is invalid" }, { status: 400 });
  }

  if (storageKey && !matchesContentAddressedStorageKey(storageKey, normalizedSha256)) {
    return Response.json(
      { error: "storageKey does not match sha256" },
      { status: 400 },
    );
  }

  if (!(await objectExists(canonicalStorageKey))) {
    return Response.json(
      { error: "uploaded object not found in storage" },
      { status: 400 },
    );
  }

  const logicalPath = `${directoryPath}/${sourceFilename}`.replace(/\/+/g, "/");
  const title = sourceFilename.replace(/\.[^.]+$/, "");
  const db = getDb();
  const privateLibrary = await ensureWorkspacePrivateLibrary(workspaceId, db);

  await ensureWorkspaceDirectoryPath(workspaceId, directoryPath, db);

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
        libraryId: privateLibrary.id,
        workspaceId,
        title,
        sourceFilename,
        logicalPath,
        directoryPath,
        mimeType,
        status: DOCUMENT_STATUS.PROCESSING,
        tagsJson: [],
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
      storageKey: canonicalStorageKey,
      sha256: normalizedSha256,
      clientMd5: body.clientMd5 ? String(body.clientMd5) : null,
      parseStatus: DEFAULT_PARSE_STATUS,
      metadataJson: {},
    })
    .returning();

  await db
    .update(documents)
    .set({
      latestVersionId: documentVersion.id,
      status: DOCUMENT_STATUS.PROCESSING,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));

  const [documentJob] = await db
    .insert(documentJobs)
    .values({
      documentVersionId: documentVersion.id,
      queueJobId: `${documentVersion.id}:parse`,
      stage: DEFAULT_PARSE_STATUS,
      status: RUN_STATUS.QUEUED,
      progress: 0,
    })
    .returning();

  await withProducerSpan(
    {
      carrier: request.headers,
      name: "bullmq document ingest enqueue",
      attributes: {
        "messaging.destination.name": "document.parse",
        "messaging.operation": "publish",
        "messaging.system": "bullmq",
        document_version_id: documentVersion.id,
        workspace_id: workspaceId,
      },
    },
    async () =>
      enqueueIngestFlow({
        workspaceId,
        libraryId: privateLibrary.id,
        documentId: document.id,
        documentVersionId: documentVersion.id,
      }),
  );

  return Response.json(
    {
      document,
      documentVersion,
      documentJob,
    },
    { status: 201 },
  );
}
