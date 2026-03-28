import Link from "next/link";

import { requireSessionUser } from "@/lib/auth/require-user";
import { buttonStyles, cn, ui } from "@/lib/ui";
import { AccountDisplayNameForm } from "@/components/account/account-display-name-form";
import { AccountPasswordForm } from "@/components/account/account-password-form";
import { LogoutButton } from "@/components/account/logout-button";

export default async function AccountPage() {
  const user = await requireSessionUser();

  return (
    <div className={cn(ui.pageNarrow, "max-w-[980px]")}>
      <section className={cn(ui.panelLarge, "grid gap-4")}>
        <div className={ui.toolbar}>
          <div className="space-y-2">
            <p className={ui.eyebrow}>Account</p>
            <h1>账号与安全</h1>
            <p className={ui.muted}>管理当前登录账号的基础安全操作</p>
          </div>
          <Link href="/workspaces" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            返回空间列表
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className={cn(ui.subcard, "grid gap-2")}>
            <strong>{user.name ?? user.username}</strong>
            <p className={ui.muted}>@{user.username}</p>
          </div>
          <div className={cn(ui.subcard, "grid content-start gap-3")}>
            <strong className="text-sm">会话</strong>
            <LogoutButton />
          </div>
        </div>
      </section>

      <AccountDisplayNameForm initialDisplayName={user.name ?? user.username} />
      <AccountPasswordForm />
    </div>
  );
}
