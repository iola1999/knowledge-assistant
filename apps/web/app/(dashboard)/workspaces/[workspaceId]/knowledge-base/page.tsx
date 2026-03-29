import { desc, eq, inArray } from "drizzle-orm";
import { RUN_STATUS } from "@anchordesk/contracts";

import {
  documentJobs,
  documentVersions,
  documents,
  getDb,
  workspaceDirectories,
} from "@anchordesk/db";

import { KnowledgeBaseExplorer } from "@/components/workspaces/knowledge-base-explorer";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";
import { KNOWLEDGE_BASE_ROOT_PATH, normalizeDirectoryPath } from "@/lib/api/directory-paths";
import { ensureWorkspaceRootDirectory } from "@/lib/api/workspace-directories";
import { loadWorkspaceShellData } from "@/lib/api/workspace-shell-data";

export default async function WorkspaceKnowledgeBasePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const { workspaceId } = await params;
  const { path } = await searchParams;
  const { workspace, workspaceList, conversationList, user } =
    await loadWorkspaceShellData(workspaceId);
  const db = getDb();
  await ensureWorkspaceRootDirectory(workspaceId, db);

  const [docs, directories] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(workspaceDirectories)
      .where(eq(workspaceDirectories.workspaceId, workspaceId))
      .orderBy(workspaceDirectories.path),
  ]);

  const activeDirectories = directories.filter((directory) => !directory.deletedAt);
  const normalizedPath = normalizeDirectoryPath(path ?? KNOWLEDGE_BASE_ROOT_PATH);
  const currentDirectory =
    activeDirectories.find((directory) => directory.path === normalizedPath) ??
    activeDirectories.find((directory) => directory.path === KNOWLEDGE_BASE_ROOT_PATH) ??
    null;

  if (!currentDirectory) {
    throw new Error("Knowledge base root directory is missing");
  }

  const latestVersionIds = docs
    .map((doc) => doc.latestVersionId)
    .filter((value): value is string => Boolean(value));

  const [latestVersions, latestJobs] = await Promise.all([
    latestVersionIds.length > 0
      ? db
          .select()
          .from(documentVersions)
          .where(inArray(documentVersions.id, latestVersionIds))
      : Promise.resolve([]),
    latestVersionIds.length > 0
      ? db
          .select()
          .from(documentJobs)
          .where(inArray(documentJobs.documentVersionId, latestVersionIds))
      : Promise.resolve([]),
  ]);

  const versionById = new Map(latestVersions.map((version) => [version.id, version]));
  const jobByVersionId = new Map(latestJobs.map((job) => [job.documentVersionId, job]));

  const docsWithProgress = docs.map((doc) => {
    const latestVersion = doc.latestVersionId
      ? versionById.get(doc.latestVersionId) ?? null
      : null;
    const latestJob = latestVersion ? jobByVersionId.get(latestVersion.id) ?? null : null;

    return {
      ...doc,
      latestVersion,
      latestJob,
    };
  });

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
      activeView="knowledge-base"
      breadcrumbs={[
        { label: "空间", href: "/workspaces" },
        { label: workspace.title, href: `/workspaces/${workspace.id}` },
        { label: "资料库" },
      ]}
    >
      <KnowledgeBaseExplorer
        workspaceId={workspace.id}
        initialCurrentPath={currentDirectory.path}
        currentDirectoryId={currentDirectory.id}
        directories={activeDirectories.map((directory) => ({
          id: directory.id,
          parentId: directory.parentId,
          name: directory.name,
          path: directory.path,
          createdAt: directory.createdAt.toISOString(),
          updatedAt: directory.updatedAt.toISOString(),
        }))}
        documents={docsWithProgress.map((doc) => ({
          id: doc.id,
          title: doc.title,
          sourceFilename: doc.sourceFilename,
          logicalPath: doc.logicalPath,
          directoryPath: doc.directoryPath,
          mimeType: doc.mimeType,
          docType: doc.docType,
          tags: doc.tagsJson ?? [],
          status: doc.status,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
          latestVersion: doc.latestVersion
            ? {
                id: doc.latestVersion.id,
                parseStatus: doc.latestVersion.parseStatus,
                fileSizeBytes: doc.latestVersion.fileSizeBytes ?? null,
              }
            : null,
          latestJob: doc.latestJob
            ? {
                id: doc.latestJob.id,
                status: doc.latestJob.status,
                stage: doc.latestJob.stage,
                progress: doc.latestJob.progress,
                updatedAt: doc.latestJob.updatedAt.toISOString(),
                errorCode: doc.latestJob.errorCode,
                errorMessage: doc.latestJob.errorMessage,
              }
            : null,
        }))}
      />
    </WorkspaceShell>
  );
}
