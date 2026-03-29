"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AccountDisplayNameForm } from "@/components/account/account-display-name-form";
import { AccountPasswordForm } from "@/components/account/account-password-form";
import { AccountSettingsNav } from "@/components/account/account-settings-nav";
import { LogoutButton } from "@/components/account/logout-button";
import {
  buildAccountSettingsNavGroups,
  resolveDefaultAccountSettingsSectionId,
  type AccountSettingsSectionId,
} from "@/lib/account-settings";
import { ui } from "@/lib/ui";
import { resolveWorkspaceUserAvatarLabel } from "@/lib/workspace-user-panel";

type AccountSettingsWorkbenchProps = {
  currentUser: {
    name?: string | null;
    username: string;
  };
};

export function AccountSettingsWorkbench({
  currentUser,
}: AccountSettingsWorkbenchProps) {
  const navGroups = buildAccountSettingsNavGroups();
  const defaultSectionId = resolveDefaultAccountSettingsSectionId(navGroups);
  const [activeSectionId, setActiveSectionId] =
    useState<AccountSettingsSectionId>(defaultSectionId);

  const displayName = currentUser.name ?? currentUser.username;

  useEffect(() => {
    function readSectionFromHash() {
      const hash = window.location.hash.replace("#", "");
      if (hash === "profile" || hash === "security") {
        setActiveSectionId(hash);
        return;
      }

      setActiveSectionId(defaultSectionId);
    }

    readSectionFromHash();
    window.addEventListener("hashchange", readSectionFromHash);

    return () => {
      window.removeEventListener("hashchange", readSectionFromHash);
    };
  }, [defaultSectionId]);

  function onSelectSection(nextSectionId: AccountSettingsSectionId) {
    setActiveSectionId(nextSectionId);
    window.history.replaceState(null, "", `#${nextSectionId}`);
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1560px] grid-cols-1 xl:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="border-b border-app-border/80 bg-white/45 xl:border-b-0 xl:border-r">
          <div className="flex h-full flex-col gap-4 px-4 py-4 md:px-5 md:py-5 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto">
            <Link
              href="/workspaces"
              className="inline-flex items-center gap-1.5 self-start rounded-full px-1.5 py-1 text-[13px] text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
            >
              <BackIcon />
              返回工作台
            </Link>

            <div className="grid gap-3 rounded-[26px] border border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(252,249,243,0.88))] p-3.5 shadow-soft">
              <div className="grid gap-0.5">
                <p className={ui.eyebrow}>Personal Settings</p>
                <h1 className="text-[1.55rem] font-semibold text-app-text">个人设置</h1>
              </div>

              <div className="flex items-center gap-3 rounded-[20px] border border-app-border/80 bg-white/82 p-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-[16px] border border-app-border bg-[radial-gradient(circle_at_top,#ffffff_0%,#f0e7d8_62%,#e3d8c7_100%)] text-base font-semibold text-app-accent">
                  {resolveWorkspaceUserAvatarLabel(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                    当前账号
                  </span>
                  <strong className="mt-0.5 block truncate text-[1.05rem] font-semibold text-app-text">
                    {displayName}
                  </strong>
                  <span className="block truncate text-[13px] text-app-muted">
                    @{currentUser.username}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-app-border bg-app-sidebar/62 p-2.5 shadow-soft">
              <AccountSettingsNav
                groups={navGroups}
                activeSectionId={activeSectionId}
                onSelect={onSelectSection}
              />
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-4 md:px-6 md:py-6 xl:px-9 xl:py-8">
          <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
            <header className="grid gap-1 px-1 pb-0.5">
              <p className={ui.eyebrow}>Account</p>
              <h2 className="text-[1.78rem] font-semibold text-app-text md:text-[2rem]">
                账号与偏好
              </h2>
            </header>

            {activeSectionId === "profile" ? (
              <AccountSettingsSection title="个人资料">
                <AccountSettingsRow title="显示名称">
                  <AccountDisplayNameForm initialDisplayName={displayName} layout="compact" />
                </AccountSettingsRow>
              </AccountSettingsSection>
            ) : null}

            {activeSectionId === "security" ? (
              <AccountSettingsSection title="安全与登录">
                <AccountSettingsRow title="更新密码">
                  <AccountPasswordForm layout="compact" />
                </AccountSettingsRow>

                <AccountSettingsRow title="退出登录">
                  <LogoutButton layout="compact" />
                </AccountSettingsRow>
              </AccountSettingsSection>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function AccountSettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-app-border bg-white/88 p-5 shadow-soft md:p-6">
      <div className="grid gap-1.5">
        <h2 className="text-[1.28rem] font-semibold text-app-text">{title}</h2>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function AccountSettingsRow({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-t border-app-border pt-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
      <div className="grid content-start gap-1">
        <h3 className="text-[15px] font-semibold text-app-text">{title}</h3>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8">
      <path d="M12.5 4.75 7.25 10l5.25 5.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
