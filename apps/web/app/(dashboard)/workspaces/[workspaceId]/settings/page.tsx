import { WorkspaceSettingsForm } from "@/components/workspaces/workspace-settings-form";
import { WorkspaceLifecyclePanel } from "@/components/workspaces/workspace-lifecycle-panel";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { loadWorkspaceShellData } from "@/lib/api/workspace-shell-data";
import { cn, ui } from "@/lib/ui";

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
      <div className={cn(ui.panelLarge, "mx-auto grid w-full max-w-[760px] gap-0 px-5 py-5 md:px-6 md:py-6")}>
        <WorkspaceSettingsForm
          workspaceId={workspace.id}
          initialTitle={workspace.title}
          initialPrompt={workspace.workspacePrompt}
          framed={false}
        />
        <WorkspaceLifecyclePanel
          workspaceId={workspace.id}
          workspaceTitle={workspace.title}
          framed={false}
        />
      </div>
    </WorkspaceShell>
  );
}
