import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE } from "@anchordesk/contracts";

import {
  conversationAttachments,
  conversations,
  documentJobs,
  documentVersions,
  documents,
  getDb,
  messageCitations,
  messages,
  workspaces,
} from "@anchordesk/db";

import { auth } from "@/auth";
import { Composer } from "@/components/chat/composer";
import { ConversationPageActions } from "@/components/chat/conversation-page-actions";
import { ConversationSession } from "@/components/chat/conversation-session";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { resolveComposerAttachmentStatus } from "@/lib/api/conversation-attachments";
import { groupAssistantProcessMessages } from "@/lib/api/conversation-process";
import { chooseWorkspaceConversationWithMeta } from "@/lib/api/conversations";
import { ui } from "@/lib/ui";

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

  const [workspaceList, workspaceRows, conversationList] = await Promise.all([
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
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId))
      .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt)),
  ]);

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
  const activeAssistantMessage =
    [...chatThread]
      .reverse()
      .find((message) => message.role === MESSAGE_ROLE.ASSISTANT) ?? null;
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
            documentId: documents.id,
            documentVersionId: documentVersions.id,
            sourceFilename: documents.sourceFilename,
            jobId: documentJobs.id,
            jobStatus: documentJobs.status,
            stage: documentJobs.stage,
            progress: documentJobs.progress,
            errorMessage: documentJobs.errorMessage,
          })
          .from(conversationAttachments)
          .innerJoin(documents, eq(documents.id, conversationAttachments.documentId))
          .innerJoin(
            documentVersions,
            eq(documentVersions.id, conversationAttachments.documentVersionId),
          )
          .leftJoin(
            documentJobs,
            eq(documentJobs.documentVersionId, conversationAttachments.documentVersionId),
          )
          .where(eq(conversationAttachments.conversationId, activeConversation.id))
          .orderBy(asc(conversationAttachments.createdAt))
      : [];

  return (
    <WorkspaceShell
      workspace={{
        id: workspace.id,
        title: workspace.title,
      }}
      workspaces={workspaceList}
      conversations={conversationList}
      activeConversationId={activeConversation?.id}
      currentUser={{
        name: user.name,
        username: user.username,
      }}
      contentScroll="contained"
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title },
      ]}
      topActions={
        activeConversation ? (
          <ConversationPageActions
            conversationId={activeConversation.id}
            workspaceId={workspaceId}
            conversationTitle={activeConversation.title}
            conversationStatus={activeConversation.status}
            createdAt={activeConversation.createdAt}
            updatedAt={activeConversation.updatedAt}
            creatorLabel={`${user.username}（你）`}
            messageCount={chatThread.length}
            attachmentCount={attachmentRows.length}
          />
        ) : undefined
      }
    >
      {activeConversation ? (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1080px] flex-col overflow-visible">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 pr-1 min-[720px]:py-5">
            <ConversationSession
              conversationId={activeConversation.id}
              workspaceId={workspaceId}
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
              }))}
            />
          </div>

          <div className="shrink-0 border-app-border/60 pb-4 pt-3 min-[720px]:pb-6 min-[720px]:pt-4">
            <Composer
              conversationId={activeConversation.id}
              workspaceId={workspaceId}
              variant="stage"
              rows={1}
              placeholder="继续追问、要求整理成结论，或让助手基于资料补充论证"
              submitLabel="继续"
              className="border-transparent bg-transparent p-0 shadow-none backdrop-blur-0"
              textareaClassName="bg-transparent"
              initialAttachments={attachmentRows.map((attachment) => ({
                id: attachment.id,
                attachmentId: attachment.id,
                documentId: attachment.documentId,
                documentVersionId: attachment.documentVersionId,
                documentJobId: attachment.jobId ?? undefined,
                sourceFilename: attachment.sourceFilename,
                status: resolveComposerAttachmentStatus({
                  jobStatus: attachment.jobStatus ?? null,
                  parseStage: attachment.stage ?? null,
                }),
                progress: attachment.progress ?? 0,
                stage: attachment.stage ?? null,
                errorMessage: attachment.errorMessage ?? null,
              }))}
            />
          </div>
        </div>
      ) : (
        <div className="grid min-h-[calc(100dvh-156px)] place-items-center px-1 py-6 min-[720px]:min-h-[calc(100vh-180px)] min-[720px]:px-2 min-[720px]:py-8">
          <div className="grid w-full max-w-[860px] gap-6 text-center">
            <div className="grid justify-items-center gap-3">
              <p className={ui.eyebrow}>New Question</p>
              <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-app-text md:text-[40px]">
                {workspace.title}
              </h1>
            </div>

            <Composer
              workspaceId={workspaceId}
              variant="stage"
              rows={2}
              placeholder="例如：请基于本空间资料，总结新版发布流程的关键变化，并列出仍需补充的信息"
              submitLabel="开始对话"
              className="mx-auto w-full max-w-[920px] text-left"
              textareaClassName="bg-transparent"
              initialAttachments={[]}
            />
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
