import { describe, expect, test } from "vitest";
import {
  ASSISTANT_TOOL,
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  TIMELINE_EVENT,
} from "@anchordesk/contracts";

import {
  buildAssistantDeltaStreamEvent,
  buildAssistantTerminalStreamEvent,
  buildToolMessageStreamEvent,
  readAssistantRunError,
} from "./conversation-stream";

describe("buildToolMessageStreamEvent", () => {
  test("serializes tool timeline messages for SSE", () => {
    expect(
      buildToolMessageStreamEvent({
        id: "tool-message-1",
        status: MESSAGE_STATUS.COMPLETED,
        contentMarkdown: `工具执行完成：${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
        createdAt: new Date("2026-03-28T09:30:00.000Z"),
        structuredJson: {
          timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
          tool_name: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        },
      }),
    ).toEqual({
      type: CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
      message_id: "tool-message-1",
      role: MESSAGE_ROLE.TOOL,
      status: MESSAGE_STATUS.COMPLETED,
      content_markdown: `工具执行完成：${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
      created_at: "2026-03-28T09:30:00.000Z",
      structured: {
        timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
        tool_name: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
      },
    });
  });
});

describe("readAssistantRunError", () => {
  test("prefers structured agent_error when present", () => {
    expect(
      readAssistantRunError({
        contentMarkdown: "Agent 处理失败：fallback",
        structuredJson: {
          agent_error: " queue worker offline ",
        },
      }),
    ).toBe("queue worker offline");
  });

  test("falls back to content markdown when structured error is missing", () => {
    expect(
      readAssistantRunError({
        contentMarkdown: "Agent 处理失败：fallback",
        structuredJson: {
          timeline_event: TIMELINE_EVENT.RUN_FAILED,
        },
      }),
    ).toBe("Agent 处理失败：fallback");
  });

  test("normalizes queue job id failures into a clearer user-facing message", () => {
    expect(
      readAssistantRunError({
        contentMarkdown: "Agent 处理失败：Custom Id cannot contain :",
        structuredJson: null,
      }),
    ).toBe("消息入队失败：队列任务 ID 不能包含冒号，回答还没有真正开始生成。");
  });
});

describe("buildAssistantDeltaStreamEvent", () => {
  test("serializes assistant content deltas for SSE consumers", () => {
    expect(
      buildAssistantDeltaStreamEvent({
        conversationId: "conversation-1",
        assistantMessage: {
          id: "assistant-1",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "正在生成回答",
        },
      }),
    ).toEqual({
      type: CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
      conversation_id: "conversation-1",
      message_id: "assistant-1",
      status: MESSAGE_STATUS.STREAMING,
      content_markdown: "正在生成回答",
    });
  });
});

describe("buildAssistantTerminalStreamEvent", () => {
  test("returns answer_done when assistant message is completed", () => {
    expect(
      buildAssistantTerminalStreamEvent({
        conversationId: "conversation-1",
        assistantMessage: {
          id: "assistant-1",
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "final answer",
          structuredJson: null,
        },
        citations: [
          {
            id: "citation-1",
            anchorId: "45abfef3-61d9-4933-a551-d58b3d6f9f61",
            documentId: "f3e3b2c9-91aa-48a2-9b5c-b5ff4d19bc61",
            label: "产品说明 · 第2页",
            quoteText: "发布前需要完成回归验证。",
          },
        ],
      }),
    ).toEqual({
      type: CONVERSATION_STREAM_EVENT.ANSWER_DONE,
      conversation_id: "conversation-1",
      message_id: "assistant-1",
      status: MESSAGE_STATUS.COMPLETED,
      content_markdown: "final answer",
      structured: null,
      citations: [
        {
          id: "citation-1",
          anchor_id: "45abfef3-61d9-4933-a551-d58b3d6f9f61",
          document_id: "f3e3b2c9-91aa-48a2-9b5c-b5ff4d19bc61",
          label: "产品说明 · 第2页",
          library_title: null,
          quote_text: "发布前需要完成回归验证。",
          source_scope: null,
        },
      ],
    });
  });

  test("returns run_failed when assistant message failed", () => {
    expect(
      buildAssistantTerminalStreamEvent({
        conversationId: "conversation-1",
        assistantMessage: {
          id: "assistant-1",
          status: MESSAGE_STATUS.FAILED,
          contentMarkdown: "Agent 处理失败：fallback",
          structuredJson: {
            agent_error: "grounded answer render failed",
          },
        },
      }),
    ).toEqual({
      type: CONVERSATION_STREAM_EVENT.RUN_FAILED,
      conversation_id: "conversation-1",
      message_id: "assistant-1",
      status: MESSAGE_STATUS.FAILED,
      content_markdown: "Agent 处理失败：fallback",
      structured: {
        agent_error: "grounded answer render failed",
      },
      citations: [],
      error: "grounded answer render failed",
    });
  });

  test("returns run_failed when assistant message is missing", () => {
    expect(
      buildAssistantTerminalStreamEvent({
        conversationId: "conversation-1",
        assistantMessage: null,
      }),
    ).toEqual({
      type: CONVERSATION_STREAM_EVENT.RUN_FAILED,
      conversation_id: "conversation-1",
      message_id: null,
      status: MESSAGE_STATUS.FAILED,
      content_markdown: null,
      structured: null,
      citations: [],
      error: "Assistant message not found.",
    });
  });
});
