import { eq } from "drizzle-orm";
import {
  DEFAULT_PARSE_STATUS,
  DEFAULT_DOCUMENT_INDEXING_MODE,
  DOCUMENT_STATUS,
  RUN_STATUS,
  type DocumentIndexingMode,
} from "@anchordesk/contracts";

import {
  documentJobs,
  documentVersions,
  documents,
  getDb,
} from "@anchordesk/db";
import { enqueueIngestFlow } from "@anchordesk/queue";
import { withProducerSpan } from "@anchordesk/tracing";

import { auth } from "@/auth";
import {
  requireOwnedDocumentJob,
  requireSuperAdminManagedDocumentJob,
} from "@/lib/guards/resources";
import { isSuperAdmin } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job =
    (await requireOwnedDocumentJob(jobId, session.user.id)) ??
    (isSuperAdmin(session.user)
      ? await requireSuperAdminManagedDocumentJob(jobId)
      : null);
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

  await withProducerSpan(
    {
      carrier: request.headers,
      name: "bullmq document ingest retry enqueue",
      attributes: {
        "messaging.destination.name": "document.parse",
        "messaging.operation": "publish",
        "messaging.system": "bullmq",
        document_version_id: job.documentVersionId,
        workspace_id: job.workspaceId ?? null,
        library_id: job.libraryId ?? null,
      },
    },
    async () =>
      enqueueIngestFlow({
        workspaceId: job.workspaceId ?? null,
        libraryId: job.libraryId ?? undefined,
        documentId: job.documentId,
        documentVersionId: job.documentVersionId,
        indexingMode,
      }),
  );

  return Response.json({ ok: true });
}
