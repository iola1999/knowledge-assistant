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
        toolName: ASSISTANT_MCP_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        state: TOOL_TIMELINE_STATE.STARTED,
      }),
    ).toEqual({
      contentMarkdown: `开始调用工具：${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.TOOL_STARTED,
        tool_name: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
      },
      status: MESSAGE_STATUS.STREAMING,
    });
  });

  it("builds failed messages with error details", () => {
    expect(
      buildToolTimelineMessage({
        toolName: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        state: TOOL_TIMELINE_STATE.FAILED,
        error: "provider unavailable",
      }),
    ).toEqual({
      contentMarkdown: `工具执行失败：${ASSISTANT_TOOL.SEARCH_WEB_GENERAL} · provider unavailable`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.TOOL_FAILED,
        tool_name: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        error: "provider unavailable",
      },
      status: MESSAGE_STATUS.FAILED,
    });
  });

  it("builds completed messages for finished tools", () => {
    expect(
      buildToolTimelineMessage({
        toolName: `${ASSISTANT_COMPAT_TOOL_PREFIX}${ASSISTANT_TOOL.READ_CITATION_ANCHOR}`,
        state: TOOL_TIMELINE_STATE.COMPLETED,
      }),
    ).toEqual({
      contentMarkdown: `工具执行完成：${ASSISTANT_TOOL.READ_CITATION_ANCHOR}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
        tool_name: ASSISTANT_TOOL.READ_CITATION_ANCHOR,
      },
      status: MESSAGE_STATUS.COMPLETED,
    });
  });
});
