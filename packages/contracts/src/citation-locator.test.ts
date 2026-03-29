import { describe, expect, test } from "vitest";

import {
  buildCitationReferenceLabel,
  formatCitationLocator,
} from "./citation-locator";

describe("citation locator helpers", () => {
  test("formats explicit document line ranges before other locator hints", () => {
    expect(
      formatCitationLocator({
        lineStart: 12,
        lineEnd: 18,
        pageLineStart: 2,
        pageLineEnd: 4,
        blockIndex: 3,
      }),
    ).toBe("第12-18行");
  });

  test("falls back to page-local lines or block index when global lines are absent", () => {
    expect(
      formatCitationLocator({
        pageLineStart: 5,
        pageLineEnd: 5,
      }),
    ).toBe("页内第5行");

    expect(
      formatCitationLocator({
        blockIndex: 4,
      }),
    ).toBe("第4段");
  });

  test("builds a compact reference label with locator details", () => {
    expect(
      buildCitationReferenceLabel({
        subject: "资料库/临时目录/发布清单.md",
        pageNo: 1,
        locator: {
          lineStart: 8,
          lineEnd: 11,
        },
        sectionLabel: "第8节",
      }),
    ).toBe("资料库/临时目录/发布清单.md · 第1页 · 第8-11行 · 第8节");
  });
});
