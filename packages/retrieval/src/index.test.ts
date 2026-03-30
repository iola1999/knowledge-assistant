import { describe, expect, test } from "vitest";

import { buildLibrarySearchFilter, buildRetrievalTagValues } from "./index";

describe("retrieval index helpers", () => {
  test("includes document tags and doc type in retrieval tag values", () => {
    expect(
      buildRetrievalTagValues({
        docType: "guide",
        tags: ["上线检查", "发布流程"],
        sectionLabel: "第8节",
        headingPath: ["发布手册", "上线检查"],
        keywords: ["回归测试"],
      }),
    ).toEqual([
      "guide",
      "上线检查",
      "发布流程",
      "第8节",
      "发布手册",
      "回归测试",
    ]);
  });

  test("builds a library-scoped search filter with optional directory constraints", () => {
    expect(
      buildLibrarySearchFilter(["library-1", "library-2"], {
        directoryPrefix: "资料库/订阅/产品规范库",
      }),
    ).toEqual({
      must: [
        {
          key: "library_id",
          match: {
            any: ["library-1", "library-2"],
          },
        },
        {
          key: "directory_prefixes",
          match: {
            value: "资料库/订阅/产品规范库",
          },
        },
      ],
    });
  });
});
