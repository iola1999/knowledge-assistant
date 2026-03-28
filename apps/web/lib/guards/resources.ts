import { and, eq } from "drizzle-orm";

import {
  citationAnchors,
  conversations,
  documentJobs,
  documentVersions,
  documents,
  getDb,
  reports,
  workspaces,
} from "@knowledge-assistant/db";

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
      mode: conversations.mode,
      status: conversations.status,
      agentSessionId: conversations.agentSessionId,
      agentWorkdir: conversations.agentWorkdir,
    })
    .from(conversations)
    .innerJoin(workspaces, eq(workspaces.id, conversations.workspaceId))
    .where(and(eq(conversations.id, conversationId), eq(workspaces.userId, userId)))
    .limit(1);

  return result[0] ?? null;
}

export async function requireOwnedDocument(documentId: string, userId: string) {
  const db = getDb();
  const result = await db
    .select({
      id: documents.id,
      workspaceId: documents.workspaceId,
      title: documents.title,
      logicalPath: documents.logicalPath,
      latestVersionId: documents.latestVersionId,
      status: documents.status,
    })
    .from(documents)
    .innerJoin(workspaces, eq(workspaces.id, documents.workspaceId))
    .where(and(eq(documents.id, documentId), eq(workspaces.userId, userId)))
    .limit(1);

  return result[0] ?? null;
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
    .where(and(eq(reports.id, reportId), eq(workspaces.userId, userId)))
    .limit(1);

  return result[0] ?? null;
}

export async function requireOwnedAnchor(anchorId: string, userId: string) {
  const db = getDb();
  const result = await db
    .select({
      id: citationAnchors.id,
      workspaceId: citationAnchors.workspaceId,
      documentId: citationAnchors.documentId,
      documentVersionId: citationAnchors.documentVersionId,
      pageNo: citationAnchors.pageNo,
      documentPath: citationAnchors.documentPath,
      anchorLabel: citationAnchors.anchorLabel,
      anchorText: citationAnchors.anchorText,
      bboxJson: citationAnchors.bboxJson,
    })
    .from(citationAnchors)
    .innerJoin(workspaces, eq(workspaces.id, citationAnchors.workspaceId))
    .where(and(eq(citationAnchors.id, anchorId), eq(workspaces.userId, userId)))
    .limit(1);

  return result[0] ?? null;
}

export async function requireOwnedDocumentJob(jobId: string, userId: string) {
  const db = getDb();
  const result = await db
    .select({
      id: documentJobs.id,
      documentVersionId: documentJobs.documentVersionId,
      stage: documentJobs.stage,
      status: documentJobs.status,
      progress: documentJobs.progress,
      errorCode: documentJobs.errorCode,
      errorMessage: documentJobs.errorMessage,
      createdAt: documentJobs.createdAt,
      updatedAt: documentJobs.updatedAt,
      startedAt: documentJobs.startedAt,
      finishedAt: documentJobs.finishedAt,
      workspaceId: documents.workspaceId,
      documentId: documents.id,
    })
    .from(documentJobs)
    .innerJoin(
      documentVersions,
      eq(documentVersions.id, documentJobs.documentVersionId),
    )
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(workspaces, eq(workspaces.id, documents.workspaceId))
    .where(and(eq(documentJobs.id, jobId), eq(workspaces.userId, userId)))
    .limit(1);

  return result[0] ?? null;
}
