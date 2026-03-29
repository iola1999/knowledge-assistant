import {
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type MessageRole,
  type MessageStatus,
} from "@knowledge-assistant/contracts";

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

export function groupAssistantProcessMessages(
  messages: ConversationProcessThreadMessage[],
) {
  const grouped = new Map<string, AssistantProcessMessage[]>();
  let activeAssistantId: string | null = null;

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
      continue;
    }

    const currentGroup = grouped.get(activeAssistantId) ?? [];
    currentGroup.push({
      id: message.id,
      status: message.status,
      contentMarkdown: message.contentMarkdown,
      createdAt:
        typeof message.createdAt === "string"
          ? message.createdAt
          : message.createdAt.toISOString(),
      structuredJson: message.structuredJson ?? null,
    });
    grouped.set(activeAssistantId, currentGroup);
  }

  return Object.fromEntries(grouped);
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

export function canShowAssistantProcess(input: {
  stepCount: number;
  isStreaming: boolean;
}) {
  return input.stepCount > 0 || input.isStreaming;
}
