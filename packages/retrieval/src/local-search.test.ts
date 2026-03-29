import { describe, expect, test } from "vitest";

import { searchLocalChunks } from "./local-search";

describe("searchLocalChunks", () => {
  test("ranks locally matched attachment chunks ahead of weaker candidates", () => {
    const results = searchLocalChunks({
      query: "上线检查清单",
      topK: 2,
      chunks: [
        {
          anchorId: "anchor-1",
          chunkId: "chunk-1",
          documentId: "doc-1",
          documentVersionId: "version-1",
          documentPath: "资料库/临时目录/上线检查清单.md",
          pageStart: 1,
          pageEnd: 1,
          sectionLabel: "第8节",
          headingPath: ["发布总览", "上线检查"],
          docType: "note",
          keywords: ["上线", "检查", "清单"],
          snippet: "上线检查清单要求在发布前完成回归测试和负责人确认。",
        },
        {
          anchorId: "anchor-2",
          chunkId: "chunk-2",
          documentId: "doc-2",
          documentVersionId: "version-2",
          documentPath: "资料库/临时目录/会议纪要.md",
          pageStart: 1,
          pageEnd: 1,
          sectionLabel: null,
          headingPath: ["周会纪要"],
          docType: "meeting_note",
          keywords: ["同步", "风险"],
          snippet: "今天同步了排期和风险，但没有形成检查清单。",
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.anchorId).toBe("anchor-1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  test("returns an empty list when there is no usable query or chunk set", () => {
    expect(
      searchLocalChunks({
        query: "   ",
        topK: 3,
        chunks: [],
      }),
    ).toEqual([]);
  });
});
