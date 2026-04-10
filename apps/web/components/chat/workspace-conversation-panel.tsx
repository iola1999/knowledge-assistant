"use client";

import { useEffect, useRef, useState } from "react";

import { MESSAGE_STATUS } from "@anchordesk/contracts";

import {
  Composer,
  type ComposerSubmittedTurn,
} from "@/components/chat/composer";
import { ConversationSession } from "@/components/chat/conversation-session";
import { type EnabledModelProfileOption } from "@/lib/api/model-profiles";
import { type ConversationMessageQuote } from "@/lib/api/conversation-message-quote";
import { type AssistantProcessMessage } from "@/lib/api/conversation-process";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import {
  appendSubmittedConversationTurn,
  findLatestAssistantMessageId,
  type ConversationChatMessage,
  type ConversationMessageCitation,
} from "@/lib/api/conversation-session";

type TimelineMessagesByAssistant = Record<string, AssistantProcessMessage[]>;

function scrollConversationPanelToBottom(panel: HTMLDivElement) {
  let scrollContainer: HTMLElement | null = panel.parentElement;

  while (scrollContainer) {
    const styles = window.getComputedStyle(scrollContainer);
    if (styles.overflowY === "auto" || styles.overflowY === "scroll") {
      break;
    }

    scrollContainer = scrollContainer.parentElement;
  }

  const target =
    scrollContainer ??
    (document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);

  if (!target) {
    panel.scrollIntoView({
      block: "end",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    return;
  }

  target.scrollTo({
    top: target.scrollHeight,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

export function WorkspaceConversationPanel({
  conversationId,
  workspaceId,
  initialMessages,
  initialTimelineMessagesByAssistant,
  initialCitations,
  availableModelProfiles,
  selectedModelProfileId,
  scrollToBottomOnMount = false,
  onSubmittedTurn,
  onAssistantTerminalEvent,
  onSelectedModelProfileIdChange,
}: {
  conversationId: string;
  workspaceId: string;
  initialMessages: ConversationChatMessage[];
  initialTimelineMessagesByAssistant?: TimelineMessagesByAssistant;
  initialCitations?: ConversationMessageCitation[];
  availableModelProfiles: EnabledModelProfileOption[];
  selectedModelProfileId?: string | null;
  scrollToBottomOnMount?: boolean;
  onSubmittedTurn?: (turn: ComposerSubmittedTurn) => void;
  onAssistantTerminalEvent?: (conversationId: string) => void;
  onSelectedModelProfileIdChange?: (modelProfileId: string) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [timelineMessagesByAssistant, setTimelineMessagesByAssistant] = useState(
    initialTimelineMessagesByAssistant ?? {},
  );
  const [citations, setCitations] = useState(initialCitations ?? []);
  const [selectedQuote, setSelectedQuote] = useState<ConversationMessageQuote | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToBottomRef = useRef(scrollToBottomOnMount);

  useEffect(() => {
    setMessages(initialMessages);
    setTimelineMessagesByAssistant(initialTimelineMessagesByAssistant ?? {});
    setCitations(initialCitations ?? []);
    setSelectedQuote(null);
  }, [initialCitations, initialMessages, initialTimelineMessagesByAssistant]);

  useEffect(() => {
    if (!scrollToBottomOnMount) {
      return;
    }

    pendingScrollToBottomRef.current = true;
  }, [scrollToBottomOnMount]);

  useEffect(() => {
    if (!pendingScrollToBottomRef.current) {
      return;
    }

    pendingScrollToBottomRef.current = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (panelRef.current) {
          scrollConversationPanelToBottom(panelRef.current);
        }
      });
    });
  }, [messages.length]);

  const activeAssistantMessageId = findLatestAssistantMessageId(messages);
  const activeAssistantStatus =
    (activeAssistantMessageId
      ? messages.find((message) => message.id === activeAssistantMessageId)?.status
      : null) ?? null;

  async function handleStopStreamingAssistant() {
    const response = await fetch(`/api/conversations/${conversationId}/stop`, {
      method: "POST",
    });
    const body = (await response.json().catch(() => null)) as
      | {
          error?: string;
          assistantMessage?: ConversationChatMessage;
        }
      | null;

    if (!response.ok || !body?.assistantMessage) {
      throw new Error(body?.error ?? "停止失败。");
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === body.assistantMessage?.id
          ? {
              ...message,
              ...body.assistantMessage,
            }
          : message,
      ),
    );
    onAssistantTerminalEvent?.(conversationId);
  }

  function handleSubmitted(turn: ComposerSubmittedTurn) {
    if (turn.conversationId !== conversationId) {
      return;
    }

    pendingScrollToBottomRef.current = true;
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
    setSelectedQuote(null);
    onSubmittedTurn?.(turn);
  }

  function handleSessionStateSync(input: {
    messages: ConversationChatMessage[];
    citations: ConversationMessageCitation[];
    timelineMessagesByAssistant: TimelineMessagesByAssistant;
  }) {
    setMessages(input.messages);
    setCitations(input.citations);
    setTimelineMessagesByAssistant(input.timelineMessagesByAssistant);
  }

  return (
    <div
      ref={panelRef}
      className="mx-auto flex min-h-full w-full max-w-[1080px] min-w-0 flex-col overflow-visible"
    >
      <div className="min-w-0 flex-1 pt-2 pb-6 pr-1 min-[720px]:pt-3 min-[720px]:pb-8">
        <ConversationSession
          conversationId={conversationId}
          workspaceId={workspaceId}
          assistantMessageId={activeAssistantMessageId}
          assistantStatus={activeAssistantStatus}
          initialTimelineMessagesByAssistant={timelineMessagesByAssistant}
          initialMessages={messages}
          initialCitations={citations}
          onAssistantTerminalEvent={onAssistantTerminalEvent}
          onQuoteRequest={setSelectedQuote}
          onSessionStateSync={handleSessionStateSync}
        />
      </div>

      <div className={conversationDensityClassNames.composerShell}>
        <Composer
          key={conversationId}
          conversationId={conversationId}
          workspaceId={workspaceId}
          variant="stage"
          rows={3}
          placeholder="继续追问、要求整理成结论，或让助手基于资料补充论证"
          submitLabel="继续"
          className="border-transparent bg-transparent p-0 shadow-none backdrop-blur-0"
          textareaClassName="bg-transparent"
          availableModelProfiles={availableModelProfiles}
          initialAttachments={[]}
          isStreaming={activeAssistantStatus === MESSAGE_STATUS.STREAMING}
          onStop={handleStopStreamingAssistant}
          onClearSelectedQuote={() => setSelectedQuote(null)}
          onSelectedModelProfileIdChange={onSelectedModelProfileIdChange}
          onSubmitted={handleSubmitted}
          selectedQuote={selectedQuote}
          selectedModelProfileId={selectedModelProfileId}
        />
      </div>
    </div>
  );
}
