import {
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  TIMELINE_EVENT,
  readStreamingAssistantRunState,
  type MessageRole,
  type MessageStatus,
} from "@anchordesk/contracts";

export type ConversationProcessThreadMessage = {
  id: string;
  role: MessageRole;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: Date | string;
  structuredJson?: Record<string, unknown> | null;
};

export type AssistantProcessMessage = {
  id: string;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: string;
  structuredJson?: Record<string, unknown> | null;
};

export type AssistantProcessTimelineEntry = {
  id: string;
  kind: "tool_call" | "status_event";
  toolName: string | null;
  status: MessageStatus;
  createdAt: string;
  completedAt: string | null;
  contentMarkdown: string;
  input: unknown | null;
  output: unknown | null;
  error: string | null;
  progressText: string | null;
  elapsedSeconds: number | null;
};

function normalizeCreatedAt(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function readStructuredString(
  structuredJson: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = structuredJson?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStructuredValue(
  structuredJson: Record<string, unknown> | null | undefined,
  key: string,
) {
  if (!structuredJson || !(key in structuredJson)) {
    return null;
  }

  return structuredJson[key] ?? null;
}

function findOpenToolCallEntryIndex(
  entries: AssistantProcessTimelineEntry[],
  toolUseId: string | null,
  toolName: string | null,
  toolCallEntryIndexByUseId: Map<string, number>,
) {
  if (toolUseId) {
    const existingIndex = toolCallEntryIndexByUseId.get(toolUseId);

    if (typeof existingIndex === "number") {
      return existingIndex;
    }
  }

  if (!toolName) {
    return -1;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (
      entry.kind === "tool_call" &&
      entry.toolName === toolName &&
      entry.status === MESSAGE_STATUS.STREAMING &&
      entry.completedAt === null
    ) {
      return index;
    }
  }

  return -1;
}

export function groupAssistantProcessMessages(
  messages: ConversationProcessThreadMessage[],
) {
  const grouped = new Map<string, AssistantProcessMessage[]>();
  const latestRunIdByAssistant = new Map<string, string | null>();
  let activeAssistantId: string | null = null;

  for (const message of messages) {
    if (message.role !== MESSAGE_ROLE.ASSISTANT) {
      continue;
    }

    latestRunIdByAssistant.set(
      message.id,
      readStreamingAssistantRunState(message.structuredJson ?? null)?.run_id ?? null,
    );
  }

  for (const message of messages) {
    if (message.role === MESSAGE_ROLE.USER) {
      activeAssistantId = null;
      continue;
    }

    if (message.role === MESSAGE_ROLE.ASSISTANT) {
      activeAssistantId = message.id;
      continue;
    }

    if (message.role !== MESSAGE_ROLE.TOOL || !activeAssistantId) {
      if (message.role !== MESSAGE_ROLE.TOOL) {
        continue;
      }
    }

    const explicitAssistantMessageId = readStructuredString(
      message.structuredJson ?? null,
      "assistant_message_id",
    );
    const explicitAssistantRunId = readStructuredString(
      message.structuredJson ?? null,
      "assistant_run_id",
    );
    const targetAssistantId = explicitAssistantMessageId ?? activeAssistantId;

    if (!targetAssistantId) {
      continue;
    }

    const latestAssistantRunId = latestRunIdByAssistant.get(targetAssistantId) ?? null;
    if (
      explicitAssistantMessageId &&
      latestAssistantRunId &&
      explicitAssistantRunId !== latestAssistantRunId
    ) {
      continue;
    }

    const currentGroup = grouped.get(targetAssistantId) ?? [];
    currentGroup.push({
      id: message.id,
      status: message.status,
      contentMarkdown: message.contentMarkdown,
      createdAt: normalizeCreatedAt(message.createdAt),
      structuredJson: message.structuredJson ?? null,
    });
    grouped.set(targetAssistantId, currentGroup);
  }

  return Object.fromEntries(grouped);
}

export function buildAssistantProcessTimelineEntries(
  timelineMessages: AssistantProcessMessage[],
) {
  const entries: AssistantProcessTimelineEntry[] = [];
  const toolCallEntryIndexByUseId = new Map<string, number>();

  for (const message of timelineMessages) {
    const createdAt = normalizeCreatedAt(message.createdAt);
    const structuredJson = message.structuredJson ?? null;
    const timelineEvent = readStructuredString(structuredJson, "timeline_event");
    const toolName = readStructuredString(structuredJson, "tool_name");
    const toolUseId = readStructuredString(structuredJson, "tool_use_id");
    const input = readStructuredValue(structuredJson, "tool_input");
    const output = readStructuredValue(structuredJson, "tool_response");
    const error = readStructuredString(structuredJson, "error");
    const progressText = readStructuredString(structuredJson, "progress_text");
    const elapsedSecondsRaw = readStructuredValue(structuredJson, "elapsed_seconds");
    const elapsedSeconds =
      typeof elapsedSecondsRaw === "number" && Number.isFinite(elapsedSecondsRaw)
        ? elapsedSecondsRaw
        : null;

    const pushStatusEvent = () => {
      entries.push({
        id: message.id,
        kind: "status_event",
        toolName: null,
        status: message.status,
        createdAt,
        completedAt: createdAt,
        contentMarkdown: message.contentMarkdown,
        input: null,
        output: null,
        error,
        progressText: null,
        elapsedSeconds: null,
      });
    };

    if (
      timelineEvent === TIMELINE_EVENT.RUN_FAILED ||
      (!toolName &&
        timelineEvent !== TIMELINE_EVENT.TOOL_STARTED &&
        timelineEvent !== TIMELINE_EVENT.TOOL_FINISHED &&
        timelineEvent !== TIMELINE_EVENT.TOOL_FAILED)
    ) {
      pushStatusEvent();
      continue;
    }

    if (!toolName) {
      pushStatusEvent();
      continue;
    }

    if (timelineEvent === TIMELINE_EVENT.TOOL_STARTED) {
      const entryIndex = entries.push({
        id: toolUseId ?? message.id,
        kind: "tool_call",
        toolName,
        status: message.status,
        createdAt,
        completedAt: null,
        contentMarkdown: message.contentMarkdown,
        input,
        output: null,
        error,
        progressText,
        elapsedSeconds,
      });

      if (toolUseId) {
        toolCallEntryIndexByUseId.set(toolUseId, entryIndex - 1);
      }
      continue;
    }

    const existingIndex = findOpenToolCallEntryIndex(
      entries,
      toolUseId,
      toolName,
      toolCallEntryIndexByUseId,
    );

    if (existingIndex >= 0) {
      const existingEntry = entries[existingIndex];
      entries[existingIndex] = {
        ...existingEntry,
        status: message.status,
        completedAt: createdAt,
        contentMarkdown: message.contentMarkdown,
        input: input ?? existingEntry.input,
        output:
          timelineEvent === TIMELINE_EVENT.TOOL_FINISHED ? output ?? existingEntry.output : null,
        error:
          timelineEvent === TIMELINE_EVENT.TOOL_FAILED ? error ?? existingEntry.error : null,
        progressText: progressText ?? existingEntry.progressText,
        elapsedSeconds: elapsedSeconds ?? existingEntry.elapsedSeconds,
      };
      continue;
    }

    const entryIndex = entries.push({
      id: toolUseId ?? message.id,
      kind: "tool_call",
      toolName,
      status: message.status,
      createdAt,
      completedAt: createdAt,
      contentMarkdown: message.contentMarkdown,
      input,
      output: timelineEvent === TIMELINE_EVENT.TOOL_FINISHED ? output : null,
      error: timelineEvent === TIMELINE_EVENT.TOOL_FAILED ? error : null,
      progressText,
      elapsedSeconds,
    });

    if (toolUseId) {
      toolCallEntryIndexByUseId.set(toolUseId, entryIndex - 1);
    }
  }

  return entries;
}

export function describeAssistantProcessSummary(input: {
  stepCount: number;
  isStreaming: boolean;
  runtimeStatus?: string | null;
}) {
  if (input.isStreaming) {
    return input.stepCount > 0
      ? `${input.runtimeStatus ?? "正在生成"} · ${input.stepCount} 个步骤`
      : (input.runtimeStatus ?? "正在生成");
  }

  if (input.stepCount <= 0) {
    return null;
  }

  return `已完成 ${input.stepCount} 个步骤`;
}

export function describeAssistantStreamingStatus(contentMarkdown: string) {
  return contentMarkdown.trim()
    ? "助手正在生成回答..."
    : "助手正在分析问题并生成回答...";
}

export function canShowAssistantProcess(input: {
  stepCount: number;
  isStreaming: boolean;
}) {
  return input.stepCount > 0 || input.isStreaming;
}

export function canShowAssistantResultPanel(input: {
  status: MessageStatus;
  contentMarkdown: string;
}) {
  if (input.status !== MESSAGE_STATUS.STREAMING) {
    return true;
  }

  return input.contentMarkdown.trim().length > 0;
}
