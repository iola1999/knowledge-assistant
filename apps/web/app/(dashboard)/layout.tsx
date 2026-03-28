import Link from "next/link";
import type { ReactNode } from "react";

import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSessionUser();
  const canAccessSystemSettings = isSuperAdminUsername(user.username);

  return (
    <main className="page stack">
      <header className="dashboard-shell">
        <div className="stack dashboard-brand">
          <p className="dashboard-kicker">Legal AI Assistant</p>
          <div>
            <strong>开发控制台</strong>
            <p className="muted">
              工作空间和系统参数都从这里进入，当前以本地开发调试为主。
            </p>
          </div>
        </div>
        <nav className="dashboard-nav">
          <Link href="/workspaces" className="dashboard-nav-link">
            工作空间
          </Link>
          {canAccessSystemSettings ? (
            <Link href="/settings" className="dashboard-nav-link">
              系统设置
            </Link>
          ) : null}
        </nav>
      </header>
      {children}
    </main>
  );
}
