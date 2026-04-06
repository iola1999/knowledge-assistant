import type { Metadata } from "next";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE } from "@anchordesk/contracts";

import {
  conversationShares,
  conversations,
  getDb,
  messageCitations,
  messages,
  workspaces,
} from "@anchordesk/db";

import { ConversationSession } from "@/components/chat/conversation-session";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { groupAssistantProcessMessages } from "@/lib/api/conversation-process";
import { workspaceBranding } from "@/lib/branding";

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
            anchorId: messageCitations.anchorId,
            documentId: messageCitations.documentId,
            label: messageCitations.label,
            quoteText: messageCitations.quoteText,
            sourceScope: messageCitations.sourceScope,
            libraryTitle: messageCitations.libraryTitleSnapshot,
            sourceUrl: messageCitations.sourceUrl,
            sourceDomain: messageCitations.sourceDomain,
            sourceTitle: messageCitations.sourceTitle,
          })
          .from(messageCitations)
          .where(
            inArray(
              messageCitations.messageId,
              chatThread.map((message) => message.id),
            ),
          )
          .orderBy(asc(messageCitations.ordinal))
      : [];

  return (
    <PublicPageShell
      productName={workspaceBranding.productName}
      pageLabel="共享会话"
      title={
        <h1 className="max-w-[720px] text-[1.35rem] font-semibold leading-[1.28] tracking-[-0.02em] text-app-text">
          {sharedConversation.title}
        </h1>
      }
      footer={
        <p className="text-[11px] text-app-muted">
          本页面由 {workspaceBranding.productName} 生成，仅供查看；外部网页链接可打开，本地资料引用不提供跳转
        </p>
      }
    >
      <section className="w-full">
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
            anchorId: citation.anchorId,
            documentId: citation.documentId,
            label: citation.label,
            quoteText: citation.quoteText,
            sourceScope: citation.sourceScope,
            libraryTitle: citation.libraryTitle,
            sourceUrl: citation.sourceUrl,
            sourceDomain: citation.sourceDomain,
            sourceTitle: citation.sourceTitle,
          }))}
          streamEnabled={false}
          documentLinksEnabled={false}
          readOnly
          emptyStateMessage="当前会话还没有可分享的消息"
        />
      </section>
    </PublicPageShell>
  );
}
