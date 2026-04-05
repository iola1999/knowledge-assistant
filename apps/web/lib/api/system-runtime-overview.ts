import "server-only";

import { count, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  APP_UPGRADE_STATUS,
  DOCUMENT_STATUS,
  KNOWLEDGE_LIBRARY_TYPE,
  KNOWLEDGE_SOURCE_SCOPE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  RUN_STATUS,
} from "@anchordesk/contracts";
import {
  appUpgrades,
  conversationAttachments,
  conversations,
  documentJobs,
  documents,
  getDb,
  knowledgeLibraries,
  llmModelProfiles,
  messageCitations,
  messages,
  retrievalResults,
  retrievalRuns,
  sessions,
  systemSettings,
  users,
  workspaces,
} from "@anchordesk/db";

import {
  AUTH_ALLOW_REGISTRATION_SETTING_KEY,
  parseSystemSettingBoolean,
} from "@/lib/api/system-settings";
import {
  SYSTEM_RUNTIME_WINDOWS,
  summarizeSystemRuntimeWindow,
  type SystemRuntimeFailureBucket,
  type SystemRuntimeFreshness,
  type SystemRuntimeOverview,
  type SystemRuntimeReadiness,
  type SystemRuntimeSnapshot,
  type SystemRuntimeWindowDataset,
  type SystemRuntimeWindowId,
  type SystemRuntimeWindowSummary,
} from "@/lib/api/system-runtime-overview-shared";

const CRITICAL_RUNTIME_SETTINGS = [
  {
    key: "app_url",
    label: "Web 地址",
  },
  {
    key: "agent_runtime_url",
    label: "Agent Runtime",
  },
  {
    key: "parser_service_url",
    label: "Parser Service",
  },
  {
    key: "redis_url",
    label: "Redis",
  },
  {
    key: "qdrant_url",
    label: "Qdrant",
  },
  {
    key: "s3_endpoint",
    label: "对象存储",
  },
  {
    key: "s3_bucket",
    label: "Bucket",
  },
] as const;

function parseCount(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function toIsoString(value: unknown) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toISOString() : null;
}

function subtractDays(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildWindowStarts(now: Date) {
  return Object.fromEntries(
    SYSTEM_RUNTIME_WINDOWS.map((window) => [window.id, subtractDays(now, window.days)]),
  ) as Record<SystemRuntimeWindowId, Date>;
}

function extractAssistantFailureReason(
  structuredJson: Record<string, unknown> | null | undefined,
) {
  const value = structuredJson?.agent_error;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "未记录错误";
}

function extractIngestFailureReason(input: {
  errorCode: string | null;
  errorMessage: string | null;
}) {
  if (input.errorCode?.trim()) {
    return input.errorCode.trim();
  }

  if (input.errorMessage?.trim()) {
    return input.errorMessage.trim();
  }

  return "未记录错误";
}

function summarizeFailureBuckets<Row extends { createdAt: Date }>(
  rows: Row[],
  windowStarts: Record<SystemRuntimeWindowId, Date>,
  resolveLabel: (row: Row) => string,
) {
  const bucketMaps = new Map<SystemRuntimeWindowId, Map<string, number>>(
    SYSTEM_RUNTIME_WINDOWS.map((window) => [window.id, new Map<string, number>()]),
  );

  for (const row of rows) {
    const label = resolveLabel(row);
    for (const window of SYSTEM_RUNTIME_WINDOWS) {
      if (row.createdAt < windowStarts[window.id]) {
        continue;
      }

      const currentMap = bucketMaps.get(window.id)!;
      currentMap.set(label, (currentMap.get(label) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    SYSTEM_RUNTIME_WINDOWS.map((window) => [
      window.id,
      Array.from(bucketMaps.get(window.id)!.entries())
        .map(([label, count]) => ({
          label,
          count,
        }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
        .slice(0, 5),
    ]),
  ) as Record<SystemRuntimeWindowId, SystemRuntimeFailureBucket[]>;
}

async function loadRuntimeWindowDataset(
  startAt: Date,
  db: ReturnType<typeof getDb>,
): Promise<SystemRuntimeWindowDataset> {
  const retrievalResultCounts = db
    .select({
      retrievalRunId: retrievalResults.retrievalRunId,
      resultCount: count(retrievalResults.id).as("resultCount"),
    })
    .from(retrievalResults)
    .groupBy(retrievalResults.retrievalRunId)
    .as("retrieval_result_counts");

  const [
    messageActivityRow,
    conversationsRow,
    documentsRow,
    assistantCitationRow,
    citationRow,
    retrievalRow,
    documentJobRow,
  ] = await Promise.all([
    db
      .select({
        activeUsers: sql<number>`coalesce(count(distinct case when ${messages.role} = ${MESSAGE_ROLE.USER} then ${workspaces.userId} end), 0)::int`,
        activeWorkspaces: sql<number>`coalesce(count(distinct case when ${messages.role} = ${MESSAGE_ROLE.USER} then ${conversations.workspaceId} end), 0)::int`,
        userMessages: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.USER}), 0)::int`,
        assistantCompleted: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.COMPLETED}), 0)::int`,
        assistantFailed: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.FAILED}), 0)::int`,
        assistantStreaming: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.STREAMING}), 0)::int`,
        toolCompleted: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.TOOL} and ${messages.status} = ${MESSAGE_STATUS.COMPLETED}), 0)::int`,
        toolFailed: sql<number>`coalesce(count(*) filter (where ${messages.role} = ${MESSAGE_ROLE.TOOL} and ${messages.status} = ${MESSAGE_STATUS.FAILED}), 0)::int`,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(workspaces, eq(workspaces.id, conversations.workspaceId))
      .where(gte(messages.createdAt, startAt))
      .then((rows) => rows[0]),
    db
      .select({
        count: count(conversations.id),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, startAt))
      .then((rows) => rows[0]),
    db
      .select({
        count: count(documents.id),
      })
      .from(documents)
      .where(gte(documents.createdAt, startAt))
      .then((rows) => rows[0]),
    db
      .select({
        assistantWithCitations: sql<number>`coalesce(count(distinct ${messages.id}), 0)::int`,
      })
      .from(messages)
      .innerJoin(messageCitations, eq(messageCitations.messageId, messages.id))
      .where(
        sql`${messages.createdAt} >= ${startAt} and ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.COMPLETED}`,
      )
      .then((rows) => rows[0]),
    db
      .select({
        citationCount: count(messageCitations.id),
        citationsWorkspace: sql<number>`coalesce(count(*) filter (where ${messageCitations.sourceScope} = ${KNOWLEDGE_SOURCE_SCOPE.WORKSPACE_PRIVATE}), 0)::int`,
        citationsGlobal: sql<number>`coalesce(count(*) filter (where ${messageCitations.sourceScope} = ${KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY}), 0)::int`,
        citationsWeb: sql<number>`coalesce(count(*) filter (where ${messageCitations.sourceScope} = ${KNOWLEDGE_SOURCE_SCOPE.WEB}), 0)::int`,
      })
      .from(messageCitations)
      .innerJoin(messages, eq(messages.id, messageCitations.messageId))
      .where(gte(messages.createdAt, startAt))
      .then((rows) => rows[0]),
    db
      .select({
        retrievalRuns: count(retrievalRuns.id),
        retrievalRunsWithHits: sql<number>`coalesce(count(*) filter (where coalesce(${retrievalResultCounts.resultCount}, 0) > 0), 0)::int`,
        retrievalResultCount: sql<number>`coalesce(sum(coalesce(${retrievalResultCounts.resultCount}, 0)), 0)::int`,
      })
      .from(retrievalRuns)
      .leftJoin(
        retrievalResultCounts,
        eq(retrievalResultCounts.retrievalRunId, retrievalRuns.id),
      )
      .where(gte(retrievalRuns.createdAt, startAt))
      .then((rows) => rows[0]),
    db
      .select({
        documentJobsCompleted: sql<number>`coalesce(count(*) filter (where ${documentJobs.status} = ${RUN_STATUS.COMPLETED}), 0)::int`,
        documentJobsFailed: sql<number>`coalesce(count(*) filter (where ${documentJobs.status} = ${RUN_STATUS.FAILED}), 0)::int`,
        documentJobsCancelled: sql<number>`coalesce(count(*) filter (where ${documentJobs.status} = ${RUN_STATUS.CANCELLED}), 0)::int`,
      })
      .from(documentJobs)
      .where(gte(documentJobs.createdAt, startAt))
      .then((rows) => rows[0]),
  ]);

  return {
    activeUsers: parseCount(messageActivityRow?.activeUsers),
    activeWorkspaces: parseCount(messageActivityRow?.activeWorkspaces),
    newConversations: parseCount(conversationsRow?.count),
    userMessages: parseCount(messageActivityRow?.userMessages),
    documentsCreated: parseCount(documentsRow?.count),
    assistantCompleted: parseCount(messageActivityRow?.assistantCompleted),
    assistantFailed: parseCount(messageActivityRow?.assistantFailed),
    assistantStreaming: parseCount(messageActivityRow?.assistantStreaming),
    assistantWithCitations: parseCount(assistantCitationRow?.assistantWithCitations),
    toolCompleted: parseCount(messageActivityRow?.toolCompleted),
    toolFailed: parseCount(messageActivityRow?.toolFailed),
    retrievalRuns: parseCount(retrievalRow?.retrievalRuns),
    retrievalRunsWithHits: parseCount(retrievalRow?.retrievalRunsWithHits),
    retrievalResultCount: parseCount(retrievalRow?.retrievalResultCount),
    citationCount: parseCount(citationRow?.citationCount),
    citationsWorkspace: parseCount(citationRow?.citationsWorkspace),
    citationsGlobal: parseCount(citationRow?.citationsGlobal),
    citationsWeb: parseCount(citationRow?.citationsWeb),
    documentJobsCompleted: parseCount(documentJobRow?.documentJobsCompleted),
    documentJobsFailed: parseCount(documentJobRow?.documentJobsFailed),
    documentJobsCancelled: parseCount(documentJobRow?.documentJobsCancelled),
  };
}

async function loadRuntimeSnapshot(db: ReturnType<typeof getDb>, now: Date) {
  const [
    usersRow,
    sessionsRow,
    workspacesRow,
    conversationsRow,
    librariesRow,
    documentsRow,
    attachmentsRow,
    documentJobRow,
  ] = await Promise.all([
    db
      .select({
        totalUsers: count(users.id),
      })
      .from(users)
      .then((rows) => rows[0]),
    db
      .select({
        activeSessions: count(sessions.id),
      })
      .from(sessions)
      .where(gte(sessions.expiresAt, now))
      .then((rows) => rows[0]),
    db
      .select({
        totalWorkspaces: count(workspaces.id),
        archivedWorkspaces: sql<number>`coalesce(count(*) filter (where ${workspaces.archivedAt} is not null), 0)::int`,
      })
      .from(workspaces)
      .then((rows) => rows[0]),
    db
      .select({
        totalConversations: count(conversations.id),
        archivedConversations: sql<number>`coalesce(count(*) filter (where ${conversations.archivedAt} is not null), 0)::int`,
      })
      .from(conversations)
      .then((rows) => rows[0]),
    db
      .select({
        totalLibraries: count(knowledgeLibraries.id),
        globalLibraries: sql<number>`coalesce(count(*) filter (where ${knowledgeLibraries.libraryType} = ${KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED}), 0)::int`,
        activeGlobalLibraries: sql<number>`coalesce(count(*) filter (where ${knowledgeLibraries.libraryType} = ${KNOWLEDGE_LIBRARY_TYPE.GLOBAL_MANAGED} and ${knowledgeLibraries.archivedAt} is null), 0)::int`,
      })
      .from(knowledgeLibraries)
      .then((rows) => rows[0]),
    db
      .select({
        totalDocuments: count(documents.id),
        readyDocuments: sql<number>`coalesce(count(*) filter (where ${documents.status} = ${DOCUMENT_STATUS.READY}), 0)::int`,
        processingDocuments: sql<number>`coalesce(count(*) filter (where ${documents.status} in (${DOCUMENT_STATUS.UPLOADING}, ${DOCUMENT_STATUS.PROCESSING})), 0)::int`,
        failedDocuments: sql<number>`coalesce(count(*) filter (where ${documents.status} = ${DOCUMENT_STATUS.FAILED}), 0)::int`,
        archivedDocuments: sql<number>`coalesce(count(*) filter (where ${documents.status} = ${DOCUMENT_STATUS.ARCHIVED}), 0)::int`,
      })
      .from(documents)
      .then((rows) => rows[0]),
    db
      .select({
        totalConversationAttachments: count(conversationAttachments.id),
      })
      .from(conversationAttachments)
      .then((rows) => rows[0]),
    db
      .select({
        queuedDocumentJobs: sql<number>`coalesce(count(*) filter (where ${documentJobs.status} = ${RUN_STATUS.QUEUED}), 0)::int`,
        runningDocumentJobs: sql<number>`coalesce(count(*) filter (where ${documentJobs.status} = ${RUN_STATUS.RUNNING}), 0)::int`,
      })
      .from(documentJobs)
      .then((rows) => rows[0]),
  ]);

  return {
    totalUsers: parseCount(usersRow?.totalUsers),
    activeSessions: parseCount(sessionsRow?.activeSessions),
    totalWorkspaces: parseCount(workspacesRow?.totalWorkspaces),
    archivedWorkspaces: parseCount(workspacesRow?.archivedWorkspaces),
    totalConversations: parseCount(conversationsRow?.totalConversations),
    archivedConversations: parseCount(conversationsRow?.archivedConversations),
    totalLibraries: parseCount(librariesRow?.totalLibraries),
    globalLibraries: parseCount(librariesRow?.globalLibraries),
    activeGlobalLibraries: parseCount(librariesRow?.activeGlobalLibraries),
    totalDocuments: parseCount(documentsRow?.totalDocuments),
    readyDocuments: parseCount(documentsRow?.readyDocuments),
    processingDocuments: parseCount(documentsRow?.processingDocuments),
    failedDocuments: parseCount(documentsRow?.failedDocuments),
    archivedDocuments: parseCount(documentsRow?.archivedDocuments),
    totalConversationAttachments: parseCount(attachmentsRow?.totalConversationAttachments),
    queuedDocumentJobs: parseCount(documentJobRow?.queuedDocumentJobs),
    runningDocumentJobs: parseCount(documentJobRow?.runningDocumentJobs),
  } satisfies SystemRuntimeSnapshot;
}

async function loadRuntimeReadiness(db: ReturnType<typeof getDb>) {
  const settingKeys = [
    AUTH_ALLOW_REGISTRATION_SETTING_KEY,
    ...CRITICAL_RUNTIME_SETTINGS.map((item) => item.key),
  ];
  const [modelsRow, upgradesRow, settingsRows] = await Promise.all([
    db
      .select({
        totalModels: count(llmModelProfiles.id),
        enabledModels: sql<number>`coalesce(count(*) filter (where ${llmModelProfiles.enabled} = true), 0)::int`,
        defaultModels: sql<number>`coalesce(count(*) filter (where ${llmModelProfiles.isDefault} = true), 0)::int`,
      })
      .from(llmModelProfiles)
      .then((rows) => rows[0]),
    db
      .select({
        runningUpgrades: sql<number>`coalesce(count(*) filter (where ${appUpgrades.status} = ${APP_UPGRADE_STATUS.RUNNING}), 0)::int`,
        failedUpgrades: sql<number>`coalesce(count(*) filter (where ${appUpgrades.status} = ${APP_UPGRADE_STATUS.FAILED}), 0)::int`,
      })
      .from(appUpgrades)
      .then((rows) => rows[0]),
    db
      .select({
        settingKey: systemSettings.settingKey,
        valueText: systemSettings.valueText,
      })
      .from(systemSettings)
      .where(inArray(systemSettings.settingKey, settingKeys)),
  ]);

  const valueByKey = new Map(
    settingsRows.map((row) => [row.settingKey, row.valueText] as const),
  );
  const criticalSettings = CRITICAL_RUNTIME_SETTINGS.map((setting) => ({
    key: setting.key,
    label: setting.label,
    configured: Boolean(valueByKey.get(setting.key)?.trim()),
  }));

  return {
    registrationOpen: parseSystemSettingBoolean(
      valueByKey.get(AUTH_ALLOW_REGISTRATION_SETTING_KEY) ?? "",
      false,
    ),
    totalModels: parseCount(modelsRow?.totalModels),
    enabledModels: parseCount(modelsRow?.enabledModels),
    hasDefaultModel: parseCount(modelsRow?.defaultModels) > 0,
    runningUpgrades: parseCount(upgradesRow?.runningUpgrades),
    failedUpgrades: parseCount(upgradesRow?.failedUpgrades),
    configuredCriticalSettings: criticalSettings.filter((item) => item.configured).length,
    totalCriticalSettings: criticalSettings.length,
    criticalSettings,
  } satisfies SystemRuntimeReadiness;
}

async function loadRuntimeFreshness(db: ReturnType<typeof getDb>) {
  const [messageRow, userRow, documentJobRow, retrievalRow] = await Promise.all([
    db
      .select({
        lastUserMessageAt: sql<Date | string | null>`max(case when ${messages.role} = ${MESSAGE_ROLE.USER} then ${messages.createdAt} end)`,
        lastAssistantCompletedAt: sql<Date | string | null>`max(case when ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.COMPLETED} then ${messages.createdAt} end)`,
        lastAssistantFailedAt: sql<Date | string | null>`max(case when ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.FAILED} then ${messages.createdAt} end)`,
      })
      .from(messages)
      .then((rows) => rows[0]),
    db
      .select({
        lastLoginAt: sql<Date | string | null>`max(${users.lastLoginAt})`,
      })
      .from(users)
      .then((rows) => rows[0]),
    db
      .select({
        lastDocumentJobCompletedAt: sql<Date | string | null>`max(case when ${documentJobs.status} = ${RUN_STATUS.COMPLETED} then coalesce(${documentJobs.finishedAt}, ${documentJobs.updatedAt}) end)`,
        lastDocumentJobFailedAt: sql<Date | string | null>`max(case when ${documentJobs.status} = ${RUN_STATUS.FAILED} then coalesce(${documentJobs.finishedAt}, ${documentJobs.updatedAt}) end)`,
      })
      .from(documentJobs)
      .then((rows) => rows[0]),
    db
      .select({
        lastRetrievalRunAt: sql<Date | string | null>`max(${retrievalRuns.createdAt})`,
      })
      .from(retrievalRuns)
      .then((rows) => rows[0]),
  ]);

  return {
    lastLoginAt: toIsoString(userRow?.lastLoginAt),
    lastUserMessageAt: toIsoString(messageRow?.lastUserMessageAt),
    lastAssistantCompletedAt: toIsoString(messageRow?.lastAssistantCompletedAt),
    lastAssistantFailedAt: toIsoString(messageRow?.lastAssistantFailedAt),
    lastDocumentJobCompletedAt: toIsoString(documentJobRow?.lastDocumentJobCompletedAt),
    lastDocumentJobFailedAt: toIsoString(documentJobRow?.lastDocumentJobFailedAt),
    lastRetrievalRunAt: toIsoString(retrievalRow?.lastRetrievalRunAt),
  } satisfies SystemRuntimeFreshness;
}

async function loadDocumentStageBacklog(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({
      stage: documentJobs.stage,
      count: count(documentJobs.id),
    })
    .from(documentJobs)
    .where(inArray(documentJobs.status, [RUN_STATUS.QUEUED, RUN_STATUS.RUNNING]))
    .groupBy(documentJobs.stage);

  return rows
    .map((row) => ({
      stage: row.stage,
      count: parseCount(row.count),
    }))
    .sort((left, right) => right.count - left.count || left.stage.localeCompare(right.stage));
}

async function loadFailureSummaries(
  db: ReturnType<typeof getDb>,
  windowStarts: Record<SystemRuntimeWindowId, Date>,
) {
  const [assistantRows, ingestRows] = await Promise.all([
    db
      .select({
        createdAt: messages.createdAt,
        structuredJson: messages.structuredJson,
      })
      .from(messages)
      .where(
        sql`${messages.createdAt} >= ${windowStarts["30d"]} and ${messages.role} = ${MESSAGE_ROLE.ASSISTANT} and ${messages.status} = ${MESSAGE_STATUS.FAILED}`,
      )
      .orderBy(desc(messages.createdAt))
      .limit(400),
    db
      .select({
        createdAt: documentJobs.createdAt,
        errorCode: documentJobs.errorCode,
        errorMessage: documentJobs.errorMessage,
      })
      .from(documentJobs)
      .where(
        sql`${documentJobs.createdAt} >= ${windowStarts["30d"]} and ${documentJobs.status} = ${RUN_STATUS.FAILED}`,
      )
      .orderBy(desc(documentJobs.createdAt))
      .limit(400),
  ]);

  const normalizedAssistantRows = assistantRows
    .map((row) => {
      const createdAt = parseDateValue(row.createdAt);
      if (!createdAt) {
        return null;
      }

      return {
        createdAt,
        structuredJson: row.structuredJson,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const normalizedIngestRows = ingestRows
    .map((row) => {
      const createdAt = parseDateValue(row.createdAt);
      if (!createdAt) {
        return null;
      }

      return {
        createdAt,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return {
    assistantFailures: summarizeFailureBuckets(
      normalizedAssistantRows,
      windowStarts,
      (row) => extractAssistantFailureReason(row.structuredJson),
    ),
    ingestFailures: summarizeFailureBuckets(
      normalizedIngestRows,
      windowStarts,
      (row) =>
        extractIngestFailureReason({
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
        }),
    ),
  };
}

export async function getSystemRuntimeOverview(
  options?: {
    now?: Date;
    db?: ReturnType<typeof getDb>;
  },
): Promise<SystemRuntimeOverview> {
  const now = options?.now ?? new Date();
  const db = options?.db ?? getDb();
  const windowStarts = buildWindowStarts(now);

  const [snapshot, readiness, freshness, documentStageBacklog, failureSummaries, windowRows] =
    await Promise.all([
      loadRuntimeSnapshot(db, now),
      loadRuntimeReadiness(db),
      loadRuntimeFreshness(db),
      loadDocumentStageBacklog(db),
      loadFailureSummaries(db, windowStarts),
      Promise.all(
        SYSTEM_RUNTIME_WINDOWS.map(async (window) => [
          window.id,
          summarizeSystemRuntimeWindow(
            await loadRuntimeWindowDataset(windowStarts[window.id], db),
          ),
        ]),
      ),
    ]);

  return {
    generatedAt: now.toISOString(),
    windows: Object.fromEntries(windowRows) as Record<
      SystemRuntimeWindowId,
      SystemRuntimeWindowSummary
    >,
    snapshot,
    readiness,
    freshness,
    documentStageBacklog,
    assistantFailures: failureSummaries.assistantFailures,
    ingestFailures: failureSummaries.ingestFailures,
  };
}
