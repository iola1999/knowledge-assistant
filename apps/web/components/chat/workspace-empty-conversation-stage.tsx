"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Composer,
  type ComposerSubmittedTurn,
} from "@/components/chat/composer";
import { WorkspaceConversationPanel } from "@/components/chat/workspace-conversation-panel";
import { appendSubmittedConversationTurn } from "@/lib/api/conversation-session";
import {
  resolveInitialModelProfileId,
  type EnabledModelProfileOption,
} from "@/lib/api/model-profiles";

type PendingConversationState = {
  conversationId: string;
  messages: ReturnType<typeof appendSubmittedConversationTurn>;
};

export function WorkspaceEmptyConversationStage({
  workspaceId,
  workspaceTitle,
  availableModelProfiles,
  defaultModelProfileId,
  onSubmittedTurn,
  onAssistantTerminalEvent,
}: {
  workspaceId: string;
  workspaceTitle: string;
  availableModelProfiles: EnabledModelProfileOption[];
  defaultModelProfileId?: string | null;
  onSubmittedTurn?: (turn: ComposerSubmittedTurn) => void;
  onAssistantTerminalEvent?: (conversationId: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedModelProfileId, setSelectedModelProfileId] = useState<string | null>(() =>
    resolveInitialModelProfileId({
      availableModelProfiles,
      defaultModelProfileId,
    }),
  );
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
        availableModelProfiles={availableModelProfiles}
        selectedModelProfileId={selectedModelProfileId}
        scrollToBottomOnMount
        onAssistantTerminalEvent={onAssistantTerminalEvent}
        onSelectedModelProfileIdChange={setSelectedModelProfileId}
      />
    );
  }

  return (
    <div className="grid min-h-[calc(100dvh-168px)] content-start gap-3 px-1 py-3 min-[720px]:min-h-[calc(100vh-196px)] min-[720px]:px-5 min-[720px]:py-4">
      <div className="mx-auto grid w-full max-w-[820px] gap-3">
        <div className="grid gap-1 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent">
            新建会话
          </p>
          <h1 className="font-headline text-[2rem] font-semibold tracking-[-0.05em] text-app-text min-[720px]:text-[2.3rem]">
            {workspaceTitle}
          </h1>
        </div>
        <Composer
          workspaceId={workspaceId}
          variant="stage"
          rows={1}
          placeholder="例如：请基于本空间资料，总结新版发布流程的关键变化，并列出仍需补充的信息"
          submitLabel="开始对话"
          className="mx-auto w-full max-w-[820px] text-left"
          textareaClassName="bg-transparent"
          availableModelProfiles={availableModelProfiles}
          initialAttachments={[]}
          onSelectedModelProfileIdChange={setSelectedModelProfileId}
          onSubmitted={handleSubmitted}
          selectedModelProfileId={selectedModelProfileId}
        />
      </div>
    </div>
  );
}
