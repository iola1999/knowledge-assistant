import { and, eq, isNull } from "drizzle-orm";
import { KNOWLEDGE_LIBRARY_TYPE } from "@anchordesk/contracts";

import {
  citationAnchors,
  conversations,
  documentJobs,
  documentVersions,
  documents,
  findWorkspaceAccessibleAnchor,
  findWorkspaceAccessibleDocument,
  getDb,
  knowledgeLibraries,
  reports,
  workspaces,
} from "@anchordesk/db";

export async function requireOwnedConversation(
  conversationId: string,
  userId: string,
) {
  const db = getDb();
  const result = await db
    .select({
      id: conversations.id,
      workspaceId: conversations.workspaceId,
      workspacePrompt: workspaces.workspacePrompt,
      title: conversations.title,
      status: conversations.status,
      modelProfileId: conversations.modelProfileId,
      agentSessionId: conversations.agentSessionId,
      agentWorkdir: conversations.agentWorkdir,
    })
    .from(conversations)
    .innerJoin(workspaces, eq(workspaces.id, conversations.workspaceId))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export async function requireOwnedDocument(documentId: string, userId: string) {
  const db = getDb();
  const accessibleWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), isNull(workspaces.archivedAt)));

  for (const workspace of accessibleWorkspaces) {
    const document = await findWorkspaceAccessibleDocument(workspace.id, documentId, db);
    if (document) {
      return document;
    }
  }

  return null;
}

export async function requireOwnedReport(reportId: string, userId: string) {
  const db = getDb();
  const result = await db
    .select({
      id: reports.id,
      workspaceId: reports.workspaceId,
      conversationId: reports.conversationId,
      title: reports.title,
      status: reports.status,
    })
    .from(reports)
    .innerJoin(workspaces, eq(workspaces.id, reports.workspaceId))
    .where(
      and(
        eq(reports.id, reportId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export async function requireOwnedAnchor(anchorId: string, userId: string) {
  const db = getDb();
  const accessibleWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), isNull(workspaces.archivedAt)));

  for (const workspace of accessibleWorkspaces) {
    const anchor = await findWorkspaceAccessibleAnchor(workspace.id, anchorId, db);
    if (anchor) {
      return anchor;
    }
  }

  return null;
}

export async function requireOwnedDocumentJob(jobId: string, userId: string) {
  const db = getDb();
  const result = await db
    .select(selectDocumentJobColumns())
    .from(documentJobs)
    .innerJoin(
      documentVersions,
      eq(documentVersions.id, documentJobs.documentVersionId),
    )
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(workspaces, eq(workspaces.id, documents.workspaceId))
    .where(
      and(
        eq(documentJobs.id, jobId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export async function requireSuperAdminManagedDocumentJob(jobId: string) {
  const db = getDb();
  const result = await db
    .select({
      ...selectDocumentJobColumns(),
      libraryType: knowledgeLibraries.libraryType,
    })
    .from(documentJobs)
    .innerJoin(
      documentVersions,
      eq(documentVersions.id, documentJobs.documentVersionId),
    )
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .leftJoin(knowledgeLibraries, eq(knowledgeLibraries.id, documents.libraryId))
    .where(eq(documentJobs.id, jobId))
    .limit(1);

  const job = result[0] ?? null;
  if (!job || job.libraryType !== KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED) {
    return null;
  }

  const { libraryType: _libraryType, ...accessibleJob } = job;
  return accessibleJob;
}

function selectDocumentJobColumns() {
  return {
    id: documentJobs.id,
    documentVersionId: documentJobs.documentVersionId,
    stage: documentJobs.stage,
    status: documentJobs.status,
    progress: documentJobs.progress,
    metadataJson: documentVersions.metadataJson,
    errorCode: documentJobs.errorCode,
    errorMessage: documentJobs.errorMessage,
    createdAt: documentJobs.createdAt,
    updatedAt: documentJobs.updatedAt,
    startedAt: documentJobs.startedAt,
    finishedAt: documentJobs.finishedAt,
    libraryId: documents.libraryId,
    workspaceId: documents.workspaceId,
    documentId: documents.id,
  };
}
