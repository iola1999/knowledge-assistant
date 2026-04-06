import type { ConversationChatMessage } from "@/lib/api/conversation-session";

export function resolveComposerHeading(input: {
  title?: string | null;
  description?: string | null;
}) {
  const title = input.title?.trim() ? input.title.trim() : null;
  const description = input.description?.trim() ? input.description.trim() : null;

  if (!title && !description) {
    return null;
  }

  return {
    title,
    description,
  };
}

export const COMPOSER_ENTER_ACTION = {
  NONE: "none",
  NEWLINE: "newline",
  SUBMIT: "submit",
} as const;

export const COMPOSER_PRIMARY_ACTION = {
  STOP: "stop",
  SUBMIT: "submit",
} as const;

export function resolveComposerPrimaryButtonState(input: {
  mode: (typeof COMPOSER_PRIMARY_ACTION)[keyof typeof COMPOSER_PRIMARY_ACTION];
  submitLabel?: string;
  isPending?: boolean;
  isStopping?: boolean;
  isSubmitting?: boolean;
}) {
  if (input.mode === COMPOSER_PRIMARY_ACTION.STOP) {
    return {
      label: input.isStopping ? "停止中..." : "停止",
      showLoadingIndicator: false,
    };
  }

  const isBusy = Boolean(input.isSubmitting || input.isPending);

  return {
    label: isBusy ? "发送中..." : (input.submitLabel ?? "发送"),
    showLoadingIndicator: isBusy,
  };
}

export function resolveComposerEnterKeyAction(input: {
  key: string;
  shiftKey?: boolean | null;
  metaKey?: boolean | null;
  ctrlKey?: boolean | null;
  isComposing?: boolean | null;
  keyCode?: number | null;
}) {
  if (input.key !== "Enter") {
    return COMPOSER_ENTER_ACTION.NONE;
  }

  if (input.isComposing || input.keyCode === 229) {
    return COMPOSER_ENTER_ACTION.NONE;
  }

  if (input.shiftKey) {
    return COMPOSER_ENTER_ACTION.NEWLINE;
  }

  if (input.metaKey || input.ctrlKey) {
    return COMPOSER_ENTER_ACTION.SUBMIT;
  }

  return COMPOSER_ENTER_ACTION.SUBMIT;
}

const STAGE_COMPOSER_LINE_HEIGHT = 28;
const STAGE_COMPOSER_MAX_HEIGHT = STAGE_COMPOSER_LINE_HEIGHT * 8;

export function resolveComposerStageTextareaSizing(rows?: number | null) {
  const requestedRows = Number.isFinite(rows) ? Math.trunc(rows ?? 1) : 1;
  const minRows = Math.max(1, Math.min(requestedRows, 3));

  return {
    minRows,
    minHeight: STAGE_COMPOSER_LINE_HEIGHT * minRows,
    maxHeight: STAGE_COMPOSER_MAX_HEIGHT,
  };
}

export function resolveComposerSubmitStatus(agentError?: string | null) {
  if (!agentError?.trim()) {
    return null;
  }

  return `消息已保存，但 Agent 处理失败：${agentError}`;
}

export function resolveComposerPrimaryAction(input: {
  content: string;
  hasQuotedSelection?: boolean;
  hasPendingAttachments: boolean;
  isSubmitting?: boolean;
  isStreaming: boolean;
}) {
  if (input.isStreaming) {
    return {
      mode: COMPOSER_PRIMARY_ACTION.STOP,
      disabled: false,
    };
  }

  return {
    mode: COMPOSER_PRIMARY_ACTION.SUBMIT,
    disabled:
      Boolean(input.isSubmitting) ||
      input.hasPendingAttachments ||
      (!input.content.trim() && !input.hasQuotedSelection),
  };
}

export function buildComposerSubmittedTurn(input: {
  assistantMessage?: ConversationChatMessage | null;
  conversationId: string;
  userMessage?: ConversationChatMessage | null;
}) {
  if (!input.userMessage || !input.assistantMessage) {
    return null;
  }

  return {
    conversationId: input.conversationId,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
  };
}
