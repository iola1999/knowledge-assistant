import {
  ASSISTANT_STREAM_PHASE,
  ASSISTANT_STREAM_PHASE_VALUES,
  type AssistantStreamPhase,
} from "./domain";

export const STREAMING_ASSISTANT_HEARTBEAT_INTERVAL_MS = 10_000;
export const STREAMING_ASSISTANT_LEASE_TIMEOUT_MS = 45_000;

export type StreamingAssistantRunState = {
  run_id: string;
  run_started_at: string;
  run_last_heartbeat_at: string;
  run_lease_expires_at: string;
  phase?: AssistantStreamPhase | null;
  status_text?: string | null;
  stream_event_id?: string | null;
  active_tool_name?: string | null;
  active_tool_use_id?: string | null;
  active_task_id?: string | null;
};

function asValidDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function buildStreamingAssistantRunId() {
  if (
    typeof globalThis.crypto === "object" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readStreamingAssistantRunState(
  structuredJson: Record<string, unknown> | null | undefined,
): StreamingAssistantRunState | null {
  if (!structuredJson) {
    return null;
  }

  const runId =
    typeof structuredJson.run_id === "string" && structuredJson.run_id.trim()
      ? structuredJson.run_id.trim()
      : null;
  const startedAt = asValidDate(structuredJson.run_started_at);
  const lastHeartbeatAt = asValidDate(structuredJson.run_last_heartbeat_at);
  const leaseExpiresAt = asValidDate(structuredJson.run_lease_expires_at);

  if (!runId || !startedAt || !lastHeartbeatAt || !leaseExpiresAt) {
    return null;
  }

  const phase =
    typeof structuredJson.phase === "string" &&
    ASSISTANT_STREAM_PHASE_VALUES.includes(
      structuredJson.phase as AssistantStreamPhase,
    )
      ? (structuredJson.phase as AssistantStreamPhase)
      : null;
  const statusText =
    typeof structuredJson.status_text === "string" ? structuredJson.status_text : null;
  const streamEventId =
    typeof structuredJson.stream_event_id === "string"
      ? structuredJson.stream_event_id
      : null;
  const activeToolName =
    typeof structuredJson.active_tool_name === "string"
      ? structuredJson.active_tool_name
      : null;
  const activeToolUseId =
    typeof structuredJson.active_tool_use_id === "string"
      ? structuredJson.active_tool_use_id
      : null;
  const activeTaskId =
    typeof structuredJson.active_task_id === "string"
      ? structuredJson.active_task_id
      : null;

  return {
    run_id: runId,
    run_started_at: startedAt.toISOString(),
    run_last_heartbeat_at: lastHeartbeatAt.toISOString(),
    run_lease_expires_at: leaseExpiresAt.toISOString(),
    phase,
    status_text: statusText,
    stream_event_id: streamEventId,
    active_tool_name: activeToolName,
    active_tool_use_id: activeToolUseId,
    active_task_id: activeTaskId,
  };
}

export function buildStreamingAssistantRunState(input: {
  now?: Date;
  runId?: string | null;
  startedAt?: Date | string;
  phase?: AssistantStreamPhase | null;
  statusText?: string | null;
  streamEventId?: string | null;
  activeToolName?: string | null;
  activeToolUseId?: string | null;
  activeTaskId?: string | null;
} = {}): StreamingAssistantRunState {
  const now = input.now ?? new Date();
  const startedAt = asValidDate(input.startedAt) ?? now;

  return {
    run_id: input.runId?.trim() || buildStreamingAssistantRunId(),
    run_started_at: startedAt.toISOString(),
    run_last_heartbeat_at: now.toISOString(),
    run_lease_expires_at: new Date(
      now.getTime() + STREAMING_ASSISTANT_LEASE_TIMEOUT_MS,
    ).toISOString(),
    phase: input.phase ?? null,
    status_text: input.statusText ?? null,
    stream_event_id: input.streamEventId ?? null,
    active_tool_name: input.activeToolName ?? null,
    active_tool_use_id: input.activeToolUseId ?? null,
    active_task_id: input.activeTaskId ?? null,
  };
}

export function refreshStreamingAssistantRunState(
  structuredJson: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): StreamingAssistantRunState {
  const existing = readStreamingAssistantRunState(structuredJson);

  return buildStreamingAssistantRunState({
    now,
    runId: existing?.run_id ?? null,
    startedAt: existing?.run_started_at ?? now,
    phase: existing?.phase ?? null,
    statusText: existing?.status_text ?? null,
    streamEventId: existing?.stream_event_id ?? null,
    activeToolName: existing?.active_tool_name ?? null,
    activeToolUseId: existing?.active_tool_use_id ?? null,
    activeTaskId: existing?.active_task_id ?? null,
  });
}

export function updateStreamingAssistantRunState(
  structuredJson: Record<string, unknown> | null | undefined,
  patch: {
    now?: Date;
    phase?: AssistantStreamPhase | null;
    statusText?: string | null;
    streamEventId?: string | null;
    activeToolName?: string | null;
    activeToolUseId?: string | null;
    activeTaskId?: string | null;
  },
) {
  const existing = refreshStreamingAssistantRunState(
    structuredJson,
    patch.now ?? new Date(),
  );

  return buildStreamingAssistantRunState({
    now: patch.now ?? new Date(),
    runId: existing.run_id,
    startedAt: existing.run_started_at,
    phase: patch.phase === undefined ? existing.phase ?? null : patch.phase,
    statusText:
      patch.statusText === undefined ? existing.status_text ?? null : patch.statusText,
    streamEventId:
      patch.streamEventId === undefined
        ? existing.stream_event_id ?? null
        : patch.streamEventId,
    activeToolName:
      patch.activeToolName === undefined
        ? existing.active_tool_name ?? null
        : patch.activeToolName,
    activeToolUseId:
      patch.activeToolUseId === undefined
        ? existing.active_tool_use_id ?? null
        : patch.activeToolUseId,
    activeTaskId:
      patch.activeTaskId === undefined
        ? existing.active_task_id ?? null
        : patch.activeTaskId,
  });
}

export function buildInitialStreamingAssistantRunState(input: {
  now?: Date;
  runId?: string | null;
  startedAt?: Date | string;
  statusText?: string | null;
} = {}) {
  return buildStreamingAssistantRunState({
    now: input.now,
    runId: input.runId ?? null,
    startedAt: input.startedAt,
    phase: ASSISTANT_STREAM_PHASE.ANALYZING,
    statusText: input.statusText ?? "助手正在分析问题并准备回答...",
  });
}

export function finalizeStreamingAssistantRunState(
  structuredJson: Record<string, unknown> | null | undefined,
  input: {
    now?: Date;
    streamEventId?: string | null;
  } = {},
) {
  const now = input.now ?? new Date();
  const existing = refreshStreamingAssistantRunState(structuredJson, now);

  return buildStreamingAssistantRunState({
    now,
    runId: existing.run_id,
    startedAt: existing.run_started_at,
    phase: null,
    statusText: null,
    streamEventId:
      input.streamEventId === undefined ? existing.stream_event_id ?? null : input.streamEventId,
    activeToolName: null,
    activeToolUseId: null,
    activeTaskId: null,
  });
}

export function isStreamingAssistantRunExpired(input: {
  structuredJson?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const state = readStreamingAssistantRunState(input.structuredJson ?? null);

  if (state) {
    return new Date(state.run_lease_expires_at).getTime() <= now.getTime();
  }

  const createdAt = asValidDate(input.createdAt ?? null);
  if (!createdAt) {
    return false;
  }

  return (
    createdAt.getTime() + STREAMING_ASSISTANT_LEASE_TIMEOUT_MS <= now.getTime()
  );
}
