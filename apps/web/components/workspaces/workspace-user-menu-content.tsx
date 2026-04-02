"use client";

import Link from "next/link";

import {
  LogoutIcon,
  SlidersIcon,
  UserIcon,
} from "@/components/icons";
import { type WorkspaceUserPanelAction } from "@/lib/workspace-user-panel";
import { cn, menuItemStyles } from "@/lib/ui";

type WorkspaceUserMenuContentProps = {
  displayName: string;
  username: string;
  avatarLabel: string;
  actions: WorkspaceUserPanelAction[];
  logoutLabel?: string | null;
  isSigningOut: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
};

export function WorkspaceUserMenuContent({
  displayName,
  username,
  avatarLabel,
  actions,
  logoutLabel,
  isSigningOut,
  onNavigate,
  onSignOut,
}: WorkspaceUserMenuContentProps) {
  return (
    <>
      <div className="flex items-center gap-3 px-3 pb-2 pt-2.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-app-surface-strong text-sm font-semibold text-app-accent">
          {avatarLabel}
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[14px] font-semibold text-app-text">
            {displayName}
          </strong>
          <span className="block truncate text-[12.5px] text-app-muted">@{username}</span>
        </div>
      </div>

      {actions.length > 0 ? (
        <>
          <div className="mx-2 my-1 h-px bg-app-border/70" />

          <nav className="grid gap-0.5 py-0.5">
            {actions.map((action) => (
              <Link
                key={action.key}
                href={action.href ?? "/"}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 transition",
                  menuItemStyles(),
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-app-muted-strong">
                  {resolveWorkspaceUserMenuActionIcon(action.key)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {action.label}
                </span>
              </Link>
            ))}
          </nav>
        </>
      ) : null}

      {logoutLabel ? (
        <>
          <div className="mx-2 my-1 h-px bg-app-border/70" />
          <div className="pb-0.5 pt-0.5">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                menuItemStyles({ tone: "danger" }),
              )}
              disabled={isSigningOut}
              onClick={onSignOut}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg text-red-500">
                <LogoutIcon />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                {isSigningOut ? "退出中..." : logoutLabel}
              </span>
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

function resolveWorkspaceUserMenuActionIcon(key: WorkspaceUserPanelAction["key"]) {
  if (key === "account") {
    return <UserIcon />;
  }

  if (key === "system-management") {
    return <SlidersIcon />;
  }

  return <SlidersIcon />;
}
