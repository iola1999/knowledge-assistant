"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import {
  AnswerIcon,
  ChevronDownIcon,
  LibraryIcon,
  SlidersIcon,
} from "@/components/icons";
import { WorkspaceUserMenuContent } from "@/components/workspaces/workspace-user-menu-content";
import {
  buildWorkspaceUserPanelState,
  type WorkspaceUserPanelAction,
} from "@/lib/workspace-user-panel";
import { buttonStyles, cn, menuItemStyles, ui } from "@/lib/ui";

type WorkspacesHeaderActionsProps = {
  initialUser: {
    name?: string | null;
    username: string;
  };
  canAccessSystemSettings: boolean;
};

export function WorkspacesHeaderActions({
  initialUser,
  canAccessSystemSettings,
}: WorkspacesHeaderActionsProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [openMenu, setOpenMenu] = useState<"account" | "admin" | null>(null);
  const accountContainerRef = useRef<HTMLDivElement | null>(null);
  const adminContainerRef = useRef<HTMLDivElement | null>(null);
  const accountMenuId = useId();
  const adminMenuId = useId();

  const { accountActions, adminActions, avatarLabel, displayName, logoutAction, username } =
    buildWorkspaceUserPanelState({
      sessionUser: session?.user,
      initialUser,
      canAccessSystemSettings,
    });

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const activeContainer =
        openMenu === "account" ? accountContainerRef.current : adminContainerRef.current;

      if (!activeContainer?.contains(event.target)) {
        setOpenMenu(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  async function onSignOut() {
    setOpenMenu(null);
    setIsSigningOut(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {adminActions.length > 0 ? (
        <div ref={adminContainerRef} className="relative">
          {openMenu === "admin" ? (
            <div
              id={adminMenuId}
              className={cn(
                ui.popover,
                "absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[260px]",
              )}
            >
              <div className="px-3 pb-1 pt-2.5">
                <p className={ui.eyebrow}>管理</p>
                <h2 className="text-[15px] font-semibold text-app-text">管理入口</h2>
              </div>

              <div className="mx-2 my-1.5 h-px bg-app-border/70" />

              <nav className="grid gap-0.5 py-0.5">
                {adminActions.map((action) => (
                  <Link
                    key={action.key}
                    href={action.href ?? "/"}
                    onClick={() => setOpenMenu(null)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2 transition",
                      menuItemStyles(),
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg text-app-muted-strong">
                      {resolveAdminActionIcon(action.key)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {action.label}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
          ) : null}

          <button
            type="button"
            aria-expanded={openMenu === "admin"}
            aria-controls={adminMenuId}
            aria-label={openMenu === "admin" ? "收起管理菜单" : "展开管理菜单"}
            className={headerMenuTriggerStyles(openMenu === "admin")}
            onClick={() => setOpenMenu((current) => (current === "admin" ? null : "admin"))}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-app-surface-strong text-app-accent">
              <SlidersIcon className="size-[15px]" />
            </span>
            <span className="text-[13px] font-medium text-app-text">管理</span>
            <ChevronDownIcon
              className={cn(
                "size-3 text-app-muted transition",
                openMenu === "admin" && "rotate-180 text-app-text",
              )}
            />
          </button>
        </div>
      ) : null}

      <div ref={accountContainerRef} className="relative">
        {openMenu === "account" ? (
          <div
            id={accountMenuId}
            className={cn(
              ui.popover,
              "absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(280px,calc(100vw-24px))]",
            )}
          >
            <WorkspaceUserMenuContent
              displayName={displayName}
              username={username}
              avatarLabel={avatarLabel}
              actions={accountActions}
              logoutLabel={logoutAction?.label}
              isSigningOut={isSigningOut}
              onNavigate={() => setOpenMenu(null)}
              onSignOut={onSignOut}
            />
          </div>
        ) : null}

        <button
          type="button"
          aria-expanded={openMenu === "account"}
          aria-controls={accountMenuId}
          aria-label={openMenu === "account" ? "收起账号菜单" : "展开账号菜单"}
          className={headerMenuTriggerStyles(openMenu === "account")}
          onClick={() => setOpenMenu((current) => (current === "account" ? null : "account"))}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-app-surface-strong text-[13px] font-semibold text-app-accent">
            {avatarLabel}
          </span>
          <span className="max-w-[8.5rem] truncate text-[13px] font-medium text-app-text">
            {displayName}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3 text-app-muted transition",
              openMenu === "account" && "rotate-180 text-app-text",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function headerMenuTriggerStyles(open: boolean) {
  return cn(
    buttonStyles({ variant: "secondary", size: "sm", shape: "pill" }),
    "gap-2 border-app-border/80 bg-white/78 pl-1.5 pr-2.5 shadow-soft backdrop-blur-sm hover:border-app-border-strong hover:bg-white",
    open && "border-app-border-strong bg-white text-app-text",
  );
}

function resolveAdminActionIcon(key: WorkspaceUserPanelAction["key"]) {
  if (key === "global-libraries") {
    return <LibraryIcon />;
  }

  if (key === "model-management") {
    return <AnswerIcon />;
  }

  return <SlidersIcon />;
}
