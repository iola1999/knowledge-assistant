// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

  test("renders streamed thinking inside the unified process timeline", () => {
    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.STREAMING,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "",
              structuredJson: {
                run_id: "run-1",
                run_started_at: "2026-04-02T10:00:00.000Z",
                run_last_heartbeat_at: "2026-04-02T10:00:00.000Z",
                run_lease_expires_at: "2026-04-02T10:00:45.000Z",
                phase: "analyzing",
                status_text: "助手正在分析问题并准备回答...",
                thinking_text: "先确认 Cloud Agent SDK 的流事件类型，再决定怎么展示",
                process_steps: [
                  {
                    id: "thinking-1",
                    kind: "thinking",
                    status: "streaming",
                    created_at: "2026-04-02T10:00:00.000Z",
                    updated_at: "2026-04-02T10:00:00.000Z",
                    completed_at: null,
                    text: "先确认 Cloud Agent SDK 的流事件类型，再决定怎么展示",
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    expect(container.querySelector('details[data-thinking-panel="assistant-1"]')).toBeNull();
    expect(container.textContent).toContain("助手正在分析问题并准备回答... · 1 个步骤");
    expect(container.textContent).toContain(
      "先确认 Cloud Agent SDK 的流事件类型，再决定怎么展示",
    );
  });

  test("shows the streaming status only once when there are no process steps yet", () => {
    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.STREAMING,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "",
              structuredJson: {
                run_id: "run-1",
                run_started_at: "2026-04-02T10:00:00.000Z",
                run_last_heartbeat_at: "2026-04-02T10:00:00.000Z",
                run_lease_expires_at: "2026-04-02T10:00:45.000Z",
                phase: "analyzing",
                status_text: "助手正在分析问题并准备回答...",
              },
            },
          ],
        }),
      );
    });

    const matches =
      container.textContent?.match(/助手正在分析问题并准备回答\.\.\./g) ?? [];

    expect(matches).toHaveLength(1);
  });

  test("keeps the process timeline compact after answer drafting starts", () => {
    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.STREAMING,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "",
              structuredJson: {
                run_id: "run-1",
                run_started_at: "2026-04-02T10:00:00.000Z",
                run_last_heartbeat_at: "2026-04-02T10:00:00.000Z",
                run_lease_expires_at: "2026-04-02T10:00:45.000Z",
                phase: "analyzing",
                status_text: "助手正在分析问题并准备回答...",
                thinking_text: "先查来源，再整理结论",
                process_steps: [
                  {
                    id: "thinking-1",
                    kind: "thinking",
                    status: "streaming",
                    created_at: "2026-04-02T10:00:00.000Z",
                    updated_at: "2026-04-02T10:00:00.000Z",
                    completed_at: null,
                    text: "先查来源，再整理结论",
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.STREAMING,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "第一段回答",
              structuredJson: {
                run_id: "run-1",
                run_started_at: "2026-04-02T10:00:00.000Z",
                run_last_heartbeat_at: "2026-04-02T10:00:01.000Z",
                run_lease_expires_at: "2026-04-02T10:00:46.000Z",
                phase: "drafting",
                status_text: "助手正在生成回答...",
                thinking_text: "先查来源，再整理结论",
                process_steps: [
                  {
                    id: "thinking-1",
                    kind: "thinking",
                    status: "completed",
                    created_at: "2026-04-02T10:00:00.000Z",
                    updated_at: "2026-04-02T10:00:01.000Z",
                    completed_at: "2026-04-02T10:00:01.000Z",
                    text: "先查来源，再整理结论",
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    expect(container.querySelector('details[data-thinking-panel="assistant-1"]')).toBeNull();
    expect(container.textContent).toContain("助手正在生成回答... · 1 个步骤");
  });

  test("interleaves thinking and tool rows inside one process list", () => {
    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.STREAMING,
          streamEnabled: false,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "",
              structuredJson: {
                run_id: "run-1",
                run_started_at: "2026-04-02T10:00:00.000Z",
                run_last_heartbeat_at: "2026-04-02T10:00:00.000Z",
                run_lease_expires_at: "2026-04-02T10:00:45.000Z",
                phase: "analyzing",
                status_text: "助手正在分析问题并准备回答...",
                thinking_text: "先查来源，再整理结论",
                process_steps: [
                  {
                    id: "thinking-1",
                    kind: "thinking",
                    status: "completed",
                    created_at: "2026-04-02T10:00:00.000Z",
                    updated_at: "2026-04-02T10:00:01.000Z",
                    completed_at: "2026-04-02T10:00:01.000Z",
                    text: "先查来源，再整理结论",
                  },
                  {
                    id: "tool-use-1",
                    kind: "tool",
                    status: "completed",
                    created_at: "2026-04-02T10:00:02.000Z",
                    updated_at: "2026-04-02T10:00:03.000Z",
                    completed_at: "2026-04-02T10:00:03.000Z",
                    tool_name: "search_web_general",
                    tool_use_id: "tool-use-1",
                    tool_message_id: "tool-1",
                  },
                  {
                    id: "thinking-2",
                    kind: "thinking",
                    status: "streaming",
                    created_at: "2026-04-02T10:00:04.000Z",
                    updated_at: "2026-04-02T10:00:04.000Z",
                    completed_at: null,
                    text: "继续整理网页结果",
                  },
                ],
              },
            },
          ],
          initialTimelineMessagesByAssistant: {
            "assistant-1": [
              {
                id: "tool-1",
                status: MESSAGE_STATUS.STREAMING,
                contentMarkdown: "开始调用工具：search_web_general",
                createdAt: "2026-04-02T10:00:02.000Z",
                structuredJson: {
                  timeline_event: "tool_started",
                  tool_name: "search_web_general",
                  tool_input: {
                    query: "B站 影视飓风 广告报价",
                  },
                  tool_use_id: "tool-use-1",
                },
              },
              {
                id: "tool-2",
                status: MESSAGE_STATUS.COMPLETED,
                contentMarkdown: "工具执行完成：search_web_general",
                createdAt: "2026-04-02T10:00:03.000Z",
                structuredJson: {
                  timeline_event: "tool_finished",
                  tool_name: "search_web_general",
                  tool_input: {
                    query: "B站 影视飓风 广告报价",
                  },
                  tool_response: {
                    results: [
                      {
                        title: "影视飓风：从顶流UP主，到年入过亿的内容公司",
                        url: "https://digitaling.com/articles/1347429.html",
                        domain: "digitaling.com",
                      },
                    ],
                  },
                  tool_use_id: "tool-use-1",
                },
              },
            ],
          },
        }),
      );
    });

    expect(container.querySelector('details[data-thinking-panel="assistant-1"]')).toBeNull();
    expect(container.textContent).toContain("先查来源，再整理结论");
    expect(container.textContent).toContain("搜索网页");
    expect(container.textContent).toContain("继续整理网页结果");
    const timelineCard = Array.from(container.querySelectorAll<HTMLElement>("article,div")).find(
      (element) => element.className.includes("bg-app-surface-lowest/70"),
    );
    expect(timelineCard).toBeTruthy();
  });

  test("renders submitted attachments beside the user message in a new tab", () => {
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
              contentMarkdown: "先看这份合同",
              structuredJson: {
                submitted_attachments: [
                  {
                    attachmentId: "attachment-1",
                    documentId: "document-1",
                    sourceFilename: "合同审阅稿.docx",
                  },
                ],
              },
            },
          ],
        }),
      );
    });

    const link = container.querySelector(
      'a[href="/workspaces/workspace-1/documents/document-1"]',
    );

    expect(link?.textContent).toContain("合同审阅稿.docx");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toContain("先看这份合同");
  });

  test("shows a follow-up button for selected assistant text and forwards the quote", () => {
    const onQuoteRequest = vi.fn();

    act(() => {
      root.render(
        createElement(ConversationSession, {
          conversationId: "conversation-1",
          workspaceId: "workspace-1",
          assistantMessageId: "assistant-1",
          assistantStatus: MESSAGE_STATUS.COMPLETED,
          streamEnabled: false,
          onQuoteRequest,
          initialMessages: [
            {
              id: "assistant-1",
              role: MESSAGE_ROLE.ASSISTANT,
              status: MESSAGE_STATUS.COMPLETED,
              contentMarkdown: "如果你方便说一下大概是哪个行业，我可以继续细化。",
              structuredJson: null,
            },
          ],
        }),
      );
    });

    const answerHost = container.querySelector('[data-follow-up-anchor="assistant-1"]');
    const textNode = answerHost?.querySelector("p")?.firstChild;
    const removeAllRanges = vi.fn();
    const selection = {
      anchorNode: textNode,
      focusNode: textNode,
      getRangeAt: () => ({
        commonAncestorContainer: textNode,
        getBoundingClientRect: () => ({
          top: 180,
          left: 200,
          right: 320,
          bottom: 208,
          width: 120,
          height: 28,
          x: 200,
          y: 180,
          toJSON: () => ({}),
        }),
      }),
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges,
      toString: () => "大概是哪个行业",
    };
    vi.spyOn(window, "getSelection").mockReturnValue(selection as unknown as Selection);

    act(() => {
      answerHost?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    const followUpButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("追问"),
    );

    expect(followUpButton).toBeTruthy();

    act(() => {
      followUpButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onQuoteRequest).toHaveBeenCalledWith({
      assistantMessageId: "assistant-1",
      text: "大概是哪个行业",
    });
    expect(removeAllRanges).toHaveBeenCalled();
  });

  test("renders quoted follow-up context above the user prompt", () => {
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
              contentMarkdown: "请继续展开说明。",
              structuredJson: {
                follow_up_quote: {
                  assistantMessageId: "assistant-1",
                  text: "大概是哪个行业（3C、游戏、汽车、教育等）",
                },
              },
            },
          ],
        }),
      );
    });

    expect(container.textContent).toContain("引用");
    expect(container.textContent).toContain("大概是哪个行业（3C、游戏、汽车、教育等）");
    expect(container.textContent).toContain("请继续展开说明。");
  });
});
