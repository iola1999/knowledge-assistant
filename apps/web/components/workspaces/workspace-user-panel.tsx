"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import {
  ChevronDownIcon,
  LogoutIcon,
  SlidersIcon,
  UserIcon,
} from "@/components/icons";
import { buildWorkspaceUserPanelState } from "@/lib/workspace-user-panel";
import { cn, menuItemStyles, ui } from "@/lib/ui";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const { actions, avatarLabel, displayName, username } = buildWorkspaceUserPanelState({
    sessionUser: session?.user,
    initialUser,
    canAccessSystemSettings,
  });
  const menuActions = actions.filter((action) => action.key !== "logout");
  const logoutAction = actions.find((action) => action.key === "logout");

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function onSignOut() {
    setIsOpen(false);
    setIsSigningOut(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <div ref={containerRef} className="relative mt-auto">
      {isOpen ? (
        <div
          id={menuId}
          className={cn(
            ui.popover,
            "absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-30",
          )}
        >
          {/* Account header */}
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

          <div className="mx-2 my-1 h-px bg-app-border/70" />

          <nav className="grid gap-0.5 py-0.5">
            {menuActions.map((action) => (
              <Link
                key={action.key}
                href={action.href ?? "/"}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 transition",
                  menuItemStyles(),
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-app-muted-strong">
                  {action.key === "account" ? <UserIcon /> : <SlidersIcon />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {action.label}
                </span>
              </Link>
            ))}
          </nav>

          {logoutAction ? (
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
                    {isSigningOut ? "退出中..." : logoutAction.label}
                  </span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={isOpen ? "收起账号菜单" : "展开账号菜单"}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/80"
        onClick={() => setIsOpen((current) => !current)}
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
    </div>
  );
}
