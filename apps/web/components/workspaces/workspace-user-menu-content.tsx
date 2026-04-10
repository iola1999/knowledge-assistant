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
      <div className="flex items-center gap-2.5 px-3 pb-1.5 pt-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-app-surface-strong text-[13px] font-semibold text-app-accent">
          {avatarLabel}
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[13px] font-semibold text-app-text">
            {displayName}
          </strong>
          <span className="block truncate text-[11px] text-app-muted">@{username}</span>
        </div>
      </div>

      {actions.length > 0 ? (
        <>
          <nav className="grid gap-0.5 py-1">
            {actions.map((action) => (
              <Link
                key={action.key}
                href={action.href ?? "/"}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-1.5 transition",
                  menuItemStyles(),
                )}
              >
                <span className="grid size-[26px] shrink-0 place-items-center rounded-lg text-app-muted-strong">
                  {resolveWorkspaceUserMenuActionIcon(action.key)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {action.label}
                </span>
              </Link>
            ))}
          </nav>
        </>
      ) : null}

      {logoutLabel ? (
        <>
          <div className="pb-1 pt-1">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left transition",
                menuItemStyles({ tone: "danger" }),
              )}
              disabled={isSigningOut}
              onClick={onSignOut}
            >
              <span className="grid size-[26px] shrink-0 place-items-center rounded-lg text-red-500">
                <LogoutIcon />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
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
