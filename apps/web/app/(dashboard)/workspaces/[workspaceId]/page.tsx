import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE } from "@knowledge-assistant/contracts";

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
} from "@knowledge-assistant/db";

import { auth } from "@/auth";
import { Composer } from "@/components/chat/composer";
import { ConversationPageActions } from "@/components/chat/conversation-page-actions";
import { ConversationSession } from "@/components/chat/conversation-session";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { resolveComposerAttachmentStatus } from "@/lib/api/conversation-attachments";
import { chooseWorkspaceConversationWithMeta } from "@/lib/api/conversations";
import { cn, ui } from "@/lib/ui";

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
  const toolTimelineMessages = thread.filter((message) => message.role === MESSAGE_ROLE.TOOL);
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
          />
        ) : undefined
      }
    >
      {activeConversation ? (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[980px] flex-col overflow-hidden">
          <header className="grid shrink-0 gap-2 border-b border-app-border/70 pb-5">
            <p className={ui.eyebrow}>Conversation</p>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-app-text md:text-[34px]">
              {activeConversation.title}
            </h1>
            <p className={cn(ui.muted, "max-w-[62ch]")}>
              保持当前会话上下文，继续围绕这组资料追问、整理结论或补充论证。
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-6 pr-1 md:py-8">
            <ConversationSession
              conversationId={activeConversation.id}
              workspaceId={workspaceId}
              assistantMessageId={activeAssistantMessage?.id ?? null}
              assistantStatus={
                activeAssistantMessage?.role === MESSAGE_ROLE.ASSISTANT
                  ? activeAssistantMessage.status
                  : null
              }
              initialTimelineMessages={toolTimelineMessages.map((message) => ({
                id: message.id,
                status: message.status,
                contentMarkdown: message.contentMarkdown,
                createdAt: message.createdAt.toISOString(),
                structuredJson:
                  (message.structuredJson as Record<string, unknown> | null | undefined) ?? null,
              }))}
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

          <div className="shrink-0 border-t border-app-border/60 pb-2 pt-4 md:pb-3">
            <Composer
              conversationId={activeConversation.id}
              workspaceId={workspaceId}
              variant="stage"
              rows={4}
              placeholder="继续追问、要求整理成结论，或让助手基于资料补充论证"
              submitLabel="发送"
              className="border-transparent bg-transparent p-0 shadow-none backdrop-blur-0"
              textareaClassName="min-h-[132px] bg-white/92"
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
        <div className="grid min-h-[calc(100vh-180px)] place-items-center px-2 py-8">
          <div className="grid w-full max-w-[860px] gap-6 text-center">
            <div className="grid justify-items-center gap-3">
              <p className={ui.eyebrow}>New Question</p>
              <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-app-text md:text-[40px]">
                {workspace.title}
              </h1>
              <p className={cn(ui.muted, "max-w-[58ch]")}>
                从这里开始新的研究问题。首条消息发送后，系统会自动创建会话，并把后续记录沉淀到左侧历史中。
              </p>
            </div>

            <Composer
              workspaceId={workspaceId}
              variant="stage"
              rows={8}
              title="输入 / 粘贴你的问题"
              description="告诉助手你想分析什么、整理什么，或希望它基于当前空间资料完成什么任务。"
              placeholder="例如：请基于本空间资料，总结新版发布流程的关键变化，并列出仍需补充的信息"
              submitLabel="开始对话"
              className="text-left shadow-card"
              textareaClassName="min-h-[220px] bg-white/90"
              initialAttachments={[]}
            />
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
