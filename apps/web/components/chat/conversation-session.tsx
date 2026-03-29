"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CONVERSATION_STREAM_EVENT,
  GROUNDED_ANSWER_CONFIDENCE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  type ConversationStreamEvent,
  type MessageStatus,
} from "@knowledge-assistant/contracts";

import { ConversationRetryButton } from "@/components/chat/conversation-retry-button";
import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import { findRetryableConversationTurn } from "@/lib/api/conversation-retry";
import {
  describeGroundedAnswerConfidence,
  readGroundedAnswerStatus,
} from "@/lib/api/grounded-answer-status";
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

type MessageCitation = ConversationMessageCitation;

export function ConversationSession({
  conversationId,
  workspaceId,
  assistantMessageId,
  assistantStatus,
  initialMessages,
  initialTimelineMessages,
  initialCitations,
}: {
  conversationId: string;
  workspaceId: string;
  assistantMessageId: string | null;
  assistantStatus: MessageStatus | null;
  initialMessages: ChatMessage[];
  initialTimelineMessages: TimelineMessage[];
  initialCitations: MessageCitation[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [timelineMessages, setTimelineMessages] = useState(initialTimelineMessages);
  const [messageCitations, setMessageCitations] = useState(initialCitations);
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(
    assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
  );
  const chatMessagesRef = useRef(initialMessages);
  const messageCitationsRef = useRef(initialCitations);
  const seenTimelineIdsRef = useRef(
    new Set(initialTimelineMessages.map((message) => message.id)),
  );

  useEffect(() => {
    setChatMessages(initialMessages);
    setTimelineMessages(initialTimelineMessages);
    setMessageCitations(initialCitations);
    chatMessagesRef.current = initialMessages;
    messageCitationsRef.current = initialCitations;
    setRuntimeStatus(
      assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
    );
    seenTimelineIdsRef.current = new Set(initialTimelineMessages.map((message) => message.id));
  }, [assistantStatus, initialCitations, initialMessages, initialTimelineMessages]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    messageCitationsRef.current = messageCitations;
  }, [messageCitations]);

  useEffect(() => {
    if (!assistantMessageId || assistantStatus !== MESSAGE_STATUS.STREAMING) {
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
      setTimelineMessages((current) => [
        ...current,
        {
          id: payload.message_id,
          status: payload.status,
          contentMarkdown: payload.content_markdown,
          createdAt: payload.created_at,
          structuredJson: payload.structured ?? null,
        },
      ]);
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
      setRuntimeStatus("回答已生成。");
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
      setRuntimeStatus(
        `运行失败：${payload.error}`,
      );
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
  }, [assistantMessageId, assistantStatus, conversationId, router]);

  const citationsByMessage = new Map<string, MessageCitation[]>();
  for (const citation of messageCitations) {
    const group = citationsByMessage.get(citation.messageId) ?? [];
    group.push(citation);
    citationsByMessage.set(citation.messageId, group);
  }
  const retryableTurn = findRetryableConversationTurn(
    chatMessages.map((message) => ({
      id: message.id,
      role: message.role,
      status: message.status,
      contentMarkdown: message.contentMarkdown,
    })),
  );

  return (
    <div className="grid gap-6">
      <ConversationTimeline
        timelineMessages={timelineMessages}
        runtimeStatus={runtimeStatus}
      />

      <div className="grid gap-8 pb-6 md:gap-10 md:pb-8">
        {chatMessages.length > 0 ? (
          chatMessages.map((message) => {
            const groundedStatus =
              message.role === MESSAGE_ROLE.ASSISTANT
                ? readGroundedAnswerStatus(
                    (message.structuredJson ?? null) as Record<string, unknown> | null,
                  )
                : null;
            const groundedStatusLabel = groundedStatus
              ? describeGroundedAnswerConfidence(groundedStatus)
              : null;
            const isStreamingAssistant =
              message.role === MESSAGE_ROLE.ASSISTANT &&
              message.status === MESSAGE_STATUS.STREAMING;
            const isUser = message.role === MESSAGE_ROLE.USER;
            const showRetryButton =
              retryableTurn?.assistantMessageId === message.id &&
              message.role === MESSAGE_ROLE.ASSISTANT &&
              message.status === MESSAGE_STATUS.FAILED;

            return (
              <article
                key={message.id}
                className={cn(
                  "grid gap-3",
                  isUser ? "ml-auto w-full max-w-[560px]" : "w-full max-w-[760px]",
                )}
              >
                <div className="flex items-center justify-between gap-3 text-[13px] text-app-muted">
                  <strong className="font-medium text-app-muted-strong">
                    {message.role === MESSAGE_ROLE.ASSISTANT
                      ? "AI 助手"
                      : message.role === MESSAGE_ROLE.USER
                        ? "你"
                        : message.role}
                  </strong>
                  <span>{message.status}</span>
                </div>

                <div
                  className={cn(
                    "grid gap-4",
                    isUser
                      ? "rounded-[24px] border border-app-border/75 bg-app-surface-strong/65 px-5 py-4 shadow-soft"
                      : "gap-5 px-1 py-1",
                  )}
                >
                  {groundedStatusLabel ? (
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[12px]",
                          groundedStatus?.unsupportedReason
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : groundedStatus?.confidence === GROUNDED_ANSWER_CONFIDENCE.HIGH
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : groundedStatus?.confidence === GROUNDED_ANSWER_CONFIDENCE.MEDIUM
                                ? "border-sky-300 bg-sky-50 text-sky-800"
                                : "border-stone-300 bg-stone-50 text-stone-700",
                        )}
                      >
                        {groundedStatusLabel}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "whitespace-pre-wrap text-[15px] leading-8 text-app-text md:text-[16px]",
                      !isUser && "max-w-none",
                    )}
                  >
                    {message.contentMarkdown ||
                      (isStreamingAssistant ? "助手正在生成回答..." : "")}
                  </div>

                  {groundedStatus?.unsupportedReason ? (
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
                      {groundedStatus.unsupportedReason}
                    </div>
                  ) : null}

                  {groundedStatus && groundedStatus.missingInformation.length > 0 ? (
                    <div className="grid gap-2 rounded-[20px] border border-app-border/70 bg-app-surface-soft/55 px-4 py-3">
                      <strong className="text-sm font-medium text-app-muted-strong">待补充信息</strong>
                      <div className="flex flex-wrap gap-2">
                        {groundedStatus.missingInformation.map((item) => (
                          <span
                            key={item}
                            className="inline-flex items-center rounded-full border border-app-border/70 bg-white/85 px-3 py-1 text-[12px] text-app-muted-strong"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(citationsByMessage.get(message.id) ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(citationsByMessage.get(message.id) ?? []).map((citation) => (
                        <Link
                          key={citation.id}
                          href={`/workspaces/${workspaceId}/documents/${citation.documentId}?anchorId=${citation.anchorId}`}
                          className="inline-flex items-center rounded-full border border-app-border/75 bg-white/82 px-3 py-1 text-[13px] text-app-muted-strong transition hover:border-app-border-strong hover:text-app-text"
                        >
                          {citation.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {showRetryButton ? (
                    <ConversationRetryButton conversationId={conversationId} />
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <div className={ui.muted}>这一轮还没有消息，从底部输入框继续提问</div>
        )}
      </div>
    </div>
  );
}
