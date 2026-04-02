import { MESSAGE_ROLE, MESSAGE_STATUS, type MessageRole, type MessageStatus } from "@anchordesk/contracts";
import { readConversationMessageQuote } from "./conversation-message-quote";

export type RetryableConversationMessage = {
  id: string;
  role: MessageRole;
  status: MessageStatus;
  contentMarkdown: string;
  structuredJson?: Record<string, unknown> | null;
};

export function findRegeneratableConversationTurn(messages: RetryableConversationMessage[]) {
  const lastMessage = messages.at(-1);
  const previousMessage = messages.at(-2);

  if (!lastMessage || !previousMessage) {
    return null;
  }

  if (lastMessage.role !== MESSAGE_ROLE.ASSISTANT) {
    return null;
  }

  if (lastMessage.status === MESSAGE_STATUS.STREAMING) {
    return null;
  }

  if (previousMessage.role !== MESSAGE_ROLE.USER) {
    return null;
  }

  const quote = readConversationMessageQuote(previousMessage.structuredJson ?? null);

  return {
    assistantMessageId: lastMessage.id,
    userMessageId: previousMessage.id,
    promptContent: previousMessage.contentMarkdown,
    ...(quote ? { quote } : {}),
  };
}

export function findRetryableConversationTurn(messages: RetryableConversationMessage[]) {
  const regeneratableTurn = findRegeneratableConversationTurn(messages);

  if (!regeneratableTurn || messages.at(-1)?.status !== MESSAGE_STATUS.FAILED) {
    return null;
  }

  return regeneratableTurn;
}
