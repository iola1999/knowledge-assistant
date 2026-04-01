import { and, eq, inArray } from "drizzle-orm";

import {
  ASSISTANT_STREAM_PHASE,
  CONVERSATION_STREAM_EVENT,
  finalizeStreamingAssistantRunState,
  GROUNDED_EVIDENCE_KIND,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  readStreamingAssistantRunState,
  STREAMING_ASSISTANT_HEARTBEAT_INTERVAL_MS,
  TOOL_TIMELINE_STATE,
  buildInitialStreamingAssistantRunState,
  normalizeConversationFailureMessage,
  refreshStreamingAssistantRunState,
  updateStreamingAssistantRunState,
  type AssistantStreamPhase,
  type GroundedEvidence,
  type ToolTimelineState,
  type ConversationStreamEvent,
  type MessageStatus,
} from "@anchordesk/contracts";
import {
  citationAnchors,
  conversations,
  getDb,
  getKnowledgeSourceScope,
  knowledgeLibraries,
  messageCitations,
  messages,
  resolveDefaultUsableModelProfile,
  resolveUsableModelProfileById,
  resolveWorkspaceLibraryScope,
  summarizeWorkspaceSearchableKnowledge,
} from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import {
  appendConversationStreamEvent,
  type ConversationResponseJobPayload,
} from "@anchordesk/queue";
import { withConsumerSpan } from "@anchordesk/tracing";

import {
  materializeAssistantAnswer,
  toDisplayInlineCitationText,
} from "./assistant-answer";
import {
  buildConversationPromptWithAttachments,
  loadConversationAttachmentPromptAttachments,
} from "./conversation-attachment-context";
import { logger } from "./logger";
import { runAgentResponse } from "./run-agent-response";
import { buildToolTimelineMessage } from "./timeline";
import { failConversationResponseRun } from "./conversation-run-failure";
import { registerActiveConversationRun } from "./active-conversation-runs";

const db = getDb();

class AssistantRunStoppedError extends Error {
  constructor(assistantMessageId: string) {
    super(`Assistant run was stopped for message ${assistantMessageId}.`);
    this.name = "AssistantRunStoppedError";
  }
}

function buildAssistantStatusEvent(input: {
  conversationId: string;
  assistantMessageId: string;
  status: MessageStatus;
  phase: AssistantStreamPhase;
  statusText: string;
  toolName?: string | null;
  toolUseId?: string | null;
  taskId?: string | null;
}): Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS }
> {
  return {
    type: CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS,
    conversation_id: input.conversationId,
    message_id: input.assistantMessageId,
    status: input.status,
    phase: input.phase,
    status_text: input.statusText,
    tool_name: input.toolName ?? null,
    tool_use_id: input.toolUseId ?? null,
    task_id: input.taskId ?? null,
  };
}

function buildAnswerDeltaEvent(input: {
  conversationId: string;
  assistantMessageId: string;
  contentMarkdown: string;
  deltaText?: string | null;
}): Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ANSWER_DELTA }
> {
  return {
    type: CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
    conversation_id: input.conversationId,
    message_id: input.assistantMessageId,
    status: MESSAGE_STATUS.STREAMING,
    content_markdown: input.contentMarkdown,
    delta_text: input.deltaText ?? null,
  };
}

function buildAssistantThinkingDeltaEvent(input: {
  conversationId: string;
  assistantMessageId: string;
  thinkingText: string;
  deltaText?: string | null;
}): Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA }
> {
  return {
    type: CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA,
    conversation_id: input.conversationId,
    message_id: input.assistantMessageId,
    status: MESSAGE_STATUS.STREAMING,
    thinking_text: input.thinkingText,
    delta_text: input.deltaText ?? null,
  };
}

function deriveStreamDeltaText(previousText: string, nextText: string) {
  if (!nextText.startsWith(previousText)) {
    return null;
  }

  return nextText.slice(previousText.length);
}

function buildToolMessageEvent(input: {
  message: {
    id: string;
    status: MessageStatus;
    contentMarkdown: string;
    createdAt: Date;
    structuredJson?: Record<string, unknown> | null;
  };
}): Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.TOOL_MESSAGE }
> {
  return {
    type: CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
    message_id: input.message.id,
    role: MESSAGE_ROLE.TOOL,
    status: input.message.status,
    content_markdown: input.message.contentMarkdown,
    created_at: input.message.createdAt.toISOString(),
    structured: input.message.structuredJson ?? null,
  };
}

function buildToolProgressEvent(input: {
  conversationId: string;
  assistantMessageId: string;
  toolUseId: string;
  toolName: string;
  elapsedSeconds: number;
  statusText: string;
  taskId?: string | null;
}): Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.TOOL_PROGRESS }
> {
  return {
    type: CONVERSATION_STREAM_EVENT.TOOL_PROGRESS,
    conversation_id: input.conversationId,
    message_id: input.assistantMessageId,
    tool_use_id: input.toolUseId,
    tool_name: input.toolName,
    elapsed_seconds: input.elapsedSeconds,
    status_text: input.statusText,
    task_id: input.taskId ?? null,
  };
}

async function insertToolMessage(input: {
  conversationId: string;
  assistantMessageId: string;
  assistantRunId: string;
  toolName: string;
  state: ToolTimelineState;
  error?: string | null;
  toolInput?: unknown;
  toolResponse?: unknown;
  toolUseId?: string | null;
}) {
  const timeline = buildToolTimelineMessage({
    assistantMessageId: input.assistantMessageId,
    assistantRunId: input.assistantRunId,
    toolName: input.toolName,
    state: input.state,
    error: input.error ?? null,
    toolInput: input.toolInput,
    toolResponse: input.toolResponse,
    toolUseId: input.toolUseId ?? null,
  });

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: MESSAGE_ROLE.TOOL,
      status: timeline.status,
      contentMarkdown: timeline.contentMarkdown,
      structuredJson: timeline.structuredJson,
    })
    .returning({
      id: messages.id,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      createdAt: messages.createdAt,
      structuredJson: messages.structuredJson,
    });

  return message
    ? {
        id: message.id,
        status: message.status,
        contentMarkdown: message.contentMarkdown,
        createdAt: message.createdAt,
        structuredJson:
          (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
      }
    : null;
}

async function updateStreamingAssistantSnapshot(input: {
  assistantMessageId: string;
  contentMarkdown?: string;
  structuredJson?: Record<string, unknown> | null;
}) {
  await db
    .update(messages)
    .set({
      ...(input.contentMarkdown === undefined
        ? {}
        : { contentMarkdown: input.contentMarkdown }),
      ...(input.structuredJson === undefined
        ? {}
        : { structuredJson: input.structuredJson }),
    })
    .where(eq(messages.id, input.assistantMessageId));
}

async function persistMessageCitations(input: {
  assistantMessageId: string;
  workspaceId: string;
  citations: GroundedEvidence[];
}) {
  const documentCitations = input.citations.filter(
    (
      citation,
    ): citation is Extract<GroundedEvidence, { kind: "document_anchor" }> =>
      citation.kind === GROUNDED_EVIDENCE_KIND.DOCUMENT_ANCHOR,
  );
  const webCitations = input.citations.filter(
    (citation): citation is Extract<GroundedEvidence, { kind: "web_page" }> =>
      citation.kind === GROUNDED_EVIDENCE_KIND.WEB_PAGE,
  );
  const nextRows: Array<typeof messageCitations.$inferInsert> = [];

  if (documentCitations.length > 0) {
    const scope = await resolveWorkspaceLibraryScope(input.workspaceId, db);
    const citationMap = new Map(
      documentCitations.map((citation) => [citation.anchor_id, citation] as const),
    );
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

    const anchorRowsById = new Map(anchorRows.map((anchor) => [anchor.anchorId, anchor] as const));

    for (const citation of documentCitations) {
      const anchor = anchorRowsById.get(citation.anchor_id);
      if (!anchor) {
        continue;
      }

      nextRows.push({
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
        sourceUrl: null,
        sourceDomain: null,
        sourceTitle: null,
        quoteText: citation.quote_text || anchor.quoteText,
        label:
          citation.label ||
          anchor.anchorLabel ||
          [anchor.documentPath, `第${anchor.pageNo}页`].filter(Boolean).join(" · "),
      });
    }
  }

  for (const citation of webCitations) {
    nextRows.push({
      messageId: input.assistantMessageId,
      anchorId: null,
      libraryId: null,
      documentId: null,
      documentVersionId: null,
      documentPath: null,
      pageNo: null,
      blockId: null,
      sourceScope: citation.source_scope ?? null,
      libraryTitleSnapshot: citation.library_title ?? null,
      sourceUrl: citation.url,
      sourceDomain: citation.domain,
      sourceTitle: citation.title,
      quoteText: citation.quote_text,
      label: citation.label,
    });
  }

  if (nextRows.length === 0) {
    return [];
  }

  return db
    .insert(messageCitations)
    .values(
      nextRows.map((row, index) => ({
        ...row,
        ordinal: index,
      })),
    )
    .returning({
      id: messageCitations.id,
      anchorId: messageCitations.anchorId,
      documentId: messageCitations.documentId,
      label: messageCitations.label,
      quoteText: messageCitations.quoteText,
      sourceScope: messageCitations.sourceScope,
      libraryTitle: messageCitations.libraryTitleSnapshot,
      sourceUrl: messageCitations.sourceUrl,
      sourceDomain: messageCitations.sourceDomain,
      sourceTitle: messageCitations.sourceTitle,
    });
}

async function processConversationResponseJobWithContext(
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
    assistantMessage.status !== MESSAGE_STATUS.STREAMING ||
    (readStreamingAssistantRunState(
      (assistantMessage.structuredJson as Record<string, unknown> | null | undefined) ?? null,
    )?.run_id ??
      payload.runId) !== payload.runId
  ) {
    jobLogger.debug(
      {
        conversationFound: Boolean(conversation),
        assistantMessageFound: Boolean(assistantMessage),
        assistantStatus: assistantMessage?.status ?? null,
        assistantRunId:
          readStreamingAssistantRunState(
            (assistantMessage?.structuredJson as Record<string, unknown> | null | undefined) ??
              null,
          )?.run_id ?? null,
        payloadRunId: payload.runId,
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

  const unregisterActiveRun = registerActiveConversationRun({
    conversationId: payload.conversationId,
    assistantMessageId: payload.assistantMessageId,
    runId: payload.runId,
  });

  try {
    async function assertAssistantMessageStillStreaming() {
      const [currentAssistantMessage] = await db
        .select({
          status: messages.status,
          structuredJson: messages.structuredJson,
        })
        .from(messages)
        .where(
          and(
            eq(messages.id, payload.assistantMessageId),
            eq(messages.conversationId, payload.conversationId),
          ),
        )
        .limit(1);
      const currentRunId = readStreamingAssistantRunState(
        (currentAssistantMessage?.structuredJson as Record<string, unknown> | null | undefined) ??
          null,
      )?.run_id;

      if (
        currentAssistantMessage?.status !== MESSAGE_STATUS.STREAMING ||
        (currentRunId && currentRunId !== payload.runId)
      ) {
        throw new AssistantRunStoppedError(payload.assistantMessageId);
      }
    }

    let lastPersistedAssistantText = assistantMessage.contentMarkdown;
    let lastPersistedAt = 0;
    let currentRunState =
      readStreamingAssistantRunState(
        (assistantMessage.structuredJson as Record<string, unknown> | null | undefined) ?? null,
      ) ??
      buildInitialStreamingAssistantRunState({
        runId: payload.runId,
      });
    let lastPersistedThinkingText = currentRunState.thinking_text ?? "";

    async function publishConversationEvent(event: ConversationStreamEvent) {
      try {
        return await appendConversationStreamEvent({
          assistantMessageId: payload.assistantMessageId,
          runId: payload.runId,
          event,
        });
      } catch (streamError) {
        jobLogger.warn(
          {
            eventType: event.type,
            error: serializeErrorForLog(streamError),
          },
          "failed to append live conversation stream event",
        );
        return null;
      }
    }

    async function persistAssistantRunState(input: {
      now?: Date;
      phase?: AssistantStreamPhase | null;
      statusText?: string | null;
      streamEventId?: string;
      activeToolName?: string | null;
      activeToolUseId?: string | null;
      activeTaskId?: string | null;
      thinkingText?: string | null;
      contentMarkdown?: string;
    }) {
      const now = input.now ?? new Date();
      currentRunState = updateStreamingAssistantRunState(currentRunState, {
        now,
        phase: input.phase,
        statusText: input.statusText,
        ...(input.streamEventId ? { streamEventId: input.streamEventId } : {}),
        activeToolName: input.activeToolName,
        activeToolUseId: input.activeToolUseId,
        activeTaskId: input.activeTaskId,
        thinkingText: input.thinkingText,
      });
      await updateStreamingAssistantSnapshot({
        assistantMessageId: payload.assistantMessageId,
        ...(input.contentMarkdown === undefined
          ? {}
          : { contentMarkdown: input.contentMarkdown }),
        structuredJson: currentRunState,
      });
    }

    async function publishAssistantStatus(input: {
      phase: AssistantStreamPhase;
      statusText: string;
      toolName?: string | null;
      toolUseId?: string | null;
      taskId?: string | null;
    }) {
      if (
        currentRunState.phase === input.phase &&
        currentRunState.status_text === input.statusText &&
        (currentRunState.active_tool_name ?? null) === (input.toolName ?? null) &&
        (currentRunState.active_tool_use_id ?? null) === (input.toolUseId ?? null) &&
        (currentRunState.active_task_id ?? null) === (input.taskId ?? null)
      ) {
        return;
      }

      await assertAssistantMessageStillStreaming();
      const now = new Date();
      const eventId = await publishConversationEvent(
        buildAssistantStatusEvent({
          conversationId: payload.conversationId,
          assistantMessageId: payload.assistantMessageId,
          status: MESSAGE_STATUS.STREAMING,
          phase: input.phase,
          statusText: input.statusText,
          toolName: input.toolName ?? null,
          toolUseId: input.toolUseId ?? null,
          taskId: input.taskId ?? null,
        }),
      );
      await persistAssistantRunState({
        now,
        phase: input.phase,
        statusText: input.statusText,
        ...(eventId ? { streamEventId: eventId } : {}),
        activeToolName: input.toolName ?? null,
        activeToolUseId: input.toolUseId ?? null,
        activeTaskId: input.taskId ?? null,
      });
    }

    async function publishToolMessage(input: {
      toolName: string;
      state: ToolTimelineState;
      error?: string | null;
      toolInput?: unknown;
      toolResponse?: unknown;
      toolUseId?: string | null;
      nextStatusText: string;
      clearActiveTool?: boolean;
    }) {
      await assertAssistantMessageStillStreaming();
      const inserted = await insertToolMessage({
        conversationId: payload.conversationId,
        assistantMessageId: payload.assistantMessageId,
        assistantRunId: payload.runId,
        toolName: input.toolName,
        state: input.state,
        error: input.error ?? null,
        toolInput: input.toolInput,
        toolResponse: input.toolResponse,
        toolUseId: input.toolUseId ?? null,
      });
      const eventId = inserted
        ? await publishConversationEvent(
            buildToolMessageEvent({
              message: inserted,
            }),
          )
        : null;

      await persistAssistantRunState({
        now: new Date(),
        phase:
          input.state === TOOL_TIMELINE_STATE.STARTED
            ? ASSISTANT_STREAM_PHASE.TOOL
            : ASSISTANT_STREAM_PHASE.ANALYZING,
        statusText: input.nextStatusText,
        ...(eventId ? { streamEventId: eventId } : {}),
        activeToolName: input.clearActiveTool ? null : input.toolName,
        activeToolUseId: input.clearActiveTool ? null : (input.toolUseId ?? null),
      });
    }

    async function publishToolProgress(input: {
      toolName: string;
      toolUseId: string;
      elapsedSeconds: number;
      statusText: string;
      taskId?: string | null;
    }) {
      await assertAssistantMessageStillStreaming();
      const eventId = await publishConversationEvent(
        buildToolProgressEvent({
          conversationId: payload.conversationId,
          assistantMessageId: payload.assistantMessageId,
          toolUseId: input.toolUseId,
          toolName: input.toolName,
          elapsedSeconds: input.elapsedSeconds,
          statusText: input.statusText,
          taskId: input.taskId ?? null,
        }),
      );
      await persistAssistantRunState({
        now: new Date(),
        phase: ASSISTANT_STREAM_PHASE.TOOL,
        statusText: input.statusText,
        ...(eventId ? { streamEventId: eventId } : {}),
        activeToolName: input.toolName,
        activeToolUseId: input.toolUseId,
        activeTaskId: input.taskId ?? null,
      });
    }

    async function persistAssistantDelta(
      nextText: string,
      input: {
        force?: boolean;
        phase?: AssistantStreamPhase | null;
        statusText?: string | null;
      } = {},
    ) {
      if (nextText === lastPersistedAssistantText) {
        return;
      }

      const now = Date.now();
      const recentlyPersisted = now - lastPersistedAt < 120;
      const lengthDelta = nextText.length - lastPersistedAssistantText.length;
      const smallIncrement = lengthDelta >= 0 && lengthDelta < 24;
      const shouldBuffer =
        !input.force &&
        recentlyPersisted &&
        smallIncrement &&
        !/[。！？.!?\n]$/.test(nextText);

      if (shouldBuffer) {
        return;
      }

      const deltaText = deriveStreamDeltaText(lastPersistedAssistantText, nextText);
      await assertAssistantMessageStillStreaming();
      const eventId = await publishConversationEvent(
        buildAnswerDeltaEvent({
          conversationId: payload.conversationId,
          assistantMessageId: payload.assistantMessageId,
          contentMarkdown: deltaText === null ? nextText : "",
          deltaText,
        }),
      );
      await persistAssistantRunState({
        now: new Date(now),
        ...(input.phase === undefined ? {} : { phase: input.phase }),
        ...(input.statusText === undefined ? {} : { statusText: input.statusText }),
        ...(eventId ? { streamEventId: eventId } : {}),
        contentMarkdown: nextText,
      });
      lastPersistedAssistantText = nextText;
      lastPersistedAt = now;
    }

    async function persistAssistantThinking(nextText: string) {
      if (nextText === lastPersistedThinkingText) {
        return;
      }

      const deltaText = deriveStreamDeltaText(lastPersistedThinkingText, nextText);
      await assertAssistantMessageStillStreaming();
      const eventId = await publishConversationEvent(
        buildAssistantThinkingDeltaEvent({
          conversationId: payload.conversationId,
          assistantMessageId: payload.assistantMessageId,
          thinkingText: nextText,
          deltaText,
        }),
      );
      await persistAssistantRunState({
        now: new Date(),
        ...(eventId ? { streamEventId: eventId } : {}),
        thinkingText: nextText,
      });
      lastPersistedThinkingText = nextText;
    }

    async function persistAssistantHeartbeat(now: Date = new Date()) {
      await assertAssistantMessageStillStreaming();
      currentRunState = refreshStreamingAssistantRunState(currentRunState, now);
      await updateStreamingAssistantSnapshot({
        assistantMessageId: payload.assistantMessageId,
        structuredJson: currentRunState,
      });
    }

    await persistAssistantHeartbeat();

    let searchableKnowledge = null;
    try {
      searchableKnowledge = await summarizeWorkspaceSearchableKnowledge(
        conversation.workspaceId,
        db,
      );
    } catch (knowledgeSummaryError) {
      jobLogger.warn(
        {
          workspaceId: conversation.workspaceId,
          error: serializeErrorForLog(knowledgeSummaryError),
        },
        "failed to summarize workspace searchable knowledge before agent run",
      );
    }

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
      const modelProfile = payload.modelProfileId
        ? await resolveUsableModelProfileById(payload.modelProfileId, db)
        : await resolveDefaultUsableModelProfile(db);
      let prompt = payload.prompt;

      try {
        const attachments = await loadConversationAttachmentPromptAttachments(
          payload.conversationId,
        );
        prompt = buildConversationPromptWithAttachments({
          prompt,
          attachments,
        });
      } catch (attachmentContextError) {
        jobLogger.warn(
          {
            error: serializeErrorForLog(attachmentContextError),
          },
          "failed to hydrate conversation attachment preload context",
        );
      }

      const agentResponse = await runAgentResponse(
        {
          prompt,
          workspaceId: conversation.workspaceId,
          conversationId: payload.conversationId,
          modelProfile,
          agentSessionId: conversation.agentSessionId,
          agentWorkdir: conversation.agentWorkdir,
          searchableKnowledge,
        },
        {
          onAssistantStatus: async ({
            phase,
            statusText,
            toolName,
            toolUseId,
            taskId,
          }) => {
            await publishAssistantStatus({
              phase,
              statusText,
              toolName: toolName ?? null,
              toolUseId: toolUseId ?? null,
              taskId: taskId ?? null,
            });
          },
          onToolStarted: async ({ toolInput, toolName, toolUseId }) => {
            jobLogger.debug(
              {
                toolName,
                toolUseId,
              },
              "assistant tool started",
            );
            await publishToolMessage({
              toolName,
              state: TOOL_TIMELINE_STATE.STARTED,
              toolInput,
              toolUseId,
              nextStatusText: `正在调用工具 ${toolName}...`,
            });
          },
          onToolProgress: async ({
            toolName,
            toolUseId,
            elapsedSeconds,
            statusText,
            taskId,
          }) => {
            await publishToolProgress({
              toolName,
              toolUseId,
              elapsedSeconds,
              statusText,
              taskId: taskId ?? null,
            });
          },
          onToolFinished: async ({ toolInput, toolName, toolResponse, toolUseId }) => {
            jobLogger.debug(
              {
                toolName,
                toolUseId,
              },
              "assistant tool completed",
            );
            await publishToolMessage({
              toolName,
              state: TOOL_TIMELINE_STATE.COMPLETED,
              toolInput,
              toolResponse,
              toolUseId,
              nextStatusText: "工具执行完成，正在整理结果...",
              clearActiveTool: true,
            });
          },
          onToolFailed: async ({ toolInput, toolName, toolUseId, error }) => {
            jobLogger.warn(
              {
                toolName,
                toolUseId,
                error,
              },
              "assistant tool failed",
            );
            await publishToolMessage({
              toolName,
              state: TOOL_TIMELINE_STATE.FAILED,
              error: normalizeConversationFailureMessage(error),
              toolInput,
              toolUseId,
              nextStatusText: `工具 ${toolName} 失败，正在继续处理...`,
              clearActiveTool: true,
            });
          },
          onAssistantDelta: async ({ fullText }) => {
            await persistAssistantDelta(toDisplayInlineCitationText(fullText), {
              phase: ASSISTANT_STREAM_PHASE.DRAFTING,
              statusText: "助手正在生成回答...",
            });
          },
          onAssistantThinkingDelta: async ({ fullThinking }) => {
            await persistAssistantThinking(fullThinking);
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

      const materializedAnswer = materializeAssistantAnswer({
        rawText: agentResponse.text,
        evidenceRegistry: Array.isArray(agentResponse.citations)
          ? agentResponse.citations
          : [],
      });

      await persistAssistantDelta(materializedAnswer.answerMarkdown, {
        force: true,
        phase: ASSISTANT_STREAM_PHASE.DRAFTING,
        statusText: "助手正在生成回答...",
      });
      await assertAssistantMessageStillStreaming();
      let terminalRunState = finalizeStreamingAssistantRunState(currentRunState);
      await db
        .update(messages)
        .set({
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: materializedAnswer.answerMarkdown,
          structuredJson: terminalRunState,
        })
        .where(eq(messages.id, payload.assistantMessageId));

      const citationRows = await persistMessageCitations({
        assistantMessageId: payload.assistantMessageId,
        workspaceId: conversation.workspaceId,
        citations: materializedAnswer.citations,
      });

      const answerDoneEventId = await publishConversationEvent({
        type: CONVERSATION_STREAM_EVENT.ANSWER_DONE,
        conversation_id: payload.conversationId,
        message_id: payload.assistantMessageId,
        status: MESSAGE_STATUS.COMPLETED,
        content_markdown: materializedAnswer.answerMarkdown,
        structured: terminalRunState,
        citations: citationRows.map((citation) => ({
          id: citation.id,
          anchor_id: citation.anchorId ?? null,
          document_id: citation.documentId ?? null,
          label: citation.label,
          quote_text: citation.quoteText,
          source_scope: citation.sourceScope ?? null,
          library_title: citation.libraryTitle ?? null,
          source_url: citation.sourceUrl ?? null,
          source_domain: citation.sourceDomain ?? null,
          source_title: citation.sourceTitle ?? null,
        })),
      });
      if (answerDoneEventId) {
        terminalRunState = finalizeStreamingAssistantRunState(terminalRunState, {
          streamEventId: answerDoneEventId,
        });
        await updateStreamingAssistantSnapshot({
          assistantMessageId: payload.assistantMessageId,
          structuredJson: terminalRunState,
        });
      }
      currentRunState = terminalRunState;

      jobLogger.info(
        {
          modelName: modelProfile.modelName,
          modelProfileId: modelProfile.id,
          workspaceId: conversation.workspaceId,
          sessionId: agentResponse.sessionId ?? null,
          citationCount: materializedAnswer.citations.length,
          outputLength: materializedAnswer.answerMarkdown.length,
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

    const failureResult = await failConversationResponseRun({
      conversationId: payload.conversationId,
      assistantMessageId: payload.assistantMessageId,
      runId: payload.runId,
      error,
    });

    jobLogger.error(
      {
        modelProfileId: payload.modelProfileId ?? null,
        workspaceId: conversation.workspaceId,
        errorMessage:
          failureResult.errorMessage ?? normalizeConversationFailureMessage(error),
        error: serializeErrorForLog(error),
      },
      "conversation response job failed",
    );
  } finally {
    unregisterActiveRun();
  }
}

export async function processConversationResponseJob(
  payload: ConversationResponseJobPayload,
) {
  return withConsumerSpan(
    {
      carrier: payload.traceContext,
      name: "conversation.respond process",
      attributes: {
        "messaging.destination.name": "conversation.respond",
        "messaging.operation": "process",
        "messaging.system": "bullmq",
        assistant_message_id: payload.assistantMessageId,
        conversation_id: payload.conversationId,
      },
    },
    async () => processConversationResponseJobWithContext(payload),
  );
}
