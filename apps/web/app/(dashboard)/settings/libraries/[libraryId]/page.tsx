import { notFound } from "next/navigation";

import { getDb } from "@anchordesk/db";

import { GlobalLibraryMetadataForm } from "@/components/settings/global-library-metadata-form";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { SettingsShell } from "@/components/shared/settings-shell";
import { KnowledgeBaseExplorer } from "@/components/workspaces/knowledge-base-explorer";
import {
  findManagedKnowledgeLibrary,
  loadManagedKnowledgeLibrarySummary,
} from "@/lib/api/admin-knowledge-libraries";
import { loadKnowledgeLibraryExplorerData } from "@/lib/api/knowledge-library-explorer";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";

export default async function GlobalLibraryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ libraryId: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const user = await requireSessionUser();
  if (!isSuperAdmin(user)) {
    notFound();
  }

  const { libraryId } = await params;
  const { path } = await searchParams;
  const db = getDb();
  const library = await findManagedKnowledgeLibrary(libraryId, db);
  const librarySummary = await loadManagedKnowledgeLibrarySummary(libraryId, db);

  if (!library || !librarySummary) {
    notFound();
  }

  const explorer = await loadKnowledgeLibraryExplorerData({
    libraryId,
    path,
    db,
  });

  return (
    <SettingsShell
      sidebar={<SystemManagementSidebar activeSection="libraries" />}
    >
      <div className="flex w-full min-w-0 flex-col gap-4">
        <GlobalLibraryMetadataForm
          library={{
            id: library.id,
            title: library.title,
            slug: library.slug,
            description: library.description,
            status: library.status,
            documentCount: librarySummary.documentCount,
            subscriptionCount: librarySummary.subscriptionCount,
          }}
        />

        <KnowledgeBaseExplorer
          initialCurrentPath={explorer.currentDirectory.path}
          currentDirectoryId={explorer.currentDirectory.id}
          directories={explorer.directories}
          documents={explorer.documents}
          documentHrefBase={null}
          scopeQuery={{}}
          presignEndpoint={`/api/knowledge-libraries/${libraryId}/uploads/presign`}
          documentsEndpoint={`/api/knowledge-libraries/${libraryId}/documents`}
          directoriesEndpoint={`/api/knowledge-libraries/${libraryId}/directories`}
          operationsEndpoint={`/api/knowledge-libraries/${libraryId}/knowledge-base/operations`}
          downloadEndpoint={`/api/knowledge-libraries/${libraryId}/knowledge-base/download`}
          editable={library.status !== "archived"}
          canManageTasks
          mountedLibraries={[]}
          readOnlyNotice={
            library.status === "archived" ? "已归档 · 仅保留下载和浏览" : null
          }
          scopeLabel="全局资料库"
        />
      </div>
    </SettingsShell>
  );
}
