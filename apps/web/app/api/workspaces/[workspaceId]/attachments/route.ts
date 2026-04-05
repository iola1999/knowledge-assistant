import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import {
  DEFAULT_PARSE_STATUS,
  DOCUMENT_STATUS,
  RUN_STATUS,
  DOCUMENT_INDEXING_MODE,
} from "@anchordesk/contracts";
import {
  conversationAttachments,
  documentJobs,
  documents,
  documentVersions,
  ensureWorkspacePrivateLibrary,
  getDb,
} from "@anchordesk/db";
import { buildIngestQueueJobId, enqueueIngestFlow } from "@anchordesk/queue";
import { withProducerSpan } from "@anchordesk/tracing";
import {
  buildContentAddressedStorageKey,
  matchesContentAddressedStorageKey,
  normalizeSha256Hex,
  objectExists,
} from "@anchordesk/storage";

import { auth } from "@/auth";
import {
  buildDraftAttachmentExpiryDate,
  buildTemporaryAttachmentDirectory,
  buildTemporaryAttachmentLogicalPath,
} from "@/lib/api/conversation-attachments";
import { ensureWorkspaceDirectoryPath } from "@/lib/api/workspace-directories";
import { validateUploadSupport } from "@/lib/api/upload-policy";
import { requireOwnedConversation } from "@/lib/guards/resources";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

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

  const body = (await request.json().catch(() => ({}))) as {
    storageKey?: string;
    sha256?: string;
    sourceFilename?: string;
    mimeType?: string;
    clientMd5?: string;
    draftUploadId?: string;
    conversationId?: string;
  };

  const storageKey = String(body.storageKey ?? "").trim();
  const sha256 = String(body.sha256 ?? "").trim();
  const sourceFilename = String(body.sourceFilename ?? "").trim();
  const mimeType = String(body.mimeType ?? "application/octet-stream");
  const draftUploadId = String(body.draftUploadId ?? "").trim() || null;
  const conversationId = String(body.conversationId ?? "").trim() || null;

  if (!sha256 || !sourceFilename) {
    return Response.json(
      { error: "sha256 and sourceFilename are required" },
      { status: 400 },
    );
  }

  if (!draftUploadId && !conversationId) {
    return Response.json(
      { error: "draftUploadId or conversationId is required" },
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

  if (conversationId) {
    const conversation = await requireOwnedConversation(conversationId, userId);
    if (!conversation || conversation.workspaceId !== workspaceId) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  const attachmentKey = crypto.randomUUID().slice(0, 8);
  const directoryPath = buildTemporaryAttachmentDirectory({
    draftUploadId,
    conversationId,
    attachmentKey,
  });
  const logicalPath = buildTemporaryAttachmentLogicalPath({
    directoryPath,
    sourceFilename,
  });
  const title = sourceFilename.replace(/\.[^.]+$/, "");
  const db = getDb();
  const privateLibrary = await ensureWorkspacePrivateLibrary(workspaceId, db);

  await ensureWorkspaceDirectoryPath(workspaceId, directoryPath, db);

  const [document] = await db
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

  const [documentVersion] = await db
    .insert(documentVersions)
    .values({
      documentId: document.id,
      version: 1,
      storageKey: canonicalStorageKey,
      sha256: normalizedSha256,
      clientMd5: body.clientMd5 ? String(body.clientMd5) : null,
      parseStatus: DEFAULT_PARSE_STATUS,
      metadataJson: {
        indexing_mode: DOCUMENT_INDEXING_MODE.PARSE_ONLY,
        source: "conversation_attachment",
      },
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
      queueJobId: buildIngestQueueJobId(documentVersion.id, "parse"),
      stage: DEFAULT_PARSE_STATUS,
      status: RUN_STATUS.QUEUED,
      progress: 0,
    })
    .returning();

  const [attachment] = await db
    .insert(conversationAttachments)
    .values({
      workspaceId,
      conversationId,
      draftUploadId,
      documentId: document.id,
      documentVersionId: documentVersion.id,
      expiresAt: draftUploadId ? buildDraftAttachmentExpiryDate() : null,
      claimedAt: conversationId ? new Date() : null,
    })
    .returning();

  await withProducerSpan(
    {
      carrier: request.headers,
      name: "bullmq parse-only attachment ingest enqueue",
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
        indexingMode: DOCUMENT_INDEXING_MODE.PARSE_ONLY,
      }),
  );

  return Response.json(
    {
      attachment,
      document,
      documentVersion,
      documentJob,
    },
    { status: 201 },
  );
}
