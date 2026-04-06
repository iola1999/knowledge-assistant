import { notFound } from "next/navigation";

import { getDb } from "@anchordesk/db";

import { GlobalLibraryMetadataForm } from "@/components/settings/global-library-metadata-form";
import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { EditorialPageHeader } from "@/components/shared/editorial-page-header";
import { SettingsShell } from "@/components/shared/settings-shell";
import { KnowledgeBaseExplorer } from "@/components/workspaces/knowledge-base-explorer";
import {
  findManagedKnowledgeLibrary,
  loadManagedKnowledgeLibrarySummary,
} from "@/lib/api/admin-knowledge-libraries";
import { loadKnowledgeLibraryExplorerData } from "@/lib/api/knowledge-library-explorer";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { ui } from "@/lib/ui";
import { normalizeOptionalStringParam } from "@/lib/query-params";

export default async function GlobalLibraryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ libraryId: string }>;
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  const user = await requireSessionUser();
  if (!isSuperAdmin(user)) {
    notFound();
  }

  const { libraryId } = await params;
  const { path } = await searchParams;
  const normalizedPath = normalizeOptionalStringParam(path);
  const db = getDb();
  const library = await findManagedKnowledgeLibrary(libraryId, db);
  const librarySummary = await loadManagedKnowledgeLibrarySummary(libraryId, db);

  if (!library || !librarySummary) {
    notFound();
  }

  const explorer = await loadKnowledgeLibraryExplorerData({
    libraryId,
    path: normalizedPath,
    db,
  });

  return (
    <SettingsShell
      sidebar={<SystemManagementSidebar activeSection="libraries" />}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
        <EditorialPageHeader
          eyebrow="系统管理"
          title={library.title}
          description="维护资料库信息、目录与文件，控制可订阅状态。"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className={ui.chipSoft}>{librarySummary.documentCount} 份资料</span>
              <span className={ui.chipSoft}>{librarySummary.subscriptionCount} 个订阅</span>
            </div>
          }
        />

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
          showPageHeader={false}
          scopeLabel={`全局资料库 · ${library.title}`}
        />
      </div>
    </SettingsShell>
  );
}
