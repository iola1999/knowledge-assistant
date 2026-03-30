import {
  buildStreamingAssistantRunState,
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type MessageRole,
  type MessageStatus,
} from "@anchordesk/contracts";

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
}) {
  if (!input.event.message_id) {
    return {
      messages: input.messages,
      citations: input.citations,
    };
  }

  const nextMessages = input.messages.map((message) =>
    message.id === input.event.message_id
      ? {
          ...message,
          status: input.event.status,
          contentMarkdown: input.event.content_markdown ?? message.contentMarkdown,
          structuredJson: input.event.structured ?? null,
        }
      : message,
  );

  const nextCitations =
    input.event.type === CONVERSATION_STREAM_EVENT.ANSWER_DONE
      ? replaceMessageCitations(
          input.citations,
          input.event.message_id,
          input.event.citations.map((citation) => ({
            id: citation.id,
            messageId: input.event.message_id!,
            anchorId: citation.anchor_id,
            documentId: citation.document_id,
            label: citation.label,
            quoteText: citation.quote_text,
          })),
        )
      : input.citations.filter((citation) => citation.messageId !== input.event.message_id);

  return {
    messages: nextMessages,
    citations: nextCitations,
  };
}
