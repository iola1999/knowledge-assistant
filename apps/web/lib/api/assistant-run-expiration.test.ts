import { describe, expect, test } from "vitest";
import { MESSAGE_STATUS, TIMELINE_EVENT } from "@anchordesk/contracts";

import {
  STALE_STREAMING_ASSISTANT_ERROR,
  buildExpiredAssistantRunPayload,
  shouldExpireStreamingAssistantMessage,
} from "./assistant-run-expiration";

describe("shouldExpireStreamingAssistantMessage", () => {
  test("expires a streaming assistant turn when its lease is stale", () => {
    expect(
      shouldExpireStreamingAssistantMessage(
        {
          status: MESSAGE_STATUS.STREAMING,
          createdAt: "2026-03-30T10:00:00.000Z",
          structuredJson: {
            run_id: "run-1",
            run_started_at: "2026-03-30T10:00:00.000Z",
            run_last_heartbeat_at: "2026-03-30T10:00:05.000Z",
            run_lease_expires_at: "2026-03-30T10:00:45.000Z",
          },
        },
        new Date("2026-03-30T10:00:46.000Z"),
      ),
    ).toBe(true);
  });

  test("keeps waiting while the streaming lease is still valid", () => {
    expect(
      shouldExpireStreamingAssistantMessage(
        {
          status: MESSAGE_STATUS.STREAMING,
          createdAt: "2026-03-30T10:00:00.000Z",
          structuredJson: {
            run_id: "run-1",
            run_started_at: "2026-03-30T10:00:00.000Z",
            run_last_heartbeat_at: "2026-03-30T10:00:20.000Z",
            run_lease_expires_at: "2026-03-30T10:01:05.000Z",
          },
        },
        new Date("2026-03-30T10:00:46.000Z"),
      ),
    ).toBe(false);
  });
});

describe("buildExpiredAssistantRunPayload", () => {
  test("builds a consistent failed assistant/tool payload pair", () => {
    expect(buildExpiredAssistantRunPayload()).toEqual({
      assistant: {
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: `Agent 处理失败：${STALE_STREAMING_ASSISTANT_ERROR}`,
        structuredJson: {
          agent_error: STALE_STREAMING_ASSISTANT_ERROR,
        },
      },
      tool: {
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: `运行失败：${STALE_STREAMING_ASSISTANT_ERROR}`,
        structuredJson: {
          timeline_event: TIMELINE_EVENT.RUN_FAILED,
          error: STALE_STREAMING_ASSISTANT_ERROR,
        },
      },
    });
  });
});
