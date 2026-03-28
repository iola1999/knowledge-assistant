import Link from "next/link";
import type { ReactNode } from "react";

import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import { buttonStyles, cn, ui } from "@/lib/ui";

type WorkspaceListItem = {
  id: string;
  title: string;
};

type ConversationListItem = {
  id: string;
  title: string;
  status: "active" | "archived";
  updatedAt: Date;
};

type WorkspaceShellProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
  activeConversationId?: string;
  activeView?: "chat" | "settings";
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
  currentUser,
  breadcrumbs,
  topActions,
  children,
}: WorkspaceShellProps) {
  const activeConversations = conversations.filter((item) => item.status === "active");
  const archivedConversations = conversations.filter((item) => item.status === "archived");
  const canAccessSystemSettings = isSuperAdminUsername(currentUser.username);
  const displayName = currentUser.name ?? currentUser.username;
  const avatarLabel = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[258px_minmax(0,1fr)]">
      <aside className="flex min-h-screen flex-col gap-4 border-b border-app-border bg-app-sidebar px-4 py-4 xl:border-r xl:border-b-0">
        <div className="grid gap-3">
          <Link href="/workspaces" className="flex items-center gap-3 px-1 py-1">
            <span className="grid size-9 place-items-center rounded-xl bg-app-accent/12 font-serif text-sm font-semibold text-app-accent">
              LA
            </span>
            <span className="grid gap-0.5">
              <strong className="font-serif text-[1.02rem]">Legal AI</strong>
              <span className="text-[10px] uppercase tracking-[0.16em] text-app-muted">
                Assistant Workspace
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

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">
            <span>当前空间</span>
          </div>
          <div className="rounded-[18px] border border-app-border bg-white/60 p-3 shadow-soft">
            <strong className="block text-sm leading-6">{workspace.title}</strong>
            <span className={ui.muted}>顶部导航可切换其他空间</span>
          </div>
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

        <div
          className={cn(
            "grid gap-2 rounded-[18px] border p-3 shadow-soft",
            activeView === "settings"
              ? "border-app-border-strong bg-white/70"
              : "border-app-border bg-white/58",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">
            <span>当前空间设置</span>
            {archivedConversations.length > 0 ? (
              <span className="text-[11px] normal-case tracking-normal">
                已归档 {archivedConversations.length}
              </span>
            ) : null}
          </div>
          <nav className="grid gap-2">
            <Link
              href={`/workspaces/${workspace.id}/settings`}
              className="flex min-h-10 items-center justify-between rounded-xl border border-transparent bg-white/75 px-3 text-sm hover:border-app-border-strong hover:bg-white"
            >
              空间信息
            </Link>
            <Link
              href={`/workspaces/${workspace.id}/settings#knowledge-base`}
              className="flex min-h-10 items-center justify-between rounded-xl border border-transparent bg-white/75 px-3 text-sm hover:border-app-border-strong hover:bg-white"
            >
              资料库与上传
            </Link>
          </nav>
        </div>

        <div className="mt-auto grid gap-3 rounded-[18px] border border-app-border bg-white/60 p-3 shadow-soft">
          <div className="inline-flex size-10 items-center justify-center rounded-xl bg-app-surface-strong font-semibold text-app-accent">
            {avatarLabel}
          </div>
          <div className="grid gap-1">
            <strong className="text-sm">{displayName}</strong>
            <span className={ui.muted}>@{currentUser.username}</span>
          </div>
          <div className="grid gap-2">
            <Link
              href="/workspaces"
              className="flex min-h-10 items-center justify-between rounded-xl bg-white/75 px-3 text-sm hover:bg-white"
            >
              切换空间
            </Link>
            {canAccessSystemSettings ? (
              <Link
                href="/settings"
                className="flex min-h-10 items-center justify-between rounded-xl bg-white/75 px-3 text-sm hover:bg-white"
              >
                系统设置
              </Link>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 px-6 py-5 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-app-border px-0.5 pb-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-app-muted" aria-label="Breadcrumb">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
                {index < breadcrumbs.length - 1 ? <span> / </span> : null}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <details className="relative">
              <summary className="grid min-w-[168px] cursor-pointer list-none gap-0.5 rounded-2xl border border-app-border bg-white/90 px-4 py-2.5 text-left shadow-soft">
                <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
                  当前空间
                </span>
                <strong className="text-sm">{workspace.title}</strong>
              </summary>
              <div className="absolute right-0 top-[calc(100%+8px)] z-10 grid min-w-[220px] gap-2 rounded-2xl border border-app-border bg-white/95 p-2 shadow-card">
                {workspaces.map((item) => (
                  <Link
                    key={item.id}
                    href={`/workspaces/${item.id}`}
                    className="flex min-h-10 items-center rounded-xl px-3 text-sm hover:bg-app-surface-soft"
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </details>
            {topActions}
          </div>
        </header>

        <div className="min-w-0">{children}</div>
      </section>
    </div>
  );
}
