import { describe, expect, test } from "vitest";

import {
  buildAnchorLabel,
  buildDocumentMetadataUpdate,
  buildDocumentPath,
  buildMessageCitationLabel,
  buildStoredFilename,
  normalizeDocumentTags,
  readCitationLocator,
} from "./document-metadata";

describe("document metadata helpers", () => {
  test("renames a document while preserving the existing extension", () => {
    expect(buildStoredFilename("发布说明-修订稿", "发布说明.docx")).toBe(
      "发布说明-修订稿.docx",
    );
    expect(buildStoredFilename("发布说明-修订稿.docx", "发布说明.docx")).toBe(
      "发布说明-修订稿.docx",
    );
  });

  test("normalizes tags by trimming whitespace and removing duplicates", () => {
    expect(normalizeDocumentTags([" 发布流程 ", "上线检查", "发布流程", "", "  "])).toEqual([
      "发布流程",
      "上线检查",
    ]);
  });

  test("normalizes directory paths and rebuilds the logical path", () => {
    expect(buildDocumentPath("///资料库//项目A/产品文档//", "发布手册.pdf")).toBe(
      "资料库/项目A/产品文档/发布手册.pdf",
    );
  });

  test("builds a metadata update for rename, move, type, and tags", () => {
    const next = buildDocumentMetadataUpdate(
      {
        title: "发布手册",
        sourceFilename: "发布手册.pdf",
        directoryPath: "资料库/项目A/旧目录",
        logicalPath: "资料库/项目A/旧目录/发布手册.pdf",
        docType: "guide",
        tags: ["发布流程"],
      },
      {
        title: "发布手册-修订稿",
        directoryPath: "/资料库/项目A/产品文档/",
        docType: "note",
        tags: [" 上线检查 ", "发布流程", "上线检查"],
      },
    );

    expect(next).toEqual({
      title: "发布手册-修订稿",
      sourceFilename: "发布手册-修订稿.pdf",
      directoryPath: "资料库/项目A/产品文档",
      logicalPath: "资料库/项目A/产品文档/发布手册-修订稿.pdf",
      docType: "note",
      tags: ["上线检查", "发布流程"],
      pathChanged: true,
      metadataChanged: true,
      searchPayloadChanged: true,
    });
  });

  test("does not mark metadata as changed when the patch is equivalent", () => {
    const next = buildDocumentMetadataUpdate(
      {
        title: "发布手册",
        sourceFilename: "发布手册.pdf",
        directoryPath: "资料库",
        logicalPath: "资料库/发布手册.pdf",
        docType: "guide",
        tags: ["发布流程"],
      },
      {
        title: "发布手册",
        directoryPath: "/资料库/",
        docType: "guide",
        tags: ["发布流程", "发布流程"],
      },
    );

    expect(next.metadataChanged).toBe(false);
    expect(next.pathChanged).toBe(false);
    expect(next.searchPayloadChanged).toBe(false);
  });

  test("reads locator metadata and formats anchor labels with line ranges", () => {
    const locator = readCitationLocator({
      locator: {
        line_start: 12,
        line_end: 16,
        block_index: 4,
      },
    });

    expect(locator).toEqual({
      lineStart: 12,
      lineEnd: 16,
      pageLineStart: null,
      pageLineEnd: null,
      blockIndex: 4,
    });
    expect(buildAnchorLabel("发布手册", 2, locator, "第8节")).toBe(
      "发布手册 · 第2页 · 第12-16行 · 第8节",
    );
    expect(buildMessageCitationLabel("资料库/发布手册.pdf", 2, locator)).toBe(
      "资料库/发布手册.pdf · 第2页 · 第12-16行",
    );
  });
});
