import crypto from "node:crypto";

import { QueueEvents, Worker } from "bullmq";
import { eq } from "drizzle-orm";

import {
  citationAnchors,
  documentBlocks,
  documentChunks,
  documentJobs,
  documentPages,
  documentVersions,
  documents,
  getDb,
  parseArtifacts,
} from "@law-doc/db";
import { QUEUE_NAMES, getRedisConnection } from "@law-doc/queue";
import { getJson, getObjectBytes, putJson } from "@law-doc/storage";

type ParseArtifact = {
  page_count: number;
  pages: Array<{ page_no: number; width?: number; height?: number; text_length?: number }>;
  blocks: Array<{
    page_no: number;
    order_index: number;
    block_type: string;
    section_label?: string | null;
    heading_path?: string[];
    text: string;
    bbox_json?: { x1: number; y1: number; x2: number; y2: number } | null;
  }>;
  parse_score_bp: number;
};

const db = getDb();
const parserServiceUrl = process.env.PARSER_SERVICE_URL ?? "http://localhost:8001";

async function updateJob(
  documentVersionId: string,
  stage: string,
  progress: number,
  status: "queued" | "running" | "completed" | "failed" = "running",
) {
  await db
    .update(documentJobs)
    .set({
      stage: stage as never,
      status: status as never,
      progress,
      startedAt: status === "running" ? new Date() : undefined,
      finishedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(documentJobs.documentVersionId, documentVersionId));

  await db
    .update(documentVersions)
    .set({
      parseStatus: stage as never,
    })
    .where(eq(documentVersions.id, documentVersionId));
}

async function completeJob(documentVersionId: string) {
  await updateJob(documentVersionId, "ready", 100, "completed");
}

async function fetchVersion(documentVersionId: string) {
  const rows = await db
    .select({
      versionId: documentVersions.id,
      documentId: documentVersions.documentId,
      storageKey: documentVersions.storageKey,
      sha256: documentVersions.sha256,
      fileSizeBytes: documentVersions.fileSizeBytes,
      parseArtifactId: documentVersions.parseArtifactId,
      documentTitle: documents.title,
      workspaceId: documents.workspaceId,
      documentPath: documents.logicalPath,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, documentVersionId))
    .limit(1);

  return rows[0] ?? null;
}

async function ensureVersionFingerprint(documentVersionId: string) {
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }

  const bytes = await getObjectBytes(version.storageKey);
  if (!bytes) {
    throw new Error(`Object ${version.storageKey} not found in storage`);
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const fileSizeBytes = bytes.byteLength;

  if (version.sha256 !== sha256 || version.fileSizeBytes !== fileSizeBytes) {
    await db
      .update(documentVersions)
      .set({
        sha256,
        fileSizeBytes,
      })
      .where(eq(documentVersions.id, documentVersionId));
  }

  return {
    ...version,
    sha256,
    fileSizeBytes,
  };
}

async function parseDocument(documentVersionId: string) {
  await updateJob(documentVersionId, "parsing_layout", 20);
  const version = await ensureVersionFingerprint(documentVersionId);

  const cached = await db
    .select()
    .from(parseArtifacts)
    .where(eq(parseArtifacts.sha256, version.sha256))
    .limit(1);

  if (cached[0]) {
    await db
      .update(documentVersions)
      .set({
        parseArtifactId: cached[0].id,
        pageCount: cached[0].pageCount,
        parseScoreBp: cached[0].parseScoreBp,
      })
      .where(eq(documentVersions.id, documentVersionId));

    return cached[0].artifactStorageKey;
  }

  const response = await fetch(`${parserServiceUrl}/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: version.workspaceId,
      document_version_id: version.versionId,
      storage_key: version.storageKey,
      sha256: version.sha256,
      title: version.documentTitle,
      logical_path: version.documentPath,
    }),
  });

  if (!response.ok) {
    throw new Error(`Parser service failed with ${response.status}`);
  }

  const artifact = (await response.json()) as ParseArtifact;
  const artifactStorageKey = `parse-artifacts/${version.sha256}.json`;
  await putJson(artifactStorageKey, artifact);

  await db
    .insert(parseArtifacts)
    .values({
      sha256: version.sha256,
      artifactStorageKey,
      pageCount: artifact.page_count,
      parseScoreBp: artifact.parse_score_bp,
      parserVersion: "parser-service-v1",
    })
    .onConflictDoNothing();

  const [artifactRecord] = await db
    .select()
    .from(parseArtifacts)
    .where(eq(parseArtifacts.sha256, version.sha256))
    .limit(1);

  await db
    .update(documentVersions)
    .set({
      parseArtifactId: artifactRecord?.id ?? null,
      pageCount: artifact.page_count,
      parseScoreBp: artifact.parse_score_bp,
    })
    .where(eq(documentVersions.id, documentVersionId));

  return artifactStorageKey;
}

async function chunkDocument(documentVersionId: string) {
  await updateJob(documentVersionId, "chunking", 45);
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }

  const artifactRecord = await db
    .select()
    .from(parseArtifacts)
    .where(eq(parseArtifacts.sha256, version.sha256))
    .limit(1);

  const artifactStorageKey = artifactRecord[0]?.artifactStorageKey;
  if (!artifactStorageKey) {
    throw new Error("Parse artifact record not found");
  }

  const artifact = await getJson<ParseArtifact>(artifactStorageKey);
  if (!artifact) {
    throw new Error("Parse artifact not found");
  }

  await db.delete(documentPages).where(eq(documentPages.documentVersionId, documentVersionId));
  await db.delete(documentBlocks).where(eq(documentBlocks.documentVersionId, documentVersionId));
  await db.delete(documentChunks).where(eq(documentChunks.documentVersionId, documentVersionId));
  await db.delete(citationAnchors).where(
    eq(citationAnchors.documentVersionId, documentVersionId),
  );

  if (artifact.pages.length) {
    await db.insert(documentPages).values(
      artifact.pages.map((page) => ({
        documentVersionId,
        pageNo: page.page_no,
        width: page.width,
        height: page.height,
        textLength: page.text_length,
      })),
    );
  }

  const insertedBlocks =
    artifact.blocks.length > 0
      ? await db
          .insert(documentBlocks)
          .values(
            artifact.blocks.map((block) => ({
              documentVersionId,
              pageNo: block.page_no,
              orderIndex: block.order_index,
              blockType: block.block_type,
              sectionLabel: block.section_label ?? null,
              headingPath: block.heading_path ?? [],
              text: block.text,
              bboxJson: block.bbox_json ?? null,
            })),
          )
          .returning()
      : [];

  if (insertedBlocks.length) {
    const insertedChunks = await db
      .insert(documentChunks)
      .values(
        insertedBlocks.map((block) => ({
          workspaceId: version.workspaceId,
          documentId: version.documentId,
          documentVersionId,
          sourceBlockId: block.id,
          pageStart: block.pageNo,
          pageEnd: block.pageNo,
          sectionLabel: block.sectionLabel,
          headingPath: block.headingPath,
          chunkText: block.text,
          plainText: block.text,
          keywords: [],
          tokenCount: block.text.length,
        })),
      )
      .returning();

    await db.insert(citationAnchors).values(
      insertedChunks.map((chunk, index) => ({
        workspaceId: version.workspaceId,
        documentId: version.documentId,
        documentVersionId,
        chunkId: chunk.id,
        blockId: chunk.sourceBlockId,
        pageNo: chunk.pageStart,
        documentPath: version.documentPath,
        anchorLabel: `${version.documentTitle} · 第${chunk.pageStart}页`,
        anchorText: chunk.chunkText,
        bboxJson: insertedBlocks[index]?.bboxJson ?? null,
      })),
    );
  }
}

async function embedDocument(documentVersionId: string) {
  await updateJob(documentVersionId, "embedding", 75);
}

async function indexDocument(documentVersionId: string) {
  await updateJob(documentVersionId, "indexing", 90);
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }

  await db
    .update(documentVersions)
    .set({
      parseStatus: "ready",
    })
    .where(eq(documentVersions.id, documentVersionId));

  await db
    .update(documents)
    .set({
      status: "ready",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, version.documentId));

  await completeJob(documentVersionId);
}

async function main() {
  const connection = getRedisConnection();

  const parseWorker = new Worker(
    QUEUE_NAMES.parse,
    async (job) => {
      await parseDocument(job.data.documentVersionId);
    },
    { connection },
  );

  const chunkWorker = new Worker(
    QUEUE_NAMES.chunk,
    async (job) => {
      await chunkDocument(job.data.documentVersionId);
    },
    { connection },
  );

  const embedWorker = new Worker(
    QUEUE_NAMES.embed,
    async (job) => {
      await embedDocument(job.data.documentVersionId);
    },
    { connection },
  );

  const indexWorker = new Worker(
    QUEUE_NAMES.index,
    async (job) => {
      await indexDocument(job.data.documentVersionId);
    },
    { connection },
  );

  const queueEvents = new QueueEvents(QUEUE_NAMES.index, { connection });
  queueEvents.on("completed", ({ jobId }) => {
    console.log(`[worker] completed ${jobId}`);
  });

  for (const worker of [parseWorker, chunkWorker, embedWorker, indexWorker]) {
    worker.on("failed", async (job, error) => {
      if (!job) return;

      const version = await fetchVersion(job.data.documentVersionId);

      await db
        .update(documentJobs)
        .set({
          stage: "failed",
          status: "failed",
          errorMessage: error.message,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documentJobs.documentVersionId, job.data.documentVersionId));

      await db
        .update(documentVersions)
        .set({
          parseStatus: "failed",
        })
        .where(eq(documentVersions.id, job.data.documentVersionId));

      if (version) {
        await db
          .update(documents)
          .set({
            status: "failed",
            updatedAt: new Date(),
          })
          .where(eq(documents.id, version.documentId));
      }
    });
  }

  console.log("[worker] ready");
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
