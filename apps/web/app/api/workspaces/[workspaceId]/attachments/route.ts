import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import {
  DEFAULT_PARSE_STATUS,
  DOCUMENT_STATUS,
  RUN_STATUS,
  DOCUMENT_INDEXING_MODE,
} from "@knowledge-assistant/contracts";
import {
  conversationAttachments,
  documentJobs,
  documents,
  documentVersions,
  getDb,
} from "@knowledge-assistant/db";
import { enqueueIngestFlow } from "@knowledge-assistant/queue";

import { auth } from "@/auth";
import {
  buildDraftAttachmentExpiryDate,
  buildTemporaryAttachmentDirectory,
  buildTemporaryAttachmentLogicalPath,
} from "@/lib/api/conversation-attachments";
import { validateUploadSupport } from "@/lib/api/upload-policy";
import { requireOwnedConversation } from "@/lib/guards/resources";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

function getTemporaryStoragePrefix(workspaceId: string) {
  return `workspaces/${workspaceId}/temporary/`;
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

  const body = (await request.json().catch(() => ({}))) as {
    storageKey?: string;
    sourceFilename?: string;
    mimeType?: string;
    clientMd5?: string;
    draftUploadId?: string;
    conversationId?: string;
  };

  const storageKey = String(body.storageKey ?? "").trim();
  const sourceFilename = String(body.sourceFilename ?? "").trim();
  const mimeType = String(body.mimeType ?? "application/octet-stream");
  const draftUploadId = String(body.draftUploadId ?? "").trim() || null;
  const conversationId = String(body.conversationId ?? "").trim() || null;

  if (!storageKey || !sourceFilename) {
    return Response.json(
      { error: "storageKey and sourceFilename are required" },
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

  if (!storageKey.startsWith(getTemporaryStoragePrefix(workspaceId))) {
    return Response.json(
      { error: "storageKey does not belong to this workspace temporary scope" },
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

  const [document] = await db
    .insert(documents)
    .values({
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
      storageKey,
      sha256: crypto.createHash("sha256").update(storageKey).digest("hex"),
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
      queueJobId: `${documentVersion.id}:parse`,
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

  await enqueueIngestFlow({
    workspaceId,
    documentId: document.id,
    documentVersionId: documentVersion.id,
    indexingMode: DOCUMENT_INDEXING_MODE.PARSE_ONLY,
  });

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
