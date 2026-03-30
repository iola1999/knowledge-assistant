"use client";

import { useEffect, useState } from "react";

import {
  Composer,
  type ComposerAttachment,
  type ComposerSubmittedTurn,
} from "@/components/chat/composer";
import { ConversationSession } from "@/components/chat/conversation-session";
import { type AssistantProcessMessage } from "@/lib/api/conversation-process";
import {
  appendSubmittedConversationTurn,
  findLatestAssistantMessageId,
  type ConversationChatMessage,
  type ConversationMessageCitation,
} from "@/lib/api/conversation-session";

type TimelineMessagesByAssistant = Record<string, AssistantProcessMessage[]>;

export function WorkspaceConversationPanel({
  conversationId,
  workspaceId,
  initialMessages,
  initialTimelineMessagesByAssistant,
  initialCitations,
  initialAttachments,
}: {
  conversationId: string;
  workspaceId: string;
  initialMessages: ConversationChatMessage[];
  initialTimelineMessagesByAssistant?: TimelineMessagesByAssistant;
  initialCitations?: ConversationMessageCitation[];
  initialAttachments: ComposerAttachment[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [timelineMessagesByAssistant, setTimelineMessagesByAssistant] = useState(
    initialTimelineMessagesByAssistant ?? {},
  );
  const [citations, setCitations] = useState(initialCitations ?? []);

  useEffect(() => {
    setMessages(initialMessages);
    setTimelineMessagesByAssistant(initialTimelineMessagesByAssistant ?? {});
    setCitations(initialCitations ?? []);
  }, [initialCitations, initialMessages, initialTimelineMessagesByAssistant]);

  const activeAssistantMessageId = findLatestAssistantMessageId(messages);
  const activeAssistantStatus =
    (activeAssistantMessageId
      ? messages.find((message) => message.id === activeAssistantMessageId)?.status
      : null) ?? null;

  function handleSubmitted(turn: ComposerSubmittedTurn) {
    if (turn.conversationId !== conversationId) {
      return;
    }

    setMessages((current) =>
      appendSubmittedConversationTurn({
        messages: current,
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
      }),
    );
    setCitations((current) =>
      current.filter((citation) => citation.messageId !== turn.assistantMessage.id),
    );
    setTimelineMessagesByAssistant((current) => ({
      ...current,
      [turn.assistantMessage.id]: [],
    }));
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1080px] flex-col overflow-visible">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 pr-1 min-[720px]:py-5">
        <ConversationSession
          conversationId={conversationId}
          workspaceId={workspaceId}
          assistantMessageId={activeAssistantMessageId}
          assistantStatus={activeAssistantStatus}
          initialTimelineMessagesByAssistant={timelineMessagesByAssistant}
          initialMessages={messages}
          initialCitations={citations}
        />
      </div>

      <div className="shrink-0 border-app-border/60 pb-4 pt-3 min-[720px]:pb-6 min-[720px]:pt-4">
        <Composer
          conversationId={conversationId}
          workspaceId={workspaceId}
          variant="stage"
          rows={1}
          placeholder="继续追问、要求整理成结论，或让助手基于资料补充论证"
          submitLabel="继续"
          className="border-transparent bg-transparent p-0 shadow-none backdrop-blur-0"
          textareaClassName="bg-transparent"
          initialAttachments={initialAttachments}
          onSubmitted={handleSubmitted}
        />
      </div>
    </div>
  );
}
