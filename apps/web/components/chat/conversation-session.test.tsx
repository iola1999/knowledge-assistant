// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import { ConversationSession } from "./conversation-session";

describe("ConversationSession", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  test("opens knowledge-base source cards in a new tab and renders markdown excerpts compactly", () => {
    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.COMPLETED,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.COMPLETED,
              contentMarkdown: "这是回答[^1]",
              structuredJson: null,
            },
          ],
          initialCitations: [
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

    const sourcesButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("参考资料"),
    );

    expect(sourcesButton).toBeTruthy();

    act(() => {
      sourcesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const link = container.querySelector(
      'a[href="/workspaces/workspace-1/documents/document-1?anchorId=anchor-9"]',
    );
    const excerpt = container.querySelector(".citation-preview-markdown");

    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(excerpt?.querySelectorAll("ul li")).toHaveLength(2);
    expect(excerpt?.textContent).toContain("部署手册");
  });
});
