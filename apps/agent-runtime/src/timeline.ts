import {
  MESSAGE_STATUS,
  normalizeAssistantToolName,
  TIMELINE_EVENT,
  type ToolTimelineState,
  TOOL_TIMELINE_STATE,
} from "@anchordesk/contracts";

function normalizeToolTimelineValue(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "object") {
    return value;
  }

  const content = Array.isArray(value)
    ? (value as Array<{ type?: string; text?: string }>)
    : (value as { content?: Array<{ type?: string; text?: string }>; text?: string }).content;
  const text =
    (Array.isArray(content)
      ? content.find(
          (item) =>
            typeof item?.text === "string" &&
            item.text.trim() &&
            (item.type == null || item.type === "text"),
        )?.text
      : null) ??
    (typeof (value as { text?: string }).text === "string" &&
    (value as { text: string }).text.trim()
      ? (value as { text: string }).text
      : null);

  if (typeof text === "string" && text.trim()) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return value;
    }
  }

  return value;
}

export function buildToolTimelineMessage(input: {
  toolName: string;
  state: ToolTimelineState;
  assistantMessageId: string;
  assistantRunId: string;
  error?: string | null;
  toolInput?: unknown;
  toolResponse?: unknown;
  toolUseId?: string | null;
}) {
  const toolName = normalizeAssistantToolName(input.toolName);
  const toolUseId = input.toolUseId?.trim() || null;
  const toolInput = normalizeToolTimelineValue(input.toolInput);
  const toolResponse = normalizeToolTimelineValue(input.toolResponse);

  if (input.state === TOOL_TIMELINE_STATE.STARTED) {
    return {
      contentMarkdown: `开始调用工具：${toolName}`,
      structuredJson: {
        assistant_message_id: input.assistantMessageId,
        assistant_run_id: input.assistantRunId,
        timeline_event: TIMELINE_EVENT.TOOL_STARTED,
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: null,
        tool_use_id: toolUseId,
      },
      status: MESSAGE_STATUS.STREAMING,
    };
  }

  if (input.state === TOOL_TIMELINE_STATE.FAILED) {
    return {
      contentMarkdown: `工具执行失败：${toolName}${input.error ? ` · ${input.error}` : ""}`,
      structuredJson: {
        assistant_message_id: input.assistantMessageId,
        assistant_run_id: input.assistantRunId,
        timeline_event: TIMELINE_EVENT.TOOL_FAILED,
        tool_name: toolName,
        error: input.error ?? null,
        tool_input: toolInput,
        tool_response: null,
        tool_use_id: toolUseId,
      },
      status: MESSAGE_STATUS.FAILED,
    };
  }

  return {
    contentMarkdown: `工具执行完成：${toolName}`,
    structuredJson: {
      assistant_message_id: input.assistantMessageId,
      assistant_run_id: input.assistantRunId,
      timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
      tool_use_id: toolUseId,
    },
    status: MESSAGE_STATUS.COMPLETED,
  };
}
