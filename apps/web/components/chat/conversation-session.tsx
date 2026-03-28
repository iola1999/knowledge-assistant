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
  type MessageRole,
  type MessageStatus,
} from "@knowledge-assistant/contracts";

import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import {
  describeGroundedAnswerConfidence,
  readGroundedAnswerStatus,
} from "@/lib/api/grounded-answer-status";
import { cn, ui } from "@/lib/ui";

type ChatMessage = {
  id: string;
  role: MessageRole;
  status: MessageStatus;
  contentMarkdown: string;
  structuredJson?: Record<string, unknown> | null;
};

type TimelineMessage = {
  id: string;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: string;
  structuredJson?: Record<string, unknown> | null;
};

type MessageCitation = {
  id: string;
  messageId: string;
  anchorId: string;
  documentId: string;
  label: string;
};

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
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(
    assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
  );
  const seenTimelineIdsRef = useRef(
    new Set(initialTimelineMessages.map((message) => message.id)),
  );

  useEffect(() => {
    setChatMessages(initialMessages);
    setTimelineMessages(initialTimelineMessages);
    setRuntimeStatus(
      assistantStatus === MESSAGE_STATUS.STREAMING ? "助手正在分析问题并生成回答..." : null,
    );
    seenTimelineIdsRef.current = new Set(initialTimelineMessages.map((message) => message.id));
  }, [assistantStatus, initialCitations, initialMessages, initialTimelineMessages]);

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

    const handleAnswerDone = () => {
      setRuntimeStatus("回答已生成，正在刷新对话...");
      source.close();
      startTransition(() => {
        router.refresh();
      });
    };

    const handleRunFailed = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as ConversationStreamEvent;
      setRuntimeStatus(
        payload.type === CONVERSATION_STREAM_EVENT.RUN_FAILED
          ? `运行失败：${payload.error}`
          : "运行失败。",
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
  for (const citation of initialCitations) {
    const group = citationsByMessage.get(citation.messageId) ?? [];
    group.push(citation);
    citationsByMessage.set(citation.messageId, group);
  }

  return (
    <>
      <ConversationTimeline
        timelineMessages={timelineMessages}
        runtimeStatus={runtimeStatus}
      />

      <div className="grid gap-4">
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

            return (
              <article
                key={message.id}
                className={cn(
                  "grid max-w-[720px] gap-2 rounded-[20px] border border-app-border px-4 py-4",
                  message.role === MESSAGE_ROLE.USER
                    ? "ml-auto bg-app-surface-strong/80"
                    : "bg-white/92",
                )}
              >
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <strong>
                    {message.role === MESSAGE_ROLE.ASSISTANT
                      ? "AI 助手"
                      : message.role === MESSAGE_ROLE.USER
                        ? "你"
                        : message.role}
                  </strong>
                  <span className="text-app-muted">{message.status}</span>
                </div>
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
                <div className="whitespace-pre-wrap leading-7">
                  {message.contentMarkdown ||
                    (isStreamingAssistant ? "助手正在生成回答..." : "")}
                </div>
                {groundedStatus?.unsupportedReason ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {groundedStatus.unsupportedReason}
                  </div>
                ) : null}
                {groundedStatus && groundedStatus.missingInformation.length > 0 ? (
                  <div className="grid gap-2 rounded-2xl border border-app-border bg-app-surface-soft/70 px-4 py-3">
                    <strong className="text-sm">待补充信息</strong>
                    <div className="flex flex-wrap gap-2">
                      {groundedStatus.missingInformation.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-full border border-app-border bg-white px-3 py-1 text-[12px] text-app-muted-strong"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(citationsByMessage.get(message.id) ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(citationsByMessage.get(message.id) ?? []).map((citation) => (
                      <Link
                        key={citation.id}
                        href={`/workspaces/${workspaceId}/documents/${citation.documentId}?anchorId=${citation.anchorId}`}
                        className="inline-flex items-center rounded-full border border-app-border bg-app-surface-soft px-3 py-1 text-[13px] hover:border-app-border-strong"
                      >
                        {citation.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className={ui.muted}>这一轮还没有消息，从底部输入框继续提问</div>
        )}
      </div>
    </>
  );
}
