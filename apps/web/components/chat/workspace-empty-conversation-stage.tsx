"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Composer,
  type ComposerSubmittedTurn,
} from "@/components/chat/composer";
import { WorkspaceConversationPanel } from "@/components/chat/workspace-conversation-panel";
import { appendSubmittedConversationTurn } from "@/lib/api/conversation-session";
import { ui } from "@/lib/ui";

type PendingConversationState = {
  attachments: ComposerSubmittedTurn["attachments"];
  conversationId: string;
  messages: ReturnType<typeof appendSubmittedConversationTurn>;
};

export function WorkspaceEmptyConversationStage({
  workspaceId,
  workspaceTitle,
  onSubmittedTurn,
  onAssistantTerminalEvent,
}: {
  workspaceId: string;
  workspaceTitle: string;
  onSubmittedTurn?: (turn: ComposerSubmittedTurn) => void;
  onAssistantTerminalEvent?: (conversationId: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingConversation, setPendingConversation] =
    useState<PendingConversationState | null>(null);

  function handleSubmitted(turn: ComposerSubmittedTurn) {
    setPendingConversation({
      conversationId: turn.conversationId,
      messages: appendSubmittedConversationTurn({
        messages: [],
        userMessage: turn.userMessage,
        assistantMessage: turn.assistantMessage,
      }),
      attachments: turn.attachments,
    });
    onSubmittedTurn?.(turn);

    startTransition(() => {
      router.replace(`/workspaces/${workspaceId}?conversationId=${turn.conversationId}`);
    });
  }

  if (pendingConversation) {
    return (
      <WorkspaceConversationPanel
        conversationId={pendingConversation.conversationId}
        workspaceId={workspaceId}
        initialTimelineMessagesByAssistant={{}}
        initialMessages={pendingConversation.messages}
        initialCitations={[]}
        initialAttachments={pendingConversation.attachments}
        scrollToBottomOnMount
        onAssistantTerminalEvent={onAssistantTerminalEvent}
      />
    );
  }

  return (
    <div className="grid min-h-[calc(100dvh-156px)] place-items-center px-1 py-6 min-[720px]:min-h-[calc(100vh-180px)] min-[720px]:px-2 min-[720px]:py-8">
      <div className="grid w-full max-w-[860px] gap-6 text-center">
        <div className="grid justify-items-center gap-3">
          <p className={ui.eyebrow}>New Question</p>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-app-text md:text-[40px]">
            {workspaceTitle}
          </h1>
        </div>

        <Composer
          workspaceId={workspaceId}
          variant="stage"
          rows={2}
          placeholder="例如：请基于本空间资料，总结新版发布流程的关键变化，并列出仍需补充的信息"
          submitLabel="开始对话"
          className="mx-auto w-full max-w-[920px] text-left"
          textareaClassName="bg-transparent"
          initialAttachments={[]}
          onSubmitted={handleSubmitted}
        />
      </div>
    </div>
  );
}
