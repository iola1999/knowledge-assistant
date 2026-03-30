import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  conversations,
  documents,
  getDb,
  workspaces,
} from "@anchordesk/db";

import { AnchorDeskLogo, PlusIcon } from "@/components/icons";
import { auth } from "@/auth";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import { formatRelativeWorkspaceActivity } from "@/lib/api/workspace-overview";
import { workspaceBranding } from "@/lib/branding";
import { buttonStyles, cn, ui, workspaceTileStyles } from "@/lib/ui";

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
  const canAccessSystemSettings = isSuperAdminUsername(username);
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
    <div className={cn(ui.page, "gap-8 py-10")}>
      {/* Branded header row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-app-primary shadow-sm">
            <AnchorDeskLogo className="size-[18px] text-app-primary-contrast" />
          </span>
          <div className="grid gap-0.5">
            <strong className="font-serif text-[17px] leading-tight text-app-text">
              {workspaceBranding.productName}
            </strong>
            <span className="text-[12px] text-app-muted">
              {workspaceList.length > 0
                ? `${workspaceList.length} 个工作空间`
                : "开始创建你的第一个工作空间"}
            </span>
          </div>
        </div>

        <div className={ui.actions}>
          <Link
            href="/account"
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            账号与安全
          </Link>
          {canAccessSystemSettings ? (
            <Link
              href="/settings"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              系统设置
            </Link>
          ) : null}
          <Link
            href="/workspaces/new"
            className={cn(buttonStyles({ size: "sm" }), "gap-2")}
          >
            <PlusIcon className="size-3.5" strokeWidth={2.5} />
            新建工作空间
          </Link>
        </div>
      </div>

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
                <span className="grid size-12 place-items-center rounded-2xl bg-app-surface-strong text-xl font-semibold text-app-accent">
                  {badgeLabel}
                </span>
              </div>
              <div className="space-y-2">
                <strong>{workspace.title}</strong>
              </div>
              <div className="grid gap-3 border-t border-app-border pt-4 text-sm text-app-muted">
                <div className="flex flex-wrap items-center gap-3">
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
            <span className="grid size-12 place-items-center rounded-2xl bg-app-surface-strong text-xl font-semibold text-app-accent">
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
