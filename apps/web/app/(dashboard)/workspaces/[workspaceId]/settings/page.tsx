import { getDb } from "@anchordesk/db";

import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
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
        isSuperAdmin: user.isSuperAdmin,
      }}
      activeView="settings"
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title, href: `/workspaces/${workspace.id}` },
        { label: "设置" },
      ]}
    >
      <div className="flex w-full min-w-0 flex-col gap-4">
        <EditorialPageHeader
          eyebrow="空间"
          title="空间设置"
          description="调整空间名称、资料订阅和生命周期设置。"
          actions={
            <div className="flex items-center gap-2">
              <span className={ui.chip}>
                {workspace.workspacePrompt ? "已设预置提示词" : "无预置提示词"}
              </span>
              <span className={ui.chip}>{libraryCatalog.length} 个可见资料库</span>
            </div>
          }
        />

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
