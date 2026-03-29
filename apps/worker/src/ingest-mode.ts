import {
  DEFAULT_DOCUMENT_INDEXING_MODE,
  DOCUMENT_INDEXING_MODE,
  DOCUMENT_INDEXING_MODE_VALUES,
  type DocumentIndexingMode,
} from "@anchordesk/contracts";

export function parseDocumentIndexingMode(value: unknown): DocumentIndexingMode | null {
  return typeof value === "string" &&
    DOCUMENT_INDEXING_MODE_VALUES.includes(value as DocumentIndexingMode)
    ? (value as DocumentIndexingMode)
    : null;
}

export function resolveDocumentIndexingMode(input: {
  payloadIndexingMode?: unknown;
  metadataJson?: Record<string, unknown> | null;
}) {
  return (
    parseDocumentIndexingMode(input.payloadIndexingMode) ??
    parseDocumentIndexingMode(input.metadataJson?.indexing_mode) ??
    DEFAULT_DOCUMENT_INDEXING_MODE
  );
}

export function shouldSkipEmbeddingIndexing(mode: DocumentIndexingMode) {
  return mode === DOCUMENT_INDEXING_MODE.PARSE_ONLY;
}
