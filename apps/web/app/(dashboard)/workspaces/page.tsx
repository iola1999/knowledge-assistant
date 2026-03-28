import Link from "next/link";
import { eq } from "drizzle-orm";

import { getDb, users, workspaces } from "@knowledge-assistant/db";

import { auth } from "@/auth";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";
import { summarizeWorkspacePrompt } from "@/lib/api/workspace-prompt";
import { buttonStyles, cn, ui } from "@/lib/ui";

export default async function WorkspacesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const db = getDb();

  const workspaceList = userId
    ? await db.select().from(workspaces).where(eq(workspaces.userId, userId))
    : [];
  const userRecord = userId
    ? await db.select().from(users).where(eq(users.id, userId)).limit(1)
    : [];
  const username = session?.user?.username ?? "";
  const displayName = session?.user?.name ?? userRecord[0]?.displayName ?? "用户";
  const canAccessSystemSettings = isSuperAdminUsername(username);

  return (
    <div className={ui.page}>
      <div className={ui.toolbar}>
        <div className="max-w-[64ch] space-y-2">
          <p className={ui.eyebrow}>Spaces</p>
          <h1>先选择要进入的空间</h1>
          <p className={ui.muted}>
            欢迎，{displayName}。问答、资料和历史会话都以空间为边界，登录后先进入一个具体空间再开始工作。
          </p>
        </div>

        <div className={ui.actions}>
          <Link href="/workspaces/new" className={buttonStyles()}>
            新建工作空间
          </Link>
          {canAccessSystemSettings ? (
            <Link href="/settings" className={buttonStyles({ variant: "secondary" })}>
              系统设置
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaceList.length ? (
          workspaceList.map((workspace) => {
            const promptSummary = summarizeWorkspacePrompt(workspace.workspacePrompt, 88);

            return (
              <Link
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
                className={cn(
                  ui.panel,
                  "grid min-h-[220px] gap-4 rounded-[24px] p-6 transition hover:-translate-y-0.5",
                )}
              >
                <div className={ui.toolbar}>
                  <span className="grid size-12 place-items-center rounded-2xl bg-app-surface-strong text-xl font-semibold text-app-accent">
                    空
                  </span>
                  <span className="text-sm text-app-muted">进入空间</span>
                </div>
                <div className="space-y-2">
                  <strong>{workspace.title}</strong>
                  <p className={ui.muted}>
                    {promptSummary ? `统一提示词：${promptSummary}` : "未设置统一提示词。"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-app-muted">
                  <span>{workspace.defaultMode === "kb_plus_web" ? "资料 + 联网" : "仅资料"}</span>
                  <span>{workspace.allowWebSearch ? "允许联网" : "默认本地"}</span>
                </div>
              </Link>
            );
          })
        ) : (
          <div className={cn(ui.panel, "grid min-h-[220px] content-center rounded-[24px] p-6")}>
            <p>还没有工作空间，先创建一个空间再开始问答。</p>
          </div>
        )}

        <Link
          href="/workspaces/new"
          className={cn(
            ui.panel,
            "grid min-h-[220px] gap-4 rounded-[24px] border-dashed p-6 transition hover:-translate-y-0.5",
          )}
        >
          <div className={ui.toolbar}>
            <span className="grid size-12 place-items-center rounded-2xl bg-app-surface-strong text-xl font-semibold text-app-accent">
              +
            </span>
            <span className="text-sm text-app-muted">创建新空间</span>
          </div>
          <div className="space-y-2">
            <strong>新建工作空间</strong>
            <p className={ui.muted}>为新的主题建立独立资料库，并提前配置一条统一回答要求。</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
