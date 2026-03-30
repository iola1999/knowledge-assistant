"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AccountDisplayNameForm } from "@/components/account/account-display-name-form";
import { AccountPasswordForm } from "@/components/account/account-password-form";
import { AccountSettingsNav } from "@/components/account/account-settings-nav";
import { ArrowLeftIcon } from "@/components/icons";
import { LogoutButton } from "@/components/account/logout-button";
import {
  SettingsShell,
  SettingsShellSidebar,
} from "@/components/shared/settings-shell";
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
    <SettingsShell
      sidebar={
        <SettingsShellSidebar>
          <Link
            href="/workspaces"
            className="inline-flex items-center gap-1.5 self-start rounded-full px-1.5 py-1 text-[13px] text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
          >
            <ArrowLeftIcon />
            返回工作台
          </Link>

          <div className="grid gap-4">
            <div className="flex items-center gap-3 px-1">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-app-surface-strong text-sm font-semibold text-app-accent">
                {resolveWorkspaceUserAvatarLabel(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-[14px] font-semibold text-app-text">
                  {displayName}
                </strong>
                <span className="block truncate text-[12.5px] text-app-muted">
                  @{currentUser.username}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-app-border bg-app-sidebar/50 p-2">
              <AccountSettingsNav
                groups={navGroups}
                activeSectionId={activeSectionId}
                onSelect={onSelectSection}
              />
            </div>
          </div>
        </SettingsShellSidebar>
      }
    >
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
        <header className="grid gap-1 px-1 pb-0.5">
          <h2 className="text-[1.5rem] font-semibold text-app-text">
            个人设置
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
    </SettingsShell>
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
    <section className={ui.sectionPanel}>
      <h3 className="text-[1.1rem] font-semibold text-app-text">{title}</h3>
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
