"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
import { WorkspaceUserMenuContent } from "@/components/workspaces/workspace-user-menu-content";
import { buildWorkspaceUserPanelState } from "@/lib/workspace-user-panel";
import { cn } from "@/lib/ui";

type WorkspaceUserPanelProps = {
  initialUser: {
    name?: string | null;
    username: string;
  };
  canAccessSystemSettings: boolean;
};

export function WorkspaceUserPanel({
  initialUser,
  canAccessSystemSettings,
}: WorkspaceUserPanelProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();

  const { accountActions, adminActions, avatarLabel, displayName, logoutAction, username } =
    buildWorkspaceUserPanelState({
      sessionUser: session?.user,
      initialUser,
      canAccessSystemSettings,
    });
  const menuActions = [...accountActions, ...adminActions];

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  async function onSignOut() {
    setIsOpen(false);
    setIsSigningOut(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      placement="top-end"
      sideOffset={8}
      collisionPadding={12}
    >
      <div className="mt-auto">
        <PopoverContent
          id={menuId}
          className="z-30 w-[min(280px,calc(100vw-24px))]"
        >
          <WorkspaceUserMenuContent
            displayName={displayName}
            username={username}
            avatarLabel={avatarLabel}
            actions={menuActions}
            logoutLabel={logoutAction?.label}
            isSigningOut={isSigningOut}
            onNavigate={() => setIsOpen(false)}
            onSignOut={onSignOut}
          />
        </PopoverContent>

        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={menuId}
            aria-label={isOpen ? "收起账号菜单" : "展开账号菜单"}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/80"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-app-surface-strong text-[13px] font-semibold text-app-accent">
              {avatarLabel}
            </div>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13.5px] font-medium text-app-text">
                {displayName}
              </strong>
              <span className="block truncate text-[12px] text-app-muted">@{username}</span>
            </span>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center text-app-muted transition",
                isOpen && "rotate-180 text-app-text",
              )}
              aria-hidden="true"
            >
              <ChevronDownIcon className="size-3" />
            </span>
          </button>
        </PopoverTrigger>
      </div>
    </Popover>
  );
}
