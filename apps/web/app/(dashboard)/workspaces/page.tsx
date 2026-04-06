import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  conversations,
  documents,
  getDb,
  workspaces,
} from "@anchordesk/db";

import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { WorkspacesHeaderActions } from "@/components/workspaces/workspaces-header-actions";
import { auth } from "@/auth";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { formatRelativeWorkspaceActivity } from "@/lib/api/workspace-overview";
import { cn, ui, workspaceTileStyles } from "@/lib/ui";

function getWorkspaceBadgeLabel(title: string) {
  const normalized = title.trim();
  return Array.from(normalized)[0] ?? "空";
}

export default async function WorkspacesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const db = getDb();

  const workspaceList = userId
    ? await db
        .select()
        .from(workspaces)
        .where(
          and(eq(workspaces.userId, userId), isNull(workspaces.archivedAt)),
        )
        .orderBy(desc(workspaces.updatedAt), desc(workspaces.createdAt))
    : [];
  const workspaceIds = workspaceList.map((workspace) => workspace.id);
  const [conversationRows, documentRows] =
    workspaceIds.length > 0
      ? await Promise.all([
          db
            .select({
              workspaceId: conversations.workspaceId,
              updatedAt: conversations.updatedAt,
            })
            .from(conversations)
            .where(inArray(conversations.workspaceId, workspaceIds)),
          db
            .select({
              workspaceId: documents.workspaceId,
              updatedAt: documents.updatedAt,
            })
            .from(documents)
            .where(inArray(documents.workspaceId, workspaceIds)),
        ])
      : [[], []];
  const username = session?.user?.username ?? "";
  const canAccessSystemSettings = isSuperAdmin(session?.user);
  const conversationCountByWorkspace = new Map<string, number>();
  const documentCountByWorkspace = new Map<string, number>();
  const latestActivityByWorkspace = new Map<string, Date>();

  for (const workspace of workspaceList) {
    latestActivityByWorkspace.set(workspace.id, workspace.updatedAt);
  }

  for (const conversation of conversationRows) {
    conversationCountByWorkspace.set(
      conversation.workspaceId,
      (conversationCountByWorkspace.get(conversation.workspaceId) ?? 0) + 1,
    );

    const latestActivity = latestActivityByWorkspace.get(
      conversation.workspaceId,
    );
    if (!latestActivity || conversation.updatedAt > latestActivity) {
      latestActivityByWorkspace.set(
        conversation.workspaceId,
        conversation.updatedAt,
      );
    }
  }

  for (const document of documentRows) {
    if (!document.workspaceId) {
      continue;
    }

    documentCountByWorkspace.set(
      document.workspaceId,
      (documentCountByWorkspace.get(document.workspaceId) ?? 0) + 1,
    );

    const latestActivity = latestActivityByWorkspace.get(document.workspaceId);
    if (!latestActivity || document.updatedAt > latestActivity) {
      latestActivityByWorkspace.set(document.workspaceId, document.updatedAt);
    }
  }

  return (
    <div className={cn(ui.page, "gap-8")}>
      <EditorialPageHeader
        eyebrow="工作空间"
        title="工作空间"
        description="围绕项目、客户或研究主题组织资料与对话。"
        actions={(
          <WorkspacesHeaderActions
            initialUser={{
              name: session?.user?.name,
              username,
            }}
            canAccessSystemSettings={canAccessSystemSettings}
          />
        )}
      />

      {/* Workspace grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaceList.map((workspace) => {
          const badgeLabel = getWorkspaceBadgeLabel(workspace.title);
          const conversationCount =
            conversationCountByWorkspace.get(workspace.id) ?? 0;
          const documentCount = documentCountByWorkspace.get(workspace.id) ?? 0;
          const latestActivity =
            latestActivityByWorkspace.get(workspace.id) ?? workspace.updatedAt;

          return (
            <Link
              key={workspace.id}
              href={`/workspaces/${workspace.id}`}
              className={workspaceTileStyles()}
            >
              <div>
                <span className="grid size-10 place-items-center rounded-[18px] bg-app-surface-strong text-[18px] font-semibold text-app-accent">
                  {badgeLabel}
                </span>
              </div>
              <div className="space-y-2">
                <strong>{workspace.title}</strong>
              </div>
              <div className="grid gap-2 border-t border-app-border pt-3 text-[13px] text-app-muted">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span>{conversationCount} 条会话</span>
                  <span>{documentCount} 份资料</span>
                </div>
                <div>
                  最后活跃 {formatRelativeWorkspaceActivity(latestActivity)}
                </div>
              </div>
            </Link>
          );
        })}

        <Link
          href="/workspaces/new"
          className={workspaceTileStyles({ variant: "create" })}
        >
          <div>
            <span className="grid size-10 place-items-center rounded-[18px] bg-app-surface-strong text-[18px] font-semibold text-app-accent">
              +
            </span>
          </div>
          <div className="space-y-2">
            <strong>新建工作空间</strong>
          </div>
        </Link>
      </div>
    </div>
  );
}
