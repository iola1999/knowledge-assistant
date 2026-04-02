export const CONVERSATION_MESSAGE_QUOTE_SNAPSHOT_KEY = "follow_up_quote" as const;
export const CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH = 280;
export const DEFAULT_QUOTED_FOLLOW_UP_MESSAGE = "请围绕这段内容继续展开。";

export type ConversationMessageQuote = {
  assistantMessageId?: string | null;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeConversationMessageQuoteText(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH - 3).trimEnd()}...`;
}

export function normalizeConversationMessageQuote(
  value: unknown,
): ConversationMessageQuote | null {
  if (!isRecord(value)) {
    return null;
  }

  const text = normalizeConversationMessageQuoteText(value.text);
  if (!text) {
    return null;
  }

  return {
    assistantMessageId:
      typeof value.assistantMessageId === "string" && value.assistantMessageId.trim()
        ? value.assistantMessageId
        : null,
    text,
  };
}

export function readConversationMessageQuote(
  structuredJson?: Record<string, unknown> | null,
) {
  return normalizeConversationMessageQuote(
    structuredJson?.[CONVERSATION_MESSAGE_QUOTE_SNAPSHOT_KEY],
  );
}

export function writeConversationMessageQuote(input: {
  quote?: ConversationMessageQuote | null;
  structuredJson?: Record<string, unknown> | null;
}) {
  const quote = normalizeConversationMessageQuote(input.quote);
  if (!quote) {
    return input.structuredJson ?? null;
  }

  return {
    ...(input.structuredJson ?? {}),
    [CONVERSATION_MESSAGE_QUOTE_SNAPSHOT_KEY]: quote,
  };
}

export function resolveConversationUserMessageContent(input: {
  content?: string | null;
  quote?: ConversationMessageQuote | null;
}) {
  const content = String(input.content ?? "").trim();
  if (content) {
    return content;
  }

  return normalizeConversationMessageQuote(input.quote)
    ? DEFAULT_QUOTED_FOLLOW_UP_MESSAGE
    : "";
}
