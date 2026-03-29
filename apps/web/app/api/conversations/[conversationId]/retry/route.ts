import { and, desc, eq, ne } from "drizzle-orm";
import {
  buildStreamingAssistantRunState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  normalizeConversationFailureMessage,
} from "@anchordesk/contracts";
import { conversations, getDb, messageCitations, messages } from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import { enqueueConversationResponse } from "@anchordesk/queue";

import { auth } from "@/auth";
import { findRegeneratableConversationTurn } from "@/lib/api/conversation-retry";
import { buildConversationPrompt } from "@/lib/api/workspace-prompt";
import { requireOwnedConversation } from "@/lib/guards/resources";
import { buildRequestLogContext, logger, resolveRequestId } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const requestId = resolveRequestId(request);
  const requestLogger = logger.child({
    ...buildRequestLogContext(request, requestId),
    conversationId,
  });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    requestLogger.warn("unauthorized conversation retry request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    requestLogger.warn({ userId }, "conversation not found for retry request");
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const db = getDb();
  const recentChatMessages = (
    await db
      .select({
        id: messages.id,
        role: messages.role,
        status: messages.status,
        contentMarkdown: messages.contentMarkdown,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), ne(messages.role, MESSAGE_ROLE.TOOL)))
      .orderBy(desc(messages.createdAt))
      .limit(4)
  ).reverse();

  const regeneratableTurn = findRegeneratableConversationTurn(recentChatMessages);
  if (!regeneratableTurn) {
    requestLogger.warn(
      {
        workspaceId: conversation.workspaceId,
        userId,
      },
      "conversation retry requested without a failed assistant turn",
    );
    return Response.json(
      { error: "当前没有可重新生成的回答。" },
      { status: 400 },
    );
  }

  await db
    .delete(messageCitations)
    .where(eq(messageCitations.messageId, regeneratableTurn.assistantMessageId));

  await db
    .update(messages)
    .set({
      status: MESSAGE_STATUS.STREAMING,
      contentMarkdown: "",
      structuredJson: buildStreamingAssistantRunState(),
    })
    .where(eq(messages.id, regeneratableTurn.assistantMessageId));

  try {
    const queueJob = await enqueueConversationResponse({
      conversationId,
      userMessageId: regeneratableTurn.userMessageId,
      assistantMessageId: regeneratableTurn.assistantMessageId,
      prompt: buildConversationPrompt({
        content: regeneratableTurn.promptContent,
        workspacePrompt: conversation.workspacePrompt,
      }),
    });

    await db
      .update(conversations)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    requestLogger.info(
      {
        workspaceId: conversation.workspaceId,
        userId,
        userMessageId: regeneratableTurn.userMessageId,
        assistantMessageId: regeneratableTurn.assistantMessageId,
        queueJobId: queueJob.id ?? null,
        contentLength: regeneratableTurn.promptContent.length,
      },
      "conversation retry enqueued",
    );

    return Response.json(
      {
        assistantMessageId: regeneratableTurn.assistantMessageId,
        userMessageId: regeneratableTurn.userMessageId,
      },
      { status: 202 },
    );
  } catch (error) {
    const message = normalizeConversationFailureMessage(error);

    await db
      .update(messages)
      .set({
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: `Agent 处理失败：${message}`,
        structuredJson: {
          agent_error: message,
        },
      })
      .where(eq(messages.id, regeneratableTurn.assistantMessageId));

    requestLogger.error(
      {
        workspaceId: conversation.workspaceId,
        userId,
        userMessageId: regeneratableTurn.userMessageId,
        assistantMessageId: regeneratableTurn.assistantMessageId,
        errorMessage: message,
        error: serializeErrorForLog(error),
      },
      "conversation retry enqueue failed",
    );

    return Response.json(
      { error: `重新生成失败：${message}` },
      { status: 500 },
    );
  }
}
