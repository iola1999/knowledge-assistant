type ValueOf<T> = T[keyof T];

export const DOCUMENT_STATUS = {
  UPLOADING: "uploading",
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
  ARCHIVED: "archived",
} as const;
export const DOCUMENT_STATUS_VALUES = [
  DOCUMENT_STATUS.UPLOADING,
  DOCUMENT_STATUS.PROCESSING,
  DOCUMENT_STATUS.READY,
  DOCUMENT_STATUS.FAILED,
  DOCUMENT_STATUS.ARCHIVED,
] as const;
export type DocumentStatus = ValueOf<typeof DOCUMENT_STATUS>;

export const DOCUMENT_TYPE = {
  REFERENCE: "reference",
  GUIDE: "guide",
  POLICY: "policy",
  SPEC: "spec",
  REPORT: "report",
  NOTE: "note",
  EMAIL: "email",
  MEETING_NOTE: "meeting_note",
  OTHER: "other",
} as const;
export const DOCUMENT_TYPE_VALUES = [
  DOCUMENT_TYPE.REFERENCE,
  DOCUMENT_TYPE.GUIDE,
  DOCUMENT_TYPE.POLICY,
  DOCUMENT_TYPE.SPEC,
  DOCUMENT_TYPE.REPORT,
  DOCUMENT_TYPE.NOTE,
  DOCUMENT_TYPE.EMAIL,
  DOCUMENT_TYPE.MEETING_NOTE,
  DOCUMENT_TYPE.OTHER,
] as const;
export type DocumentType = ValueOf<typeof DOCUMENT_TYPE>;

export const DOCUMENT_INDEXING_MODE = {
  FULL: "full",
  PARSE_ONLY: "parse_only",
} as const;
export const DOCUMENT_INDEXING_MODE_VALUES = [
  DOCUMENT_INDEXING_MODE.FULL,
  DOCUMENT_INDEXING_MODE.PARSE_ONLY,
] as const;
export type DocumentIndexingMode = ValueOf<typeof DOCUMENT_INDEXING_MODE>;

export const PARSE_STATUS = {
  QUEUED: "queued",
  EXTRACTING_TEXT: "extracting_text",
  PARSING_LAYOUT: "parsing_layout",
  CHUNKING: "chunking",
  EMBEDDING: "embedding",
  INDEXING: "indexing",
  READY: "ready",
  FAILED: "failed",
} as const;
export const PARSE_STATUS_VALUES = [
  PARSE_STATUS.QUEUED,
  PARSE_STATUS.EXTRACTING_TEXT,
  PARSE_STATUS.PARSING_LAYOUT,
  PARSE_STATUS.CHUNKING,
  PARSE_STATUS.EMBEDDING,
  PARSE_STATUS.INDEXING,
  PARSE_STATUS.READY,
  PARSE_STATUS.FAILED,
] as const;
export type ParseStatus = ValueOf<typeof PARSE_STATUS>;

export const CONVERSATION_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
export const CONVERSATION_STATUS_VALUES = [
  CONVERSATION_STATUS.ACTIVE,
  CONVERSATION_STATUS.ARCHIVED,
] as const;
export type ConversationStatus = ValueOf<typeof CONVERSATION_STATUS>;

export const MESSAGE_ROLE = {
  SYSTEM: "system",
  USER: "user",
  ASSISTANT: "assistant",
  TOOL: "tool",
} as const;
export const MESSAGE_ROLE_VALUES = [
  MESSAGE_ROLE.SYSTEM,
  MESSAGE_ROLE.USER,
  MESSAGE_ROLE.ASSISTANT,
  MESSAGE_ROLE.TOOL,
] as const;
export type MessageRole = ValueOf<typeof MESSAGE_ROLE>;

export const MESSAGE_STATUS = {
  STREAMING: "streaming",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export const MESSAGE_STATUS_VALUES = [
  MESSAGE_STATUS.STREAMING,
  MESSAGE_STATUS.COMPLETED,
  MESSAGE_STATUS.FAILED,
] as const;
export type MessageStatus = ValueOf<typeof MESSAGE_STATUS>;

export const REPORT_STATUS = {
  DRAFT: "draft",
  GENERATING: "generating",
  READY: "ready",
  FAILED: "failed",
  EXPORTED: "exported",
} as const;
export const REPORT_STATUS_VALUES = [
  REPORT_STATUS.DRAFT,
  REPORT_STATUS.GENERATING,
  REPORT_STATUS.READY,
  REPORT_STATUS.FAILED,
  REPORT_STATUS.EXPORTED,
] as const;
export type ReportStatus = ValueOf<typeof REPORT_STATUS>;

export const RUN_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export const RUN_STATUS_VALUES = [
  RUN_STATUS.QUEUED,
  RUN_STATUS.RUNNING,
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
] as const;
export type RunStatus = ValueOf<typeof RUN_STATUS>;

export const GROUNDED_ANSWER_CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export const GROUNDED_ANSWER_CONFIDENCE_VALUES = [
  GROUNDED_ANSWER_CONFIDENCE.HIGH,
  GROUNDED_ANSWER_CONFIDENCE.MEDIUM,
  GROUNDED_ANSWER_CONFIDENCE.LOW,
] as const;
export type GroundedAnswerConfidence = ValueOf<typeof GROUNDED_ANSWER_CONFIDENCE>;

export const TOOL_TIMELINE_STATE = {
  STARTED: "started",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export const TOOL_TIMELINE_STATE_VALUES = [
  TOOL_TIMELINE_STATE.STARTED,
  TOOL_TIMELINE_STATE.COMPLETED,
  TOOL_TIMELINE_STATE.FAILED,
] as const;
export type ToolTimelineState = ValueOf<typeof TOOL_TIMELINE_STATE>;

export const TIMELINE_EVENT = {
  TOOL_STARTED: "tool_started",
  TOOL_FINISHED: "tool_finished",
  TOOL_FAILED: "tool_failed",
  RUN_FAILED: "run_failed",
} as const;
export type TimelineEvent = ValueOf<typeof TIMELINE_EVENT>;

export const CONVERSATION_STREAM_EVENT = {
  TOOL_MESSAGE: "tool_message",
  ANSWER_DELTA: "answer_delta",
  ANSWER_DONE: "answer_done",
  RUN_FAILED: "run_failed",
} as const;
export const CONVERSATION_STREAM_EVENT_VALUES = [
  CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
  CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
  CONVERSATION_STREAM_EVENT.ANSWER_DONE,
  CONVERSATION_STREAM_EVENT.RUN_FAILED,
] as const;
export type ConversationStreamEventType = ValueOf<typeof CONVERSATION_STREAM_EVENT>;

export function isGroundedAnswerConfidence(
  value: unknown,
): value is GroundedAnswerConfidence {
  return (
    typeof value === "string" &&
    GROUNDED_ANSWER_CONFIDENCE_VALUES.includes(
      value as GroundedAnswerConfidence,
    )
  );
}
