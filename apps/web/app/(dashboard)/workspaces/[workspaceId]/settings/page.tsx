import { WorkspaceSettingsForm } from "@/components/workspaces/workspace-settings-form";
import { WorkspaceLifecyclePanel } from "@/components/workspaces/workspace-lifecycle-panel";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { loadWorkspaceShellData } from "@/lib/api/workspace-shell-data";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { workspace, workspaceList, conversationList, user } =
    await loadWorkspaceShellData(workspaceId);

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
      <div className="mx-auto grid w-full max-w-[760px] gap-4">
        <WorkspaceSettingsForm
          workspaceId={workspace.id}
          initialTitle={workspace.title}
          initialPrompt={workspace.workspacePrompt}
        />
        <WorkspaceLifecyclePanel
          workspaceId={workspace.id}
          workspaceTitle={workspace.title}
        />
      </div>
    </WorkspaceShell>
  );
}
