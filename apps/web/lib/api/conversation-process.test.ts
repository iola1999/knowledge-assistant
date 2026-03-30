import { describe, expect, test } from "vitest";
import { MESSAGE_ROLE, MESSAGE_STATUS, TIMELINE_EVENT } from "@anchordesk/contracts";

import {
  buildAssistantProcessTimelineEntries,
  canShowAssistantProcess,
  canShowAssistantResultPanel,
  describeAssistantProcessSummary,
  describeAssistantStreamingStatus,
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

describe("buildAssistantProcessTimelineEntries", () => {
  test("merges started and completed tool events from the same tool_use_id into one entry", () => {
    expect(
      buildAssistantProcessTimelineEntries([
        {
          id: "tool-start-1",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "开始调用工具：search_web_general",
          createdAt: "2026-03-29T08:00:02.000Z",
          structuredJson: {
            timeline_event: TIMELINE_EVENT.TOOL_STARTED,
            tool_name: "search_web_general",
            tool_input: {
              query: "伊朗局势",
            },
            tool_use_id: "tool-use-1",
          },
        },
        {
          id: "tool-finish-1",
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "工具执行完成：search_web_general",
          createdAt: "2026-03-29T08:00:04.000Z",
          structuredJson: {
            timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
            tool_name: "search_web_general",
            tool_input: {
              query: "伊朗局势",
            },
            tool_response: {
              results: [
                {
                  title: "最新局势",
                },
              ],
            },
            tool_use_id: "tool-use-1",
          },
        },
        {
          id: "tool-failed-1",
          status: MESSAGE_STATUS.FAILED,
          contentMarkdown: "工具执行失败：fetch_source · timeout",
          createdAt: "2026-03-29T08:00:06.000Z",
          structuredJson: {
            timeline_event: TIMELINE_EVENT.TOOL_FAILED,
            tool_name: "fetch_source",
            tool_input: {
              url: "https://example.com",
            },
            error: "timeout",
            tool_use_id: "tool-use-2",
          },
        },
      ]),
    ).toEqual([
      {
        id: "tool-use-1",
        kind: "tool_call",
        toolName: "search_web_general",
        status: MESSAGE_STATUS.COMPLETED,
        createdAt: "2026-03-29T08:00:02.000Z",
        completedAt: "2026-03-29T08:00:04.000Z",
        contentMarkdown: "工具执行完成：search_web_general",
        input: {
          query: "伊朗局势",
        },
        output: {
          results: [
            {
              title: "最新局势",
            },
          ],
        },
        error: null,
      },
      {
        id: "tool-use-2",
        kind: "tool_call",
        toolName: "fetch_source",
        status: MESSAGE_STATUS.FAILED,
        createdAt: "2026-03-29T08:00:06.000Z",
        completedAt: "2026-03-29T08:00:06.000Z",
        contentMarkdown: "工具执行失败：fetch_source · timeout",
        input: {
          url: "https://example.com",
        },
        output: null,
        error: "timeout",
      },
    ]);
  });

  test("keeps run_failed messages as standalone status events", () => {
    expect(
      buildAssistantProcessTimelineEntries([
        {
          id: "tool-run-failed-1",
          status: MESSAGE_STATUS.FAILED,
          contentMarkdown: "运行失败：queue offline",
          createdAt: "2026-03-29T08:00:08.000Z",
          structuredJson: {
            timeline_event: TIMELINE_EVENT.RUN_FAILED,
            error: "queue offline",
          },
        },
      ]),
    ).toEqual([
      {
        id: "tool-run-failed-1",
        kind: "status_event",
        toolName: null,
        status: MESSAGE_STATUS.FAILED,
        createdAt: "2026-03-29T08:00:08.000Z",
        completedAt: "2026-03-29T08:00:08.000Z",
        contentMarkdown: "运行失败：queue offline",
        input: null,
        output: null,
        error: "queue offline",
      },
    ]);
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

describe("describeAssistantStreamingStatus", () => {
  test("keeps the assistant in analysis mode until the first answer delta arrives", () => {
    expect(describeAssistantStreamingStatus("")).toBe("助手正在分析问题并生成回答...");
    expect(describeAssistantStreamingStatus("   ")).toBe("助手正在分析问题并生成回答...");
    expect(describeAssistantStreamingStatus("第一段回答")).toBe("助手正在生成回答...");
  });
});

describe("canShowAssistantResultPanel", () => {
  test("hides the result panel while the assistant is still thinking", () => {
    expect(
      canShowAssistantResultPanel({
        status: MESSAGE_STATUS.STREAMING,
        contentMarkdown: "",
      }),
    ).toBe(false);
    expect(
      canShowAssistantResultPanel({
        status: MESSAGE_STATUS.STREAMING,
        contentMarkdown: "   ",
      }),
    ).toBe(false);
  });

  test("shows the result panel after answer streaming starts or the turn reaches a terminal state", () => {
    expect(
      canShowAssistantResultPanel({
        status: MESSAGE_STATUS.STREAMING,
        contentMarkdown: "第一段回答",
      }),
    ).toBe(true);
    expect(
      canShowAssistantResultPanel({
        status: MESSAGE_STATUS.COMPLETED,
        contentMarkdown: "",
      }),
    ).toBe(true);
    expect(
      canShowAssistantResultPanel({
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: "",
      }),
    ).toBe(true);
  });
});
