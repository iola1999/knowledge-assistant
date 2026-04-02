import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import { auth } from "@/auth";
import { conversations, getDb, messages, workspaces } from "@anchordesk/db";
import { applyConversationRespondingState } from "@/lib/api/conversations";

export async function loadWorkspaceShellData(workspaceId: string) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const user = session?.user;
  const db = getDb();

  const [workspaceList, workspaceRows, conversationList, respondingConversationRows] =
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
        updatedAt: conversations.updatedAt,
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
  ]);

  const workspace = workspaceRows[0];
  if (!workspace || !user) {
    notFound();
  }

  return {
    workspace,
    workspaceList,
    conversationList: applyConversationRespondingState({
      conversations: conversationList,
      respondingConversationIds: respondingConversationRows.map(
        (conversation) => conversation.conversationId,
      ),
    }),
    user,
  };
}
