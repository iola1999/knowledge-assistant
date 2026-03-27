import { asc, eq } from "drizzle-orm";

import { getDb, messages } from "@law-doc/db";

import { auth } from "@/auth";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  const conversationMessages = await db
    .select({
      id: messages.id,
      role: messages.role,
      status: messages.status,
      contentMarkdown: messages.contentMarkdown,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      for (const message of conversationMessages) {
        controller.enqueue(
          encoder.encode(
            encodeSse("message", {
              id: message.id,
              role: message.role,
              status: message.status,
              content_markdown: message.contentMarkdown,
              created_at: message.createdAt,
            }),
          ),
        );
      }

      const lastMessage = conversationMessages[conversationMessages.length - 1];
      controller.enqueue(
        encoder.encode(
          encodeSse("answer_done", {
            conversation_id: conversationId,
            message_id: lastMessage?.role === "assistant" ? lastMessage.id : null,
          }),
        ),
      );
      controller.close();
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
