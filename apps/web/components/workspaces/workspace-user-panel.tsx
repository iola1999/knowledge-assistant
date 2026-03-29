"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

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
          className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-30 rounded-[28px] border border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,248,242,0.96))] p-3 shadow-card backdrop-blur-md"
        >
          <div className="flex items-center gap-3 rounded-[22px] border border-app-border/70 bg-white/82 px-3.5 py-3.5">
            <div className="grid size-14 shrink-0 place-items-center rounded-[20px] border border-app-border bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1eadf_62%,#e5ddcf_100%)] text-lg font-semibold text-app-accent shadow-soft">
              {avatarLabel}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                当前账号
              </p>
              <strong className="mt-1 block truncate text-[1.02rem] font-semibold text-app-text">
                {displayName}
              </strong>
              <span className="block truncate text-sm text-app-muted">@{username}</span>
            </div>
          </div>

          <nav className="mt-2.5 grid gap-1">
            {menuActions.map((action) => (
              <Link
                key={action.key}
                href={action.href ?? "/"}
                onClick={() => setIsOpen(false)}
                className="group flex items-center gap-2.5 rounded-[20px] px-3 py-2.5 transition hover:bg-app-surface-soft/82"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-app-border bg-white text-app-muted-strong transition group-hover:border-app-border-strong group-hover:text-app-text">
                  {action.key === "account" ? <UserIcon /> : <SettingsIcon />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-app-text">
                  {action.label}
                </span>
              </Link>
            ))}
          </nav>

          {logoutAction ? (
            <>
              <div className="mx-1 my-2 h-px bg-app-border" />
              <button
                type="button"
                className="group flex w-full items-center gap-2.5 rounded-[20px] px-3 py-2.5 text-left transition hover:bg-[#fff2ec]"
                disabled={isSigningOut}
                onClick={onSignOut}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#f0c9ba] bg-white text-[#b65643] transition group-hover:border-[#e0a892] group-hover:bg-[#fff8f5]">
                  <LogoutIcon />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#9e4332]">
                  {isSigningOut ? "退出中..." : logoutAction.label}
                </span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={isOpen ? "收起账号菜单" : "展开账号菜单"}
        className="flex w-full items-center gap-3 rounded-[22px] border border-app-border bg-white/78 px-3 py-2.5 text-left shadow-soft backdrop-blur-sm transition hover:border-app-border-strong hover:bg-white focus:outline-none focus:ring-4 focus:ring-app-accent/10"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="grid size-11 shrink-0 place-items-center rounded-[16px] border border-app-border bg-[radial-gradient(circle_at_top,#ffffff_0%,#efe7da_62%,#e2d9ca_100%)] font-semibold text-app-accent">
          {avatarLabel}
        </div>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[15px] font-medium text-app-text">
            {displayName}
          </strong>
          <span className="block truncate text-[13px] text-app-muted">@{username}</span>
        </span>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full bg-app-surface-soft text-app-muted-strong transition",
            isOpen && "rotate-180 text-app-text",
          )}
          aria-hidden="true"
        >
          <ChevronIcon />
        </span>
      </button>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.8">
      <path d="M5.5 7.5 10 12l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M10 10.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM4.75 16.25a5.25 5.25 0 0 1 10.5 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path
        d="M7.25 4.25v11.5M12.75 4.25v11.5M4.25 7.25h6M9.75 12.75h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7.25" cy="7.25" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="12.75" cy="12.75" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.7">
      <path
        d="M8 4.75H6.75a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2H8M11.25 6.5 14.75 10m0 0-3.5 3.5M14.75 10H8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
