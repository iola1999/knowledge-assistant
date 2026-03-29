import Link from "next/link";
import type { ReactNode } from "react";
import { CONVERSATION_STATUS, type ConversationStatus } from "@knowledge-assistant/contracts";

import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import { workspaceBranding } from "@/lib/branding";
import { cn, ui } from "@/lib/ui";
import { WorkspaceBreadcrumbSwitcher } from "@/components/workspaces/workspace-breadcrumb-switcher";
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

function formatSidebarDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

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
        ? "bg-white text-app-text shadow-soft"
        : "bg-white/68 text-app-muted-strong hover:bg-white hover:text-app-text",
    );

  return (
    <div className="grid min-h-screen grid-cols-1 xl:h-[100dvh] xl:grid-cols-[258px_minmax(0,1fr)] xl:overflow-hidden">
      <aside className="flex min-h-screen flex-col gap-4 border-b border-app-border bg-app-sidebar px-4 py-4 xl:min-h-0 xl:h-[100dvh] xl:border-r xl:border-b-0 xl:overflow-hidden">
        <div className="grid gap-3">
          <Link href="/workspaces" className="flex items-center gap-3 px-1 py-1">
            <span className="grid size-9 place-items-center rounded-xl bg-app-accent/12 font-serif text-sm font-semibold text-app-accent">
              {workspaceBranding.badgeLabel}
            </span>
            <span className="grid gap-0.5">
              <strong className="font-serif text-[1.02rem]">
                {workspaceBranding.productName}
              </strong>
              <span className="text-[10px] uppercase tracking-[0.16em] text-app-muted">
                {workspaceBranding.productTagline}
              </span>
            </span>
          </Link>
          <Link
            href={`/workspaces/${workspace.id}`}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
              activeView === "chat" && !activeConversationId
                ? "border-app-border-strong bg-white text-app-text shadow-soft"
                : "border-app-border bg-white/80 text-app-text hover:bg-white",
            )}
          >
            <span className="grid size-[18px] place-items-center rounded-full bg-app-surface-strong text-[15px] leading-none">
              +
            </span>
            新建问题
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-app-border pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">
            <span>历史会话</span>
            <span className="text-[11px] normal-case tracking-normal">
              {activeConversations.length}
            </span>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-auto">
            {activeConversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/workspaces/${workspace.id}?conversationId=${conversation.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm transition",
                  conversation.id === activeConversationId
                    ? "border-app-border bg-white shadow-soft"
                    : "border-transparent bg-transparent hover:border-app-border hover:bg-white/70",
                )}
              >
                <div className="grid min-w-0 gap-1">
                  <strong className="truncate text-sm">{conversation.title}</strong>
                  <span className={cn(ui.muted, "text-xs leading-5")}>继续当前会话</span>
                </div>
                <span className="shrink-0 text-xs text-app-muted">
                  {formatSidebarDate(conversation.updatedAt)}
                </span>
              </Link>
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
              设置
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
