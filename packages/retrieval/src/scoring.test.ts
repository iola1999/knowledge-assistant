import { describe, expect, test } from "vitest";

import {
  buildDirectoryPrefixes,
  buildHashedEmbedding,
  chunkTextSnippet,
  computeBm25SparseScores,
  computeKeywordScore,
  extractStructuredTokens,
} from "./scoring";

describe("retrieval scoring helpers", () => {
  test("builds directory prefixes for nested logical paths", () => {
    expect(
      buildDirectoryPrefixes(
        "资料库/项目A/产品文档/2024版",
        "资料库/项目A/产品文档/2024版/发布手册.pdf",
      ),
    ).toEqual([
      "资料库",
      "资料库/项目A",
      "资料库/项目A/产品文档",
      "资料库/项目A/产品文档/2024版",
    ]);
  });

  test("extracts structured tokens for Chinese clauses and numbered sections", () => {
    const tokens = extractStructuredTokens("依据第8节、第5.1项整理上线检查清单");

    expect(tokens).toContain("第8节");
    expect(tokens).toContain("5.1");
    expect(tokens).toContain("上线");
    expect(tokens).toContain("清单");
  });

  test("produces deterministic hashed embeddings", () => {
    const first = buildHashedEmbedding("上线检查清单", 16);
    const second = buildHashedEmbedding("上线检查清单", 16);
    const third = buildHashedEmbedding("发布流程说明", 16);

    expect(first).toEqual(second);
    expect(first).not.toEqual(third);
    expect(first).toHaveLength(16);
  });

  test("truncates snippets with an ellipsis", () => {
    const snippet = chunkTextSnippet("a".repeat(330), 32);
    expect(snippet).toHaveLength(32);
    expect(snippet.endsWith("…")).toBe(true);
  });

  test("boosts scores when the query matches headings and body text", () => {
    const strong = computeKeywordScore("上线检查", {
      document_path: "资料库/项目A/产品文档/发布手册.pdf",
      section_label: "第8节 上线检查",
      heading_path: ["发布手册", "上线前检查", "上线检查"],
      keywords: ["上线", "检查"],
      chunk_text: "发布前需要完成回归测试并通知相关成员。",
    });

    const weak = computeKeywordScore("上线检查", {
      document_path: "资料库/项目A/会议纪要/周会.md",
      section_label: "会议纪要",
      heading_path: ["会议纪要"],
      keywords: ["沟通记录"],
      chunk_text: "本次会议讨论了排期，但没有列出具体检查清单。",
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0.5);
    expect(weak).toBeLessThan(0.3);
  });

  test("computes higher bm25 sparse scores for lexically matching documents", () => {
    const [strong, weak] = computeBm25SparseScores("上线检查清单", [
      "资料库/项目A/发布手册.pdf\n第8节 上线检查\n上线前需完成回归测试，并核对上线检查清单。",
      "资料库/项目A/会议纪要.md\n会议纪要\n本周主要讨论排期与分工。",
    ]);

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(0);
    expect(weak).toBe(0);
  });

  test("returns zero bm25 sparse scores when the query has no retrievable tokens", () => {
    expect(computeBm25SparseScores("   ", ["第一份材料", "第二份材料"])).toEqual([0, 0]);
  });
});
