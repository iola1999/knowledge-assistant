import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  CONVERSATION_STREAM_EVENT,
  finalizeStreamingAssistantRunState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  readStreamingAssistantRunState,
  type MessageStatus,
  type ConversationStreamEvent,
} from "@anchordesk/contracts";
import { getDb, messageCitations, messages } from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import {
  createRedisClient,
  readConversationStreamEvents,
} from "@anchordesk/queue";

import { auth } from "@/auth";
import {
  buildExpiredAssistantRunPayload,
  shouldExpireStreamingAssistantMessage,
} from "@/lib/api/assistant-run-expiration";
import { cancelStreamingAssistantRun } from "@/lib/api/conversation-run-control";
import {
  buildAssistantStatusStreamEvent,
  buildAssistantThinkingStreamEvent,
  buildAssistantDeltaStreamEvent,
  buildAssistantTerminalStreamEvent,
  buildToolMessageStreamEvent,
} from "@/lib/api/conversation-stream";
import { createSseWriter } from "@/lib/api/sse-writer";
import { requireOwnedConversation } from "@/lib/guards/resources";
import { buildRequestLogContext, logger, resolveRequestId } from "@/lib/server/logger";

export const runtime = "nodejs";

function buildAssistantStatusSignature(event: Extract<
  ConversationStreamEvent,
  { type: typeof CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS }
>) {
  return [
    event.status,
    event.phase ?? "",
    event.status_text ?? "",
    event.tool_name ?? "",
    event.tool_use_id ?? "",
    event.task_id ?? "",
  ].join("|");
}

async function expireStreamingAssistantMessage(input: {
  conversationId: string;
  assistantMessage: {
    id: string;
    status: MessageStatus;
    contentMarkdown: string;
    structuredJson?: Record<string, unknown> | null;
    createdAt: Date;
  };
}) {
  if (!shouldExpireStreamingAssistantMessage(input.assistantMessage)) {
    return null;
  }

  const db = getDb();
  const payload = buildExpiredAssistantRunPayload();
  const runState = readStreamingAssistantRunState(
    input.assistantMessage.structuredJson ?? null,
  );
  const failedAssistantState = {
    ...payload.assistant,
    structuredJson: {
      ...finalizeStreamingAssistantRunState(input.assistantMessage.structuredJson ?? null),
      ...payload.assistant.structuredJson,
    },
  };
  const failedToolState = {
    ...payload.tool,
    structuredJson: {
      ...payload.tool.structuredJson,
      assistant_message_id: input.assistantMessage.id,
      assistant_run_id: runState?.run_id ?? null,
    },
  };

  const [assistantMessage] = await db
    .update(messages)
    .set(failedAssistantState)
    .where(
      and(
        eq(messages.id, input.assistantMessage.id),
        eq(messages.conversationId, input.conversationId),
        eq(messages.status, MESSAGE_STATUS.STREAMING),
        runState
          ? sql`${messages.structuredJson}->>'run_lease_expires_at' = ${runState.run_lease_expires_at}`
          : and(
              isNull(messages.structuredJson),
              eq(messages.createdAt, input.assistantMessage.createdAt),
            ),
      ),
    )
    .returning({
      id: messages.id,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      structuredJson: messages.structuredJson,
      createdAt: messages.createdAt,
    });

  if (!assistantMessage) {
    return null;
  }

  const [toolMessage] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: MESSAGE_ROLE.TOOL,
      ...failedToolState,
    })
    .returning({
      id: messages.id,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      createdAt: messages.createdAt,
      structuredJson: messages.structuredJson,
    });

  return {
    assistantMessage: {
      id: assistantMessage.id,
      status: assistantMessage.status,
      contentMarkdown: assistantMessage.contentMarkdown,
      structuredJson:
        (assistantMessage.structuredJson as Record<string, unknown> | null | undefined) ??
        null,
      createdAt: assistantMessage.createdAt,
    },
    toolMessage: toolMessage
      ? {
          id: toolMessage.id,
          status: toolMessage.status,
          contentMarkdown: toolMessage.contentMarkdown,
          createdAt: toolMessage.createdAt,
          structuredJson:
            (toolMessage.structuredJson as Record<string, unknown> | null | undefined) ?? null,
        }
      : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const assistantMessageId = new URL(request.url).searchParams.get("assistantMessageId");
  const requestId = resolveRequestId(request);
  const requestLogger = logger.child({
    ...buildRequestLogContext(request, requestId),
    conversationId,
    assistantMessageId: assistantMessageId ?? null,
  });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    requestLogger.warn("unauthorized conversation stream request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    requestLogger.warn({ userId }, "conversation not found for stream request");
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!assistantMessageId) {
    requestLogger.warn(
      {
        workspaceId: conversation.workspaceId,
        userId,
      },
      "conversation stream request missing assistant message id",
    );
    return Response.json({ error: "assistantMessageId is required" }, { status: 400 });
  }
  const streamingAssistantMessageId = assistantMessageId;

  const db = getDb();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const writer = createSseWriter(controller, encoder);
      const redis = createRedisClient();
      const emittedMessageIds = new Set<string>();
      let lastAssistantContent = "";
      let lastAssistantThinking = "";
      let lastAssistantStatus = "";
      let terminalEventType: ConversationStreamEvent["type"] | null = null;
      let currentRunId: string | null = null;
      let streamCursor =
        request.headers.get("last-event-id")?.trim() ||
        new URL(request.url).searchParams.get("cursor")?.trim() ||
        null;

      requestLogger.info(
        {
          workspaceId: conversation.workspaceId,
          userId,
        },
        "conversation stream opened",
      );

      function enqueueEvent(event: ConversationStreamEvent, id?: string | null) {
        return writer.event(event.type, event, id);
      }

      function applyLiveEventState(event: ConversationStreamEvent) {
        if (event.type === CONVERSATION_STREAM_EVENT.TOOL_MESSAGE) {
          emittedMessageIds.add(event.message_id);
          return;
        }

        if (event.type === CONVERSATION_STREAM_EVENT.ANSWER_DELTA) {
          lastAssistantContent = event.delta_text
            ? `${lastAssistantContent}${event.delta_text}`
            : event.content_markdown;
          return;
        }

        if (event.type === CONVERSATION_STREAM_EVENT.ASSISTANT_THINKING_DELTA) {
          lastAssistantThinking = event.delta_text
            ? `${lastAssistantThinking}${event.delta_text}`
            : event.thinking_text;
          return;
        }

        if (event.type === CONVERSATION_STREAM_EVENT.ASSISTANT_STATUS) {
          lastAssistantStatus = buildAssistantStatusSignature(event);
        }
      }

      async function syncFromDatabase() {
        const [assistantMessage] = await db
          .select({
            id: messages.id,
            status: messages.status,
            contentMarkdown: messages.contentMarkdown,
            structuredJson: messages.structuredJson,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(
            and(
              eq(messages.id, streamingAssistantMessageId),
              eq(messages.conversationId, conversationId),
            ),
          )
          .limit(1);

        const expiredRun =
          assistantMessage && assistantMessage.status === MESSAGE_STATUS.STREAMING
            ? await expireStreamingAssistantMessage({
                conversationId,
                assistantMessage: {
                  id: assistantMessage.id,
                  status: assistantMessage.status,
                  contentMarkdown: assistantMessage.contentMarkdown,
                  structuredJson:
                    (assistantMessage.structuredJson as
                      | Record<string, unknown>
                      | null
                      | undefined) ?? null,
                  createdAt: assistantMessage.createdAt,
                },
              })
            : null;

        const effectiveAssistantMessage = expiredRun?.assistantMessage
          ? {
              id: expiredRun.assistantMessage.id,
              status: expiredRun.assistantMessage.status,
              contentMarkdown: expiredRun.assistantMessage.contentMarkdown,
              structuredJson: expiredRun.assistantMessage.structuredJson,
              createdAt: expiredRun.assistantMessage.createdAt,
            }
            : assistantMessage
              ? {
                  id: assistantMessage.id,
                  status: assistantMessage.status,
                  contentMarkdown: assistantMessage.contentMarkdown,
                  structuredJson:
                    (assistantMessage.structuredJson as
                      | Record<string, unknown>
                      | null
                      | undefined) ?? null,
                  createdAt: assistantMessage.createdAt,
                }
              : null;
        const effectiveRunState = readStreamingAssistantRunState(
          effectiveAssistantMessage?.structuredJson ?? null,
        );
        currentRunId = effectiveRunState?.run_id ?? null;

        if (expiredRun) {
          requestLogger.warn(
            {
              workspaceId: conversation.workspaceId,
              toolMessageCount: emittedMessageIds.size,
              assistantStatusBeforeExpire: assistantMessage?.status ?? null,
            },
            "conversation stream expired a stale streaming assistant run",
          );

          try {
            await cancelStreamingAssistantRun({
              conversationId,
              assistantMessageId: expiredRun.assistantMessage.id,
              runId: effectiveRunState?.run_id ?? null,
              reason: "stale_stream_expired",
            });
          } catch (error) {
            requestLogger.warn(
              {
                workspaceId: conversation.workspaceId,
                toolMessageCount: emittedMessageIds.size,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
              "failed to propagate stale streaming run cancellation",
            );
          }
        }

        if (expiredRun?.toolMessage && !emittedMessageIds.has(expiredRun.toolMessage.id)) {
          emittedMessageIds.add(expiredRun.toolMessage.id);
          if (!enqueueEvent(buildToolMessageStreamEvent(expiredRun.toolMessage))) {
            return true;
          }
        }

        const toolMessageFilters = [
          eq(messages.conversationId, conversationId),
          eq(messages.role, MESSAGE_ROLE.TOOL),
          sql`${messages.structuredJson}->>'assistant_message_id' = ${streamingAssistantMessageId}`,
        ];
        if (effectiveRunState?.run_id) {
          toolMessageFilters.push(
            sql`${messages.structuredJson}->>'assistant_run_id' = ${effectiveRunState.run_id}`,
          );
        }

        const toolMessages = await db
          .select({
            id: messages.id,
            status: messages.status,
            contentMarkdown: messages.contentMarkdown,
            createdAt: messages.createdAt,
            structuredJson: messages.structuredJson,
          })
          .from(messages)
          .where(and(...toolMessageFilters))
          .orderBy(asc(messages.createdAt));

        for (const message of toolMessages) {
          if (emittedMessageIds.has(message.id)) {
            continue;
          }

          emittedMessageIds.add(message.id);
          if (
            !enqueueEvent(
              buildToolMessageStreamEvent({
                id: message.id,
                status: message.status,
                contentMarkdown: message.contentMarkdown,
                createdAt: message.createdAt,
                structuredJson:
                  (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
              }),
            )
          ) {
            return true;
          }
        }

        const assistantStatusEvent =
          effectiveAssistantMessage?.status === MESSAGE_STATUS.STREAMING
            ? buildAssistantStatusStreamEvent({
                conversationId,
                assistantMessage: {
                  id: effectiveAssistantMessage.id,
                  status: effectiveAssistantMessage.status,
                  contentMarkdown: effectiveAssistantMessage.contentMarkdown,
                  structuredJson: effectiveAssistantMessage.structuredJson,
                },
              })
            : null;

        if (assistantStatusEvent) {
          const signature = buildAssistantStatusSignature(assistantStatusEvent);
          if (signature !== lastAssistantStatus) {
            lastAssistantStatus = signature;
            if (!enqueueEvent(assistantStatusEvent)) {
              return true;
            }
          }
        }

        const assistantThinkingEvent =
          effectiveAssistantMessage?.status === MESSAGE_STATUS.STREAMING
            ? buildAssistantThinkingStreamEvent({
                conversationId,
                assistantMessage: {
                  id: effectiveAssistantMessage.id,
                  status: effectiveAssistantMessage.status,
                  contentMarkdown: effectiveAssistantMessage.contentMarkdown,
                  structuredJson: effectiveAssistantMessage.structuredJson,
                },
              })
            : null;

        if (
          assistantThinkingEvent &&
          assistantThinkingEvent.thinking_text !== lastAssistantThinking
        ) {
          lastAssistantThinking = assistantThinkingEvent.thinking_text;
          if (!enqueueEvent(assistantThinkingEvent)) {
            return true;
          }
        }

        if (
          effectiveAssistantMessage &&
          effectiveAssistantMessage.status === MESSAGE_STATUS.STREAMING &&
          effectiveAssistantMessage.contentMarkdown !== lastAssistantContent
        ) {
          lastAssistantContent = effectiveAssistantMessage.contentMarkdown;
          if (
            !enqueueEvent(
              buildAssistantDeltaStreamEvent({
                conversationId,
                assistantMessage: {
                  id: effectiveAssistantMessage.id,
                  status: effectiveAssistantMessage.status,
                  contentMarkdown: effectiveAssistantMessage.contentMarkdown,
                  structuredJson: effectiveAssistantMessage.structuredJson,
                },
              }),
            )
          ) {
            return true;
          }
        }

        if (!streamCursor) {
          streamCursor = effectiveRunState?.stream_event_id ?? "0-0";
        }

        const assistantCitations =
          effectiveAssistantMessage &&
          (effectiveAssistantMessage.status === MESSAGE_STATUS.COMPLETED ||
            effectiveAssistantMessage.status === MESSAGE_STATUS.FAILED)
            ? await db
                .select({
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
                })
                .from(messageCitations)
                .where(eq(messageCitations.messageId, effectiveAssistantMessage.id))
                .orderBy(asc(messageCitations.ordinal))
            : [];

        const terminalEvent = buildAssistantTerminalStreamEvent({
          conversationId,
          assistantMessage: effectiveAssistantMessage
            ? {
                id: effectiveAssistantMessage.id,
                status: effectiveAssistantMessage.status,
                contentMarkdown: effectiveAssistantMessage.contentMarkdown,
                structuredJson: effectiveAssistantMessage.structuredJson,
              }
            : null,
          citations: assistantCitations,
        });

        if (terminalEvent) {
          terminalEventType = terminalEvent.type;
          requestLogger.info(
            {
              workspaceId: conversation.workspaceId,
              toolMessageCount: emittedMessageIds.size,
              terminalEventType,
            },
            "conversation stream completed from database snapshot",
          );
          enqueueEvent(terminalEvent);
          writer.close();
          return true;
        }

        return false;
      }

      try {
        if (await syncFromDatabase()) {
          return;
        }

        while (!request.signal.aborted) {
          if (!currentRunId) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (!writer.comment("keepalive")) {
              return;
            }

            if (await syncFromDatabase()) {
              return;
            }
            continue;
          }

          const events = await readConversationStreamEvents({
            assistantMessageId: streamingAssistantMessageId,
            runId: currentRunId,
            afterId: streamCursor ?? "0-0",
            blockMs: 5000,
            count: 128,
            redis,
          });

          if (events.length === 0) {
            if (!writer.comment("keepalive")) {
              return;
            }

            if (await syncFromDatabase()) {
              return;
            }
            continue;
          }

          for (const record of events) {
            streamCursor = record.id;
            applyLiveEventState(record.event);
            if (!enqueueEvent(record.event, record.id)) {
              return;
            }

            if (
              record.event.type === CONVERSATION_STREAM_EVENT.ANSWER_DONE ||
              record.event.type === CONVERSATION_STREAM_EVENT.RUN_FAILED
            ) {
              terminalEventType = record.event.type;
              requestLogger.info(
                {
                  workspaceId: conversation.workspaceId,
                  toolMessageCount: emittedMessageIds.size,
                  terminalEventType,
                },
                "conversation stream completed from live events",
              );
              writer.close();
              return;
            }
          }
        }
      } catch (error) {
        requestLogger.error(
          {
            workspaceId: conversation.workspaceId,
            toolMessageCount: emittedMessageIds.size,
            error: serializeErrorForLog(error),
          },
          "conversation stream failed",
        );
        if (!writer.isClosed()) {
          writer.error(error);
        }
        return;
      } finally {
        if (!terminalEventType) {
          requestLogger.debug(
            {
              workspaceId: conversation.workspaceId,
              toolMessageCount: emittedMessageIds.size,
            },
            "conversation stream aborted by client",
          );
        }

        await redis.quit().catch(() => null);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
