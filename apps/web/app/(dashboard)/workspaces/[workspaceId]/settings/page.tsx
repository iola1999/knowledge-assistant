import { getDb } from "@anchordesk/db";

import { WorkspaceSettingsForm } from "@/components/workspaces/workspace-settings-form";
import { WorkspaceLibrarySubscriptions } from "@/components/workspaces/workspace-library-subscriptions";
import { WorkspaceLifecyclePanel } from "@/components/workspaces/workspace-lifecycle-panel";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { listWorkspaceGlobalLibraryCatalog } from "@/lib/api/workspace-library-subscriptions";
import { loadWorkspaceShellData } from "@/lib/api/workspace-shell-data";
import { ui } from "@/lib/ui";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { workspace, workspaceList, conversationList, user } =
    await loadWorkspaceShellData(workspaceId);
  const libraryCatalog = await listWorkspaceGlobalLibraryCatalog(workspaceId, getDb());

  return (
    <WorkspaceShell
      workspace={{
        id: workspace.id,
        title: workspace.title,
      }}
      workspaces={workspaceList}
      conversations={conversationList}
      currentUser={{
        name: user.name,
        username: user.username,
      }}
      activeView="settings"
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title, href: `/workspaces/${workspace.id}` },
        { label: "设置" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4">
        <header className="grid gap-3 px-1 pb-0.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h1 className="text-[1.5rem] font-semibold text-app-text">空间设置</h1>
              <p className="text-sm text-app-muted-strong">{workspace.title}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={ui.chipSoft}>
                {workspace.workspacePrompt ? "已设预置提示词" : "无预置提示词"}
              </span>
              <span className={ui.chipSoft}>{libraryCatalog.length} 个可见资料库</span>
            </div>
          </div>
        </header>

        <WorkspaceSettingsForm
          workspaceId={workspace.id}
          initialTitle={workspace.title}
          initialPrompt={workspace.workspacePrompt}
        />
        <WorkspaceLibrarySubscriptions
          workspaceId={workspace.id}
          libraries={libraryCatalog.map((library) => ({
            ...library,
            updatedAt: library.updatedAt.toISOString(),
          }))}
        />
        <WorkspaceLifecyclePanel
          workspaceId={workspace.id}
          workspaceTitle={workspace.title}
        />
      </div>
    </WorkspaceShell>
  );
}
