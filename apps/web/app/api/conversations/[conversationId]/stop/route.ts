import { and, desc, eq } from "drizzle-orm";

import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";
import { conversations, getDb, messages } from "@anchordesk/db";

import { auth } from "@/auth";
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
    requestLogger.warn("unauthorized conversation stop request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    requestLogger.warn({ userId }, "conversation not found for stop request");
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const db = getDb();
  const [streamingAssistant] = await db
    .select({
      id: messages.id,
      contentMarkdown: messages.contentMarkdown,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, MESSAGE_ROLE.ASSISTANT),
        eq(messages.status, MESSAGE_STATUS.STREAMING),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!streamingAssistant) {
    return Response.json(
      { error: "当前没有正在生成的回答。" },
      { status: 400 },
    );
  }

  const stoppedContent = streamingAssistant.contentMarkdown.trim() || "已停止生成";
  const [assistantMessage] = await db
    .update(messages)
    .set({
      status: MESSAGE_STATUS.COMPLETED,
      contentMarkdown: stoppedContent,
      structuredJson: null,
    })
    .where(
      and(
        eq(messages.id, streamingAssistant.id),
        eq(messages.conversationId, conversationId),
        eq(messages.status, MESSAGE_STATUS.STREAMING),
      ),
    )
    .returning({
      id: messages.id,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      structuredJson: messages.structuredJson,
    });

  if (!assistantMessage) {
    return Response.json(
      { error: "回答已结束，无需停止。" },
      { status: 409 },
    );
  }

  await db
    .update(conversations)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId))
    .returning({
      id: conversations.id,
    });

  requestLogger.info(
    {
      workspaceId: conversation.workspaceId,
      userId,
      assistantMessageId: assistantMessage.id,
    },
    "conversation assistant stop requested",
  );

  return Response.json(
    {
      assistantMessage: {
        ...assistantMessage,
        role: MESSAGE_ROLE.ASSISTANT,
      },
    },
    { status: 200 },
  );
}
