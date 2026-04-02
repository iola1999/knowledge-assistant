import { describe, expect, test } from "vitest";

import {
  buildCitationBadgeSummary,
  buildCitationLinkTarget,
  buildCitationPreviewModel,
} from "./citation-display";

describe("buildCitationBadgeSummary", () => {
  test("builds a compact grouped badge label for web citations", () => {
    expect(
      buildCitationBadgeSummary([
        {
          id: "citation-1",
          messageId: "assistant-1",
          label: "极客湾Geekerwan个人主页 · space.bilibili.com",
          quoteText: "原文摘录",
          sourceScope: "web",
          sourceUrl: "https://space.bilibili.com/25876945",
          sourceDomain: "space.bilibili.com",
          sourceTitle: "极客湾Geekerwan个人主页-哔哩哔哩视频",
        },
        {
          id: "citation-2",
          messageId: "assistant-1",
          label: "第二条",
          quoteText: "第二条摘录",
          sourceScope: "web",
          sourceUrl: "https://www.bilibili.com/video/BV1xx",
          sourceDomain: "www.bilibili.com",
          sourceTitle: "第二条",
        },
        {
          id: "citation-3",
          messageId: "assistant-1",
          label: "第三条",
          quoteText: "第三条摘录",
          sourceScope: "web",
          sourceUrl: "https://www.bilibili.com/video/BV2xx",
          sourceDomain: "www.bilibili.com",
          sourceTitle: "第三条",
        },
      ]),
    ).toEqual({
      label: "space.bilibili",
      extraCount: 2,
    });
  });
});

describe("buildCitationPreviewModel", () => {
  test("cleans noisy markdown-style web excerpts for UI display", () => {
    expect(
      buildCitationPreviewModel({
        id: "citation-1",
        messageId: "assistant-1",
        label: "终于有人说清全屋定制的板材了！ · www.bilibili.com",
        quoteText:
          "* [首页](//www.bilibili.com) * [番剧](//www.bilibili.com/anime/) * [直播](//live.bilibili.com/) * [投稿](//www.bilibili.com/v/game/match/)\n终于有人说清全屋定制的板材了！\n这条视频用通俗易懂的方式解释颗粒板、欧松板和免漆板的差异。",
        sourceScope: "web",
        sourceUrl: "https://www.bilibili.com/video/BV1NaXzBJEsu/",
        sourceDomain: "www.bilibili.com",
        sourceTitle: "终于有人说清全屋定制的板材了！ - 哔哩哔哩",
      }),
    ).toEqual({
      isWeb: true,
      badgeLabel: "bilibili",
      title: "终于有人说清全屋定制的板材了！ - 哔哩哔哩",
      meta: "bilibili.com",
      excerpt: "这条视频用通俗易懂的方式解释颗粒板、欧松板和免漆板的差异。",
      excerptFormat: "text",
    });
  });

  test("keeps document citations compact without altering their factual text", () => {
    expect(
      buildCitationPreviewModel({
        id: "citation-2",
        messageId: "assistant-1",
        label: "资料库/项目A/发布手册.md · 第12页",
        quoteText: "发布前需要完成回归验证和灰度检查。",
        sourceScope: "workspace_private",
        libraryTitle: null,
      }),
    ).toEqual({
      isWeb: false,
      badgeLabel: "发布手册",
      title: "资料库/项目A/发布手册.md · 第12页",
      meta: null,
      excerpt: "发布前需要完成回归验证和灰度检查。",
      excerptFormat: "text",
    });
  });

  test("keeps concise markdown structure for document previews when the excerpt is markdown", () => {
    expect(
      buildCitationPreviewModel({
        id: "citation-3",
        messageId: "assistant-1",
        label: "资料库/项目A/部署清单.md · 第2节",
        quoteText:
          "## 发布前检查\n- 回归验证完成\n- 灰度环境通过\n[部署手册](https://example.com/runbook)",
        sourceScope: "workspace_private",
        libraryTitle: null,
      }),
    ).toEqual({
      isWeb: false,
      badgeLabel: "部署清单",
      title: "资料库/项目A/部署清单.md · 第2节",
      meta: null,
      excerpt:
        "## 发布前检查\n- 回归验证完成\n- 灰度环境通过\n[部署手册](https://example.com/runbook)",
      excerptFormat: "markdown",
    });
  });
});

describe("buildCitationLinkTarget", () => {
  test("opens knowledge-base citations with a workspace document link", () => {
    expect(
      buildCitationLinkTarget({
        documentLinksEnabled: true,
        workspaceId: "workspace-1",
        citation: {
          id: "citation-1",
          messageId: "assistant-1",
          label: "资料A",
          quoteText: "摘录",
          sourceScope: "workspace_private",
          documentId: "document-1",
          anchorId: "anchor-9",
        },
      }),
    ).toEqual({
      href: "/workspaces/workspace-1/documents/document-1?anchorId=anchor-9",
    });
  });

  test("falls back to source urls for web citations", () => {
    expect(
      buildCitationLinkTarget({
        documentLinksEnabled: true,
        citation: {
          id: "citation-2",
          messageId: "assistant-1",
          label: "网页来源",
          quoteText: "摘录",
          sourceScope: "web",
          sourceUrl: "https://example.com/report",
        },
      }),
    ).toEqual({
      href: "https://example.com/report",
    });
  });

  test("keeps web citations clickable when document links are disabled", () => {
    expect(
      buildCitationLinkTarget({
        documentLinksEnabled: false,
        citation: {
          id: "citation-3",
          messageId: "assistant-1",
          label: "网页来源",
          quoteText: "摘录",
          sourceScope: "web",
          sourceUrl: "https://example.com/report",
        },
      }),
    ).toEqual({
      href: "https://example.com/report",
    });
  });

  test("disables workspace document jumps when document links are disabled", () => {
    expect(
      buildCitationLinkTarget({
        documentLinksEnabled: false,
        workspaceId: "workspace-1",
        citation: {
          id: "citation-4",
          messageId: "assistant-1",
          label: "资料A",
          quoteText: "摘录",
          sourceScope: "workspace_private",
          documentId: "document-1",
          anchorId: "anchor-9",
        },
      }),
    ).toBeNull();
  });
});
