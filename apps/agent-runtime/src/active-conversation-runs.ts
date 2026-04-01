import type { ConversationResponseJobPayload } from "@anchordesk/queue";

export type ActiveConversationRun = Pick<
  ConversationResponseJobPayload,
  "conversationId" | "assistantMessageId" | "runId"
>;

const activeConversationRuns = new Map<string, ActiveConversationRun>();

function buildActiveConversationRunKey(run: ActiveConversationRun) {
  return `${run.assistantMessageId}:${run.runId}`;
}

export function registerActiveConversationRun(run: ActiveConversationRun) {
  const key = buildActiveConversationRunKey(run);
  activeConversationRuns.set(key, run);

  return () => {
    const current = activeConversationRuns.get(key);
    if (
      current?.assistantMessageId === run.assistantMessageId &&
      current.runId === run.runId
    ) {
      activeConversationRuns.delete(key);
    }
  };
}

export function listActiveConversationRuns() {
  return Array.from(activeConversationRuns.values());
}
