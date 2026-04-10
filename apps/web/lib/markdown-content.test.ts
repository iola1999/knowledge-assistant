// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { MarkdownContent } from "../components/shared/markdown-content";

describe("MarkdownContent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    if (!("ResizeObserver" in window)) {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }

      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: ResizeObserverMock,
      });
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("renders markdown structure instead of plain text", () => {
    act(() => {
      root.render(
        createElement(MarkdownContent, {
          content: "# 标题\n\n- 条目一\n- 条目二\n\n```ts\nconst a = 1;\n```",
        }),
      );
    });

    expect(container.querySelector(".app-markdown")?.className).toContain("select-text");
    expect(container.querySelector("h1")?.textContent).toBe("标题");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toContain("const a = 1;");
  });

  test("keeps external links safe", () => {
    act(() => {
      root.render(
        createElement(MarkdownContent, {
          content: "[项目主页](https://example.com/docs)",
        }),
      );
    });

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/docs");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("renders grouped inline citations with a compact badge and cleaned preview text", () => {
    act(() => {
      root.render(
        createElement(MarkdownContent, {
          content: "结论[^1][^2]",
          citations: [
            {
              id: "citation-1",
              messageId: "assistant-1",
              label: "终于有人说清全屋定制的板材了！ · www.bilibili.com",
              quoteText:
                "* [首页](//www.bilibili.com) * [番剧](//www.bilibili.com/anime/)\n终于有人说清全屋定制的板材了！\n这条视频用通俗易懂的方式解释颗粒板、欧松板和免漆板的差异。",
              sourceScope: "web",
              sourceUrl: "https://www.bilibili.com/video/BV1NaXzBJEsu/",
              sourceDomain: "www.bilibili.com",
              sourceTitle: "终于有人说清全屋定制的板材了！ - 哔哩哔哩",
            },
            {
              id: "citation-2",
              messageId: "assistant-1",
              label: "第二条来源 · www.bilibili.com",
              quoteText: "第二条来源的摘要。",
              sourceScope: "web",
              sourceUrl: "https://www.bilibili.com/video/BV2NaXzBJEsu/",
              sourceDomain: "www.bilibili.com",
              sourceTitle: "第二条来源",
            },
          ],
        }),
      );
    });

    const trigger = container.querySelector("button");

    act(() => {
      trigger?.focus();
    });

    expect(container.textContent).toContain("bilibili");
    expect(container.textContent).toContain("+1");
    const groupedBadge = container.querySelector('span[title="bilibili"]');
    const groupedBadgeLabel = groupedBadge?.children[0];
    const groupedBadgeCount = groupedBadge?.children[1];

    expect(groupedBadge?.className).toContain("min-w-0");
    expect(groupedBadgeLabel?.className).toContain("min-w-0");
    expect(groupedBadgeLabel?.className).toContain("flex-1");
    expect(groupedBadgeCount?.className).toContain("shrink-0");
    expect(groupedBadgeCount?.className).toContain("whitespace-nowrap");
    expect(document.body.textContent).toContain("终于有人说清全屋定制的板材了！ - 哔哩哔哩");
    expect(document.body.textContent).toContain(
      "这条视频用通俗易懂的方式解释颗粒板、欧松板和免漆板的差异。",
    );
    expect(document.body.textContent).not.toContain("番剧");
  });

  test("renders compact markdown previews for document citations and opens them in a new tab", () => {
    act(() => {
      root.render(
        createElement(MarkdownContent, {
          content: "部署建议[^1]",
          workspaceId: "workspace-1",
          citations: [
            {
              id: "citation-1",
              messageId: "assistant-1",
              label: "资料库/项目A/部署清单.md · 第2节",
              quoteText:
                "## 发布前检查\n- 回归验证完成\n- 灰度环境通过\n[部署手册](https://example.com/runbook)",
              sourceScope: "workspace_private",
              documentId: "document-1",
              anchorId: "anchor-9",
            },
          ],
        }),
      );
    });

    const trigger = container.querySelector("button");

    act(() => {
      trigger?.focus();
    });

    const link = document.body.querySelector(
      'a[href="/workspaces/workspace-1/documents/document-1?anchorId=anchor-9"]',
    );
    const excerpt = document.body.querySelector(".citation-preview-markdown");

    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(excerpt?.querySelectorAll("ul li")).toHaveLength(2);
    expect(excerpt?.querySelector("a")).toBeNull();
    expect(excerpt?.textContent).toContain("部署手册");
  });

  test("wraps markdown tables with a scrollable container to prevent overflow", () => {
    const tableSource = `
| Column A | Column B |
| -------- | -------- |
| ${"Very long content ".repeat(5)} | ${"More long content ".repeat(5)} |
`;

    act(() => {
      root.render(
        createElement(MarkdownContent, {
          content: tableSource,
        }),
      );
    });

    const wrapper = container.querySelector(".app-markdown-table-wrapper");
    const table = wrapper?.querySelector("table");

    expect(wrapper).toBeTruthy();
    expect(table).toBeTruthy();
    expect(wrapper?.classList.contains("app-markdown-table-wrapper")).toBe(true);
  });
});
