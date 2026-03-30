import { eq, inArray } from "drizzle-orm";

import {
  citationAnchors,
  documentBlocks,
  documentChunks,
  documents,
  documentVersions,
  getDb,
  messageCitations,
} from "@anchordesk/db";
import { DOCUMENT_INDEXING_MODE } from "@anchordesk/contracts";
import {
  deleteDocumentVersionPoints,
  upsertDocumentChunks,
} from "@anchordesk/retrieval";
import { deleteObject, getJson } from "@anchordesk/storage";

import {
  buildAnchorLabel,
  buildMessageCitationLabel,
  readCitationLocator,
} from "./document-metadata";
import { resolveStorageKeysToDelete } from "./storage-assets";

type EmbeddingArtifact = {
  points: Array<{
    chunk_id: string;
    vector: number[];
  }>;
};

export function getEmbeddingArtifactKey(documentVersionId: string) {
  return `embedding-artifacts/${documentVersionId}.json`;
}

async function listDocumentVersions(documentId: string) {
  const db = getDb();
  return db
    .select({
      id: documentVersions.id,
      libraryId: documents.libraryId,
      workspaceId: documents.workspaceId,
      storageKey: documentVersions.storageKey,
      metadataJson: documentVersions.metadataJson,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.documentId, documentId));
}

async function fetchChunksForIndex(documentVersionId: string) {
  const db = getDb();
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

async function syncDocumentVersionIndex(input: {
  libraryId: string;
  documentVersionId: string;
  metadataJson?: Record<string, unknown> | null;
}) {
  if (input.metadataJson?.indexing_mode === DOCUMENT_INDEXING_MODE.PARSE_ONLY) {
    await deleteDocumentVersionPoints(input);
    return;
  }

  const chunks = await fetchChunksForIndex(input.documentVersionId);
  const embeddingArtifact = await getJson<EmbeddingArtifact>(
    getEmbeddingArtifactKey(input.documentVersionId),
  );
  const vectorsByChunkId = new Map(
    (embeddingArtifact?.points ?? []).map((item) => [item.chunk_id, item.vector] as const),
  );
  const vectors =
    chunks.length > 0 && chunks.every((chunk) => vectorsByChunkId.has(chunk.chunkId))
      ? chunks.map((chunk) => vectorsByChunkId.get(chunk.chunkId) ?? [])
      : undefined;

  await deleteDocumentVersionPoints(input);

  if (chunks.length > 0) {
    await upsertDocumentChunks(chunks, { vectors });
  }
}

export async function syncDocumentSearchIndex(documentId: string) {
  const versions = await listDocumentVersions(documentId);

  for (const version of versions) {
    if (!version.libraryId) {
      continue;
    }

    await syncDocumentVersionIndex({
      libraryId: version.libraryId,
      documentVersionId: version.id,
      metadataJson: (version.metadataJson as Record<string, unknown> | null | undefined) ?? null,
    });
  }
}

export async function deleteDocumentSearchIndexAndAssets(documentId: string) {
  const versions = await listDocumentVersions(documentId);
  const storageKeys = [...new Set(versions.map((version) => version.storageKey))];

  for (const version of versions) {
    if (!version.libraryId) {
      continue;
    }

    await deleteDocumentVersionPoints({
      libraryId: version.libraryId,
      documentVersionId: version.id,
    });
  }

  const referencedStorageKeys =
    storageKeys.length === 0
      ? []
      : (
          await getDb()
            .select({ storageKey: documentVersions.storageKey })
            .from(documentVersions)
            .where(inArray(documentVersions.storageKey, storageKeys))
        ).map((row) => row.storageKey);

  const storageKeysToDelete = resolveStorageKeysToDelete({
    referencedStorageKeys,
    deletingStorageKeys: versions.map((version) => version.storageKey),
  });

  await Promise.all([
    ...storageKeysToDelete.map((storageKey) => deleteObject(storageKey)),
    ...versions.map((version) => deleteObject(getEmbeddingArtifactKey(version.id))),
  ]);
}

export async function syncDocumentCitationMetadata(input: {
  documentId: string;
  title: string;
  logicalPath: string;
}) {
  const db = getDb();
  const anchors = await db
    .select({
      id: citationAnchors.id,
      pageNo: citationAnchors.pageNo,
      blockMetadataJson: documentBlocks.metadataJson,
      sectionLabel: documentChunks.sectionLabel,
    })
    .from(citationAnchors)
    .leftJoin(documentBlocks, eq(documentBlocks.id, citationAnchors.blockId))
    .leftJoin(documentChunks, eq(documentChunks.id, citationAnchors.chunkId))
    .where(eq(citationAnchors.documentId, input.documentId));

  for (const anchor of anchors) {
    await db
      .update(citationAnchors)
      .set({
        documentPath: input.logicalPath,
        anchorLabel: buildAnchorLabel(
          input.title,
          anchor.pageNo,
          readCitationLocator(
            (anchor.blockMetadataJson as Record<string, unknown> | null | undefined) ?? null,
          ),
          anchor.sectionLabel ?? null,
        ),
      })
      .where(eq(citationAnchors.id, anchor.id));
  }

  const citations = await db
    .select({
      id: messageCitations.id,
      pageNo: messageCitations.pageNo,
      blockId: messageCitations.blockId,
    })
    .from(messageCitations)
    .where(eq(messageCitations.documentId, input.documentId));
  const citationBlockIds = citations
    .map((citation) => citation.blockId)
    .filter((value): value is string => Boolean(value));

  const blocksById =
    citationBlockIds.length > 0
      ? new Map(
          (
            await db
              .select({
                id: documentBlocks.id,
                metadataJson: documentBlocks.metadataJson,
              })
              .from(documentBlocks)
              .where(inArray(documentBlocks.id, citationBlockIds))
          ).map((block) => [block.id, block] as const),
        )
      : new Map();

  for (const citation of citations) {
    await db
      .update(messageCitations)
      .set({
        documentPath: input.logicalPath,
        label: buildMessageCitationLabel(
          input.logicalPath,
          citation.pageNo,
          readCitationLocator(
            (
              blocksById.get(citation.blockId ?? "")?.metadataJson as
                | Record<string, unknown>
                | null
                | undefined
            ) ?? null,
          ),
        ),
      })
      .where(eq(messageCitations.id, citation.id));
  }
}
