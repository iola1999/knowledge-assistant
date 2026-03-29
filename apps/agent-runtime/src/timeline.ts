import {
  MESSAGE_STATUS,
  normalizeAssistantToolName,
  TIMELINE_EVENT,
  type ToolTimelineState,
  TOOL_TIMELINE_STATE,
} from "@anchordesk/contracts";

export function buildToolTimelineMessage(input: {
  toolName: string;
  state: ToolTimelineState;
  error?: string | null;
}) {
  const toolName = normalizeAssistantToolName(input.toolName);

  if (input.state === TOOL_TIMELINE_STATE.STARTED) {
    return {
      contentMarkdown: `开始调用工具：${toolName}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.TOOL_STARTED,
        tool_name: toolName,
      },
      status: MESSAGE_STATUS.STREAMING,
    };
  }

  if (input.state === TOOL_TIMELINE_STATE.FAILED) {
    return {
      contentMarkdown: `工具执行失败：${toolName}${input.error ? ` · ${input.error}` : ""}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.TOOL_FAILED,
        tool_name: toolName,
        error: input.error ?? null,
      },
      status: MESSAGE_STATUS.FAILED,
    };
  }

  return {
    contentMarkdown: `工具执行完成：${toolName}`,
    structuredJson: {
      timeline_event: TIMELINE_EVENT.TOOL_FINISHED,
      tool_name: toolName,
    },
    status: MESSAGE_STATUS.COMPLETED,
  };
}
