import { and, desc, eq, ilike, inArray } from "drizzle-orm";

import {
  citationAnchors,
  conversations,
  documents,
  getDb,
  messageCitations,
  messages,
} from "@law-doc/db";

import { auth } from "@/auth";
import { requestAgentResponse } from "@/lib/api/agent-runtime";
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

  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = String(body.content ?? "").trim();
  if (!content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const db = getDb();
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "user",
      status: "completed",
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

  try {
    const agentResponse = await requestAgentResponse({
      prompt: content,
      workspaceId: conversation.workspaceId,
      conversationId,
      mode: conversation.mode,
      agentSessionId: conversation.agentSessionId,
      agentWorkdir: conversation.agentWorkdir,
    });

    await db
      .update(conversations)
      .set({
        agentSessionId: agentResponse.sessionId ?? conversation.agentSessionId,
        agentWorkdir: agentResponse.workdir ?? conversation.agentWorkdir,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    const [assistantMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        status: "completed",
        contentMarkdown: agentResponse.text,
        structuredJson: {
          mode: conversation.mode,
        },
      })
      .returning();

    const returnedCitations = Array.isArray(agentResponse.citations)
      ? agentResponse.citations
      : [];
    const citationMap = new Map(
      returnedCitations.map((citation) => [citation.anchor_id, citation]),
    );
    const requestedAnchorIds = Array.from(citationMap.keys());

    const anchorRows =
      requestedAnchorIds.length > 0
        ? await db
            .select({
              anchorId: citationAnchors.id,
              documentId: citationAnchors.documentId,
              documentVersionId: citationAnchors.documentVersionId,
              documentPath: citationAnchors.documentPath,
              pageNo: citationAnchors.pageNo,
              blockId: citationAnchors.blockId,
              quoteText: citationAnchors.anchorText,
            })
            .from(citationAnchors)
            .where(
              and(
                eq(citationAnchors.workspaceId, conversation.workspaceId),
                inArray(citationAnchors.id, requestedAnchorIds),
              ),
            )
        : [];

    const finalAnchors =
      anchorRows.length > 0
        ? anchorRows
        : await db
            .select({
              anchorId: citationAnchors.id,
              documentId: citationAnchors.documentId,
              documentVersionId: citationAnchors.documentVersionId,
              documentPath: citationAnchors.documentPath,
              pageNo: citationAnchors.pageNo,
              blockId: citationAnchors.blockId,
              quoteText: citationAnchors.anchorText,
            })
            .from(citationAnchors)
            .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
            .where(
              and(
                eq(citationAnchors.workspaceId, conversation.workspaceId),
                ilike(citationAnchors.anchorText, `%${content}%`),
              ),
            )
            .orderBy(desc(citationAnchors.createdAt))
            .limit(3);

    if (finalAnchors.length > 0) {
      await db.insert(messageCitations).values(
        finalAnchors.map((anchor, index) => {
          const runtimeCitation = citationMap.get(anchor.anchorId);
          const label =
            runtimeCitation?.label ||
            [anchor.documentPath, `第${anchor.pageNo}页`].filter(Boolean).join(" · ");

          return {
            messageId: assistantMessage.id,
            anchorId: anchor.anchorId,
            documentId: anchor.documentId,
            documentVersionId: anchor.documentVersionId,
            documentPath: anchor.documentPath,
            pageNo: anchor.pageNo,
            blockId: anchor.blockId,
            quoteText: runtimeCitation?.quote_text || anchor.quoteText,
            label,
            ordinal: index,
          };
        }),
      );
    }

    return Response.json(
      {
        userMessage,
        assistantMessage,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent runtime failed";

    const [assistantMessage] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "assistant",
        status: "failed",
        contentMarkdown: `Agent 处理失败：${message}`,
        structuredJson: {
          mode: conversation.mode,
          agent_error: message,
        },
      })
      .returning();

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
