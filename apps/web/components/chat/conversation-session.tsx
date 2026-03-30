"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type MessageStatus,
} from "@anchordesk/contracts";

import {
  AnswerIcon,
  CopyIcon,
  ExportIcon,
  RegenerateIcon,
  SourceIcon,
} from "@/components/icons";
import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import { KnowledgeSourceBadge } from "@/components/shared/knowledge-source-badge";
import { LinkifiedText } from "@/components/shared/linkified-text";
import { MarkdownContent } from "@/components/shared/markdown-content";
import {
  canShowAssistantResultPanel,
  describeAssistantStreamingStatus,
} from "@/lib/api/conversation-process";
import { buildCitationSourceBadges } from "@/lib/api/knowledge-libraries";
import {
  findRegeneratableConversationTurn,
  type RetryableConversationMessage,
} from "@/lib/api/conversation-retry";
import {
  applyAssistantTerminalEvent,
  applyAssistantTerminalEventToSessionSnapshot,
  buildConversationExportFilename,
  type ConversationChatMessage,
  type ConversationMessageCitation,
  type ConversationSessionSnapshot,
  type ConversationTimelineMessagesByAssistant,
  findLatestAssistantMessageId,
  resolveConversationStreamingAssistantMessageId,
  restartAssistantSessionSnapshotForRetry,
} from "@/lib/api/conversation-session";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import { chipButtonStyles, cn, tabButtonStyles, ui } from "@/lib/ui";

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
type ConversationSessionProps = {
  conversationId: string;
  workspaceId?: string | null;
  assistantMessageId?: string | null;
  assistantStatus?: MessageStatus | null;
  initialMessages: ChatMessage[];
  initialTimelineMessagesByAssistant?: TimelineMessagesByAssistant;
  initialCitations?: MessageCitation[];
  streamEnabled?: boolean;
  sourceLinksEnabled?: boolean;
  readOnly?: boolean;
  emptyStateMessage?: string;
  onAssistantTerminalEvent?: (conversationId: string) => void;
  onSessionStateSync?: (snapshot: ConversationSessionSnapshot) => void;
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

export function ConversationSession({
  conversationId,
  workspaceId,
  assistantMessageId,
  assistantStatus,
  initialMessages,
  initialTimelineMessagesByAssistant,
  initialCitations,
  streamEnabled = true,
  sourceLinksEnabled = true,
  readOnly = false,
  emptyStateMessage = "这一轮还没有消息",
  onAssistantTerminalEvent,
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
      ? describeAssistantStreamingStatus(
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
        ? describeAssistantStreamingStatus(
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
      const nextTimelineMessagesByAssistant = {
        ...timelineMessagesByAssistantRef.current,
        [streamingAssistantMessageId]: [
          ...(timelineMessagesByAssistantRef.current[streamingAssistantMessageId] ?? []),
          {
            id: payload.message_id,
            status: payload.status,
            contentMarkdown: payload.content_markdown,
            createdAt: payload.created_at,
            structuredJson: payload.structured ?? null,
          },
        ],
      };
      timelineMessagesByAssistantRef.current = nextTimelineMessagesByAssistant;
      setTimelineMessagesByAssistant(nextTimelineMessagesByAssistant);
    };

    const handleAnswerDelta = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ANSWER_DELTA) {
        return;
      }

      setRuntimeStatus(describeAssistantStreamingStatus(payload.content_markdown));
      setChatMessages((current) =>
        current.map((message) =>
          message.id === payload.message_id
            ? {
                ...message,
                status: payload.status,
                contentMarkdown: payload.content_markdown,
              }
            : message,
        ),
      );
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
      CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
      handleToolMessage as EventListener,
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
      const currentContent = readAssistantMessageContent(
        chatMessagesRef.current,
        streamingAssistantMessageId,
      );
      setRuntimeStatus(describeAssistantStreamingStatus(currentContent));
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
        })),
      );

  function setMessageView(messageId: string, nextView: MessageViewMode) {
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
        | { error?: string }
        | null;

      if (!response.ok) {
        setRegeneratingMessageId(null);
        setActionStatus(messageId, body?.error ?? "重新生成失败");
        return;
      }

      const nextSnapshot = restartAssistantSessionSnapshotForRetry({
        assistantMessageId: messageId,
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
            return (
              <article key={message.id} className={conversationDensityClassNames.userWrap}>
                <div className={conversationDensityClassNames.userBubble}>
                  <LinkifiedText
                    text={message.contentMarkdown}
                    className={conversationDensityClassNames.userText}
                  />
                </div>
              </article>
            );
          }

          return (
            <article key={message.id} className={conversationDensityClassNames.assistantSection}>
              <ConversationTimeline
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

                  {citationSourceBadges.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-app-border/70 pt-3">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                        命中来源
                      </span>
                      {citationSourceBadges.map((badge) => (
                        <KnowledgeSourceBadge
                          key={`${badge.tone}:${badge.label}`}
                          sourceScope={badge.sourceScope}
                          libraryTitle={badge.libraryTitle}
                        />
                      ))}
                    </div>
                  ) : null}

                  {selectedView === "sources" ? (
                    <div className={conversationDensityClassNames.sourcesList}>
                      {citations.map((citation, index) => (
                        sourceLinksEnabled &&
                        workspaceId &&
                        citation.documentId &&
                        citation.anchorId ? (
                          <Link
                            key={citation.id}
                            href={`/workspaces/${workspaceId}/documents/${citation.documentId}?anchorId=${citation.anchorId}`}
                            className={conversationDensityClassNames.sourceCard}
                          >
                            <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                              资料 {index + 1}
                            </span>
                            <CitationSourceBadge citation={citation} />
                            <span className="text-[13px] leading-5 text-app-text">
                              {citation.label}
                            </span>
                            {citation.quoteText.trim() ? (
                              <span className="line-clamp-4 text-[12px] leading-5 text-app-muted-strong">
                                {citation.quoteText}
                              </span>
                            ) : null}
                          </Link>
                        ) : (
                          <div
                            key={citation.id}
                            aria-disabled="true"
                            title={sourceLinksEnabled ? undefined : "公开页不提供资料跳转"}
                            className={cn(
                              conversationDensityClassNames.sourceCard,
                              "cursor-default hover:border-app-border/55 hover:bg-white/72",
                            )}
                          >
                            <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                              资料 {index + 1}
                            </span>
                            <CitationSourceBadge citation={citation} />
                            <span className="text-[13px] leading-5 text-app-text">
                              {citation.label}
                            </span>
                            {citation.quoteText.trim() ? (
                              <span className="line-clamp-4 text-[12px] leading-5 text-app-muted-strong">
                                {citation.quoteText}
                              </span>
                            ) : null}
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <MarkdownContent
                        content={answerText}
                        className={conversationDensityClassNames.answerText}
                        streaming={isStreamingAssistant}
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
    </div>
  );
}
