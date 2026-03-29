import { and, desc, eq, ne } from "drizzle-orm";
import {
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  normalizeConversationFailureMessage,
} from "@knowledge-assistant/contracts";
import { conversations, getDb, messageCitations, messages } from "@knowledge-assistant/db";
import { enqueueConversationResponse } from "@knowledge-assistant/queue";

import { auth } from "@/auth";
import { findRetryableConversationTurn } from "@/lib/api/conversation-retry";
import { buildConversationPrompt } from "@/lib/api/workspace-prompt";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
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

  const retryableTurn = findRetryableConversationTurn(recentChatMessages);
  if (!retryableTurn) {
    return Response.json(
      { error: "当前没有可重试的失败回答。" },
      { status: 400 },
    );
  }

  await db.delete(messageCitations).where(eq(messageCitations.messageId, retryableTurn.assistantMessageId));

  await db
    .update(messages)
    .set({
      status: MESSAGE_STATUS.STREAMING,
      contentMarkdown: "",
      structuredJson: null,
    })
    .where(eq(messages.id, retryableTurn.assistantMessageId));

  try {
    await enqueueConversationResponse({
      conversationId,
      userMessageId: retryableTurn.userMessageId,
      assistantMessageId: retryableTurn.assistantMessageId,
      prompt: buildConversationPrompt({
        content: retryableTurn.promptContent,
        workspacePrompt: conversation.workspacePrompt,
      }),
    });

    await db
      .update(conversations)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    return Response.json(
      {
        assistantMessageId: retryableTurn.assistantMessageId,
        userMessageId: retryableTurn.userMessageId,
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
      .where(eq(messages.id, retryableTurn.assistantMessageId));

    return Response.json(
      { error: `重新生成失败：${message}` },
      { status: 500 },
    );
  }
}
