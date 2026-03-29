import type { Metadata } from "next";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE } from "@knowledge-assistant/contracts";

import {
  citationAnchors,
  conversationShares,
  conversations,
  getDb,
  messageCitations,
  messages,
  workspaces,
} from "@knowledge-assistant/db";

import { ConversationSession } from "@/components/chat/conversation-session";
import { groupAssistantProcessMessages } from "@/lib/api/conversation-process";
import { cn, ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "共享会话",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const db = getDb();

  const rows = await db
    .select({
      conversationId: conversations.id,
      title: conversations.title,
    })
    .from(conversationShares)
    .innerJoin(conversations, eq(conversations.id, conversationShares.conversationId))
    .innerJoin(workspaces, eq(workspaces.id, conversations.workspaceId))
    .where(
      and(
        eq(conversationShares.shareToken, shareToken),
        isNull(conversationShares.revokedAt),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  const sharedConversation = rows[0];
  if (!sharedConversation) {
    notFound();
  }

  const thread = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, sharedConversation.conversationId))
    .orderBy(asc(messages.createdAt));

  const chatThread = thread.filter((message) => message.role !== MESSAGE_ROLE.TOOL);
  const activeAssistantMessage =
    [...chatThread]
      .reverse()
      .find((message) => message.role === MESSAGE_ROLE.ASSISTANT) ?? null;
  const citations =
    chatThread.length > 0
      ? await db
          .select({
            id: messageCitations.id,
            messageId: messageCitations.messageId,
            label: messageCitations.label,
          })
          .from(messageCitations)
          .innerJoin(citationAnchors, eq(citationAnchors.id, messageCitations.anchorId))
          .where(
            inArray(
              messageCitations.messageId,
              chatThread.map((message) => message.id),
            ),
          )
          .orderBy(asc(messageCitations.ordinal))
      : [];

  return (
    <main className={cn(ui.pageNarrow, "min-h-screen max-w-[1280px] gap-5 py-10")}>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <p className={ui.eyebrow}>Shared Conversation</p>
          <h1 className="max-w-[720px]">{sharedConversation.title}</h1>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1080px]">
        <ConversationSession
          conversationId={sharedConversation.conversationId}
          assistantMessageId={activeAssistantMessage?.id ?? null}
          assistantStatus={
            activeAssistantMessage?.role === MESSAGE_ROLE.ASSISTANT
              ? activeAssistantMessage.status
              : null
          }
          initialTimelineMessagesByAssistant={groupAssistantProcessMessages(
            thread.map((message) => ({
              id: message.id,
              role: message.role,
              status: message.status,
              contentMarkdown: message.contentMarkdown,
              createdAt: message.createdAt,
              structuredJson:
                (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
            })),
          )}
          initialMessages={chatThread.map((message) => ({
            id: message.id,
            role: message.role,
            status: message.status,
            contentMarkdown: message.contentMarkdown,
            structuredJson:
              (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
          }))}
          initialCitations={citations.map((citation) => ({
            id: citation.id,
            messageId: citation.messageId,
            label: citation.label,
          }))}
          streamEnabled={false}
          sourceLinksEnabled={false}
          readOnly
          emptyStateMessage="当前会话还没有可分享的消息"
        />
      </section>
    </main>
  );
}
