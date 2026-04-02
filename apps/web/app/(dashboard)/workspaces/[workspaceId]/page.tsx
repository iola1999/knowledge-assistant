import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import {
  conversationAttachments,
  conversations,
  documents,
  getDb,
  listEnabledModelProfiles,
  messageCitations,
  messages,
  workspaces,
} from "@anchordesk/db";

import { auth } from "@/auth";
import { WorkspaceChatView } from "@/components/chat/workspace-chat-view";
import { groupAssistantProcessMessages } from "@/lib/api/conversation-process";
import {
  applyConversationRespondingState,
  chooseWorkspaceConversationWithMeta,
} from "@/lib/api/conversations";
import {
  applyConversationMessageAttachments,
  readConversationMessageAttachments,
  type ConversationChatMessage,
  type ConversationMessageAttachment,
} from "@/lib/api/conversation-session";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { workspaceId } = await params;
  const { conversationId: requestedConversationId } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const user = session?.user;
  const db = getDb();

  const [workspaceList, workspaceRows, conversationListRows, respondingConversationRows, availableModelProfiles] =
    await Promise.all([
    db
      .select({
        id: workspaces.id,
        title: workspaces.title,
      })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(desc(workspaces.updatedAt), desc(workspaces.createdAt)),
    db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, workspaceId),
          eq(workspaces.userId, userId),
          isNull(workspaces.archivedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        status: conversations.status,
        modelProfileId: conversations.modelProfileId,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt)),
    db
      .select({
        conversationId: messages.conversationId,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.workspaceId, workspaceId),
          eq(messages.role, MESSAGE_ROLE.ASSISTANT),
          eq(messages.status, MESSAGE_STATUS.STREAMING),
        ),
      ),
    listEnabledModelProfiles(db),
  ]);

  const conversationList = applyConversationRespondingState({
    conversations: conversationListRows,
    respondingConversationIds: respondingConversationRows.map(
      (conversation) => conversation.conversationId,
    ),
  });

  const workspace = workspaceRows[0];
  if (!workspace || !user) {
    notFound();
  }

  const activeConversation = chooseWorkspaceConversationWithMeta(
    conversationList,
    requestedConversationId,
  );

  const thread = activeConversation
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, activeConversation.id))
        .orderBy(asc(messages.createdAt))
    : [];
  const chatThread = thread.filter((message) => message.role !== MESSAGE_ROLE.TOOL);
  const citations =
    chatThread.length > 0
      ? await db
          .select()
          .from(messageCitations)
          .where(inArray(messageCitations.messageId, chatThread.map((message) => message.id)))
          .orderBy(asc(messageCitations.ordinal))
      : [];
  const attachmentRows =
    activeConversation
      ? await db
          .select({
            id: conversationAttachments.id,
            documentId: conversationAttachments.documentId,
            documentVersionId: conversationAttachments.documentVersionId,
            sourceFilename: documents.sourceFilename,
          })
          .from(conversationAttachments)
          .innerJoin(documents, eq(documents.id, conversationAttachments.documentId))
          .where(eq(conversationAttachments.conversationId, activeConversation.id))
          .orderBy(asc(conversationAttachments.createdAt))
      : [];

  const initialMessages: ConversationChatMessage[] = chatThread.map((message) => ({
    id: message.id,
    role: message.role,
    status: message.status,
    contentMarkdown: message.contentMarkdown,
    structuredJson:
      (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
  }));
  const legacyAttachmentSnapshots: ConversationMessageAttachment[] = attachmentRows.map(
    (attachment) => ({
      attachmentId: attachment.id,
      documentId: attachment.documentId,
      documentVersionId: attachment.documentVersionId,
      sourceFilename: attachment.sourceFilename,
    }),
  );
  const firstUserMessageIndex = initialMessages.findIndex(
    (message) => message.role === MESSAGE_ROLE.USER,
  );

  if (
    firstUserMessageIndex >= 0 &&
    legacyAttachmentSnapshots.length > 0 &&
    readConversationMessageAttachments(initialMessages[firstUserMessageIndex]?.structuredJson)
      .length === 0
  ) {
    initialMessages[firstUserMessageIndex] = applyConversationMessageAttachments({
      attachments: legacyAttachmentSnapshots,
      message: initialMessages[firstUserMessageIndex]!,
    });
  }

  return (
    <WorkspaceChatView
      workspace={{
        id: workspace.id,
        title: workspace.title,
      }}
      workspaces={workspaceList}
      initialConversations={conversationList}
      currentUser={{
        name: user.name,
        username: user.username,
        isSuperAdmin: user.isSuperAdmin,
      }}
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title },
      ]}
      workspaceId={workspaceId}
      activeConversation={
        activeConversation
          ? {
              id: activeConversation.id,
              title: activeConversation.title,
              status: activeConversation.status,
              isResponding: activeConversation.isResponding,
              modelProfileId: activeConversation.modelProfileId,
              createdAt: activeConversation.createdAt,
              updatedAt: activeConversation.updatedAt,
              messageCount: chatThread.length,
              attachmentCount: attachmentRows.length,
            }
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
      initialMessages={initialMessages}
      initialCitations={citations.map((citation) => ({
        id: citation.id,
        messageId: citation.messageId,
        anchorId: citation.anchorId,
        documentId: citation.documentId,
        label: citation.label,
        quoteText: citation.quoteText,
        sourceScope: citation.sourceScope,
        libraryTitle: citation.libraryTitleSnapshot,
        sourceUrl: citation.sourceUrl,
        sourceDomain: citation.sourceDomain,
        sourceTitle: citation.sourceTitle,
      }))}
      availableModelProfiles={availableModelProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        modelName: profile.modelName,
        isDefault: profile.isDefault,
      }))}
      defaultModelProfileId={
        availableModelProfiles.find((profile) => profile.isDefault)?.id ?? null
      }
    />
  );
}
