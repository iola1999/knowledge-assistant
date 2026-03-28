import { describe, expect, test } from "vitest";

import { buildDocumentViewerPages } from "./document-view";

describe("buildDocumentViewerPages", () => {
  test("groups blocks by page and sorts them by page then order", () => {
    const pages = buildDocumentViewerPages({
      blocks: [
        {
          id: "block-2",
          pageNo: 2,
          orderIndex: 2,
          blockType: "paragraph",
          text: "第二页第二块",
          headingPath: [],
          sectionLabel: null,
        },
        {
          id: "block-1",
          pageNo: 1,
          orderIndex: 1,
          blockType: "heading",
          text: "第一页标题",
          headingPath: ["第一页标题"],
          sectionLabel: "第1条",
        },
        {
          id: "block-3",
          pageNo: 2,
          orderIndex: 1,
          blockType: "paragraph",
          text: "第二页第一块",
          headingPath: ["第一页标题"],
          sectionLabel: null,
        },
      ],
      anchors: [],
    });

    expect(pages.map((page) => page.pageNo)).toEqual([1, 2]);
    expect(pages[1]?.blocks.map((block) => block.id)).toEqual(["block-3", "block-2"]);
  });

  test("marks the selected anchor and its source block", () => {
    const pages = buildDocumentViewerPages({
      blocks: [
        {
          id: "block-a",
          pageNo: 3,
          orderIndex: 1,
          blockType: "paragraph",
          text: "发生不可抗力时应及时通知。",
          headingPath: ["不可抗力"],
          sectionLabel: "第8条",
        },
      ],
      anchors: [
        {
          id: "anchor-a",
          pageNo: 3,
          blockId: "block-a",
          anchorText: "发生不可抗力时应及时通知。",
          anchorLabel: "资料库/主合同.pdf · 第3页 · 第8条",
        },
      ],
      highlightedAnchorId: "anchor-a",
    });

    expect(pages[0]?.anchors[0]).toMatchObject({
      id: "anchor-a",
      isHighlighted: true,
    });
    expect(pages[0]?.blocks[0]).toMatchObject({
      id: "block-a",
      isHighlighted: true,
      anchorCount: 1,
    });
  });
});
