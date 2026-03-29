import Link from "next/link";
import type { ReactNode } from "react";
import { CONVERSATION_STATUS, type ConversationStatus } from "@knowledge-assistant/contracts";

import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import { workspaceBranding } from "@/lib/branding";
import { cn, navItemStyles, ui } from "@/lib/ui";
import { WorkspaceBreadcrumbSwitcher } from "@/components/workspaces/workspace-breadcrumb-switcher";
import { WorkspaceConversationSidebarItem } from "@/components/workspaces/workspace-conversation-sidebar-item";
import { WorkspaceUserPanel } from "@/components/workspaces/workspace-user-panel";

type WorkspaceListItem = {
  id: string;
  title: string;
};

type ConversationListItem = {
  id: string;
  title: string;
  status: ConversationStatus;
  updatedAt: Date;
};

type WorkspaceShellProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
  activeConversationId?: string;
  activeView?: "chat" | "settings" | "knowledge-base";
  contentScroll?: "shell" | "contained";
  currentUser: {
    name?: string | null;
    username: string;
  };
  breadcrumbs: Array<{ label: string; href?: string }>;
  topActions?: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({
  workspace,
  workspaces,
  conversations,
  activeConversationId,
  activeView = "chat",
  contentScroll = "shell",
  currentUser,
  breadcrumbs,
  topActions,
  children,
}: WorkspaceShellProps) {
  const activeConversations = conversations.filter(
    (item) => item.status === CONVERSATION_STATUS.ACTIVE,
  );
  const archivedConversations = conversations.filter(
    (item) => item.status === CONVERSATION_STATUS.ARCHIVED,
  );
  const canAccessSystemSettings = isSuperAdminUsername(currentUser.username);
  const workspaceNavLink = (selected: boolean) =>
    cn(
      "flex min-h-10 items-center justify-between rounded-xl px-3 text-sm transition",
      selected
        ? navItemStyles({ selected: true })
        : "bg-white/68 text-app-muted-strong hover:bg-white hover:text-app-text",
    );

  return (
    <div className="grid min-h-screen grid-cols-1 xl:h-[100dvh] xl:grid-cols-[258px_minmax(0,1fr)] xl:overflow-hidden">
      <aside className="flex min-h-screen flex-col gap-4 border-b border-app-border bg-app-sidebar px-4 py-4 xl:min-h-0 xl:h-[100dvh] xl:border-r xl:border-b-0 xl:overflow-hidden">
        <div className="grid gap-4">
          <Link href="/workspaces" className="group flex items-center gap-3 px-1.5 py-1 transition-opacity hover:opacity-80">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-app-primary font-serif text-[15px] font-semibold text-app-primary-contrast shadow-sm">
              {workspaceBranding.badgeLabel}
            </span>
            <span className="grid gap-0.5">
              <strong className="font-serif text-[15px] leading-tight text-app-text">
                {workspaceBranding.productName}
              </strong>
              <span className="text-[11px] font-medium tracking-wide text-app-muted-strong">
                {workspaceBranding.productTagline}
              </span>
            </span>
          </Link>
          <div className="px-1">
            <Link
              href={`/workspaces/${workspace.id}`}
              className={cn(
                "group flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-[14px] font-medium transition-all",
                activeView === "chat" && !activeConversationId
                  ? "border-app-primary bg-app-primary text-app-primary-contrast shadow-sm"
                  : "border-app-border-strong bg-white text-app-text shadow-sm hover:bg-app-surface-soft hover:shadow-soft",
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:scale-110">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新建会话
            </Link>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-app-border/60 pt-4">
          <div className="flex items-center justify-between px-1.5">
            <span className="text-[12px] font-medium text-app-muted-strong">历史会话</span>
            <span className="grid min-w-5 place-items-center rounded-[5px] bg-white/80 px-1 py-0.5 text-[10px] font-semibold text-app-muted shadow-sm">
              {activeConversations.length}
            </span>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-auto">
            {activeConversations.map((conversation) => (
              <WorkspaceConversationSidebarItem
                key={conversation.id}
                workspaceId={workspace.id}
                conversation={conversation}
                activeConversationId={activeConversationId}
              />
            ))}
            {activeConversations.length === 0 ? (
              <div className={ui.muted}>当前还没有历史会话。</div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 rounded-[18px] border border-app-border bg-white/58 p-2 shadow-soft">
          <nav className="grid gap-1">
            <Link
              href={`/workspaces/${workspace.id}/settings`}
              className={workspaceNavLink(activeView === "settings")}
            >
              空间设置
            </Link>
            <Link
              href={`/workspaces/${workspace.id}/knowledge-base`}
              className={workspaceNavLink(activeView === "knowledge-base")}
            >
              资料库
            </Link>
          </nav>
          {archivedConversations.length > 0 ? (
            <div className="px-3 pt-1 text-[11px] text-app-muted">
              已归档 {archivedConversations.length}
            </div>
          ) : null}
        </div>

        <WorkspaceUserPanel
          initialUser={currentUser}
          canAccessSystemSettings={canAccessSystemSettings}
        />
      </aside>

      <section className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 px-6 py-5 xl:min-h-0 xl:overflow-hidden md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-app-border px-0.5 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-app-muted" aria-label="Breadcrumb">
            {breadcrumbs.map((item, index) => {
              const isWorkspaceCrumb = item.label === workspace.title;

              return (
                <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                  {isWorkspaceCrumb ? (
                    <WorkspaceBreadcrumbSwitcher
                      workspace={workspace}
                      workspaces={workspaces}
                      activeView={activeView}
                    />
                  ) : item.href ? (
                    <Link href={item.href}>{item.label}</Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {index < breadcrumbs.length - 1 ? <span> / </span> : null}
                </span>
              );
            })}
          </div>

          {topActions ? <div className="flex flex-wrap items-center gap-2">{topActions}</div> : null}
        </header>

        <div
          className={cn(
            "min-h-0 min-w-0",
            contentScroll === "shell"
              ? "overflow-y-auto overscroll-contain pr-1"
              : "overflow-hidden",
          )}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
