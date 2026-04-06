import {
  ensureWorkspacePrivateLibrary,
  getDb,
  resolveWorkspaceLibraryScope,
} from "@anchordesk/db";

import { KnowledgeBaseExplorer } from "@/components/workspaces/knowledge-base-explorer";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { loadKnowledgeLibraryExplorerData } from "@/lib/api/knowledge-library-explorer";
import { filterMountedGlobalLibraries } from "@/lib/api/knowledge-libraries";
import { listWorkspaceGlobalLibraryCatalog } from "@/lib/api/workspace-library-subscriptions";
import { loadWorkspaceShellData } from "@/lib/api/workspace-shell-data";

export default async function WorkspaceKnowledgeBasePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ path?: string; libraryId?: string }>;
}) {
  const { workspaceId } = await params;
  const { path, libraryId } = await searchParams;
  const { workspace, workspaceList, conversationList, user } =
    await loadWorkspaceShellData(workspaceId);
  const db = getDb();
  const privateLibrary = await ensureWorkspacePrivateLibrary(workspaceId, db);
  const scope = await resolveWorkspaceLibraryScope(workspaceId, db);
  const libraryCatalog = await listWorkspaceGlobalLibraryCatalog(workspaceId, db);
  const mountedLibraries = filterMountedGlobalLibraries(libraryCatalog).map((library) => ({
    id: library.id,
    title: library.title,
    description: library.description,
    documentCount: library.documentCount,
    updatedAt: library.updatedAt.toISOString(),
    href: `/workspaces/${workspaceId}/knowledge-base?libraryId=${library.id}`,
  }));

  const activeLibraryId =
    libraryId && scope.accessibleLibraryIds.includes(libraryId) ? libraryId : privateLibrary.id;
  const explorer = await loadKnowledgeLibraryExplorerData({
    libraryId: activeLibraryId,
    path,
    db,
  });
  const isViewingSubscribedGlobalLibrary = activeLibraryId !== privateLibrary.id;
  const selectedGlobalLibrary = isViewingSubscribedGlobalLibrary
    ? libraryCatalog.find((library) => library.id === activeLibraryId) ?? null
    : null;
  const scopeLabel = isViewingSubscribedGlobalLibrary ? "订阅资料库" : "我的资料";

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
      activeView="knowledge-base"
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title, href: `/workspaces/${workspace.id}` },
        { label: "资料库" },
      ]}
    >
      <KnowledgeBaseExplorer
        initialCurrentPath={explorer.currentDirectory.path}
        currentDirectoryId={explorer.currentDirectory.id}
        directories={explorer.directories}
        documents={explorer.documents}
        documentHrefBase={`/workspaces/${workspaceId}/documents`}
        scopeQuery={isViewingSubscribedGlobalLibrary ? { libraryId: activeLibraryId } : {}}
        presignEndpoint={`/api/workspaces/${workspaceId}/uploads/presign`}
        documentsEndpoint={
          isViewingSubscribedGlobalLibrary
            ? `/api/knowledge-libraries/${activeLibraryId}/documents`
            : `/api/workspaces/${workspaceId}/documents`
        }
        directoriesEndpoint={
          isViewingSubscribedGlobalLibrary
            ? null
            : `/api/workspaces/${workspaceId}/directories`
        }
        operationsEndpoint={
          isViewingSubscribedGlobalLibrary
            ? null
            : `/api/workspaces/${workspaceId}/knowledge-base/operations`
        }
        downloadEndpoint={
          isViewingSubscribedGlobalLibrary
            ? `/api/knowledge-libraries/${activeLibraryId}/knowledge-base/download`
            : `/api/workspaces/${workspaceId}/knowledge-base/download`
        }
        editable={!isViewingSubscribedGlobalLibrary}
        canManageTasks={!isViewingSubscribedGlobalLibrary}
        mountedLibraries={isViewingSubscribedGlobalLibrary ? [] : mountedLibraries}
        readOnlyNotice={
          isViewingSubscribedGlobalLibrary
            ? `已挂载只读 · ${selectedGlobalLibrary?.title ?? explorer.library.title}`
            : null
        }
        scopeLabel={scopeLabel}
        backLink={
          isViewingSubscribedGlobalLibrary
            ? {
                href: `/workspaces/${workspaceId}/knowledge-base`,
                label: "返回我的资料",
              }
            : null
        }
      />
    </WorkspaceShell>
  );
}
