"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  CONVERSATION_STATUS,
  type ConversationStatus,
} from "@anchordesk/contracts";

import { AnchorDeskLogo, CloseIcon, MenuIcon, PlusIcon, SlidersIcon, SourceIcon } from "@/components/icons";
import { workspaceBranding } from "@/lib/branding";
import {
  WORKSPACE_SHELL_DESKTOP_MEDIA_QUERY,
  WORKSPACE_SHELL_SIDEBAR_CONTENT_CLASS,
  resolveWorkspaceShellContentClass,
} from "@/lib/workspace-shell";
import {
  buttonStyles,
  cn,
  createConversationNavButtonStyles,
  navItemStyles,
} from "@/lib/ui";
import { ConversationBreadcrumbSwitcher } from "@/components/workspaces/conversation-breadcrumb-switcher";
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
  isResponding?: boolean;
  updatedAt: Date;
};

export type WorkspaceShellFrameProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
  activeConversationId?: string;
  currentConversation?: {
    id: string;
    title: string;
  };
  activeView?: "chat" | "settings" | "knowledge-base";
  contentScroll?: "shell" | "contained";
  currentUser: {
    name?: string | null;
    username: string;
    isSuperAdmin: boolean;
  };
  canAccessSystemSettings: boolean;
  breadcrumbs: Array<{ label: string; href?: string }>;
  topActions?: ReactNode;
  children: ReactNode;
};

type SidebarContentProps = {
  workspace: WorkspaceListItem;
  conversations: ConversationListItem[];
  activeConversationId?: string;
  activeView: "chat" | "settings" | "knowledge-base";
  currentUser: {
    name?: string | null;
    username: string;
    isSuperAdmin: boolean;
  };
  canAccessSystemSettings: boolean;
  onNavigate?: () => void;
  alwaysShowConversationMenu?: boolean;
};

type BreadcrumbTrailProps = {
  workspace: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  conversations: ConversationListItem[];
  breadcrumbs: Array<{ label: string; href?: string }>;
  activeView: "chat" | "settings" | "knowledge-base";
  currentConversation?: {
    id: string;
    title: string;
  };
};

export function WorkspaceShellFrame({
  workspace,
  workspaces,
  conversations,
  activeConversationId,
  currentConversation,
  activeView = "chat",
  contentScroll = "shell",
  currentUser,
  canAccessSystemSettings,
  breadcrumbs,
  topActions,
  children,
}: WorkspaceShellFrameProps) {
  const pathname = usePathname();
  const drawerId = useId();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(WORKSPACE_SHELL_DESKTOP_MEDIA_QUERY);

    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsDrawerOpen(false);
      }
    }

    if (mediaQuery.matches) {
      setIsDrawerOpen(false);
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <div className="relative grid min-h-[100dvh] grid-cols-1 min-[720px]:h-[100dvh] min-[720px]:grid-cols-[258px_minmax(0,1fr)] min-[720px]:overflow-hidden">
      <div
        className={cn(
          "fixed inset-0 z-50 min-[720px]:hidden",
          isDrawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="关闭导航面板"
          className={cn(
            "absolute inset-0 bg-[rgba(23,22,18,0.34)] backdrop-blur-[2px] transition-opacity duration-200",
            isDrawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setIsDrawerOpen(false)}
        />
        <aside
          id={drawerId}
          aria-label="工作区导航"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(86vw,340px)] max-w-full flex-col border-r border-app-border bg-app-sidebar shadow-card transition-transform duration-200 ease-out",
            isDrawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-app-border/70 px-4 py-3">
            <div className="grid gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                Workspace
              </span>
              <strong className="max-w-[18rem] truncate text-[15px] font-semibold text-app-text">
                {workspace.title}
              </strong>
            </div>
            <button
              type="button"
              aria-label="收起导航面板"
              className={cn(
                buttonStyles({ variant: "ghost", size: "sm", shape: "icon" }),
                "size-9 text-app-muted-strong",
              )}
              onClick={() => setIsDrawerOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>
          <WorkspaceSidebarContent
            workspace={workspace}
            conversations={conversations}
            activeConversationId={activeConversationId}
            activeView={activeView}
            currentUser={currentUser}
            canAccessSystemSettings={canAccessSystemSettings}
            onNavigate={() => setIsDrawerOpen(false)}
            alwaysShowConversationMenu
          />
        </aside>
      </div>

      <aside className="hidden min-[720px]:flex min-[720px]:min-h-0 min-[720px]:h-[100dvh] min-[720px]:overflow-hidden min-[720px]:border-r min-[720px]:border-app-border min-[720px]:bg-app-sidebar">
        <WorkspaceSidebarContent
          workspace={workspace}
          conversations={conversations}
          activeConversationId={activeConversationId}
          activeView={activeView}
          currentUser={currentUser}
          canAccessSystemSettings={canAccessSystemSettings}
        />
      </aside>

      <section className="grid min-h-[100dvh] min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 px-4 py-4 min-[720px]:min-h-0 min-[720px]:px-6 min-[720px]:py-5 min-[720px]:overflow-hidden md:px-8">
        <header className="border-b border-app-border px-0.5 pb-3">
          <div className="grid gap-3 min-[720px]:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-controls={drawerId}
                aria-expanded={isDrawerOpen}
                aria-label={isDrawerOpen ? "收起导航面板" : "展开导航面板"}
                className={cn(
                  buttonStyles({ variant: "secondary", size: "sm", shape: "icon" }),
                  "size-10 rounded-2xl border-app-border bg-white/88 shadow-soft",
                )}
                onClick={() => setIsDrawerOpen((current) => !current)}
              >
                <MenuIcon />
              </button>

              <Link
                href="/workspaces"
                className="flex min-w-0 items-center gap-3"
                onClick={() => setIsDrawerOpen(false)}
              >
                <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-app-primary shadow-sm">
                  <AnchorDeskLogo className="size-[18px] text-app-primary-contrast" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <strong className="truncate font-serif text-[15px] leading-tight text-app-text">
                    {workspaceBranding.productName}
                  </strong>
                  <span className="truncate text-[12px] text-app-muted-strong">
                    {workspace.title}
                  </span>
                </span>
              </Link>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <BreadcrumbTrail
                  workspace={workspace}
                  workspaces={workspaces}
                  conversations={conversations}
                  breadcrumbs={breadcrumbs}
                  activeView={activeView}
                  currentConversation={currentConversation}
                />
              </div>

              {topActions ? (
                <div className="flex shrink-0 items-center justify-end gap-1.5">
                  {topActions}
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden min-[720px]:flex min-[720px]:min-w-0 min-[720px]:items-center min-[720px]:justify-between min-[720px]:gap-4">
            <div className="min-w-0 flex-1">
              <BreadcrumbTrail
                workspace={workspace}
                workspaces={workspaces}
                conversations={conversations}
                breadcrumbs={breadcrumbs}
                activeView={activeView}
                currentConversation={currentConversation}
              />
            </div>

            {topActions ? <div className="flex shrink-0 items-center gap-2">{topActions}</div> : null}
          </div>
        </header>

        <div
          className={resolveWorkspaceShellContentClass(contentScroll)}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

function WorkspaceSidebarContent({
  workspace,
  conversations,
  activeConversationId,
  activeView,
  currentUser,
  canAccessSystemSettings,
  onNavigate,
  alwaysShowConversationMenu = false,
}: SidebarContentProps) {
  const activeConversations = conversations.filter(
    (item) => item.status === CONVERSATION_STATUS.ACTIVE,
  );
  const archivedConversations = conversations.filter(
    (item) => item.status === CONVERSATION_STATUS.ARCHIVED,
  );
  const isCreateConversationActive = activeView === "chat" && !activeConversationId;
  const workspaceNavLink = (selected: boolean) =>
    cn(
      "group flex min-h-[36px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors",
      selected
        ? navItemStyles({ selected: true })
        : "text-app-muted-strong hover:bg-black/5 hover:text-app-text",
    );

  return (
    <div className={WORKSPACE_SHELL_SIDEBAR_CONTENT_CLASS}>
      <div className="grid gap-4">
        <Link
          href="/workspaces"
          className="group flex items-center gap-3 px-1.5 py-1 transition-opacity hover:opacity-80"
          onClick={onNavigate}
        >
          <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-app-primary shadow-sm">
            <AnchorDeskLogo className="size-[18px] text-app-primary-contrast" />
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
            onClick={onNavigate}
            className={createConversationNavButtonStyles({
              active: isCreateConversationActive,
            })}
          >
            <PlusIcon className="size-3.5 transition-transform group-hover:scale-110" strokeWidth={2.5} />
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
              onNavigate={onNavigate}
              alwaysShowMenu={alwaysShowConversationMenu}
            />
          ))}
          {activeConversations.length === 0 ? (
            <div className="px-1.5 text-sm leading-6 text-app-muted">
              当前还没有历史会话。
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1 border-t border-app-border/60 pt-4 px-1.5 pb-2">
        <nav className="grid gap-0.5">
          <Link
            href={`/workspaces/${workspace.id}/settings`}
            onClick={onNavigate}
            className={workspaceNavLink(activeView === "settings")}
          >
            <SlidersIcon className="size-4 shrink-0 opacity-70 group-hover:opacity-100" />
            <span>空间设置</span>
          </Link>
          <Link
            href={`/workspaces/${workspace.id}/knowledge-base`}
            onClick={onNavigate}
            className={workspaceNavLink(activeView === "knowledge-base")}
          >
            <SourceIcon className="size-4 shrink-0 opacity-70 group-hover:opacity-100" />
            <span>资料库</span>
          </Link>
        </nav>
        {archivedConversations.length > 0 ? (
          <div className="px-2.5 pt-1 text-[11px] text-app-muted">
            已归档 {archivedConversations.length}
          </div>
        ) : null}
      </div>

      <WorkspaceUserPanel
        initialUser={currentUser}
        canAccessSystemSettings={canAccessSystemSettings}
      />
    </div>
  );
}

function BreadcrumbTrail({
  workspace,
  workspaces,
  conversations,
  breadcrumbs,
  activeView,
  currentConversation,
}: BreadcrumbTrailProps) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-app-muted"
      aria-label="Breadcrumb"
    >
      {breadcrumbs.map((item, index) => {
        const isWorkspaceCrumb = item.label === workspace.title;
        const isCurrentConversationCrumb =
          Boolean(currentConversation) && index === breadcrumbs.length - 1;
        const isWorkspaceRootCrumb =
          Boolean(currentConversation) && index === 0 && item.href === "/workspaces";

        return (
          <span
            key={`${item.label}-${index}`}
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              isWorkspaceRootCrumb && "hidden min-[720px]:flex",
            )}
          >
            {isCurrentConversationCrumb && currentConversation ? (
              <ConversationBreadcrumbSwitcher
                workspaceId={workspace.id}
                currentConversation={currentConversation}
                conversations={conversations}
              />
            ) : isWorkspaceCrumb ? (
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
  );
}
