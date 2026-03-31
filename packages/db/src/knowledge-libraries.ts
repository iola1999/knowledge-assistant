import { and, eq, inArray, ne } from "drizzle-orm";

import {
  DOCUMENT_STATUS,
  KNOWLEDGE_LIBRARY_STATUS,
  KNOWLEDGE_LIBRARY_TYPE,
  KNOWLEDGE_SOURCE_SCOPE,
  WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS,
  type KnowledgeLibraryStatus,
  type KnowledgeLibraryType,
  type KnowledgeSourceScope,
  type WorkspaceLibrarySubscriptionStatus,
} from "@anchordesk/contracts";

import { getDb } from "./client";
import {
  citationAnchors,
  documents,
  knowledgeLibraries,
  workspaceLibrarySubscriptions,
  workspaces,
} from "./schema";

type DbLike = ReturnType<typeof getDb>;

export type WorkspaceLibraryScopeSummary = {
  privateLibraryId: string | null;
  accessibleLibraryIds: string[];
  subscribedLibraryIds: string[];
  searchableLibraryIds: string[];
};

export type WorkspaceSearchableKnowledgeSummary = {
  hasReadySearchableKnowledge: boolean;
  totalReadyDocumentCount: number;
  readyPrivateDocumentCount: number;
  readyGlobalDocumentCount: number;
  searchableGlobalLibraryCount: number;
};

export type WorkspaceLibraryScopeInput = {
  workspaceId: string;
  libraries: Array<{
    id: string;
    libraryType: KnowledgeLibraryType;
    status: KnowledgeLibraryStatus;
    workspaceId: string | null;
  }>;
  subscriptions: Array<{
    workspaceId: string;
    libraryId: string;
    status: WorkspaceLibrarySubscriptionStatus;
    searchEnabled: boolean;
  }>;
};

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function isLibraryAccessibleStatus(status: KnowledgeLibraryStatus) {
  return status === KNOWLEDGE_LIBRARY_STATUS.ACTIVE;
}

function isSubscriptionAccessibleStatus(status: WorkspaceLibrarySubscriptionStatus) {
  return (
    status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE ||
    status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED
  );
}

function isSubscriptionSearchableStatus(status: WorkspaceLibrarySubscriptionStatus) {
  return status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE;
}

export function getKnowledgeSourceScope(
  libraryType: KnowledgeLibraryType,
): KnowledgeSourceScope {
  return libraryType === KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE
    ? KNOWLEDGE_SOURCE_SCOPE.WORKSPACE_PRIVATE
    : KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY;
}

export function buildWorkspacePrivateLibrarySlug(input: {
  workspaceId: string;
  workspaceSlug?: string | null;
}) {
  const slugSeed = String(input.workspaceSlug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallbackSeed = input.workspaceId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `workspace-${slugSeed || fallbackSeed || "library"}`;
}

export function computeWorkspaceLibraryScope(
  input: WorkspaceLibraryScopeInput,
): WorkspaceLibraryScopeSummary {
  const privateLibrary =
    input.libraries.find(
      (library) =>
        library.workspaceId === input.workspaceId &&
        library.libraryType === KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE &&
        isLibraryAccessibleStatus(library.status),
    ) ?? null;

  const libraryById = new Map(input.libraries.map((library) => [library.id, library] as const));
  const subscribedLibraries = input.subscriptions
    .filter(
      (subscription) =>
        subscription.workspaceId === input.workspaceId &&
        isSubscriptionAccessibleStatus(subscription.status),
    )
    .map((subscription) => libraryById.get(subscription.libraryId))
    .filter((library): library is NonNullable<typeof library> => Boolean(library))
    .filter(
      (library) =>
        library.libraryType === KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED &&
        isLibraryAccessibleStatus(library.status),
    );

  const accessibleLibraryIds = dedupeStrings([
    privateLibrary?.id ?? null,
    ...subscribedLibraries.map((library) => library.id),
  ]);
  const subscribedLibraryIds = dedupeStrings(
    input.subscriptions
      .filter(
        (subscription) =>
          subscription.workspaceId === input.workspaceId &&
          isSubscriptionAccessibleStatus(subscription.status),
      )
      .map((subscription) => {
        const library = libraryById.get(subscription.libraryId);
        if (
          !library ||
          library.libraryType !== KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED ||
          !isLibraryAccessibleStatus(library.status)
        ) {
          return null;
        }

        return library.id;
      }),
  );
  const searchableLibraryIds = dedupeStrings([
    privateLibrary?.id ?? null,
    ...input.subscriptions
      .filter(
        (subscription) =>
          subscription.workspaceId === input.workspaceId &&
          isSubscriptionSearchableStatus(subscription.status) &&
          subscription.searchEnabled,
      )
      .map((subscription) => {
        const library = libraryById.get(subscription.libraryId);
        if (
          !library ||
          library.libraryType !== KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED ||
          !isLibraryAccessibleStatus(library.status)
        ) {
          return null;
        }

        return library.id;
      }),
  ]);

  return {
    privateLibraryId: privateLibrary?.id ?? null,
    accessibleLibraryIds,
    subscribedLibraryIds,
    searchableLibraryIds,
  };
}

export function computeWorkspaceSearchableKnowledgeSummary(input: {
  privateLibraryId: string | null;
  searchableLibraryIds: string[];
  readyDocumentLibraryIds: Array<string | null | undefined>;
}): WorkspaceSearchableKnowledgeSummary {
  const searchableLibraryIds = dedupeStrings(input.searchableLibraryIds);
  const searchableLibrarySet = new Set(searchableLibraryIds);
  const readyDocumentLibraryIds = input.readyDocumentLibraryIds
    .filter((libraryId): libraryId is string => Boolean(libraryId?.trim()))
    .filter((libraryId) => searchableLibrarySet.has(libraryId));
  const privateLibraryId = input.privateLibraryId?.trim() || null;
  const readyPrivateDocumentCount = privateLibraryId
    ? readyDocumentLibraryIds.filter((libraryId) => libraryId === privateLibraryId).length
    : 0;
  const readyGlobalDocumentCount = readyDocumentLibraryIds.length - readyPrivateDocumentCount;
  const searchableGlobalLibraryCount = searchableLibraryIds.filter(
    (libraryId) => libraryId !== privateLibraryId,
  ).length;
  const totalReadyDocumentCount = readyDocumentLibraryIds.length;

  return {
    hasReadySearchableKnowledge: totalReadyDocumentCount > 0,
    totalReadyDocumentCount,
    readyPrivateDocumentCount,
    readyGlobalDocumentCount,
    searchableGlobalLibraryCount,
  };
}

export async function ensureWorkspacePrivateLibrary(
  workspaceId: string,
  db: DbLike = getDb(),
) {
  const [existingLibrary] = await db
    .select()
    .from(knowledgeLibraries)
    .where(
      and(
        eq(knowledgeLibraries.workspaceId, workspaceId),
        eq(
          knowledgeLibraries.libraryType,
          KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE,
        ),
      ),
    )
    .limit(1);

  if (existingLibrary) {
    return existingLibrary;
  }

  const [workspace] = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      title: workspaces.title,
      userId: workspaces.userId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const baseSlug = buildWorkspacePrivateLibrarySlug({
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  });
  const conflictingLibrary = await db
    .select({ id: knowledgeLibraries.id })
    .from(knowledgeLibraries)
    .where(and(eq(knowledgeLibraries.slug, baseSlug), ne(knowledgeLibraries.workspaceId, workspaceId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const slug = conflictingLibrary ? `${baseSlug}-${workspace.id.slice(0, 8)}` : baseSlug;

  const [library] = await db
    .insert(knowledgeLibraries)
    .values({
      libraryType: KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE,
      workspaceId: workspace.id,
      slug,
      title: workspace.title,
      status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
      managedByUserId: workspace.userId,
    })
    .returning();

  return library;
}

export async function resolveWorkspaceLibraryScope(
  workspaceId: string,
  db: DbLike = getDb(),
) {
  await ensureWorkspacePrivateLibrary(workspaceId, db);

  const [libraries, subscriptions] = await Promise.all([
    db.select({
      id: knowledgeLibraries.id,
      libraryType: knowledgeLibraries.libraryType,
      status: knowledgeLibraries.status,
      workspaceId: knowledgeLibraries.workspaceId,
    }).from(knowledgeLibraries),
    db
      .select({
        workspaceId: workspaceLibrarySubscriptions.workspaceId,
        libraryId: workspaceLibrarySubscriptions.libraryId,
        status: workspaceLibrarySubscriptions.status,
        searchEnabled: workspaceLibrarySubscriptions.searchEnabled,
      })
      .from(workspaceLibrarySubscriptions)
      .where(eq(workspaceLibrarySubscriptions.workspaceId, workspaceId)),
  ]);

  return computeWorkspaceLibraryScope({
    workspaceId,
    libraries,
    subscriptions,
  });
}

export async function summarizeWorkspaceSearchableKnowledge(
  workspaceId: string,
  db: DbLike = getDb(),
) {
  const scope = await resolveWorkspaceLibraryScope(workspaceId, db);

  if (scope.searchableLibraryIds.length === 0) {
    return computeWorkspaceSearchableKnowledgeSummary({
      privateLibraryId: scope.privateLibraryId,
      searchableLibraryIds: scope.searchableLibraryIds,
      readyDocumentLibraryIds: [],
    });
  }

  const readyDocuments = await db
    .select({
      libraryId: documents.libraryId,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.libraryId, scope.searchableLibraryIds),
        eq(documents.status, DOCUMENT_STATUS.READY),
      ),
    );

  return computeWorkspaceSearchableKnowledgeSummary({
    privateLibraryId: scope.privateLibraryId,
    searchableLibraryIds: scope.searchableLibraryIds,
    readyDocumentLibraryIds: readyDocuments.map((document) => document.libraryId),
  });
}

export async function findWorkspaceAccessibleDocument(
  workspaceId: string,
  documentId: string,
  db: DbLike = getDb(),
) {
  const scope = await resolveWorkspaceLibraryScope(workspaceId, db);
  if (scope.accessibleLibraryIds.length === 0) {
    return null;
  }

  const [document] = await db
    .select({
      id: documents.id,
      libraryId: documents.libraryId,
      workspaceId: documents.workspaceId,
      title: documents.title,
      logicalPath: documents.logicalPath,
      latestVersionId: documents.latestVersionId,
      status: documents.status,
      mimeType: documents.mimeType,
      sourceFilename: documents.sourceFilename,
      directoryPath: documents.directoryPath,
      docType: documents.docType,
      tagsJson: documents.tagsJson,
      libraryTitle: knowledgeLibraries.title,
      libraryType: knowledgeLibraries.libraryType,
    })
    .from(documents)
    .innerJoin(knowledgeLibraries, eq(knowledgeLibraries.id, documents.libraryId))
    .where(
      and(
        eq(documents.id, documentId),
        inArray(documents.libraryId, scope.accessibleLibraryIds),
      ),
    )
    .limit(1);

  return document ?? null;
}

export async function findWorkspaceAccessibleAnchor(
  workspaceId: string,
  anchorId: string,
  db: DbLike = getDb(),
) {
  const scope = await resolveWorkspaceLibraryScope(workspaceId, db);
  if (scope.accessibleLibraryIds.length === 0) {
    return null;
  }

  const [anchor] = await db
    .select({
      id: citationAnchors.id,
      workspaceId: citationAnchors.workspaceId,
      libraryId: citationAnchors.libraryId,
      documentId: citationAnchors.documentId,
      documentVersionId: citationAnchors.documentVersionId,
      pageNo: citationAnchors.pageNo,
      documentPath: citationAnchors.documentPath,
      anchorLabel: citationAnchors.anchorLabel,
      anchorText: citationAnchors.anchorText,
      bboxJson: citationAnchors.bboxJson,
      libraryTitle: knowledgeLibraries.title,
      libraryType: knowledgeLibraries.libraryType,
    })
    .from(citationAnchors)
    .innerJoin(knowledgeLibraries, eq(knowledgeLibraries.id, citationAnchors.libraryId))
    .where(
      and(
        eq(citationAnchors.id, anchorId),
        inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
      ),
    )
    .limit(1);

  return anchor ?? null;
}
