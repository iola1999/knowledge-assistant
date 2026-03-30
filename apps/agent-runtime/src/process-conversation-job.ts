import { and, eq, inArray } from "drizzle-orm";

import {
  buildAssistantFailedMessageState,
  buildRunFailedToolMessageState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  STREAMING_ASSISTANT_HEARTBEAT_INTERVAL_MS,
  TOOL_TIMELINE_STATE,
  normalizeConversationFailureMessage,
  refreshStreamingAssistantRunState,
  type ToolTimelineState,
} from "@anchordesk/contracts";
import {
  citationAnchors,
  conversations,
  getDb,
  getKnowledgeSourceScope,
  knowledgeLibraries,
  messageCitations,
  messages,
  resolveWorkspaceLibraryScope,
} from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import type { ConversationResponseJobPayload } from "@anchordesk/queue";

import { logger } from "./logger";
import { runAgentResponse } from "./run-agent-response";
import { buildToolTimelineMessage } from "./timeline";

const db = getDb();

class AssistantRunStoppedError extends Error {
  constructor(assistantMessageId: string) {
    super(`Assistant run was stopped for message ${assistantMessageId}.`);
    this.name = "AssistantRunStoppedError";
  }
}

async function insertToolMessage(input: {
  conversationId: string;
  toolName: string;
  state: ToolTimelineState;
  error?: string | null;
  toolInput?: unknown;
  toolResponse?: unknown;
  toolUseId?: string | null;
}) {
  const timeline = buildToolTimelineMessage({
    toolName: input.toolName,
    state: input.state,
    error: input.error ?? null,
    toolInput: input.toolInput,
    toolResponse: input.toolResponse,
    toolUseId: input.toolUseId ?? null,
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

async function updateStreamingAssistantRunState(input: {
  assistantMessageId: string;
  structuredJson: Record<string, unknown>;
}) {
  await db
    .update(messages)
    .set({
      structuredJson: input.structuredJson,
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
  const scope = await resolveWorkspaceLibraryScope(input.workspaceId, db);
  const citationMap = new Map(input.citations.map((citation) => [citation.anchor_id, citation]));
  const requestedAnchorIds = Array.from(citationMap.keys());

  const anchorRows =
    requestedAnchorIds.length > 0 && scope.accessibleLibraryIds.length > 0
      ? await db
          .select({
            anchorId: citationAnchors.id,
            libraryId: citationAnchors.libraryId,
            documentId: citationAnchors.documentId,
            documentVersionId: citationAnchors.documentVersionId,
            documentPath: citationAnchors.documentPath,
            anchorLabel: citationAnchors.anchorLabel,
            pageNo: citationAnchors.pageNo,
            blockId: citationAnchors.blockId,
            quoteText: citationAnchors.anchorText,
            libraryTitle: knowledgeLibraries.title,
            libraryType: knowledgeLibraries.libraryType,
          })
          .from(citationAnchors)
          .innerJoin(knowledgeLibraries, eq(knowledgeLibraries.id, citationAnchors.libraryId))
          .where(
            and(
              inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
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
        libraryId: anchor.libraryId,
        documentId: anchor.documentId,
        documentVersionId: anchor.documentVersionId,
        documentPath: anchor.documentPath,
        pageNo: anchor.pageNo,
        blockId: anchor.blockId,
        sourceScope: getKnowledgeSourceScope(anchor.libraryType),
        libraryTitleSnapshot: anchor.libraryTitle,
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
  const jobLogger = logger.child({
    conversationId: payload.conversationId,
    userMessageId: payload.userMessageId,
    assistantMessageId: payload.assistantMessageId,
    hasDraftUploadId: Boolean(payload.draftUploadId),
    promptLength: payload.prompt.length,
  });
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
    jobLogger.debug(
      {
        conversationFound: Boolean(conversation),
        assistantMessageFound: Boolean(assistantMessage),
        assistantStatus: assistantMessage?.status ?? null,
      },
      "skipping conversation response job",
    );
    return;
  }

  jobLogger.info(
    {
      workspaceId: conversation.workspaceId,
      hasAgentSessionId: Boolean(conversation.agentSessionId),
      hasAgentWorkdir: Boolean(conversation.agentWorkdir),
    },
    "processing conversation response job",
  );

  try {
    async function assertAssistantMessageStillStreaming() {
      const [currentAssistantMessage] = await db
        .select({
          status: messages.status,
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, payload.assistantMessageId),
            eq(messages.conversationId, payload.conversationId),
          ),
        )
        .limit(1);

      if (currentAssistantMessage?.status !== MESSAGE_STATUS.STREAMING) {
        throw new AssistantRunStoppedError(payload.assistantMessageId);
      }
    }

    let streamedAssistantText = "";
    let lastPersistedAssistantText = assistantMessage.contentMarkdown;
    let lastPersistedAt = 0;
    let currentRunState = refreshStreamingAssistantRunState(
      (assistantMessage.structuredJson as Record<string, unknown> | null | undefined) ??
        null,
    );

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

      await assertAssistantMessageStillStreaming();
      await updateStreamingAssistantMessage({
        assistantMessageId: payload.assistantMessageId,
        contentMarkdown: nextText,
      });
      lastPersistedAssistantText = nextText;
      lastPersistedAt = now;
    }

    async function persistAssistantHeartbeat(now: Date = new Date()) {
      await assertAssistantMessageStillStreaming();
      currentRunState = refreshStreamingAssistantRunState(currentRunState, now);
      await updateStreamingAssistantRunState({
        assistantMessageId: payload.assistantMessageId,
        structuredJson: currentRunState,
      });
    }

    await persistAssistantHeartbeat();

    const heartbeatTimer = setInterval(() => {
      void persistAssistantHeartbeat().catch((heartbeatError) => {
        if (heartbeatError instanceof AssistantRunStoppedError) {
          clearInterval(heartbeatTimer);
          return;
        }

        jobLogger.warn(
          {
            error: serializeErrorForLog(heartbeatError),
          },
          "failed to persist assistant heartbeat",
        );
      });
    }, STREAMING_ASSISTANT_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();

    try {
      const agentResponse = await runAgentResponse(
        {
          prompt: payload.prompt,
          workspaceId: conversation.workspaceId,
          conversationId: payload.conversationId,
          agentSessionId: conversation.agentSessionId,
          agentWorkdir: conversation.agentWorkdir,
        },
        {
          onToolStarted: async ({ toolInput, toolName, toolUseId }) => {
            await assertAssistantMessageStillStreaming();
            jobLogger.debug(
              {
                toolName,
                toolUseId,
              },
              "assistant tool started",
            );
            await insertToolMessage({
              conversationId: payload.conversationId,
              toolName,
              state: TOOL_TIMELINE_STATE.STARTED,
              toolInput,
              toolUseId,
            });
          },
          onToolFinished: async ({ toolInput, toolName, toolResponse, toolUseId }) => {
            await assertAssistantMessageStillStreaming();
            jobLogger.debug(
              {
                toolName,
                toolUseId,
              },
              "assistant tool completed",
            );
            await insertToolMessage({
              conversationId: payload.conversationId,
              toolName,
              state: TOOL_TIMELINE_STATE.COMPLETED,
              toolInput,
              toolResponse,
              toolUseId,
            });
          },
          onToolFailed: async ({ toolInput, toolName, toolUseId, error }) => {
            await assertAssistantMessageStillStreaming();
            jobLogger.warn(
              {
                toolName,
                toolUseId,
                error,
              },
              "assistant tool failed",
            );
            await insertToolMessage({
              conversationId: payload.conversationId,
              toolName,
              state: TOOL_TIMELINE_STATE.FAILED,
              error: normalizeConversationFailureMessage(error),
              toolInput,
              toolUseId,
            });
          },
          onAssistantDelta: async ({ fullText }) => {
            await assertAssistantMessageStillStreaming();
            streamedAssistantText = fullText;
            await persistAssistantDelta(fullText);
          },
        },
      );

      clearInterval(heartbeatTimer);

      await db
        .update(conversations)
        .set({
          agentSessionId: agentResponse.sessionId ?? conversation.agentSessionId,
          agentWorkdir: agentResponse.workdir ?? conversation.agentWorkdir,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, payload.conversationId));

      await persistAssistantDelta(streamedAssistantText, true);
      await assertAssistantMessageStillStreaming();
      await db
        .update(messages)
        .set({
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: agentResponse.text,
          structuredJson: null,
        })
        .where(eq(messages.id, payload.assistantMessageId));

      await persistMessageCitations({
        assistantMessageId: payload.assistantMessageId,
        workspaceId: conversation.workspaceId,
        citations: Array.isArray(agentResponse.citations) ? agentResponse.citations : [],
      });

      jobLogger.info(
        {
          workspaceId: conversation.workspaceId,
          sessionId: agentResponse.sessionId ?? null,
          citationCount: Array.isArray(agentResponse.citations)
            ? agentResponse.citations.length
            : 0,
          outputLength: agentResponse.text.length,
        },
        "conversation response job completed",
      );
    } catch (error) {
      clearInterval(heartbeatTimer);
      throw error;
    }
  } catch (error) {
    if (error instanceof AssistantRunStoppedError) {
      jobLogger.info(
        {
          workspaceId: conversation.workspaceId,
        },
        "conversation response job stopped because assistant message is no longer streaming",
      );
      return;
    }

    const failedAssistantState = buildAssistantFailedMessageState(error);
    const failedToolState = buildRunFailedToolMessageState(error);

    await db.insert(messages).values({
      conversationId: payload.conversationId,
      role: MESSAGE_ROLE.TOOL,
      ...failedToolState,
    });

    await db
      .update(messages)
      .set(failedAssistantState)
      .where(eq(messages.id, payload.assistantMessageId));

    jobLogger.error(
      {
        workspaceId: conversation.workspaceId,
        errorMessage: failedAssistantState.structuredJson.agent_error,
        error: serializeErrorForLog(error),
      },
      "conversation response job failed",
    );
  }
}
