import { describe, expect, test } from "vitest";

import {
  STREAMING_ASSISTANT_LEASE_TIMEOUT_MS,
  buildInitialStreamingAssistantRunState,
  finalizeStreamingAssistantRunState,
  buildStreamingAssistantRunState,
  isStreamingAssistantRunExpired,
  readStreamingAssistantRunState,
  refreshStreamingAssistantRunState,
  updateStreamingAssistantRunState,
} from "./conversation-run";
import { ASSISTANT_STREAM_PHASE } from "./domain";

describe("buildStreamingAssistantRunState", () => {
  test("builds a normalized lease window from the provided clock", () => {
    const now = new Date("2026-03-30T10:00:00.000Z");

    expect(buildStreamingAssistantRunState({ now, runId: "run-1" })).toEqual({
      run_id: "run-1",
      run_started_at: "2026-03-30T10:00:00.000Z",
      run_last_heartbeat_at: "2026-03-30T10:00:00.000Z",
      run_lease_expires_at: new Date(
        now.getTime() + STREAMING_ASSISTANT_LEASE_TIMEOUT_MS,
      ).toISOString(),
      phase: null,
      status_text: null,
      stream_event_id: null,
      active_tool_name: null,
      active_tool_use_id: null,
      active_task_id: null,
    });
  });
});

describe("readStreamingAssistantRunState", () => {
  test("returns null for malformed state", () => {
    expect(readStreamingAssistantRunState(null)).toBeNull();
    expect(
      readStreamingAssistantRunState({
        run_id: "run-1",
        run_started_at: "bad-date",
        run_last_heartbeat_at: "2026-03-30T10:00:00.000Z",
        run_lease_expires_at: "2026-03-30T10:00:45.000Z",
      }),
    ).toBeNull();
  });
});

describe("refreshStreamingAssistantRunState", () => {
  test("keeps the original started_at while moving the heartbeat window forward", () => {
    const refreshed = refreshStreamingAssistantRunState(
      {
        run_id: "run-1",
        run_started_at: "2026-03-30T10:00:00.000Z",
        run_last_heartbeat_at: "2026-03-30T10:00:10.000Z",
        run_lease_expires_at: "2026-03-30T10:00:55.000Z",
      },
      new Date("2026-03-30T10:00:20.000Z"),
    );

    expect(refreshed).toEqual({
      run_id: "run-1",
      run_started_at: "2026-03-30T10:00:00.000Z",
      run_last_heartbeat_at: "2026-03-30T10:00:20.000Z",
      run_lease_expires_at: "2026-03-30T10:01:05.000Z",
      phase: null,
      status_text: null,
      stream_event_id: null,
      active_tool_name: null,
      active_tool_use_id: null,
      active_task_id: null,
    });
  });
});

describe("updateStreamingAssistantRunState", () => {
  test("preserves the lease window while merging live runtime metadata", () => {
    expect(
      updateStreamingAssistantRunState(
        {
          run_id: "run-1",
          run_started_at: "2026-03-30T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-30T10:00:10.000Z",
          run_lease_expires_at: "2026-03-30T10:00:55.000Z",
          phase: ASSISTANT_STREAM_PHASE.TOOL,
          status_text: "正在调用工具...",
          stream_event_id: "1743328800000-0",
          active_tool_name: "fetch_source",
          active_tool_use_id: "tool-1",
        },
        {
          now: new Date("2026-03-30T10:00:20.000Z"),
          phase: ASSISTANT_STREAM_PHASE.FINALIZING,
          statusText: "正在整理证据并生成最终答案...",
          streamEventId: "1743328801000-0",
          activeToolName: null,
          activeToolUseId: null,
        },
      ),
    ).toEqual({
      run_id: "run-1",
      run_started_at: "2026-03-30T10:00:00.000Z",
      run_last_heartbeat_at: "2026-03-30T10:00:20.000Z",
      run_lease_expires_at: "2026-03-30T10:01:05.000Z",
      phase: ASSISTANT_STREAM_PHASE.FINALIZING,
      status_text: "正在整理证据并生成最终答案...",
      stream_event_id: "1743328801000-0",
      active_tool_name: null,
      active_tool_use_id: null,
      active_task_id: null,
    });
  });
});

describe("buildInitialStreamingAssistantRunState", () => {
  test("starts the streaming assistant in analyzing phase with visible status copy", () => {
    expect(
      buildInitialStreamingAssistantRunState({
        now: new Date("2026-03-30T10:00:00.000Z"),
        runId: "run-1",
      }),
    ).toEqual({
      run_id: "run-1",
      run_started_at: "2026-03-30T10:00:00.000Z",
      run_last_heartbeat_at: "2026-03-30T10:00:00.000Z",
      run_lease_expires_at: "2026-03-30T10:00:45.000Z",
      phase: ASSISTANT_STREAM_PHASE.ANALYZING,
      status_text: "助手正在分析问题并准备回答...",
      stream_event_id: null,
      active_tool_name: null,
      active_tool_use_id: null,
      active_task_id: null,
    });
  });
});

describe("finalizeStreamingAssistantRunState", () => {
  test("preserves run identity while clearing live-only status fields", () => {
    expect(
      finalizeStreamingAssistantRunState(
        {
          run_id: "run-1",
          run_started_at: "2026-03-30T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-30T10:00:10.000Z",
          run_lease_expires_at: "2026-03-30T10:00:55.000Z",
          phase: ASSISTANT_STREAM_PHASE.TOOL,
          status_text: "正在调用工具...",
          stream_event_id: "1743328800000-0",
          active_tool_name: "fetch_source",
          active_tool_use_id: "tool-1",
          active_task_id: "task-1",
        },
        {
          now: new Date("2026-03-30T10:00:20.000Z"),
          streamEventId: "1743328802000-0",
        },
      ),
    ).toEqual({
      run_id: "run-1",
      run_started_at: "2026-03-30T10:00:00.000Z",
      run_last_heartbeat_at: "2026-03-30T10:00:20.000Z",
      run_lease_expires_at: "2026-03-30T10:01:05.000Z",
      phase: null,
      status_text: null,
      stream_event_id: "1743328802000-0",
      active_tool_name: null,
      active_tool_use_id: null,
      active_task_id: null,
    });
  });
});

describe("isStreamingAssistantRunExpired", () => {
  test("uses lease expiry when structured state is present", () => {
    expect(
      isStreamingAssistantRunExpired({
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-30T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-30T10:00:10.000Z",
          run_lease_expires_at: "2026-03-30T10:00:45.000Z",
        },
        now: new Date("2026-03-30T10:00:46.000Z"),
      }),
    ).toBe(true);
  });

  test("falls back to message creation time for legacy streaming rows", () => {
    expect(
      isStreamingAssistantRunExpired({
        structuredJson: null,
        createdAt: "2026-03-30T10:00:00.000Z",
        now: new Date("2026-03-30T10:00:46.000Z"),
      }),
    ).toBe(true);
    expect(
      isStreamingAssistantRunExpired({
        structuredJson: null,
        createdAt: "2026-03-30T10:00:00.000Z",
        now: new Date("2026-03-30T10:00:20.000Z"),
      }),
    ).toBe(false);
  });
});
