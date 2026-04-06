// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import { ConversationSession } from "@/components/chat/conversation-session";

describe("ConversationSession user copy action", () => {
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

  test("reveals a hover copy button to the left of user messages and copies their text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          streamEnabled: false,
          initialMessages: [
            {
              id: "user-1",
              role: MESSAGE_ROLE.USER,
              status: MESSAGE_STATUS.COMPLETED,
              contentMarkdown: "这是一条需要复制的用户消息",
              structuredJson: null,
            },
          ],
        }),
      );
    });

    const copyButton = container.querySelector<HTMLButtonElement>(
      '[data-user-message-copy-button="user-1"]',
    );

    expect(copyButton).toBeTruthy();
    expect(copyButton?.className).toContain("opacity-0");
    expect(copyButton?.className).toContain("group-hover/user-message-row:opacity-100");
    expect(copyButton?.className).toContain("border-transparent");
    expect(copyButton?.className).toContain("hover:bg-app-surface-soft/82");
    expect(copyButton?.className).not.toContain("border-app-border/65");
    expect(copyButton?.getAttribute("aria-label")).toBe("复制用户消息");

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("这是一条需要复制的用户消息");
    expect(copyButton?.getAttribute("aria-label")).toBe("已复制用户消息");
  });
});
