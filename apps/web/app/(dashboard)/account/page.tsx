import Link from "next/link";
import type { ReactNode } from "react";

import { AccountSettingsNav } from "@/components/account/account-settings-nav";
import { requireSessionUser } from "@/lib/auth/require-user";
import { buildAccountSettingsNavGroups } from "@/lib/account-settings";
import { cn, ui } from "@/lib/ui";
import { resolveWorkspaceUserAvatarLabel } from "@/lib/workspace-user-panel";
import { AccountDisplayNameForm } from "@/components/account/account-display-name-form";
import { AccountPasswordForm } from "@/components/account/account-password-form";
import { LogoutButton } from "@/components/account/logout-button";

export default async function AccountPage() {
  const user = await requireSessionUser();
  const navGroups = buildAccountSettingsNavGroups();
  const displayName = user.name ?? user.username;

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="border-b border-app-border/80 bg-white/45 xl:border-b-0 xl:border-r">
          <div className="flex h-full flex-col gap-6 px-5 py-5 md:px-6 md:py-6 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto">
            <Link
              href="/workspaces"
              className="inline-flex items-center gap-2 self-start rounded-full px-2 py-1 text-sm text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
            >
              <BackIcon />
              返回工作台
            </Link>

            <div className="grid gap-4 rounded-[32px] border border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(252,249,243,0.88))] p-4 shadow-soft">
              <div className="grid gap-1">
                <p className={ui.eyebrow}>Personal Settings</p>
                <h1 className="text-[1.85rem] font-semibold text-app-text">个人设置</h1>
                <p className={cn(ui.muted, "text-[13px] leading-5")}>
                  管理你的公开名称、登录安全和当前会话。
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-[24px] border border-app-border/80 bg-white/82 p-3.5">
                <div className="grid size-14 shrink-0 place-items-center rounded-[20px] border border-app-border bg-[radial-gradient(circle_at_top,#ffffff_0%,#f0e7d8_62%,#e3d8c7_100%)] text-lg font-semibold text-app-accent">
                  {resolveWorkspaceUserAvatarLabel(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                    当前账号
                  </span>
                  <strong className="mt-1 block truncate text-lg font-semibold text-app-text">
                    {displayName}
                  </strong>
                  <span className="block truncate text-sm text-app-muted">@{user.username}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-app-border bg-app-sidebar/62 p-3 shadow-soft">
              <AccountSettingsNav groups={navGroups} />
            </div>

            <div className="mt-auto rounded-[24px] border border-app-border/80 bg-white/72 p-4 text-[13px] leading-6 text-app-muted">
              这里只影响当前登录用户，不会改动工作空间资料。
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-5 md:px-8 md:py-8 xl:px-12 xl:py-10">
          <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4 px-1 pb-1">
              <div className="grid gap-1.5">
                <p className={ui.eyebrow}>Account</p>
                <h2 className="text-[2rem] font-semibold text-app-text md:text-[2.25rem]">
                  账号与偏好
                </h2>
                <p className={cn(ui.muted, "max-w-[48ch]")}>
                  个人资料、安全与当前会话都收口在这里。
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-app-border bg-white/86 px-4 py-2 text-sm text-app-muted-strong shadow-soft">
                <span className="size-2 rounded-full bg-emerald-500" />
                当前已登录
              </div>
            </header>

            <AccountSettingsSection
              id="profile"
              title="个人资料"
              description="维护会在账号页和工作区侧边栏中展示的公开名称。"
            >
              <AccountSettingsRow
                title="显示名称"
                description="你更新后的名称会同步显示在工作区左下角和账号页摘要中。"
              >
                <AccountDisplayNameForm initialDisplayName={displayName} layout="compact" />
              </AccountSettingsRow>

              <AccountSettingsRow
                title="登录用户名"
                description="用户名用于登录与识别账户，当前页面只读展示。"
              >
                <div className="rounded-[24px] border border-app-border bg-app-surface-soft/74 px-4 py-4 shadow-soft">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                    Username
                  </span>
                  <strong className="mt-2 block text-lg font-semibold text-app-text">
                    @{user.username}
                  </strong>
                </div>
              </AccountSettingsRow>
            </AccountSettingsSection>

            <AccountSettingsSection
              id="security"
              title="安全与登录"
              description="修改密码前需要验证当前密码。更新后，系统会撤销所有已登录会话。"
            >
              <AccountSettingsRow
                title="更新密码"
                description="建议使用长度更长且不重复的密码，提交成功后会自动退出当前登录。"
              >
                <AccountPasswordForm layout="compact" />
              </AccountSettingsRow>
            </AccountSettingsSection>

            <AccountSettingsSection
              id="session"
              title="当前会话"
              description="管理当前浏览器中的登录状态。退出后会回到登录页。"
            >
              <AccountSettingsRow
                title="退出登录"
                description="适用于公共设备、临时环境或需要重新登录验证身份的场景。"
              >
                <LogoutButton layout="compact" />
              </AccountSettingsRow>
            </AccountSettingsSection>
          </div>
        </main>
      </div>
    </div>
  );
}

function AccountSettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[32px] border border-app-border bg-white/88 p-6 shadow-soft md:p-8"
    >
      <div className="grid gap-2">
        <h2 className="text-[1.45rem] font-semibold text-app-text">{title}</h2>
        <p className={cn(ui.muted, "max-w-[62ch]")}>{description}</p>
      </div>
      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  );
}

function AccountSettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 border-t border-app-border pt-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
      <div className="grid content-start gap-1.5">
        <h3 className="text-base font-semibold text-app-text">{title}</h3>
        <p className={cn(ui.muted, "text-[13px] leading-5")}>{description}</p>
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
