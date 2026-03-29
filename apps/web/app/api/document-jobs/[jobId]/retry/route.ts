import { eq } from "drizzle-orm";
import {
  DEFAULT_PARSE_STATUS,
  DEFAULT_DOCUMENT_INDEXING_MODE,
  DOCUMENT_STATUS,
  RUN_STATUS,
  type DocumentIndexingMode,
} from "@knowledge-assistant/contracts";

import { documentJobs, documentVersions, documents, getDb } from "@knowledge-assistant/db";
import { enqueueIngestFlow } from "@knowledge-assistant/queue";

import { auth } from "@/auth";
import { requireOwnedDocumentJob } from "@/lib/guards/resources";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await requireOwnedDocumentJob(jobId, session.user.id);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== RUN_STATUS.FAILED) {
    return Response.json({ error: "Only failed jobs can be retried" }, { status: 400 });
  }

  const db = getDb();
  await db
    .update(documentJobs)
    .set({
      stage: DEFAULT_PARSE_STATUS,
      status: RUN_STATUS.QUEUED,
      progress: 0,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(documentJobs.id, jobId));

  await db
    .update(documentVersions)
    .set({
      parseStatus: DEFAULT_PARSE_STATUS,
    })
    .where(eq(documentVersions.id, job.documentVersionId));

  await db
    .update(documents)
    .set({
      status: DOCUMENT_STATUS.PROCESSING,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, job.documentId));

  const indexingMode =
    typeof job.metadataJson?.indexing_mode === "string"
      ? (job.metadataJson.indexing_mode as DocumentIndexingMode)
      : DEFAULT_DOCUMENT_INDEXING_MODE;

  await enqueueIngestFlow({
    workspaceId: job.workspaceId,
    documentId: job.documentId,
    documentVersionId: job.documentVersionId,
    indexingMode,
  });

  return Response.json({ ok: true });
}
