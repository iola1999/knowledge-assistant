import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE } from "@knowledge-assistant/contracts";

import {
  conversations,
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
        <div className="mx-auto w-full max-w-[1040px]">
          <div className={cn(ui.panelLarge, "grid min-h-[calc(100vh-132px)] content-start gap-5 p-6")}>
            <header className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <p className={ui.eyebrow}>Conversation</p>
                <h1>{activeConversation.title}</h1>
                <p className={ui.muted}>
                  当前会话持续沉淀在 {workspace.title} 里，引用会继续指向该空间下的资料。
                </p>
              </div>
            </header>

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

            <div className="mt-auto">
              <Composer
                conversationId={activeConversation.id}
                workspaceId={workspaceId}
                variant="stage"
                rows={4}
                title="继续提问"
                description="上下文会沿用本轮会话，不需要重复描述已经上传的资料。"
                placeholder="继续追问、要求整理成结论，或让助手基于资料补充论证。"
                submitLabel="发送"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[calc(100vh-158px)] place-items-center">
          <div className={cn(ui.panelLarge, "w-full max-w-[820px] gap-5 px-8 py-8")}>
            <div className="grid justify-items-center gap-3 text-center">
              <p className={ui.eyebrow}>New Question</p>
              <h1>{workspace.title}</h1>
            </div>

            <div className="new-question-stage-composer">
              <Composer
                workspaceId={workspaceId}
                variant="stage"
                rows={8}
                title="输入 / 粘贴你的问题"
                description="提交第一轮问题后，系统会自动创建会话，并把后续回答沉淀到左侧历史里。"
                placeholder="例如：请基于本空间资料，总结新版发布流程的关键变化，并列出仍需补充的信息。"
                submitLabel="开始对话"
              />
            </div>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
