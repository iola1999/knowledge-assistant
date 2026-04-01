import { createServer } from "node:http";
import crypto from "node:crypto";

import { QueueEvents, Worker } from "bullmq";
import { eq } from "drizzle-orm";

import {
  buildCitationReferenceLabel,
  DOCUMENT_STATUS,
  PARSE_STATUS,
  RUN_STATUS,
  type CitationLocator,
  type ParseStatus,
  type RunStatus,
} from "@anchordesk/contracts";
import {
  citationAnchors,
  documentBlocks,
  documentChunks,
  documentJobs,
  documentPages,
  documentVersions,
  documents,
  getDb,
  initRuntimeSettings,
  parseArtifacts,
} from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import { QUEUE_NAMES, getRedisConnection } from "@anchordesk/queue";
import {
  deleteDocumentVersionPoints,
  embedTexts,
  upsertDocumentChunks,
} from "@anchordesk/retrieval";
import {
  buildContentAddressedStorageKey,
  deleteObject,
  getJson,
  getObjectBytes,
  isTemporaryUploadKey,
  putJson,
  putObjectBytes,
} from "@anchordesk/storage";
import {
  injectTraceContextHeaders,
  startNodeTracing,
  withClientSpan,
  withConsumerSpan,
} from "@anchordesk/tracing";
import { buildChunkSeeds } from "./chunking";
import {
  resolveDocumentIndexingMode,
  shouldSkipEmbeddingIndexing,
} from "./ingest-mode";
import { logger } from "./logger";

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
    metadata_json?: Record<string, unknown> | null;
  }>;
  parse_score_bp: number;
};

type EmbeddingArtifact = {
  generated_at: string;
  vector_size: number;
  points: Array<{
    chunk_id: string;
    vector: number[];
  }>;
};

const db = getDb();
const healthPort = Number(process.env.PORT ?? 4002);
const BULLMQ_EVENT = {
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

function createStageLogger(stage: string, documentVersionId: string) {
  return logger.child({
    stage,
    documentVersionId,
  });
}

function getParserServiceUrl() {
  return process.env.PARSER_SERVICE_URL ?? "http://localhost:8001";
}

function readNumericLocatorValue(
  locator: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = locator?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(1, Math.trunc(value));
    }
  }

  return null;
}

function readBlockLocator(metadataJson: Record<string, unknown> | null | undefined) {
  const locator =
    metadataJson?.locator && typeof metadataJson.locator === "object"
      ? (metadataJson.locator as Record<string, unknown>)
      : null;

  const result: CitationLocator = {
    lineStart: readNumericLocatorValue(locator, ["line_start", "lineStart"]),
    lineEnd: readNumericLocatorValue(locator, ["line_end", "lineEnd"]),
    pageLineStart: readNumericLocatorValue(locator, [
      "page_line_start",
      "pageLineStart",
    ]),
    pageLineEnd: readNumericLocatorValue(locator, ["page_line_end", "pageLineEnd"]),
    blockIndex: readNumericLocatorValue(locator, ["block_index", "blockIndex"]),
  };

  return Object.values(result).some((value) => value !== null) ? result : null;
}

async function updateJob(
  documentVersionId: string,
  stage: ParseStatus,
  progress: number,
  status: RunStatus = RUN_STATUS.RUNNING,
) {
  await db
    .update(documentJobs)
    .set({
      stage: stage as never,
      status: status as never,
      progress,
      startedAt: status === RUN_STATUS.RUNNING ? new Date() : undefined,
      finishedAt:
        status === RUN_STATUS.COMPLETED || status === RUN_STATUS.FAILED
          ? new Date()
          : undefined,
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
  await updateJob(documentVersionId, PARSE_STATUS.READY, 100, RUN_STATUS.COMPLETED);
}

async function fetchVersion(documentVersionId: string) {
  const rows = await db
    .select({
      versionId: documentVersions.id,
      documentId: documentVersions.documentId,
      libraryId: documents.libraryId,
      storageKey: documentVersions.storageKey,
      sha256: documentVersions.sha256,
      fileSizeBytes: documentVersions.fileSizeBytes,
      parseArtifactId: documentVersions.parseArtifactId,
      metadataJson: documentVersions.metadataJson,
      documentTitle: documents.title,
      documentMimeType: documents.mimeType,
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
  const canonicalStorageKey = buildContentAddressedStorageKey(sha256);
  let storageKey = version.storageKey;
  let previousStorageKey: string | null = null;
  const nextSha256 = isTemporaryUploadKey(version.storageKey) ? sha256 : version.sha256;

  if (isTemporaryUploadKey(version.storageKey)) {
    await putObjectBytes(canonicalStorageKey, bytes, version.documentMimeType);
    storageKey = canonicalStorageKey;
    previousStorageKey = version.storageKey;
  } else if (version.storageKey !== canonicalStorageKey || version.sha256 !== sha256) {
    try {
      await deleteObject(version.storageKey);
    } catch (error) {
      logger.warn(
        {
          documentVersionId,
          storageKey: version.storageKey,
          error: serializeErrorForLog(error),
        },
        "failed to remove mismatched content-addressed blob",
      );
    }
    throw new Error("uploaded object digest does not match the claimed sha256");
  }

  if (
    version.sha256 !== nextSha256 ||
    version.fileSizeBytes !== fileSizeBytes ||
    version.storageKey !== storageKey
  ) {
    await db
      .update(documentVersions)
      .set({
        storageKey,
        sha256: nextSha256,
        fileSizeBytes,
      })
      .where(eq(documentVersions.id, documentVersionId));
  }

  if (previousStorageKey) {
    try {
      await deleteObject(previousStorageKey);
    } catch (error) {
      logger.warn(
        {
          documentVersionId,
          previousStorageKey,
          error: serializeErrorForLog(error),
        },
        "failed to clean up temporary object after promoting content-addressed blob",
      );
    }
  }

  return {
    ...version,
    storageKey,
    sha256: nextSha256,
    fileSizeBytes,
  };
}

async function parseDocument(documentVersionId: string) {
  const stageLogger = createStageLogger(PARSE_STATUS.PARSING_LAYOUT, documentVersionId);
  stageLogger.info(
    {
      parserServiceUrl: getParserServiceUrl(),
    },
    "starting parse stage",
  );
  await updateJob(documentVersionId, PARSE_STATUS.PARSING_LAYOUT, 20);
  const version = await ensureVersionFingerprint(documentVersionId);
  const versionLogger = stageLogger.child({
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    documentPath: version.documentPath,
  });

  const cached = await db
    .select()
    .from(parseArtifacts)
    .where(eq(parseArtifacts.sha256, version.sha256))
    .limit(1);

  if (cached[0]) {
    versionLogger.info(
      {
        parseArtifactId: cached[0].id,
        pageCount: cached[0].pageCount,
        parseScoreBp: cached[0].parseScoreBp,
      },
      "reused cached parse artifact",
    );
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

  const response = await withClientSpan(
    {
      name: "POST parser /parse",
      attributes: {
        "http.method": "POST",
        "http.route": "/parse",
        document_version_id: version.versionId,
      },
    },
    async () => {
      const traceHeaders = injectTraceContextHeaders();
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      if (traceHeaders?.traceparent) {
        headers.traceparent = traceHeaders.traceparent;
      }
      if (traceHeaders?.tracestate) {
        headers.tracestate = traceHeaders.tracestate;
      }
      if (traceHeaders?.baggage) {
        headers.baggage = traceHeaders.baggage;
      }

      return fetch(`${getParserServiceUrl()}/parse`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          workspace_id: version.workspaceId,
          library_id: version.libraryId,
          document_version_id: version.versionId,
          storage_key: version.storageKey,
          sha256: version.sha256,
          title: version.documentTitle,
          logical_path: version.documentPath,
        }),
      });
    },
  );

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

  versionLogger.info(
    {
      parseArtifactId: artifactRecord?.id ?? null,
      pageCount: artifact.page_count,
      blockCount: artifact.blocks.length,
      parseScoreBp: artifact.parse_score_bp,
    },
    "parse stage completed",
  );

  return artifactStorageKey;
}

async function chunkDocument(documentVersionId: string) {
  const stageLogger = createStageLogger(PARSE_STATUS.CHUNKING, documentVersionId);
  stageLogger.info("starting chunk stage");
  await updateJob(documentVersionId, PARSE_STATUS.CHUNKING, 45);
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }
  const versionLogger = stageLogger.child({
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    documentPath: version.documentPath,
  });

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
              metadataJson: block.metadata_json ?? null,
            })),
          )
          .returning()
      : [];

  if (insertedBlocks.length) {
    const chunkSeeds = buildChunkSeeds(
      insertedBlocks.map((block) => ({
        id: block.id,
        pageNo: block.pageNo,
        orderIndex: block.orderIndex,
        blockType: block.blockType,
        sectionLabel: block.sectionLabel ?? null,
        headingPath: block.headingPath ?? [],
        text: block.text,
      })),
    );

    const insertedChunks = await db
      .insert(documentChunks)
      .values(
        chunkSeeds.map((chunk) => ({
          libraryId: version.libraryId,
          workspaceId: version.workspaceId,
          documentId: version.documentId,
          documentVersionId,
          sourceBlockId: chunk.sourceBlockId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionLabel: chunk.sectionLabel,
          headingPath: chunk.headingPath,
          chunkText: chunk.chunkText,
          plainText: chunk.plainText,
          keywords: chunk.keywords,
          tokenCount: chunk.tokenCount,
        })),
      )
      .returning();

    const blockById = new Map(insertedBlocks.map((block) => [block.id, block] as const));

    await db.insert(citationAnchors).values(
      insertedChunks.map((chunk) => {
        const sourceBlock = chunk.sourceBlockId
          ? blockById.get(chunk.sourceBlockId) ?? null
          : null;

        return {
          libraryId: version.libraryId,
          workspaceId: version.workspaceId,
          documentId: version.documentId,
          documentVersionId,
          chunkId: chunk.id,
          blockId: chunk.sourceBlockId,
          pageNo: chunk.pageStart,
          documentPath: version.documentPath,
          anchorLabel: buildCitationReferenceLabel({
            subject: version.documentTitle,
            pageNo: chunk.pageStart,
            sectionLabel: chunk.sectionLabel,
            locator: readBlockLocator(
              (sourceBlock?.metadataJson as Record<string, unknown> | null | undefined) ?? null,
            ),
          }),
          anchorText: chunk.chunkText,
          bboxJson: sourceBlock?.bboxJson ?? null,
        };
      }),
    );

    versionLogger.info(
      {
        blockCount: insertedBlocks.length,
        chunkCount: insertedChunks.length,
      },
      "chunk stage completed",
    );
    return;
  }

  versionLogger.info(
    {
      blockCount: insertedBlocks.length,
      chunkCount: 0,
    },
    "chunk stage completed with no chunks",
  );
}

async function fetchChunksForIndex(documentVersionId: string) {
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      libraryId: documentChunks.libraryId,
      workspaceId: documentChunks.workspaceId,
      documentId: documentChunks.documentId,
      documentVersionId: documentChunks.documentVersionId,
      pageStart: documentChunks.pageStart,
      pageEnd: documentChunks.pageEnd,
      sectionLabel: documentChunks.sectionLabel,
      headingPath: documentChunks.headingPath,
      keywords: documentChunks.keywords,
      text: documentChunks.chunkText,
      documentPath: documents.logicalPath,
      directoryPath: documents.directoryPath,
      docType: documents.docType,
      tags: documents.tagsJson,
      anchorId: citationAnchors.id,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .innerJoin(citationAnchors, eq(citationAnchors.chunkId, documentChunks.id))
    .where(eq(documentChunks.documentVersionId, documentVersionId));

  return rows.map((row) => ({
    pointId: row.chunkId,
    libraryId: row.libraryId ?? "",
    workspaceId: row.workspaceId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    chunkId: row.chunkId,
    anchorId: row.anchorId,
    docType: row.docType,
    documentPath: row.documentPath,
    directoryPath: row.directoryPath,
    tags: row.tags ?? [],
    pageStart: row.pageStart,
    pageEnd: row.pageEnd,
    headingPath: row.headingPath ?? [],
    sectionLabel: row.sectionLabel ?? null,
    keywords: row.keywords ?? [],
    text: row.text,
  }));
}

function getEmbeddingArtifactKey(documentVersionId: string) {
  return `embedding-artifacts/${documentVersionId}.json`;
}

async function embedDocument(documentVersionId: string) {
  const stageLogger = createStageLogger(PARSE_STATUS.EMBEDDING, documentVersionId);
  stageLogger.info("starting embedding stage");
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }
  const versionLogger = stageLogger.child({
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    documentPath: version.documentPath,
  });
  const indexingMode = resolveDocumentIndexingMode({
    metadataJson: (version.metadataJson as Record<string, unknown> | null | undefined) ?? null,
  });
  if (shouldSkipEmbeddingIndexing(indexingMode)) {
    versionLogger.info({ indexingMode }, "skipping embedding stage for parse-only document");
    return;
  }

  await updateJob(documentVersionId, PARSE_STATUS.EMBEDDING, 75);
  const chunks = await fetchChunksForIndex(documentVersionId);
  const vectors = await embedTexts(chunks.map((chunk) => chunk.text));

  await putJson(getEmbeddingArtifactKey(documentVersionId), {
    generated_at: new Date().toISOString(),
    vector_size: vectors[0]?.length ?? 0,
    points: chunks.map((chunk, index) => ({
      chunk_id: chunk.chunkId,
      vector: vectors[index] ?? [],
    })),
  } satisfies EmbeddingArtifact);

  versionLogger.info(
    {
      indexingMode,
      chunkCount: chunks.length,
      vectorSize: vectors[0]?.length ?? 0,
    },
    "embedding stage completed",
  );
}

async function indexDocument(documentVersionId: string) {
  const stageLogger = createStageLogger(PARSE_STATUS.INDEXING, documentVersionId);
  stageLogger.info("starting index stage");
  const version = await fetchVersion(documentVersionId);
  if (!version) {
    throw new Error(`Document version ${documentVersionId} not found`);
  }
  const versionLogger = stageLogger.child({
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    documentPath: version.documentPath,
  });
  const indexingMode = resolveDocumentIndexingMode({
    metadataJson: (version.metadataJson as Record<string, unknown> | null | undefined) ?? null,
  });

  if (shouldSkipEmbeddingIndexing(indexingMode)) {
    await deleteDocumentVersionPoints({
      libraryId: version.libraryId ?? "",
      documentVersionId,
    });
    await db
      .update(documentVersions)
      .set({
        parseStatus: PARSE_STATUS.READY,
      })
      .where(eq(documentVersions.id, documentVersionId));

    await db
      .update(documents)
      .set({
        status: DOCUMENT_STATUS.READY,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, version.documentId));

    await completeJob(documentVersionId);
    versionLogger.info(
      {
        indexingMode,
      },
      "index stage skipped vector sync for parse-only document",
    );
    return;
  }

  await updateJob(documentVersionId, PARSE_STATUS.INDEXING, 90);

  const chunks = await fetchChunksForIndex(documentVersionId);
  const embeddingArtifact =
    (await getJson<EmbeddingArtifact>(getEmbeddingArtifactKey(documentVersionId))) ?? null;
  const embeddedVectors = new Map(
    (embeddingArtifact?.points ?? []).map((item) => [item.chunk_id, item.vector]),
  );
  const vectors =
    chunks.length > 0 && chunks.every((chunk) => embeddedVectors.has(chunk.chunkId))
      ? chunks.map((chunk) => embeddedVectors.get(chunk.chunkId) ?? [])
      : undefined;

  await deleteDocumentVersionPoints({
    libraryId: version.libraryId ?? "",
    documentVersionId,
  });

  if (chunks.length > 0) {
    await upsertDocumentChunks(chunks, { vectors });
  }

  await db
    .update(documentVersions)
    .set({
      parseStatus: PARSE_STATUS.READY,
    })
    .where(eq(documentVersions.id, documentVersionId));

  await db
    .update(documents)
    .set({
      status: DOCUMENT_STATUS.READY,
      updatedAt: new Date(),
      })
      .where(eq(documents.id, version.documentId));

  await completeJob(documentVersionId);
  versionLogger.info(
    {
      indexingMode,
      chunkCount: chunks.length,
      vectorCount: vectors?.length ?? 0,
    },
    "index stage completed",
  );
}

async function main() {
  const tracing = startNodeTracing({
    serviceName: "anchordesk-worker",
  });
  await initRuntimeSettings();

  const connection = getRedisConnection();
  logger.info(
    {
      healthPort,
      otlpTraceExporterUrl: tracing.otlpTraceExporterUrl,
      parserServiceUrl: getParserServiceUrl(),
      redisConfigured: Boolean(connection.url),
    },
    "worker bootstrapped",
  );

  const parseWorker = new Worker(
    QUEUE_NAMES.parse,
    async (job) => {
      await withConsumerSpan(
        {
          carrier: job.data.traceContext,
          name: "document.parse process",
          attributes: {
            "messaging.destination.name": QUEUE_NAMES.parse,
            "messaging.operation": "process",
            "messaging.system": "bullmq",
            document_version_id: job.data.documentVersionId,
          },
        },
        async () => parseDocument(job.data.documentVersionId),
      );
    },
    { connection },
  );

  const chunkWorker = new Worker(
    QUEUE_NAMES.chunk,
    async (job) => {
      await withConsumerSpan(
        {
          carrier: job.data.traceContext,
          name: "document.chunk process",
          attributes: {
            "messaging.destination.name": QUEUE_NAMES.chunk,
            "messaging.operation": "process",
            "messaging.system": "bullmq",
            document_version_id: job.data.documentVersionId,
          },
        },
        async () => chunkDocument(job.data.documentVersionId),
      );
    },
    { connection },
  );

  const embedWorker = new Worker(
    QUEUE_NAMES.embed,
    async (job) => {
      await withConsumerSpan(
        {
          carrier: job.data.traceContext,
          name: "document.embed process",
          attributes: {
            "messaging.destination.name": QUEUE_NAMES.embed,
            "messaging.operation": "process",
            "messaging.system": "bullmq",
            document_version_id: job.data.documentVersionId,
          },
        },
        async () => embedDocument(job.data.documentVersionId),
      );
    },
    { connection },
  );

  const indexWorker = new Worker(
    QUEUE_NAMES.index,
    async (job) => {
      await withConsumerSpan(
        {
          carrier: job.data.traceContext,
          name: "document.index process",
          attributes: {
            "messaging.destination.name": QUEUE_NAMES.index,
            "messaging.operation": "process",
            "messaging.system": "bullmq",
            document_version_id: job.data.documentVersionId,
          },
        },
        async () => indexDocument(job.data.documentVersionId),
      );
    },
    { connection },
  );

  const queueEvents = new QueueEvents(QUEUE_NAMES.index, { connection });
  queueEvents.on(BULLMQ_EVENT.COMPLETED, ({ jobId }) => {
    logger.info(
      {
        queueName: QUEUE_NAMES.index,
        jobId,
      },
      "worker queue job completed",
    );
  });

  const healthServer = createServer((req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  healthServer.listen(healthPort, () => {
    logger.info({ healthPort }, "worker health endpoint listening");
  });

  for (const { queueName, worker } of [
    { queueName: QUEUE_NAMES.parse, worker: parseWorker },
    { queueName: QUEUE_NAMES.chunk, worker: chunkWorker },
    { queueName: QUEUE_NAMES.embed, worker: embedWorker },
    { queueName: QUEUE_NAMES.index, worker: indexWorker },
  ]) {
    worker.on(BULLMQ_EVENT.FAILED, async (job, error) => {
      if (!job) return;

      const version = await fetchVersion(job.data.documentVersionId);

      await db
        .update(documentJobs)
        .set({
          stage: PARSE_STATUS.FAILED,
          status: RUN_STATUS.FAILED,
          errorMessage: error.message,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documentJobs.documentVersionId, job.data.documentVersionId));

      await db
        .update(documentVersions)
        .set({
          parseStatus: PARSE_STATUS.FAILED,
        })
        .where(eq(documentVersions.id, job.data.documentVersionId));

      if (version) {
        await db
          .update(documents)
          .set({
            status: DOCUMENT_STATUS.FAILED,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, version.documentId));
      }

      logger.error(
        {
          queueName,
          jobId: job.id ?? null,
          documentVersionId:
            job.data && typeof job.data.documentVersionId === "string"
              ? job.data.documentVersionId
              : null,
          documentId: version?.documentId ?? null,
          workspaceId: version?.workspaceId ?? null,
          errorMessage: error.message,
          error: serializeErrorForLog(error),
        },
        "worker stage failed",
      );
    });
  }

  logger.info("worker ready");
}

main().catch((error) => {
  logger.fatal({ error: serializeErrorForLog(error) }, "worker fatal error");
  process.exit(1);
});
