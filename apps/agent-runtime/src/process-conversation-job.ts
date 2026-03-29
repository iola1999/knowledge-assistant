import { and, eq, inArray } from "drizzle-orm";

import {
  DEFAULT_GROUNDED_ANSWER_CONFIDENCE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  TIMELINE_EVENT,
  TOOL_TIMELINE_STATE,
  normalizeConversationFailureMessage,
  type ToolTimelineState,
} from "@knowledge-assistant/contracts";
import {
  citationAnchors,
  conversations,
  getDb,
  messageCitations,
  messages,
} from "@knowledge-assistant/db";
import type { ConversationResponseJobPayload } from "@knowledge-assistant/queue";

import { runAgentResponse } from "./run-agent-response";
import { buildToolTimelineMessage } from "./timeline";

const db = getDb();

async function insertToolMessage(input: {
  conversationId: string;
  toolName: string;
  state: ToolTimelineState;
  error?: string | null;
}) {
  const timeline = buildToolTimelineMessage({
    toolName: input.toolName,
    state: input.state,
    error: input.error ?? null,
  });

  await db.insert(messages).values({
    conversationId: input.conversationId,
    role: MESSAGE_ROLE.TOOL,
    status: timeline.status,
    contentMarkdown: timeline.contentMarkdown,
    structuredJson: timeline.structuredJson,
  });
}

async function updateStreamingAssistantMessage(input: {
  assistantMessageId: string;
  contentMarkdown: string;
}) {
  await db
    .update(messages)
    .set({
      contentMarkdown: input.contentMarkdown,
    })
    .where(eq(messages.id, input.assistantMessageId));
}

async function persistMessageCitations(input: {
  assistantMessageId: string;
  workspaceId: string;
  citations: Array<{
    anchor_id: string;
    label: string;
    quote_text: string;
  }>;
}) {
  const citationMap = new Map(input.citations.map((citation) => [citation.anchor_id, citation]));
  const requestedAnchorIds = Array.from(citationMap.keys());

  const anchorRows =
    requestedAnchorIds.length > 0
      ? await db
          .select({
            anchorId: citationAnchors.id,
            documentId: citationAnchors.documentId,
            documentVersionId: citationAnchors.documentVersionId,
            documentPath: citationAnchors.documentPath,
            anchorLabel: citationAnchors.anchorLabel,
            pageNo: citationAnchors.pageNo,
            blockId: citationAnchors.blockId,
            quoteText: citationAnchors.anchorText,
          })
          .from(citationAnchors)
          .where(
            and(
              eq(citationAnchors.workspaceId, input.workspaceId),
              inArray(citationAnchors.id, requestedAnchorIds),
            ),
          )
      : [];

  if (anchorRows.length === 0) {
    return;
  }

  await db.insert(messageCitations).values(
    anchorRows.map((anchor, index) => {
      const runtimeCitation = citationMap.get(anchor.anchorId);

      return {
        messageId: input.assistantMessageId,
        anchorId: anchor.anchorId,
        documentId: anchor.documentId,
        documentVersionId: anchor.documentVersionId,
        documentPath: anchor.documentPath,
        pageNo: anchor.pageNo,
        blockId: anchor.blockId,
        quoteText: runtimeCitation?.quote_text || anchor.quoteText,
        label:
          runtimeCitation?.label ||
          anchor.anchorLabel ||
          [anchor.documentPath, `第${anchor.pageNo}页`].filter(Boolean).join(" · "),
        ordinal: index,
      };
    }),
  );
}

export async function processConversationResponseJob(
  payload: ConversationResponseJobPayload,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, payload.conversationId))
    .limit(1);

  const [assistantMessage] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, payload.assistantMessageId),
        eq(messages.conversationId, payload.conversationId),
      ),
    )
    .limit(1);

  if (
    !conversation ||
    !assistantMessage ||
    assistantMessage.status !== MESSAGE_STATUS.STREAMING
  ) {
    return;
  }

  try {
    let streamedAssistantText = "";
    let lastPersistedAssistantText = assistantMessage.contentMarkdown;
    let lastPersistedAt = 0;
    let sawToolEvent = false;
    let emittedFallbackTool = false;

    async function persistAssistantDelta(nextText: string, force = false) {
      if (nextText === lastPersistedAssistantText) {
        return;
      }

      const now = Date.now();
      const recentlyPersisted = now - lastPersistedAt < 120;
      const smallIncrement =
        nextText.length - lastPersistedAssistantText.length < 24;
      const shouldBuffer =
        !force &&
        recentlyPersisted &&
        smallIncrement &&
        !/[。！？.!?\n]$/.test(nextText);

      if (shouldBuffer) {
        return;
      }

      await updateStreamingAssistantMessage({
        assistantMessageId: payload.assistantMessageId,
        contentMarkdown: nextText,
      });
      lastPersistedAssistantText = nextText;
      lastPersistedAt = now;
    }

    async function ensureFallbackToolTimeline() {
      if (sawToolEvent || emittedFallbackTool) {
        return;
      }

      emittedFallbackTool = true;
      await insertToolMessage({
        conversationId: payload.conversationId,
        toolName: "mock_workspace_probe",
        state: TOOL_TIMELINE_STATE.STARTED,
      });
      await insertToolMessage({
        conversationId: payload.conversationId,
        toolName: "mock_workspace_probe",
        state: TOOL_TIMELINE_STATE.COMPLETED,
      });
    }

    const agentResponse = await runAgentResponse(
      {
        prompt: payload.prompt,
        workspaceId: conversation.workspaceId,
        conversationId: payload.conversationId,
        agentSessionId: conversation.agentSessionId,
        agentWorkdir: conversation.agentWorkdir,
      },
      {
        onToolStarted: async ({ toolName }) => {
          sawToolEvent = true;
          await insertToolMessage({
            conversationId: payload.conversationId,
            toolName,
            state: TOOL_TIMELINE_STATE.STARTED,
          });
        },
        onToolFinished: async ({ toolName }) => {
          sawToolEvent = true;
          await insertToolMessage({
            conversationId: payload.conversationId,
            toolName,
            state: TOOL_TIMELINE_STATE.COMPLETED,
          });
        },
        onToolFailed: async ({ toolName, error }) => {
          sawToolEvent = true;
          await insertToolMessage({
            conversationId: payload.conversationId,
            toolName,
            state: TOOL_TIMELINE_STATE.FAILED,
            error: normalizeConversationFailureMessage(error),
          });
        },
        onAssistantDelta: async ({ fullText }) => {
          await ensureFallbackToolTimeline();
          streamedAssistantText = fullText;
          await persistAssistantDelta(fullText);
        },
      },
    );

    await ensureFallbackToolTimeline();
    await persistAssistantDelta(streamedAssistantText, true);

    await db
      .update(conversations)
      .set({
        agentSessionId: agentResponse.sessionId ?? conversation.agentSessionId,
        agentWorkdir: agentResponse.workdir ?? conversation.agentWorkdir,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, payload.conversationId));

    await db
      .update(messages)
      .set({
        status: MESSAGE_STATUS.COMPLETED,
        contentMarkdown: agentResponse.text,
        structuredJson: {
          confidence:
            agentResponse.structured?.confidence ?? DEFAULT_GROUNDED_ANSWER_CONFIDENCE,
          unsupported_reason: agentResponse.structured?.unsupported_reason ?? null,
          missing_information: agentResponse.structured?.missing_information ?? [],
        },
      })
      .where(eq(messages.id, payload.assistantMessageId));

    await persistMessageCitations({
      assistantMessageId: payload.assistantMessageId,
      workspaceId: conversation.workspaceId,
      citations: Array.isArray(agentResponse.citations) ? agentResponse.citations : [],
    });
  } catch (error) {
    const message = normalizeConversationFailureMessage(error);

    await db.insert(messages).values({
      conversationId: payload.conversationId,
      role: MESSAGE_ROLE.TOOL,
      status: MESSAGE_STATUS.FAILED,
      contentMarkdown: `运行失败：${message}`,
      structuredJson: {
        timeline_event: TIMELINE_EVENT.RUN_FAILED,
        error: message,
      },
    });

    await db
      .update(messages)
      .set({
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: `Agent 处理失败：${message}`,
        structuredJson: {
          agent_error: message,
        },
      })
      .where(eq(messages.id, payload.assistantMessageId));
  }
}
