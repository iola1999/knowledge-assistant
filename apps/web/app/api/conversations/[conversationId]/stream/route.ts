import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  CONVERSATION_STREAM_EVENT,
  DEFAULT_CONVERSATION_STREAM_POLL_INTERVAL_MS,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  readStreamingAssistantRunState,
  type MessageStatus,
  type ConversationStreamEvent,
} from "@anchordesk/contracts";
import { getDb, messageCitations, messages } from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";

import { auth } from "@/auth";
import {
  buildExpiredAssistantRunPayload,
  shouldExpireStreamingAssistantMessage,
} from "@/lib/api/assistant-run-expiration";
import {
  buildAssistantDeltaStreamEvent,
  buildAssistantTerminalStreamEvent,
  buildToolMessageStreamEvent,
} from "@/lib/api/conversation-stream";
import { requireOwnedConversation } from "@/lib/guards/resources";
import { buildRequestLogContext, logger, resolveRequestId } from "@/lib/server/logger";

export const runtime = "nodejs";

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const [assistantMessage] = await db
    .update(messages)
    .set(payload.assistant)
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
      ...payload.tool,
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

  const db = getDb();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emittedMessageIds = new Set<string>();
      let lastAssistantContent = "";
      let terminalEventType: ConversationStreamEvent["type"] | null = null;

      requestLogger.info(
        {
          workspaceId: conversation.workspaceId,
          userId,
        },
        "conversation stream opened",
      );

      try {
        while (!request.signal.aborted) {
          const toolMessages = await db
            .select({
              id: messages.id,
              status: messages.status,
              contentMarkdown: messages.contentMarkdown,
              createdAt: messages.createdAt,
              structuredJson: messages.structuredJson,
            })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                eq(messages.role, MESSAGE_ROLE.TOOL),
              ),
            )
            .orderBy(asc(messages.createdAt));

          for (const message of toolMessages) {
            if (emittedMessageIds.has(message.id)) {
              continue;
            }

            emittedMessageIds.add(message.id);
            const payload = buildToolMessageStreamEvent({
              id: message.id,
              status: message.status,
              contentMarkdown: message.contentMarkdown,
              createdAt: message.createdAt,
              structuredJson:
                (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
            });

            controller.enqueue(
              encoder.encode(
                encodeSse(CONVERSATION_STREAM_EVENT.TOOL_MESSAGE, payload),
              ),
            );
          }

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
                eq(messages.id, assistantMessageId),
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

          if (expiredRun) {
            requestLogger.warn(
              {
                workspaceId: conversation.workspaceId,
                toolMessageCount: emittedMessageIds.size,
                assistantStatusBeforeExpire: assistantMessage?.status ?? null,
              },
              "conversation stream expired a stale streaming assistant run",
            );
          }

          if (expiredRun?.toolMessage && !emittedMessageIds.has(expiredRun.toolMessage.id)) {
            emittedMessageIds.add(expiredRun.toolMessage.id);
            controller.enqueue(
              encoder.encode(
                encodeSse(
                  CONVERSATION_STREAM_EVENT.TOOL_MESSAGE,
                  buildToolMessageStreamEvent(expiredRun.toolMessage),
                ),
              ),
            );
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

          if (
            effectiveAssistantMessage &&
            effectiveAssistantMessage.status === MESSAGE_STATUS.STREAMING &&
            effectiveAssistantMessage.contentMarkdown !== lastAssistantContent
          ) {
            lastAssistantContent = effectiveAssistantMessage.contentMarkdown;
            controller.enqueue(
              encoder.encode(
                encodeSse(
                  CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
                  buildAssistantDeltaStreamEvent({
                    conversationId,
                    assistantMessage: {
                      id: effectiveAssistantMessage.id,
                      status: effectiveAssistantMessage.status,
                      contentMarkdown: effectiveAssistantMessage.contentMarkdown,
                      structuredJson: effectiveAssistantMessage.structuredJson,
                    },
                  }),
                ),
              ),
            );
          }

          if (terminalEvent) {
            terminalEventType = terminalEvent.type;
            requestLogger.info(
              {
                workspaceId: conversation.workspaceId,
                toolMessageCount: emittedMessageIds.size,
                terminalEventType,
              },
              "conversation stream completed",
            );
            controller.enqueue(
              encoder.encode(
                encodeSse(terminalEvent.type, terminalEvent satisfies ConversationStreamEvent),
              ),
            );
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(": keepalive\n\n"));
          await sleep(DEFAULT_CONVERSATION_STREAM_POLL_INTERVAL_MS);
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
        controller.error(error);
        return;
      }

      if (!terminalEventType) {
        requestLogger.debug(
          {
            workspaceId: conversation.workspaceId,
            toolMessageCount: emittedMessageIds.size,
          },
          "conversation stream aborted by client",
        );
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
