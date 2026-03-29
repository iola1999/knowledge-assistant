import { describe, expect, test } from "vitest";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@knowledge-assistant/contracts";

import {
  canShowAssistantProcess,
  describeAssistantProcessSummary,
  groupAssistantProcessMessages,
} from "./conversation-process";

describe("groupAssistantProcessMessages", () => {
  test("assigns tool events to the latest assistant placeholder until the next user turn", () => {
    expect(
      groupAssistantProcessMessages([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "问题一",
          createdAt: "2026-03-29T08:00:00.000Z",
        },
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "回答一",
          createdAt: "2026-03-29T08:00:01.000Z",
        },
        {
          id: "tool-1",
          role: MESSAGE_ROLE.TOOL,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "开始调用工具：search_workspace_knowledge",
          createdAt: "2026-03-29T08:00:02.000Z",
        },
        {
          id: "user-2",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "问题二",
          createdAt: "2026-03-29T08:01:00.000Z",
        },
        {
          id: "tool-ignored",
          role: MESSAGE_ROLE.TOOL,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "不会被归属",
          createdAt: "2026-03-29T08:01:01.000Z",
        },
        {
          id: "assistant-2",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
          createdAt: "2026-03-29T08:01:02.000Z",
        },
        {
          id: "tool-2",
          role: MESSAGE_ROLE.TOOL,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "工具执行完成：search_web_general",
          createdAt: "2026-03-29T08:01:03.000Z",
        },
      ]),
    ).toEqual({
      "assistant-1": [
        {
          id: "tool-1",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "开始调用工具：search_workspace_knowledge",
          createdAt: "2026-03-29T08:00:02.000Z",
          structuredJson: null,
        },
      ],
      "assistant-2": [
        {
          id: "tool-2",
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "工具执行完成：search_web_general",
          createdAt: "2026-03-29T08:01:03.000Z",
          structuredJson: null,
        },
      ],
    });
  });
});

describe("describeAssistantProcessSummary", () => {
  test("builds a compact completed summary", () => {
    expect(
      describeAssistantProcessSummary({
        stepCount: 8,
        isStreaming: false,
      }),
    ).toBe("已完成 8 个步骤");
  });

  test("prefers runtime status while streaming", () => {
    expect(
      describeAssistantProcessSummary({
        stepCount: 3,
        isStreaming: true,
        runtimeStatus: "助手正在生成回答...",
      }),
    ).toBe("助手正在生成回答... · 3 个步骤");
  });
});

describe("canShowAssistantProcess", () => {
  test("shows the disclosure when there are steps or the answer is still streaming", () => {
    expect(canShowAssistantProcess({ stepCount: 2, isStreaming: false })).toBe(true);
    expect(canShowAssistantProcess({ stepCount: 0, isStreaming: true })).toBe(true);
    expect(canShowAssistantProcess({ stepCount: 0, isStreaming: false })).toBe(false);
  });
});
