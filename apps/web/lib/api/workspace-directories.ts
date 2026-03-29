import { eq, and } from "drizzle-orm";

import { getDb, workspaceDirectories } from "@anchordesk/db";

import {
  getDirectoryName,
  getParentDirectoryPath,
  listAncestorDirectoryPaths,
  normalizeDirectoryPath,
} from "./directory-paths";

type DirectoryDb = ReturnType<typeof getDb>;
type WorkspaceDirectoryRecord = typeof workspaceDirectories.$inferSelect;

export async function ensureWorkspaceDirectoryPath(
  workspaceId: string,
  path: string,
  db: DirectoryDb = getDb(),
) {
  const normalizedPath = normalizeDirectoryPath(path);
  const ancestors = listAncestorDirectoryPaths(normalizedPath);
  let parentId: string | null = null;
  let currentDirectory: WorkspaceDirectoryRecord | null = null;

  for (const ancestorPath of ancestors) {
    const name = getDirectoryName(ancestorPath);
    const rows: WorkspaceDirectoryRecord[] = await db
      .insert(workspaceDirectories)
      .values({
        workspaceId,
        parentId,
        name,
        path: ancestorPath,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workspaceDirectories.workspaceId, workspaceDirectories.path],
        set: {
          parentId,
          name,
          deletedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    const directory = rows[0] ?? null;

    if (!directory) {
      continue;
    }

    currentDirectory = directory;
    parentId = directory.id;
  }

  return currentDirectory;
}

export async function findWorkspaceDirectoryByPath(
  workspaceId: string,
  path: string,
  db: DirectoryDb = getDb(),
) {
  const normalizedPath = normalizeDirectoryPath(path);
  const rows = await db
    .select()
    .from(workspaceDirectories)
    .where(
      and(
        eq(workspaceDirectories.workspaceId, workspaceId),
        eq(workspaceDirectories.path, normalizedPath),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function ensureWorkspaceRootDirectory(
  workspaceId: string,
  db: DirectoryDb = getDb(),
) {
  return ensureWorkspaceDirectoryPath(workspaceId, "资料库", db);
}

export async function restoreWorkspaceDirectoryAncestors(
  workspaceId: string,
  path: string,
  db: DirectoryDb = getDb(),
) {
  const normalizedPath = normalizeDirectoryPath(path);
  const parentPath = getParentDirectoryPath(normalizedPath);

  if (!parentPath) {
    return ensureWorkspaceDirectoryPath(workspaceId, normalizedPath, db);
  }

  await ensureWorkspaceDirectoryPath(workspaceId, parentPath, db);
  return ensureWorkspaceDirectoryPath(workspaceId, normalizedPath, db);
}
