import { asc, eq, inArray } from "drizzle-orm";
import { CONVERSATION_STATUS } from "@anchordesk/contracts";

import { conversations, getDb, messageCitations, messages } from "@anchordesk/db";

import { auth } from "@/auth";
import {
  conversationPatchSchema,
  normalizeConversationTitle,
} from "@/lib/api/conversations";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

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
  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const messageIds = conversationMessages.map((message) => message.id);
  const citations =
    messageIds.length > 0
      ? await db
          .select()
          .from(messageCitations)
          .where(inArray(messageCitations.messageId, messageIds))
          .orderBy(asc(messageCitations.ordinal))
      : [];

  return Response.json({
    conversation,
    messages: conversationMessages,
    citations,
  });
}

export async function PATCH(
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

  const body = await request.json().catch(() => null);
  const parsed = conversationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid conversation patch" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [updatedConversation] = await db
    .update(conversations)
    .set({
      title:
        parsed.data.title !== undefined
          ? normalizeConversationTitle(parsed.data.title, conversation.title)
          : conversation.title,
      status: parsed.data.status ?? conversation.status,
      archivedAt:
        parsed.data.status === CONVERSATION_STATUS.ARCHIVED
          ? new Date()
          : parsed.data.status === CONVERSATION_STATUS.ACTIVE
            ? null
            : undefined,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId))
    .returning();

  return Response.json({ conversation: updatedConversation });
}

export async function DELETE(
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
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  return Response.json({ ok: true, workspaceId: conversation.workspaceId });
}
