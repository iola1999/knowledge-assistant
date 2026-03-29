import { describe, expect, test } from "vitest";
import {
  DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE,
  EMBEDDING_PROVIDER,
  RERANK_PROVIDER,
} from "@anchordesk/contracts";

import {
  describeRetrievalProvider,
  getEmbeddingBatchSize,
  parseDashScopeRerankResponse,
  resolveEmbeddingProvider,
  resolveRerankProvider,
} from "./providers";

describe("retrieval providers", () => {
  test("prefers dashscope embeddings when dashscope api key is present", () => {
    const provider = resolveEmbeddingProvider({
      DASHSCOPE_API_KEY: "sk-test",
    });

    expect(provider).toMatchObject({
      type: EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE,
      model: "text-embedding-v4",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    });
  });

  test("clamps dashscope embedding batch size to the official limit", () => {
    const provider = resolveEmbeddingProvider({
      DASHSCOPE_API_KEY: "sk-test",
      EMBEDDING_BATCH_SIZE: "32",
    });

    expect(getEmbeddingBatchSize(provider, { EMBEDDING_BATCH_SIZE: "32" })).toBe(
      DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE,
    );
  });

  test("falls back to local heuristic rerank when dashscope is not configured", () => {
    const provider = resolveRerankProvider({});

    expect(provider).toEqual({
      type: RERANK_PROVIDER.LOCAL_HEURISTIC,
    });
  });

  test("parses dashscope rerank response results", () => {
    const parsed = parseDashScopeRerankResponse({
      output: {
        results: [
          {
            index: 1,
            relevance_score: 0.91,
            document: { text: "第二份材料" },
          },
          {
            index: 0,
            relevance_score: 0.48,
          },
        ],
      },
    });

    expect(parsed).toEqual([
      { index: 1, relevance_score: 0.91, document_text: "第二份材料" },
      { index: 0, relevance_score: 0.48, document_text: null },
    ]);
  });

  test("describes the active retrieval provider pipeline", () => {
    const provider = describeRetrievalProvider({
      DASHSCOPE_API_KEY: "sk-test",
    });

    expect(provider).toBe("qdrant_dense_dashscope_compatible_dashscope");
  });
});
