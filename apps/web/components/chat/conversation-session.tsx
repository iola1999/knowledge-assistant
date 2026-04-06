"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  readStreamingAssistantRunState,
  type ConversationStreamEvent,
  type MessageStatus,
} from "@anchordesk/contracts";

import {
  AnswerIcon,
  CheckIcon,
  CopyIcon,
  ExportIcon,
  GlobeIcon,
  RegenerateIcon,
  SourceIcon,
} from "@/components/icons";
import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import { CitationPreviewExcerpt } from "@/components/shared/citation-preview-excerpt";
import { KnowledgeSourceBadge } from "@/components/shared/knowledge-source-badge";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { MarkdownContent } from "@/components/shared/markdown-content";
import {
  canShowAssistantResultPanel,
  describeAssistantStreamingStatus,
} from "@/lib/api/conversation-process";
import { buildCitationSourceBadges } from "@/lib/api/knowledge-libraries";
import { normalizeConversationMessageQuoteText } from "@/lib/api/conversation-message-quote";
import {
  findRegeneratableConversationTurn,
  type RetryableConversationMessage,
} from "@/lib/api/conversation-retry";
import {
  applyAssistantThinkingDeltaEvent,
  applyAssistantToolMessageEvent,
  buildConversationAttachmentLinkTarget,
  readConversationMessageAttachments,
  readConversationMessageQuote,
  applyAssistantDeltaEvent,
  applyAssistantTerminalEvent,
  applyAssistantTerminalEventToSessionSnapshot,
  buildConversationExportFilename,
  type ConversationChatMessage,
  type ConversationMessageAttachment,
  type ConversationMessageCitation,
  type ConversationMessageQuote,
  type ConversationSessionSnapshot,
  type ConversationTimelineMessagesByAssistant,
  findLatestAssistantMessageId,
  resolveConversationStreamingAssistantMessageId,
  restartAssistantSessionSnapshotForRetry,
} from "@/lib/api/conversation-session";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import { buildCitationLinkTarget, buildCitationPreviewModel } from "@/lib/citation-display";
import {
  buttonStyles,
  chipButtonStyles,
  cn,
  tabButtonStyles,
  textSelectionStyles,
  ui,
} from "@/lib/ui";

type ChatMessage = ConversationChatMessage;

type TimelineMessagesByAssistant = ConversationTimelineMessagesByAssistant;

type MessageCitation = ConversationMessageCitation;
type MessageViewMode = "answer" | "sources";
type ActionButtonProps = {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
};
type TabButtonProps = {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
};
type CitationSourceBadgeProps = {
  citation: MessageCitation;
};
type UserAttachmentChipProps = {
  attachment: ConversationMessageAttachment;
  workspaceId?: string | null;
};
type ConversationSessionProps = {
  conversationId: string;
  workspaceId?: string | null;
  assistantMessageId?: string | null;
  assistantStatus?: MessageStatus | null;
  initialMessages: ChatMessage[];
  initialTimelineMessagesByAssistant?: TimelineMessagesByAssistant;
  initialCitations?: MessageCitation[];
  streamEnabled?: boolean;
  documentLinksEnabled?: boolean;
  readOnly?: boolean;
  emptyStateMessage?: string;
  onAssistantTerminalEvent?: (conversationId: string) => void;
  onQuoteRequest?: (quote: ConversationMessageQuote) => void;
  onSessionStateSync?: (snapshot: ConversationSessionSnapshot) => void;
};

type PendingQuoteSelection = {
  assistantMessageId: string;
  left: number;
  text: string;
  top: number;
};

function flattenTimelineMessageIds(timelineByAssistant: TimelineMessagesByAssistant) {
  return new Set(
    Object.values(timelineByAssistant)
      .flat()
      .map((message) => message.id),
  );
}

function readAssistantMessageContent(
  messages: ChatMessage[],
  assistantMessageId?: string | null,
) {
  return messages.find((message) => message.id === assistantMessageId)?.contentMarkdown ?? "";
}

function readAssistantRuntimeStatus(
  messages: ChatMessage[],
  assistantMessageId?: string | null,
) {
  const assistantMessage = messages.find((message) => message.id === assistantMessageId);
  const runState = readStreamingAssistantRunState(assistantMessage?.structuredJson ?? null);
  return runState?.status_text ?? null;
}

function applyToolProgressToTimeline(
  timelineByAssistant: TimelineMessagesByAssistant,
  assistantMessageId: string,
  input: {
    toolUseId: string;
    toolName: string;
    elapsedSeconds: number;
    statusText?: string | null;
    taskId?: string | null;
  },
) {
  const currentTimeline = timelineByAssistant[assistantMessageId] ?? [];
  let changed = false;

  const nextTimeline = currentTimeline.map((message) => {
    const toolUseId =
      typeof message.structuredJson?.tool_use_id === "string"
        ? message.structuredJson.tool_use_id
        : null;

    if (toolUseId !== input.toolUseId || message.status !== MESSAGE_STATUS.STREAMING) {
      return message;
    }

    changed = true;

    return {
      ...message,
      structuredJson: {
        ...(message.structuredJson ?? {}),
        tool_name: input.toolName,
        tool_use_id: input.toolUseId,
        task_id: input.taskId ?? null,
        progress_text: input.statusText ?? `正在调用工具 ${input.toolName}...`,
        elapsed_seconds: input.elapsedSeconds,
      },
    };
  });

  if (!changed) {
    return timelineByAssistant;
  }

  return {
    ...timelineByAssistant,
    [assistantMessageId]: nextTimeline,
  };
}

function ActionButton({
  active = false,
  children,
  disabled = false,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={chipButtonStyles({ active, size: "compact" })}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  children,
  disabled = false,
  onClick,
}: TabButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={tabButtonStyles({ active, size: "compact" })}
    >
      {children}
    </button>
  );
}

function CitationSourceBadge({
  citation,
}: CitationSourceBadgeProps) {
  return (
    <KnowledgeSourceBadge
      sourceScope={citation.sourceScope}
      libraryTitle={citation.libraryTitle}
    />
  );
}

function CitationCardContent({
  citation,
  index,
}: {
  citation: MessageCitation;
  index: number;
}) {
  const preview = buildCitationPreviewModel(citation);

  return (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
          资料 {index + 1}
        </span>
        {preview.isWeb ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-app-muted-strong">
            <span className="inline-flex size-5 items-center justify-center rounded-full border border-app-border bg-app-surface-soft text-app-muted-strong">
              <GlobeIcon className="size-3.5" />
            </span>
            <span className="truncate">{preview.meta ?? preview.badgeLabel}</span>
          </span>
        ) : (
          <CitationSourceBadge citation={citation} />
        )}
      </span>
      <span
        className={cn(
          textSelectionStyles.content,
          "text-[14px] font-medium leading-6 text-app-text",
        )}
      >
        {preview.title}
      </span>
      <CitationPreviewExcerpt preview={preview} />
    </>
  );
}

function UserAttachmentChip({
  attachment,
  workspaceId,
}: UserAttachmentChipProps) {
  const content = (
    <span className={conversationDensityClassNames.userAttachmentChip}>
      <span className="truncate">{attachment.sourceFilename}</span>
    </span>
  );

  const target = buildConversationAttachmentLinkTarget({
    workspaceId,
    documentId: attachment.documentId,
  });

  if (!target) {
    return content;
  }

  return (
    <Link href={target.href} target={target.target} rel={target.rel}>{content}</Link>
  );
}

export function ConversationSession({
  conversationId,
  workspaceId,
  assistantMessageId,
  assistantStatus,
  initialMessages,
  initialTimelineMessagesByAssistant,
  initialCitations,
  streamEnabled = true,
  documentLinksEnabled = true,
  readOnly = false,
  emptyStateMessage = "这一轮还没有消息",
  onAssistantTerminalEvent,
  onQuoteRequest,
  onSessionStateSync,
}: ConversationSessionProps) {
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [timelineMessagesByAssistant, setTimelineMessagesByAssistant] = useState(
    initialTimelineMessagesByAssistant ?? {},
  );
  const [messageCitations, setMessageCitations] = useState(initialCitations ?? []);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(() => {
    const initialStreamingAssistantMessageId = resolveConversationStreamingAssistantMessageId({
      assistantMessageId,
      assistantStatus,
      messages: initialMessages,
    });

    return initialStreamingAssistantMessageId
      ? readAssistantRuntimeStatus(initialMessages, initialStreamingAssistantMessageId) ??
          describeAssistantStreamingStatus(
            readAssistantMessageContent(initialMessages, initialStreamingAssistantMessageId),
          )
      : null;
  });
  const [messageViewModes, setMessageViewModes] = useState<Record<string, MessageViewMode>>({});
  const [actionStatusByMessage, setActionStatusByMessage] = useState<
    Record<string, string | null>
  >({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [pendingQuoteSelection, setPendingQuoteSelection] =
    useState<PendingQuoteSelection | null>(null);
  const chatMessagesRef = useRef(initialMessages);
  const messageCitationsRef = useRef(initialCitations ?? []);
  const timelineMessagesByAssistantRef = useRef(initialTimelineMessagesByAssistant ?? {});
  const seenTimelineIdsRef = useRef(
    flattenTimelineMessageIds(initialTimelineMessagesByAssistant ?? {}),
  );
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setChatMessages(initialMessages);
    setTimelineMessagesByAssistant(initialTimelineMessagesByAssistant ?? {});
    setMessageCitations(initialCitations ?? []);
    setMessageViewModes({});
    setActionStatusByMessage({});
    setCopiedMessageId(null);
    setRegeneratingMessageId(null);
    setPendingQuoteSelection(null);
    chatMessagesRef.current = initialMessages;
    messageCitationsRef.current = initialCitations ?? [];
    timelineMessagesByAssistantRef.current = initialTimelineMessagesByAssistant ?? {};
    const nextStreamingAssistantMessageId = resolveConversationStreamingAssistantMessageId({
      assistantMessageId,
      assistantStatus,
      messages: initialMessages,
    });
    setRuntimeStatus(
      nextStreamingAssistantMessageId
        ? readAssistantRuntimeStatus(initialMessages, nextStreamingAssistantMessageId) ??
            describeAssistantStreamingStatus(
              readAssistantMessageContent(initialMessages, nextStreamingAssistantMessageId),
            )
        : null,
    );
    seenTimelineIdsRef.current = flattenTimelineMessageIds(
      initialTimelineMessagesByAssistant ?? {},
    );
  }, [
    assistantStatus,
    initialCitations,
    initialMessages,
    initialTimelineMessagesByAssistant,
    assistantMessageId,
  ]);

  const activeAssistantMessageId =
    findLatestAssistantMessageId(chatMessages) ?? assistantMessageId ?? null;
  const streamingAssistantMessageId = resolveConversationStreamingAssistantMessageId({
    assistantMessageId,
    assistantStatus,
    messages: chatMessages,
  });

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    messageCitationsRef.current = messageCitations;
  }, [messageCitations]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingQuoteSelection) {
      return;
    }

    function clearPendingQuoteSelection() {
      setPendingQuoteSelection(null);
    }

    window.addEventListener("resize", clearPendingQuoteSelection);
    window.addEventListener("scroll", clearPendingQuoteSelection, true);

    return () => {
      window.removeEventListener("resize", clearPendingQuoteSelection);
      window.removeEventListener("scroll", clearPendingQuoteSelection, true);
    };
  }, [pendingQuoteSelection]);

  useEffect(() => {
    if (!streamEnabled || !streamingAssistantMessageId) {
      return;
    }

    const source = new EventSource(
      `/api/conversations/${conversationId}/stream?assistantMessageId=${streamingAssistantMessageId}`,
    );

    const handleToolMessage = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.TOOL_MESSAGE) {
        return;
      }

      if (seenTimelineIdsRef.current.has(payload.message_id)) {
        return;
      }

      seenTimelineIdsRef.current.add(payload.message_id);
      const nextTimelineMessage = {
        id: payload.message_id,
        status: payload.status,
        contentMarkdown: payload.content_markdown,
        createdAt: payload.created_at,
        structuredJson: payload.structured ?? null,
      };
      const nextTimelineMessagesByAssistant = {
        ...timelineMessagesByAssistantRef.current,
        [streamingAssistantMessageId]: [
          ...(timelineMessagesByAssistantRef.current[streamingAssistantMessageId] ?? []),
          nextTimelineMessage,
        ],
      };
      timelineMessagesByAssistantRef.current = nextTimelineMessagesByAssistant;
      setTimelineMessagesByAssistant(nextTimelineMessagesByAssistant);
      setChatMessages((current) => {
        const nextMessages = applyAssistantToolMessageEvent({
          assistantMessageId: streamingAssistantMessageId,
          messages: current,
          timelineMessage: nextTimelineMessage,
        });
        chatMessagesRef.current = nextMessages;
        return nextMessages;
      });
    };

    const handleAssistantStatus = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS) {
        return;
      }

      setRuntimeStatus(payload.status_text ?? null);
      setChatMessages((current) => {
        const nextMessages = current.map((message) =>
          message.id === payload.message_id
            ? {
                ...message,
                structuredJson: {
                  ...(message.structuredJson ?? {}),
                  phase: payload.phase ?? null,
                  status_text: payload.status_text ?? null,
                  active_tool_name: payload.tool_name ?? null,
                  active_tool_use_id: payload.tool_use_id ?? null,
                  active_task_id: payload.task_id ?? null,
                },
              }
            : message,
        );
        chatMessagesRef.current = nextMessages;
        return nextMessages;
      });
    };

    const handleToolProgress = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.TOOL_PROGRESS) {
        return;
      }

      const nextTimelineMessagesByAssistant = applyToolProgressToTimeline(
        timelineMessagesByAssistantRef.current,
        streamingAssistantMessageId,
        {
          toolUseId: payload.tool_use_id,
          toolName: payload.tool_name,
          elapsedSeconds: payload.elapsed_seconds,
          statusText: payload.status_text ?? null,
          taskId: payload.task_id ?? null,
        },
      );

      if (nextTimelineMessagesByAssistant !== timelineMessagesByAssistantRef.current) {
        timelineMessagesByAssistantRef.current = nextTimelineMessagesByAssistant;
        setTimelineMessagesByAssistant(nextTimelineMessagesByAssistant);
      }

      if (payload.status_text) {
        setRuntimeStatus(payload.status_text);
      }
    };

    const handleAnswerDelta = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ANSWER_DELTA) {
        return;
      }

      setChatMessages((current) => {
        const nextMessages = applyAssistantDeltaEvent({
          messages: current,
          event: payload,
        });
        chatMessagesRef.current = nextMessages;
        setRuntimeStatus(
          readAssistantRuntimeStatus(nextMessages, payload.message_id) ??
            describeAssistantStreamingStatus(
              readAssistantMessageContent(nextMessages, payload.message_id),
            ),
        );
        return nextMessages;
      });
    };

    const handleAssistantThinkingDelta = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA) {
        return;
      }

      setChatMessages((current) => {
        const nextMessages = applyAssistantThinkingDeltaEvent({
          messages: current,
          event: payload,
        });
        chatMessagesRef.current = nextMessages;
        return nextMessages;
      });
    };

    const handleAnswerDone = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ANSWER_DONE) {
        return;
      }

      const nextState = applyAssistantTerminalEvent({
        messages: chatMessagesRef.current,
        citations: messageCitationsRef.current,
        event: payload,
        fallbackMessageId: streamingAssistantMessageId,
      });
      const nextSnapshot = applyAssistantTerminalEventToSessionSnapshot({
        messages: chatMessagesRef.current,
        citations: messageCitationsRef.current,
        timelineMessagesByAssistant: timelineMessagesByAssistantRef.current,
        event: payload,
        fallbackMessageId: streamingAssistantMessageId,
      });
      chatMessagesRef.current = nextState.messages;
      messageCitationsRef.current = nextState.citations;
      setChatMessages(nextState.messages);
      setMessageCitations(nextState.citations);
      onSessionStateSync?.(nextSnapshot);
      setRuntimeStatus("回答已生成");
      setRegeneratingMessageId(null);
      onAssistantTerminalEvent?.(conversationId);
      source.close();
    };

    const handleRunFailed = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.RUN_FAILED) {
        return;
      }

      const nextState = applyAssistantTerminalEvent({
        messages: chatMessagesRef.current,
        citations: messageCitationsRef.current,
        event: payload,
        fallbackMessageId: streamingAssistantMessageId,
      });
      const nextSnapshot = applyAssistantTerminalEventToSessionSnapshot({
        messages: chatMessagesRef.current,
        citations: messageCitationsRef.current,
        timelineMessagesByAssistant: timelineMessagesByAssistantRef.current,
        event: payload,
        fallbackMessageId: streamingAssistantMessageId,
      });
      chatMessagesRef.current = nextState.messages;
      messageCitationsRef.current = nextState.citations;
      setChatMessages(nextState.messages);
      setMessageCitations(nextState.citations);
      onSessionStateSync?.(nextSnapshot);
      setRuntimeStatus(`运行失败：${payload.error}`);
      setRegeneratingMessageId(null);
      onAssistantTerminalEvent?.(conversationId);
      source.close();
    };

    source.addEventListener(
      CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS,
      handleAssistantStatus as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
      handleToolMessage as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.TOOL_PROGRESS,
      handleToolProgress as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA,
      handleAssistantThinkingDelta as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
      handleAnswerDelta as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.ANSWER_DONE,
      handleAnswerDone as EventListener,
    );
    source.addEventListener(
      CONVERSATION_STREAM_EVENT.RUN_FAILED,
      handleRunFailed as EventListener,
    );
    source.onopen = () => {
      setRuntimeStatus(
        readAssistantRuntimeStatus(
          chatMessagesRef.current,
          streamingAssistantMessageId,
        ) ??
          describeAssistantStreamingStatus(
            readAssistantMessageContent(
              chatMessagesRef.current,
              streamingAssistantMessageId,
            ),
          ),
      );
    };
    source.onerror = () => {
      setRuntimeStatus("连接暂时中断，正在重连...");
    };

    return () => {
      source.close();
    };
  }, [conversationId, onAssistantTerminalEvent, streamEnabled, streamingAssistantMessageId]);

  const citationsByMessage = new Map<string, MessageCitation[]>();
  for (const citation of messageCitations) {
    const group = citationsByMessage.get(citation.messageId) ?? [];
    group.push(citation);
    citationsByMessage.set(citation.messageId, group);
  }

  const regeneratableTurn = readOnly
    ? null
    : findRegeneratableConversationTurn(
        chatMessages.map((message): RetryableConversationMessage => ({
          id: message.id,
          role: message.role,
          status: message.status,
          contentMarkdown: message.contentMarkdown,
          structuredJson: message.structuredJson ?? null,
        })),
      );

  function setMessageView(messageId: string, nextView: MessageViewMode) {
    if (nextView !== "answer") {
      setPendingQuoteSelection(null);
    }

    setMessageViewModes((current) => ({
      ...current,
      [messageId]: nextView,
    }));
  }

  function setActionStatus(messageId: string, nextStatus: string | null) {
    setActionStatusByMessage((current) => ({
      ...current,
      [messageId]: nextStatus,
    }));
  }

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setActionStatus(messageId, null);
      setCopiedMessageId(messageId);

      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1600);
    } catch {
      setCopiedMessageId((current) => (current === messageId ? null : current));
      setActionStatus(messageId, "复制失败");
    }
  }

  function handleExportMessage(messageId: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildConversationExportFilename({
      conversationId,
      messageId,
      messages: chatMessagesRef.current,
    });
    anchor.click();
    URL.revokeObjectURL(url);
    setActionStatus(messageId, null);
  }

  async function handleRegenerateMessage(messageId: string) {
    try {
      setActionStatus(messageId, null);
      setRegeneratingMessageId(messageId);

      const response = await fetch(`/api/conversations/${conversationId}/retry`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            assistantMessage?: ConversationChatMessage;
          }
        | null;

      if (!response.ok) {
        setRegeneratingMessageId(null);
        setActionStatus(messageId, body?.error ?? "重新生成失败");
        return;
      }

      const nextSnapshot = restartAssistantSessionSnapshotForRetry({
        assistantMessageId: messageId,
        nextAssistantMessage: body?.assistantMessage ?? null,
        citations: messageCitationsRef.current,
        messages: chatMessagesRef.current,
        timelineMessagesByAssistant: timelineMessagesByAssistantRef.current,
      });
      timelineMessagesByAssistantRef.current = nextSnapshot.timelineMessagesByAssistant;
      chatMessagesRef.current = nextSnapshot.messages;
      messageCitationsRef.current = nextSnapshot.citations;
      setChatMessages(nextSnapshot.messages);
      setMessageCitations(nextSnapshot.citations);
      setTimelineMessagesByAssistant(nextSnapshot.timelineMessagesByAssistant);
      seenTimelineIdsRef.current = flattenTimelineMessageIds(
        nextSnapshot.timelineMessagesByAssistant,
      );
      onSessionStateSync?.(nextSnapshot);
      setRuntimeStatus(
        describeAssistantStreamingStatus(
          readAssistantMessageContent(nextSnapshot.messages, messageId),
        ),
      );
    } catch {
      setRegeneratingMessageId(null);
      setActionStatus(messageId, "重新生成失败");
    }
  }

  function handleAnswerMouseUp(
    assistantMessageId: string,
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (!onQuoteRequest || readOnly) {
      return;
    }

    const container = event.currentTarget;
    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !container.contains(selection.anchorNode) ||
      !container.contains(selection.focusNode)
    ) {
      setPendingQuoteSelection(null);
      return;
    }

    const text = normalizeConversationMessageQuoteText(selection.toString());
    if (!text) {
      setPendingQuoteSelection(null);
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setPendingQuoteSelection(null);
      return;
    }

    setPendingQuoteSelection({
      assistantMessageId,
      left: rect.left + rect.width / 2,
      text,
      top: Math.max(12, rect.top - 10),
    });
  }

  function handleQuoteRequest() {
    if (!pendingQuoteSelection || !onQuoteRequest) {
      return;
    }

    onQuoteRequest({
      assistantMessageId: pendingQuoteSelection.assistantMessageId,
      text: pendingQuoteSelection.text,
    });
    window.getSelection()?.removeAllRanges();
    setPendingQuoteSelection(null);
  }

  return (
    <div className={conversationDensityClassNames.sessionStack}>
      {chatMessages.length > 0 ? (
        chatMessages.map((message) => {
          const isUser = message.role === MESSAGE_ROLE.USER;
          const isAssistant = message.role === MESSAGE_ROLE.ASSISTANT;
          const isCurrentAssistant = activeAssistantMessageId === message.id;
          const isStreamingAssistant = isAssistant && message.status === MESSAGE_STATUS.STREAMING;
          const citations = citationsByMessage.get(message.id) ?? [];
          const citationSourceBadges = buildCitationSourceBadges(citations);
          const hasSources = citations.length > 0;
          const processMessages = timelineMessagesByAssistant[message.id] ?? [];
          const showResultPanel =
            isAssistant &&
            canShowAssistantResultPanel({
              status: message.status,
              contentMarkdown: message.contentMarkdown,
            });
          const selectedView =
            hasSources && showResultPanel
              ? (messageViewModes[message.id] ?? "answer")
              : "answer";
          const answerText =
            message.contentMarkdown ||
            (isStreamingAssistant && showResultPanel ? "助手正在生成回答..." : "");
          const canRegenerate =
            regeneratableTurn?.assistantMessageId === message.id &&
            !isStreamingAssistant;
          const canExportOrCopy =
            isAssistant &&
            message.status !== MESSAGE_STATUS.FAILED &&
            Boolean(answerText.trim());

          if (isUser) {
            const attachments = readConversationMessageAttachments(message.structuredJson);
            const quotedMessage = readConversationMessageQuote(message.structuredJson);
            const canCopyUserMessage = Boolean(message.contentMarkdown.trim());
            const userMessageCopied = copiedMessageId === message.id;

            return (
              <article key={message.id} className={conversationDensityClassNames.userWrap}>
                <div className={conversationDensityClassNames.userStack}>
                  {quotedMessage ? (
                    <div className="max-w-[min(100%,42rem)] rounded-[18px] border border-app-border bg-app-surface-soft/88 px-3 py-2.5 text-[13px] text-app-muted-strong shadow-soft">
                      <div className="flex items-start gap-2">
                        <span className="inline-flex shrink-0 rounded-full border border-app-border bg-white/90 px-2 py-0.5 text-[11px] font-medium text-app-muted-strong">
                          引用
                        </span>
                        <p className="min-w-0 flex-1 line-clamp-3 leading-6">
                          {quotedMessage.text}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className={conversationDensityClassNames.userBubbleRow}>
                    <div className={conversationDensityClassNames.userActionRail}>
                      {canCopyUserMessage ? (
                        <button
                          type="button"
                          data-user-message-copy-button={message.id}
                          aria-label={userMessageCopied ? "已复制用户消息" : "复制用户消息"}
                          title={userMessageCopied ? "已复制" : "复制"}
                          className={cn(
                            buttonStyles({ variant: "ghost", size: "xs", shape: "icon" }),
                            conversationDensityClassNames.userActionButton,
                            userMessageCopied &&
                              "bg-emerald-50 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-800",
                          )}
                          onClick={() => handleCopyMessage(message.id, message.contentMarkdown)}
                        >
                          {userMessageCopied ? (
                            <CheckIcon className="size-4" strokeWidth={1.8} />
                          ) : (
                            <CopyIcon className="size-4" />
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div className={conversationDensityClassNames.userBubble}>
                      <LinkifiedText
                        text={message.contentMarkdown}
                        className={conversationDensityClassNames.userText}
                      />
                    </div>
                  </div>
                  {attachments.length > 0 ? (
                    <div className={conversationDensityClassNames.userAttachmentList}>
                      {attachments.map((attachment) => (
                        <UserAttachmentChip
                          key={attachment.attachmentId}
                          attachment={attachment}
                          workspaceId={workspaceId}
                        />
                      ))}
                    </div>
                  ) : null}
                  {actionStatusByMessage[message.id] ? (
                    <p
                      className={cn(
                        conversationDensityClassNames.actionStatus,
                        "max-w-[min(100%,42rem)] justify-self-end",
                      )}
                    >
                      {actionStatusByMessage[message.id]}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          }

          return (
            <article key={message.id} className={conversationDensityClassNames.assistantSection}>
              <ConversationTimeline
                assistantContentMarkdown={message.contentMarkdown}
                assistantStatus={message.status}
                assistantStructuredJson={message.structuredJson ?? null}
                timelineMessages={processMessages}
                runtimeStatus={isCurrentAssistant ? runtimeStatus : null}
                defaultOpen={isStreamingAssistant}
              />

              {showResultPanel ? (
                <div className={conversationDensityClassNames.resultPanel}>
                  <div className={conversationDensityClassNames.resultHeader}>
                    <div className="flex flex-wrap items-center gap-3">
                      <TabButton
                        active={selectedView === "answer"}
                        onClick={() => setMessageView(message.id, "answer")}
                      >
                        <AnswerIcon />
                        结果
                      </TabButton>
                      <TabButton
                        active={selectedView === "sources"}
                        disabled={!hasSources}
                        onClick={() => setMessageView(message.id, "sources")}
                      >
                        <SourceIcon />
                        参考资料
                        {hasSources ? (
                          <span className="rounded-full bg-app-surface-strong/72 px-1.5 py-0.5 text-[10px] text-app-muted-strong">
                            {citations.length}
                          </span>
                        ) : null}
                      </TabButton>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {canExportOrCopy ? (
                        <>
                          <ActionButton onClick={() => handleExportMessage(message.id, answerText)}>
                            <ExportIcon />
                            导出
                          </ActionButton>
                          <ActionButton onClick={() => handleCopyMessage(message.id, answerText)}>
                            <CopyIcon />
                            {copiedMessageId === message.id ? "已复制" : "复制"}
                          </ActionButton>
                        </>
                      ) : null}

                      {canRegenerate ? (
                        <ActionButton
                          disabled={regeneratingMessageId === message.id}
                          onClick={() => handleRegenerateMessage(message.id)}
                        >
                          <RegenerateIcon />
                          {regeneratingMessageId === message.id ? "重新生成中" : "重新生成"}
                        </ActionButton>
                      ) : null}
                    </div>
                  </div>

                  {selectedView === "sources" ? (
                    <div className={conversationDensityClassNames.sourcesList}>
                      {citations.map((citation, index) => {
                        const target = buildCitationLinkTarget({
                          citation,
                          documentLinksEnabled,
                          workspaceId,
                        });

                        if (target) {
                          return (
                            <a
                              key={citation.id}
                              href={target.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={conversationDensityClassNames.sourceCard}
                            >
                              <CitationCardContent citation={citation} index={index} />
                            </a>
                          );
                        }

                        return (
                          <div
                            key={citation.id}
                            aria-disabled="true"
                            title={documentLinksEnabled ? undefined : "公开页不提供本地资料跳转"}
                            className={cn(
                              conversationDensityClassNames.sourceCard,
                              "cursor-default hover:border-app-border/55 hover:bg-white/72",
                            )}
                          >
                            <CitationCardContent citation={citation} index={index} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      data-follow-up-anchor={message.id}
                      className="grid gap-3"
                      onMouseUp={(event) => handleAnswerMouseUp(message.id, event)}
                    >
                      <MarkdownContent
                        content={answerText}
                        className={conversationDensityClassNames.answerText}
                        streaming={isStreamingAssistant}
                        citations={citations}
                        workspaceId={workspaceId}
                        documentLinksEnabled={documentLinksEnabled}
                      />
                    </div>
                  )}

                  {actionStatusByMessage[message.id] ? (
                    <p className={conversationDensityClassNames.actionStatus}>
                      {actionStatusByMessage[message.id]}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      ) : (
        <div className={ui.muted}>{emptyStateMessage}</div>
      )}
      {pendingQuoteSelection ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            className="pointer-events-auto fixed"
            style={{
              left: pendingQuoteSelection.left,
              top: pendingQuoteSelection.top,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="rounded-2xl border border-app-border bg-white/98 p-1 shadow-card backdrop-blur-md">
              <button
                type="button"
                className="inline-flex min-h-8 items-center justify-center rounded-xl border border-app-border/90 bg-app-surface-soft px-3 text-[13px] font-medium text-app-text transition hover:border-app-border-strong hover:bg-white focus:outline-none focus:ring-4 focus:ring-app-accent/10"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={handleQuoteRequest}
              >
                追问这段
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
