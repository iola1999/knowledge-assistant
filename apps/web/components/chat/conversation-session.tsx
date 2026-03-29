"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CONVERSATION_STREAM_EVENT,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type MessageStatus,
} from "@knowledge-assistant/contracts";

import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import { LinkifiedText } from "@/components/shared/linkified-text";
import {
  findRegeneratableConversationTurn,
  type RetryableConversationMessage,
} from "@/lib/api/conversation-retry";
import { readGroundedAnswerStatus } from "@/lib/api/grounded-answer-status";
import {
  applyAssistantTerminalEvent,
  type ConversationChatMessage,
  type ConversationMessageCitation,
} from "@/lib/api/conversation-session";
import { cn, ui } from "@/lib/ui";

type ChatMessage = ConversationChatMessage;

type TimelineMessage = {
  id: string;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: string;
  structuredJson?: Record<string, unknown> | null;
};

type TimelineMessagesByAssistant = Record<string, TimelineMessage[]>;

type MessageCitation = ConversationMessageCitation;
type MessageViewMode = "answer" | "sources";

function flattenTimelineMessageIds(timelineByAssistant: TimelineMessagesByAssistant) {
  return new Set(
    Object.values(timelineByAssistant)
      .flat()
      .map((message) => message.id),
  );
}

function AnswerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M4.167 5.833h11.666M4.167 10h8.333M4.167 14.167H10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M8.125 6.667 5.833 8.96a2.357 2.357 0 0 0 3.334 3.334l2.083-2.084M11.875 13.333l2.292-2.293a2.357 2.357 0 1 0-3.334-3.334L8.75 9.79"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M10 3.75v8.333m0 0 3.125-3.125M10 12.083 6.875 8.958M4.583 15.417h10.834"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <rect x="7.083" y="5.417" width="8.333" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.833 12.5h-.625A1.875 1.875 0 0 1 3.333 10.625V5.208c0-1.035.84-1.875 1.875-1.875h5.417c1.035 0 1.875.84 1.875 1.875v.625"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RegenerateIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M15.208 8.333a5.417 5.417 0 1 0 1.042 3.125m0-3.125V4.583m0 3.75h-3.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActionButton({
  active = false,
  children,
  disabled = false,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-app-border-strong bg-app-surface-strong/65 text-app-text"
          : "border-transparent bg-transparent text-app-muted-strong hover:border-app-border/80 hover:bg-white/70 hover:text-app-text",
      )}
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
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 border-b px-1 pb-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-app-text text-app-text"
          : "border-transparent text-app-muted-strong hover:text-app-text",
      )}
    >
      {children}
    </button>
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
}: {
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
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [timelineMessagesByAssistant, setTimelineMessagesByAssistant] = useState(
    initialTimelineMessagesByAssistant ?? {},
  );
  const [messageCitations, setMessageCitations] = useState(initialCitations ?? []);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(
    assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
  );
  const [messageViewModes, setMessageViewModes] = useState<Record<string, MessageViewMode>>({});
  const [actionStatusByMessage, setActionStatusByMessage] = useState<
    Record<string, string | null>
  >({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const chatMessagesRef = useRef(initialMessages);
  const messageCitationsRef = useRef(initialCitations ?? []);
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
    setRuntimeStatus(
      assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
    );
    seenTimelineIdsRef.current = flattenTimelineMessageIds(
      initialTimelineMessagesByAssistant ?? {},
    );
  }, [
    assistantStatus,
    initialCitations,
    initialMessages,
    initialTimelineMessagesByAssistant,
  ]);

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
    if (
      !streamEnabled ||
      !assistantMessageId ||
      assistantStatus !== MESSAGE_STATUS.STREAMING
    ) {
      return;
    }

    const source = new EventSource(
      `/api/conversations/${conversationId}/stream?assistantMessageId=${assistantMessageId}`,
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
      setTimelineMessagesByAssistant((current) => ({
        ...current,
        [assistantMessageId]: [
          ...(current[assistantMessageId] ?? []),
          {
            id: payload.message_id,
            status: payload.status,
            contentMarkdown: payload.content_markdown,
            createdAt: payload.created_at,
            structuredJson: payload.structured ?? null,
          },
        ],
      }));
    };

    const handleAnswerDelta = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      if (payload.type !== CONVERSATION_STREAM_EVENT.ANSWER_DELTA) {
        return;
      }

      setRuntimeStatus("助手正在生成回答...");
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
      });
      setChatMessages(nextState.messages);
      setMessageCitations(nextState.citations);
      setRuntimeStatus("回答已生成");
      setRegeneratingMessageId(null);
      source.close();
      startTransition(() => {
        router.refresh();
      });
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
      });
      setChatMessages(nextState.messages);
      setMessageCitations(nextState.citations);
      setRuntimeStatus(`运行失败：${payload.error}`);
      setRegeneratingMessageId(null);
      source.close();
      startTransition(() => {
        router.refresh();
      });
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
    source.onerror = () => {
      source.close();
      setRuntimeStatus("连接已断开，正在刷新对话...");
      startTransition(() => {
        router.refresh();
      });
    };

    return () => {
      source.close();
    };
  }, [assistantMessageId, assistantStatus, conversationId, router, streamEnabled]);

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
    anchor.download = `conversation-${conversationId}-${messageId}.md`;
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

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setRegeneratingMessageId(null);
      setActionStatus(messageId, "重新生成失败");
    }
  }

  return (
    <div className="grid gap-10 pb-6 md:gap-12 md:pb-8">
      {chatMessages.length > 0 ? (
        chatMessages.map((message) => {
          const isUser = message.role === MESSAGE_ROLE.USER;
          const isAssistant = message.role === MESSAGE_ROLE.ASSISTANT;
          const isCurrentAssistant = assistantMessageId === message.id;
          const isStreamingAssistant = isAssistant && message.status === MESSAGE_STATUS.STREAMING;
          const groundedStatus = isAssistant
            ? readGroundedAnswerStatus(
                (message.structuredJson ?? null) as Record<string, unknown> | null,
              )
            : null;
          const citations = citationsByMessage.get(message.id) ?? [];
          const hasSources = citations.length > 0;
          const processMessages = timelineMessagesByAssistant[message.id] ?? [];
          const selectedView =
            hasSources && isAssistant
              ? (messageViewModes[message.id] ?? "answer")
              : "answer";
          const answerText =
            message.contentMarkdown ||
            (isStreamingAssistant ? "助手正在生成回答..." : "");
          const canRegenerate =
            regeneratableTurn?.assistantMessageId === message.id &&
            !isStreamingAssistant;
          const canExportOrCopy =
            isAssistant &&
            message.status !== MESSAGE_STATUS.FAILED &&
            Boolean(answerText.trim());

          if (isUser) {
            return (
              <article key={message.id} className="ml-auto w-full max-w-[720px]">
                <div className="rounded-[28px] border border-app-border/60 bg-app-surface-strong/58 px-5 py-4 shadow-[0_14px_36px_rgba(23,22,18,0.035)]">
                  <LinkifiedText
                    text={message.contentMarkdown}
                    className="text-[15px] leading-8 text-app-text md:text-[16px]"
                  />
                </div>
              </article>
            );
          }

          return (
            <article key={message.id} className="grid gap-4">
              <ConversationTimeline
                timelineMessages={processMessages}
                runtimeStatus={isCurrentAssistant ? runtimeStatus : null}
                defaultOpen={isStreamingAssistant}
              />

              <div className="grid gap-5">
                <div className="flex flex-wrap items-center gap-5 border-b border-app-border/60 pb-2">
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
                      <span className="rounded-full bg-app-surface-strong/72 px-2 py-0.5 text-[11px] text-app-muted-strong">
                        {citations.length}
                      </span>
                    ) : null}
                  </TabButton>
                </div>

                {selectedView === "sources" ? (
                  <div className="grid gap-2.5">
                    {citations.map((citation, index) => (
                      sourceLinksEnabled &&
                      workspaceId &&
                      citation.documentId &&
                      citation.anchorId ? (
                        <Link
                          key={citation.id}
                          href={`/workspaces/${workspaceId}/documents/${citation.documentId}?anchorId=${citation.anchorId}`}
                          className="grid gap-1 rounded-[20px] border border-app-border/55 bg-white/70 px-4 py-3 transition hover:border-app-border-strong hover:bg-white"
                        >
                          <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                            资料 {index + 1}
                          </span>
                          <span className="text-[14px] leading-6 text-app-text">{citation.label}</span>
                        </Link>
                      ) : (
                        <div
                          key={citation.id}
                          aria-disabled="true"
                          title={sourceLinksEnabled ? undefined : "公开页不提供资料跳转"}
                          className="grid gap-1 rounded-[20px] border border-app-border/55 bg-white/70 px-4 py-3 text-left"
                        >
                          <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                            资料 {index + 1}
                          </span>
                          <span className="text-[14px] leading-6 text-app-text">{citation.label}</span>
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <LinkifiedText
                      text={answerText}
                      className="max-w-none text-[15px] leading-[2] text-app-text md:text-[16px]"
                    />

                    {groundedStatus?.unsupportedReason ? (
                      <p className="text-[13px] leading-6 text-app-muted-strong">
                        {groundedStatus.unsupportedReason}
                      </p>
                    ) : null}

                    {groundedStatus && groundedStatus.missingInformation.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {groundedStatus.missingInformation.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center rounded-full border border-app-border/60 bg-app-surface-soft/72 px-3 py-1 text-[12px] text-app-muted-strong"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-app-border/55 pt-3">
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

                  {hasSources ? (
                    <ActionButton
                      active={selectedView === "sources"}
                      onClick={() =>
                        setMessageView(
                          message.id,
                          selectedView === "sources" ? "answer" : "sources",
                        )
                      }
                    >
                      <SourceIcon />
                      {citations.length} 条资料
                    </ActionButton>
                  ) : null}
                </div>

                {actionStatusByMessage[message.id] ? (
                  <p className="text-[13px] leading-6 text-app-muted">
                    {actionStatusByMessage[message.id]}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })
      ) : (
        <div className={ui.muted}>{emptyStateMessage}</div>
      )}
    </div>
  );
}
