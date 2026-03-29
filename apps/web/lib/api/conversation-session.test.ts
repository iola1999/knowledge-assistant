import { describe, expect, test } from "vitest";
import { CONVERSATION_STREAM_EVENT, MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import { applyAssistantTerminalEvent } from "./conversation-session";

describe("applyAssistantTerminalEvent", () => {
  test("hydrates the completed assistant message and replaces its citations", () => {
    const result = applyAssistantTerminalEvent({
      messages: [
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "正在生成",
          structuredJson: null,
        },
      ],
      citations: [
        {
          id: "old-citation",
          messageId: "assistant-1",
          anchorId: "a3a2f34f-778d-4a09-8941-6778dcb6b412",
          documentId: "06ec053c-8082-451f-bda3-7cda5863a46e",
          label: "旧引用",
        },
      ],
      event: {
        type: CONVERSATION_STREAM_EVENT.ANSWER_DONE,
        conversation_id: "16c8de0a-1b31-41d3-a48b-2d4d8f423886",
        message_id: "assistant-1",
        status: MESSAGE_STATUS.COMPLETED,
        content_markdown: "最终回答",
        structured: null,
        citations: [
          {
            id: "new-citation",
            anchor_id: "89e6420f-c248-4df9-a8e5-d0a19f9a3c59",
            document_id: "4e87ef0d-a2d9-465a-8ddf-3cfc92c30b16",
            label: "新版引用",
          },
        ],
      },
    });

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        status: MESSAGE_STATUS.COMPLETED,
        contentMarkdown: "最终回答",
        structuredJson: null,
      }),
    ]);
    expect(result.citations).toEqual([
      {
        id: "new-citation",
        messageId: "assistant-1",
        anchorId: "89e6420f-c248-4df9-a8e5-d0a19f9a3c59",
        documentId: "4e87ef0d-a2d9-465a-8ddf-3cfc92c30b16",
        label: "新版引用",
      },
    ]);
  });

  test("hydrates the failed assistant message and clears stale citations", () => {
    const result = applyAssistantTerminalEvent({
      messages: [
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "正在生成",
          structuredJson: null,
        },
      ],
      citations: [
        {
          id: "stale-citation",
          messageId: "assistant-1",
          anchorId: "2ef3ea43-971e-42f6-9465-d0d17117d8d1",
          documentId: "3ee35888-e295-462b-a960-e2634c6c447b",
          label: "旧引用",
        },
      ],
      event: {
        type: CONVERSATION_STREAM_EVENT.RUN_FAILED,
        conversation_id: "16c8de0a-1b31-41d3-a48b-2d4d8f423886",
        message_id: "assistant-1",
        status: MESSAGE_STATUS.FAILED,
        content_markdown: "Agent 处理失败：queue offline",
        structured: {
          agent_error: "queue offline",
        },
        citations: [],
        error: "queue offline",
      },
    });

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "assistant-1",
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: "Agent 处理失败：queue offline",
        structuredJson: {
          agent_error: "queue offline",
        },
      }),
    ]);
    expect(result.citations).toEqual([]);
  });
});
