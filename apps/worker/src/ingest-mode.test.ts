import { describe, expect, test } from "vitest";

import { DOCUMENT_INDEXING_MODE } from "@anchordesk/contracts";

import {
  parseDocumentIndexingMode,
  resolveDocumentIndexingMode,
  shouldSkipEmbeddingIndexing,
} from "./ingest-mode";

describe("document ingest mode helpers", () => {
  test("parses only known indexing modes", () => {
    expect(parseDocumentIndexingMode(DOCUMENT_INDEXING_MODE.PARSE_ONLY)).toBe(
      DOCUMENT_INDEXING_MODE.PARSE_ONLY,
    );
    expect(parseDocumentIndexingMode("unexpected")).toBeNull();
  });

  test("prefers payload indexing mode and falls back to version metadata", () => {
    expect(
      resolveDocumentIndexingMode({
        payloadIndexingMode: DOCUMENT_INDEXING_MODE.PARSE_ONLY,
        metadataJson: { indexing_mode: DOCUMENT_INDEXING_MODE.FULL },
      }),
    ).toBe(DOCUMENT_INDEXING_MODE.PARSE_ONLY);

    expect(
      resolveDocumentIndexingMode({
        metadataJson: { indexing_mode: DOCUMENT_INDEXING_MODE.PARSE_ONLY },
      }),
    ).toBe(DOCUMENT_INDEXING_MODE.PARSE_ONLY);
  });

  test("marks parse-only documents as skip-index targets", () => {
    expect(shouldSkipEmbeddingIndexing(DOCUMENT_INDEXING_MODE.PARSE_ONLY)).toBe(true);
    expect(shouldSkipEmbeddingIndexing(DOCUMENT_INDEXING_MODE.FULL)).toBe(false);
  });
});
