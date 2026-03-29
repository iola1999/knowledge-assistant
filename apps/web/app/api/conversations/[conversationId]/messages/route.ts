import { and, desc, eq } from "drizzle-orm";
import {
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  normalizeConversationFailureMessage,
} from "@knowledge-assistant/contracts";

import {
  conversationAttachments,
  conversations,
  getDb,
  messages,
} from "@knowledge-assistant/db";
import { enqueueConversationResponse } from "@knowledge-assistant/queue";

import { auth } from "@/auth";
import { buildConversationPrompt } from "@/lib/api/workspace-prompt";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

function buildConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

export async function GET(
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
  const items = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt));

  return Response.json({ messages: items.reverse() });
}

export async function POST(
  request: Request,
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

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    draftUploadId?: string;
  };
  const content = String(body.content ?? "").trim();
  const draftUploadId = String(body.draftUploadId ?? "").trim() || null;
  if (!content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: MESSAGE_ROLE.USER,
      status: MESSAGE_STATUS.COMPLETED,
      contentMarkdown: content,
    })
    .returning();

  const existingMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(3);

  if (existingMessages.length <= 1) {
    await db
      .update(conversations)
      .set({
        title: buildConversationTitle(content),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: MESSAGE_ROLE.ASSISTANT,
      status: MESSAGE_STATUS.STREAMING,
      contentMarkdown: "",
    })
    .returning();

  if (draftUploadId) {
    await db
      .update(conversationAttachments)
      .set({
        conversationId,
        draftUploadId: null,
        claimedAt: new Date(),
        expiresAt: null,
      })
      .where(
        and(
          eq(conversationAttachments.workspaceId, conversation.workspaceId),
          eq(conversationAttachments.draftUploadId, draftUploadId),
        ),
      );
  }

  try {
    await enqueueConversationResponse({
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      draftUploadId,
      prompt: buildConversationPrompt({
        content,
        workspacePrompt: conversation.workspacePrompt,
      }),
    });

    return Response.json(
      {
        userMessage,
        assistantMessage,
      },
      { status: 201 },
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
      .where(eq(messages.id, assistantMessage.id));

    return Response.json(
      {
        agentError: message,
        userMessage,
        assistantMessage,
      },
      { status: 201 },
    );
  }
}
