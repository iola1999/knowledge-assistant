import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@anchordesk/db";

import { GlobalLibraryMetadataForm } from "@/components/settings/global-library-metadata-form";
import {
  SettingsShell,
  SettingsShellSidebar,
} from "@/components/shared/settings-shell";
import { ArrowLeftIcon } from "@/components/icons";
import { KnowledgeBaseExplorer } from "@/components/workspaces/knowledge-base-explorer";
import {
  findManagedKnowledgeLibrary,
  loadManagedKnowledgeLibrarySummary,
} from "@/lib/api/admin-knowledge-libraries";
import { loadKnowledgeLibraryExplorerData } from "@/lib/api/knowledge-library-explorer";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";

export default async function GlobalLibraryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ libraryId: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const user = await requireSessionUser();
  if (!isSuperAdminUsername(user.username)) {
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
      sidebar={
        <SettingsShellSidebar>
          <Link
            href="/settings/libraries"
            className="inline-flex items-center gap-1.5 self-start rounded-full px-1.5 py-1 text-[13px] text-app-muted-strong transition hover:bg-white/82 hover:text-app-text"
          >
            <ArrowLeftIcon />
            返回资料库列表
          </Link>

          <div className="grid gap-1 px-1">
            <h1 className="text-[1.25rem] font-semibold text-app-text">{library.title}</h1>
            <p className="text-[13px] leading-6 text-app-muted-strong">
              上传文档、整理目录，并控制该资料库是否允许工作空间订阅
            </p>
          </div>
        </SettingsShellSidebar>
      }
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
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
