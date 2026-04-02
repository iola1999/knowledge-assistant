import { describe, expect, it } from "vitest";
import {
  ASSISTANT_COMPAT_TOOL_PREFIX,
  ASSISTANT_MCP_TOOL,
  ASSISTANT_TOOL,
  MESSAGE_STATUS,
  TIMELINE_EVENT,
  TOOL_TIMELINE_STATE,
} from "@anchordesk/contracts";

import { buildToolTimelineMessage } from "./timeline";

describe("buildToolTimelineMessage", () => {
  it("builds started messages for tool timeline", () => {
    expect(
      buildToolTimelineMessage({
        assistantMessageId: "assistant-1",
        assistantRunId: "run-1",
        toolName: ASSISTANT_MCP_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        state: TOOL_TIMELINE_STATE.STARTED,
        toolInput: { query: "总结一下" },
        toolUseId: "tool-1",
      }),
    ).toEqual({
      contentMarkdown: `开始调用工具：${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
      structuredJson: {
        assistant_message_id: "assistant-1",
        assistant_run_id: "run-1",
        timeline_event: TIMELINE_EVENT.TOOL_STARTED,
        tool_name: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        tool_input: {
          query: "总结一下",
        },
        tool_response: null,
        tool_use_id: "tool-1",
      },
      status: MESSAGE_STATUS.STREAMING,
    });
  });

  it("builds failed messages with error details", () => {
    expect(
      buildToolTimelineMessage({
        assistantMessageId: "assistant-1",
        assistantRunId: "run-1",
        toolName: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        state: TOOL_TIMELINE_STATE.FAILED,
        error: "provider unavailable",
        toolInput: { query: "伊朗局势" },
        toolUseId: "tool-2",
      }),
    ).toEqual({
      contentMarkdown: `工具执行失败：${ASSISTANT_TOOL.SEARCH_WEB_GENERAL} · provider unavailable`,
      structuredJson: {
        assistant_message_id: "assistant-1",
        assistant_run_id: "run-1",
        timeline_event: TIMELINE_EVENT.TOOL_FAILED,
        tool_name: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        error: "provider unavailable",
        tool_input: {
          query: "伊朗局势",
        },
        tool_response: null,
        tool_use_id: "tool-2",
      },
      status: MESSAGE_STATUS.FAILED,
    });
  });

  it("builds completed messages for finished tools", () => {
    expect(
      buildToolTimelineMessage({
        assistantMessageId: "assistant-1",
        assistantRunId: "run-1",
        toolName: `${ASSISTANT_COMPAT_TOOL_PREFIX}${ASSISTANT_TOOL.READ_CITATION_ANCHOR}`,
        state: TOOL_TIMELINE_STATE.COMPLETED,
        toolInput: { anchor_id: "anchor-1" },
        toolResponse: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                anchor: {
                  anchor_id: "anchor-1",
                  text: "引用内容",
                },
              }),
            },
          ],
        },
        toolUseId: "tool-3",
      }),
    ).toEqual({
      contentMarkdown: `工具执行完成：${ASSISTANT_TOOL.READ_CITATION_ANCHOR}`,
      structuredJson: {
        assistant_message_id: "assistant-1",
        assistant_run_id: "run-1",
        timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
        tool_name: ASSISTANT_TOOL.READ_CITATION_ANCHOR,
        tool_input: {
          anchor_id: "anchor-1",
        },
        tool_response: {
          anchor: {
            anchor_id: "anchor-1",
            text: "引用内容",
          },
        },
        tool_use_id: "tool-3",
      },
      status: MESSAGE_STATUS.COMPLETED,
    });
  });

  it("normalizes completed tool responses shaped as plain text block arrays", () => {
    expect(
      buildToolTimelineMessage({
        assistantMessageId: "assistant-1",
        assistantRunId: "run-1",
        toolName: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        state: TOOL_TIMELINE_STATE.COMPLETED,
        toolInput: { query: "Alibaba earnings" },
        toolResponse: [
          {
            text: JSON.stringify({
              ok: true,
              results: [
                {
                  title: "Alibaba Investor Relations",
                  url: "https://www.alibabagroup.com/en-US/ir-financial-results",
                },
              ],
            }),
          },
        ],
        toolUseId: "tool-4",
      }),
    ).toEqual({
      contentMarkdown: `工具执行完成：${ASSISTANT_TOOL.SEARCH_WEB_GENERAL}`,
      structuredJson: {
        assistant_message_id: "assistant-1",
        assistant_run_id: "run-1",
        timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
        tool_name: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        tool_input: {
          query: "Alibaba earnings",
        },
        tool_response: {
          ok: true,
          results: [
            {
              title: "Alibaba Investor Relations",
              url: "https://www.alibabagroup.com/en-US/ir-financial-results",
            },
          ],
        },
        tool_use_id: "tool-4",
      },
      status: MESSAGE_STATUS.COMPLETED,
    });
  });
});
