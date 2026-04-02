import {
  appendStreamingAssistantThinkingProcessStep,
  buildAssistantFailedMessageState,
  buildInitialStreamingAssistantRunState,
  closeStreamingAssistantThinkingProcessSteps,
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type KnowledgeSourceScope,
  type MessageRole,
  type MessageStatus,
  readStreamingAssistantProcessSteps,
  upsertStreamingAssistantToolProcessStep,
} from "@anchordesk/contracts";

import {
  readConversationMessageQuote,
  type ConversationMessageQuote,
} from "./conversation-message-quote";
import { slugify } from "./slug";

export type ConversationChatMessage = {
  id: string;
  role: MessageRole;
  status: MessageStatus;
  contentMarkdown: string;
  structuredJson?: Record<string, unknown> | null;
};

export const USER_MESSAGE_ATTACHMENT_SNAPSHOT_KEY = "submitted_attachments" as const;

export type ConversationMessageAttachment = {
  attachmentId: string;
  documentId?: string | null;
  documentVersionId?: string | null;
  sourceFilename: string;
};

export type { ConversationMessageQuote };

export type ConversationMessageCitation = {
  id: string;
  messageId: string;
  anchorId?: string | null;
  documentId?: string | null;
  label: string;
  quoteText: string;
  sourceScope?: KnowledgeSourceScope | null;
  libraryTitle?: string | null;
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  sourceTitle?: string | null;
};

export type ConversationTimelineMessage = {
  id: string;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: string;
  structuredJson?: Record<string, unknown> | null;
};

export type ConversationTimelineMessagesByAssistant = Record<
  string,
  ConversationTimelineMessage[]
>;

export type ConversationSessionSnapshot = {
  messages: ConversationChatMessage[];
  citations: ConversationMessageCitation[];
  timelineMessagesByAssistant: ConversationTimelineMessagesByAssistant;
};

type AssistantTerminalEvent = Extract<
  ConversationStreamEvent,
  | { type: typeof CONVERSATION_STREAM_EVENT.ANSWER_DONE }
  | { type: typeof CONVERSATION_STREAM_EVENT.RUN_FAILED }
>;

type AssistantDeltaEvent = Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ANSWER_DELTA }
>;
type AssistantThinkingDeltaEvent = Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA }
>;

const CONVERSATION_EXPORT_FILENAME_STEM_LENGTH = 48;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConversationMessageAttachment(
  value: unknown,
): ConversationMessageAttachment | null {
  if (!isRecord(value)) {
    return null;
  }

  const attachmentId = typeof value.attachmentId === "string" ? value.attachmentId.trim() : "";
  const sourceFilename =
    typeof value.sourceFilename === "string" ? value.sourceFilename.trim() : "";

  if (!attachmentId || !sourceFilename) {
    return null;
  }

  return {
    attachmentId,
    documentId:
      typeof value.documentId === "string" && value.documentId.trim()
        ? value.documentId
        : null,
    documentVersionId:
      typeof value.documentVersionId === "string" && value.documentVersionId.trim()
        ? value.documentVersionId
        : null,
    sourceFilename,
  };
}

export function normalizeConversationMessageAttachments(
  attachments: ConversationMessageAttachment[],
) {
  const seen = new Set<string>();
  const normalized: ConversationMessageAttachment[] = [];

  for (const attachment of attachments) {
    const nextAttachment = normalizeConversationMessageAttachment(attachment);
    if (!nextAttachment || seen.has(nextAttachment.attachmentId)) {
      continue;
    }

    seen.add(nextAttachment.attachmentId);
    normalized.push(nextAttachment);
  }

  return normalized;
}

export function readConversationMessageAttachments(
  structuredJson?: Record<string, unknown> | null,
) {
  const rawAttachments = structuredJson?.[USER_MESSAGE_ATTACHMENT_SNAPSHOT_KEY];
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments
    .map((attachment) => normalizeConversationMessageAttachment(attachment))
    .filter((attachment): attachment is ConversationMessageAttachment => attachment !== null);
}

export function writeConversationMessageAttachments(input: {
  attachments: ConversationMessageAttachment[];
  structuredJson?: Record<string, unknown> | null;
}) {
  const attachments = normalizeConversationMessageAttachments(input.attachments);
  if (attachments.length === 0) {
    return input.structuredJson ?? null;
  }

  return {
    ...(input.structuredJson ?? {}),
    [USER_MESSAGE_ATTACHMENT_SNAPSHOT_KEY]: attachments,
  };
}

export function applyConversationMessageAttachments(input: {
  attachments: ConversationMessageAttachment[];
  message: ConversationChatMessage;
}) {
  if (input.attachments.length === 0) {
    return input.message;
  }

  return {
    ...input.message,
    structuredJson: writeConversationMessageAttachments({
      attachments: input.attachments,
      structuredJson: input.message.structuredJson ?? null,
    }),
  };
}

export { readConversationMessageQuote };

export function buildConversationAttachmentLinkTarget(input: {
  workspaceId?: string | null;
  documentId?: string | null;
}) {
  if (!input.workspaceId || !input.documentId) {
    return null;
  }

  return {
    href: `/workspaces/${input.workspaceId}/documents/${input.documentId}`,
    target: "_blank" as const,
    rel: "noopener noreferrer" as const,
  };
}

function replaceMessageCitations(
  citations: ConversationMessageCitation[],
  messageId: string,
  nextCitations: ConversationMessageCitation[],
) {
  return [
    ...citations.filter((citation) => citation.messageId !== messageId),
    ...nextCitations,
  ];
}

function readToolTimelineString(
  structuredJson: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = structuredJson?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function applyToolProcessStepToMessage(input: {
  assistantMessageId: string;
  messages: ConversationChatMessage[];
  timelineMessage: ConversationTimelineMessage;
}) {
  return input.messages.map((message) => {
    if (message.id !== input.assistantMessageId) {
      return message;
    }

    const structuredJson = message.structuredJson ?? null;
    const timelineStructuredJson = input.timelineMessage.structuredJson ?? null;
    const toolUseId = readToolTimelineString(timelineStructuredJson, "tool_use_id");
    const toolName = readToolTimelineString(timelineStructuredJson, "tool_name");
    const processSteps = upsertStreamingAssistantToolProcessStep(
      readStreamingAssistantProcessSteps(structuredJson),
      {
        stepId: toolUseId ?? input.timelineMessage.id,
        status: input.timelineMessage.status,
        now: new Date(input.timelineMessage.createdAt),
        toolName,
        toolUseId,
        toolMessageId: input.timelineMessage.id,
      },
    );

    return {
      ...message,
      structuredJson: {
        ...(structuredJson ?? {}),
        process_steps: processSteps,
      },
    };
  });
}

export function appendSubmittedConversationTurn(input: {
  assistantMessage: ConversationChatMessage;
  messages: ConversationChatMessage[];
  userMessage: ConversationChatMessage;
}) {
  return [
    ...input.messages.filter(
      (message) =>
        message.id !== input.userMessage.id &&
        message.id !== input.assistantMessage.id,
    ),
    input.userMessage,
    input.assistantMessage,
  ];
}

export function findLatestAssistantMessageId(messages: ConversationChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === MESSAGE_ROLE.ASSISTANT) {
      return messages[index]!.id;
    }
  }

  return null;
}

export function findStreamingAssistantMessageId(messages: ConversationChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === MESSAGE_ROLE.ASSISTANT &&
      message.status === MESSAGE_STATUS.STREAMING
    ) {
      return message.id;
    }
  }

  return null;
}

function findConversationExportPrompt(
  messages: ConversationChatMessage[],
  messageId: string,
) {
  const messageIndex = messages.findIndex((message) => message.id === messageId);

  for (let index = messageIndex; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === MESSAGE_ROLE.USER && message.contentMarkdown.trim()) {
      return message.contentMarkdown;
    }
  }

  return null;
}

function buildConversationExportBasename(prompt: string) {
  return slugify(
    prompt.replace(/\s+/g, " ").trim().slice(0, CONVERSATION_EXPORT_FILENAME_STEM_LENGTH),
  );
}

export function buildConversationExportFilename(input: {
  conversationId: string;
  messageId: string;
  messages: ConversationChatMessage[];
}) {
  const prompt = findConversationExportPrompt(input.messages, input.messageId);
  const basename = prompt ? buildConversationExportBasename(prompt) : null;

  return basename
    ? `${basename}.md`
    : `conversation-${input.conversationId.slice(0, 8)}.md`;
}

export function resolveConversationStreamingAssistantMessageId(input: {
  assistantMessageId?: string | null;
  assistantStatus?: MessageStatus | null;
  messages: ConversationChatMessage[];
}) {
  const localStreamingAssistantMessageId = findStreamingAssistantMessageId(input.messages);
  if (localStreamingAssistantMessageId) {
    return localStreamingAssistantMessageId;
  }

  if (input.messages.length > 0) {
    return null;
  }

  return input.assistantStatus === MESSAGE_STATUS.STREAMING
    ? input.assistantMessageId ?? null
    : null;
}

export function restartAssistantMessageForRetry(input: {
  assistantMessageId: string;
  nextAssistantMessage?: ConversationChatMessage | null;
  citations: ConversationMessageCitation[];
  messages: ConversationChatMessage[];
  now?: Date;
}) {
  const nextMessages = input.messages.map((message) =>
    message.id === input.assistantMessageId
      ? (input.nextAssistantMessage
          ? {
              ...message,
              ...input.nextAssistantMessage,
            }
          : {
              ...message,
              status: MESSAGE_STATUS.STREAMING,
              contentMarkdown: "",
              structuredJson: buildInitialStreamingAssistantRunState({
                now: input.now,
              }),
            })
      : message,
  );

  return {
    messages: nextMessages,
    citations: input.citations.filter(
      (citation) => citation.messageId !== input.assistantMessageId,
    ),
  };
}

export function restartAssistantSessionSnapshotForRetry(input: {
  assistantMessageId: string;
  nextAssistantMessage?: ConversationChatMessage | null;
  citations: ConversationMessageCitation[];
  messages: ConversationChatMessage[];
  now?: Date;
  timelineMessagesByAssistant: ConversationTimelineMessagesByAssistant;
}) {
  const nextState = restartAssistantMessageForRetry({
    assistantMessageId: input.assistantMessageId,
    nextAssistantMessage: input.nextAssistantMessage ?? null,
    citations: input.citations,
    messages: input.messages,
    now: input.now,
  });
  const nextTimelineMessagesByAssistant = { ...input.timelineMessagesByAssistant };
  delete nextTimelineMessagesByAssistant[input.assistantMessageId];

  return {
    messages: nextState.messages,
    citations: nextState.citations,
    timelineMessagesByAssistant: nextTimelineMessagesByAssistant,
  };
}

export function applyAssistantDeltaEvent(input: {
  event: AssistantDeltaEvent;
  messages: ConversationChatMessage[];
}) {
  return input.messages.map((message) => {
    if (message.id !== input.event.message_id) {
      return message;
    }

    return {
      ...message,
      status: input.event.status,
      contentMarkdown: input.event.delta_text
        ? `${message.contentMarkdown}${input.event.delta_text}`
        : input.event.content_markdown,
      structuredJson: {
        ...(message.structuredJson ?? {}),
        process_steps: closeStreamingAssistantThinkingProcessSteps(
          readStreamingAssistantProcessSteps(message.structuredJson ?? null),
        ),
      },
    };
  });
}

export function applyAssistantThinkingDeltaEvent(input: {
  event: AssistantThinkingDeltaEvent;
  messages: ConversationChatMessage[];
}) {
  return input.messages.map((message) => {
    if (message.id !== input.event.message_id) {
      return message;
    }

    return {
      ...message,
      status: input.event.status,
      structuredJson: {
        ...(message.structuredJson ?? {}),
        thinking_text: input.event.delta_text
          ? `${typeof message.structuredJson?.thinking_text === "string" ? message.structuredJson.thinking_text : ""}${input.event.delta_text}`
          : input.event.thinking_text,
        process_steps: appendStreamingAssistantThinkingProcessStep(
          readStreamingAssistantProcessSteps(message.structuredJson ?? null),
          {
            deltaText: input.event.delta_text ?? null,
            fullText: input.event.thinking_text,
          },
        ),
      },
    };
  });
}

export function applyAssistantToolMessageEvent(input: {
  assistantMessageId: string;
  messages: ConversationChatMessage[];
  timelineMessage: ConversationTimelineMessage;
}) {
  return applyToolProcessStepToMessage(input);
}

export function applyAssistantTerminalEvent(input: {
  messages: ConversationChatMessage[];
  citations: ConversationMessageCitation[];
  event: AssistantTerminalEvent;
  fallbackMessageId?: string | null;
}) {
  const targetMessageId = input.event.message_id ?? input.fallbackMessageId ?? null;

  if (!targetMessageId) {
    return {
      messages: input.messages,
      citations: input.citations,
    };
  }

  const fallbackFailedState =
    input.event.type === CONVERSATION_STREAM_EVENT.RUN_FAILED &&
    input.event.content_markdown === null
      ? buildAssistantFailedMessageState(input.event.error)
      : null;

  const nextMessages = input.messages.map((message) =>
    message.id === targetMessageId
      ? {
          ...message,
          status: input.event.status,
          contentMarkdown:
            input.event.content_markdown ??
            fallbackFailedState?.contentMarkdown ??
            message.contentMarkdown,
          structuredJson:
            input.event.structured ??
            (fallbackFailedState
              ? {
                  ...(message.structuredJson ?? {}),
                  ...fallbackFailedState.structuredJson,
                }
              : null),
        }
      : message,
  );

  const nextCitations =
    input.event.type === CONVERSATION_STREAM_EVENT.ANSWER_DONE
      ? replaceMessageCitations(
          input.citations,
          targetMessageId,
          input.event.citations.map((citation) => ({
            id: citation.id,
            messageId: targetMessageId,
            anchorId: citation.anchor_id,
            documentId: citation.document_id,
            label: citation.label,
            quoteText: citation.quote_text,
            sourceScope: citation.source_scope ?? null,
            libraryTitle: citation.library_title ?? null,
            sourceUrl: citation.source_url ?? null,
            sourceDomain: citation.source_domain ?? null,
            sourceTitle: citation.source_title ?? null,
          })),
        )
      : input.citations.filter((citation) => citation.messageId !== targetMessageId);

  return {
    messages: nextMessages,
    citations: nextCitations,
  };
}

export function applyAssistantTerminalEventToSessionSnapshot(input: {
  messages: ConversationChatMessage[];
  citations: ConversationMessageCitation[];
  timelineMessagesByAssistant: ConversationTimelineMessagesByAssistant;
  event: AssistantTerminalEvent;
  fallbackMessageId?: string | null;
}) {
  const nextState = applyAssistantTerminalEvent({
    messages: input.messages,
    citations: input.citations,
    event: input.event,
    fallbackMessageId: input.fallbackMessageId,
  });

  return {
    messages: nextState.messages,
    citations: nextState.citations,
    timelineMessagesByAssistant: input.timelineMessagesByAssistant,
  };
}
