import {
  buildAssistantFailedMessageState,
  buildStreamingAssistantRunState,
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type MessageRole,
  type MessageStatus,
} from "@anchordesk/contracts";

import { slugify } from "./slug";

export type ConversationChatMessage = {
  id: string;
  role: MessageRole;
  status: MessageStatus;
  contentMarkdown: string;
  structuredJson?: Record<string, unknown> | null;
};

export type ConversationMessageCitation = {
  id: string;
  messageId: string;
  anchorId?: string | null;
  documentId?: string | null;
  label: string;
  quoteText: string;
};

type AssistantTerminalEvent = Extract<
  ConversationStreamEvent,
  | { type: typeof CONVERSATION_STREAM_EVENT.ANSWER_DONE }
  | { type: typeof CONVERSATION_STREAM_EVENT.RUN_FAILED }
>;

const CONVERSATION_EXPORT_FILENAME_STEM_LENGTH = 48;

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
  citations: ConversationMessageCitation[];
  messages: ConversationChatMessage[];
  now?: Date;
}) {
  const nextMessages = input.messages.map((message) =>
    message.id === input.assistantMessageId
      ? {
          ...message,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
          structuredJson: buildStreamingAssistantRunState({
            now: input.now,
          }),
        }
      : message,
  );

  return {
    messages: nextMessages,
    citations: input.citations.filter(
      (citation) => citation.messageId !== input.assistantMessageId,
    ),
  };
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
            fallbackFailedState?.structuredJson ??
            null,
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
          })),
        )
      : input.citations.filter((citation) => citation.messageId !== targetMessageId);

  return {
    messages: nextMessages,
    citations: nextCitations,
  };
}
