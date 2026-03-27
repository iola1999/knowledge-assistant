import { asc, eq, inArray } from "drizzle-orm";

import { getDb, messageCitations, messages } from "@law-doc/db";

import { auth } from "@/auth";
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
