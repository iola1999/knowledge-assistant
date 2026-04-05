export const SYSTEM_RUNTIME_WINDOWS = [
  {
    id: "24h",
    label: "24 小时",
    days: 1,
  },
  {
    id: "7d",
    label: "7 天",
    days: 7,
  },
  {
    id: "30d",
    label: "30 天",
    days: 30,
  },
] as const;

export type SystemRuntimeWindowId = (typeof SYSTEM_RUNTIME_WINDOWS)[number]["id"];

export type SystemRuntimeWindowDataset = {
  activeUsers: number;
  activeWorkspaces: number;
  newConversations: number;
  userMessages: number;
  documentsCreated: number;
  assistantCompleted: number;
  assistantFailed: number;
  assistantStreaming: number;
  assistantWithCitations: number;
  toolCompleted: number;
  toolFailed: number;
  retrievalRuns: number;
  retrievalRunsWithHits: number;
  retrievalResultCount: number;
  citationCount: number;
  citationsWorkspace: number;
  citationsGlobal: number;
  citationsWeb: number;
  documentJobsCompleted: number;
  documentJobsFailed: number;
  documentJobsCancelled: number;
};

export type SystemRuntimeWindowSummary = SystemRuntimeWindowDataset & {
  assistantTerminalCount: number;
  assistantSuccessRate: number | null;
  citationCoverageRate: number | null;
  toolSuccessRate: number | null;
  retrievalHitRate: number | null;
  averageRetrievalResultsPerRun: number | null;
  ingestSuccessRate: number | null;
};

export type SystemRuntimeSnapshot = {
  totalUsers: number;
  activeSessions: number;
  totalWorkspaces: number;
  archivedWorkspaces: number;
  totalConversations: number;
  archivedConversations: number;
  totalLibraries: number;
  globalLibraries: number;
  activeGlobalLibraries: number;
  totalDocuments: number;
  readyDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  archivedDocuments: number;
  totalConversationAttachments: number;
  queuedDocumentJobs: number;
  runningDocumentJobs: number;
};

export type SystemRuntimeReadiness = {
  registrationOpen: boolean;
  totalModels: number;
  enabledModels: number;
  hasDefaultModel: boolean;
  runningUpgrades: number;
  failedUpgrades: number;
  configuredCriticalSettings: number;
  totalCriticalSettings: number;
  criticalSettings: Array<{
    key: string;
    label: string;
    configured: boolean;
  }>;
};

export type SystemRuntimeFreshness = {
  lastLoginAt: string | null;
  lastUserMessageAt: string | null;
  lastAssistantCompletedAt: string | null;
  lastAssistantFailedAt: string | null;
  lastDocumentJobCompletedAt: string | null;
  lastDocumentJobFailedAt: string | null;
  lastRetrievalRunAt: string | null;
};

export type SystemRuntimeFailureBucket = {
  label: string;
  count: number;
};

export type SystemRuntimeOverview = {
  generatedAt: string;
  windows: Record<SystemRuntimeWindowId, SystemRuntimeWindowSummary>;
  snapshot: SystemRuntimeSnapshot;
  readiness: SystemRuntimeReadiness;
  freshness: SystemRuntimeFreshness;
  documentStageBacklog: Array<{
    stage: string;
    count: number;
  }>;
  assistantFailures: Record<SystemRuntimeWindowId, SystemRuntimeFailureBucket[]>;
  ingestFailures: Record<SystemRuntimeWindowId, SystemRuntimeFailureBucket[]>;
};

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function buildRate(successCount: number, totalCount: number) {
  if (totalCount <= 0) {
    return null;
  }

  return roundToOne((successCount / totalCount) * 100);
}

export function summarizeSystemRuntimeWindow(
  input: SystemRuntimeWindowDataset,
): SystemRuntimeWindowSummary {
  const assistantTerminalCount = input.assistantCompleted + input.assistantFailed;
  const toolTerminalCount = input.toolCompleted + input.toolFailed;
  const ingestTerminalCount = input.documentJobsCompleted + input.documentJobsFailed;

  return {
    ...input,
    assistantTerminalCount,
    assistantSuccessRate: buildRate(input.assistantCompleted, assistantTerminalCount),
    citationCoverageRate: buildRate(input.assistantWithCitations, input.assistantCompleted),
    toolSuccessRate: buildRate(input.toolCompleted, toolTerminalCount),
    retrievalHitRate: buildRate(input.retrievalRunsWithHits, input.retrievalRuns),
    averageRetrievalResultsPerRun:
      input.retrievalRuns > 0
        ? roundToOne(input.retrievalResultCount / input.retrievalRuns)
        : null,
    ingestSuccessRate: buildRate(input.documentJobsCompleted, ingestTerminalCount),
  };
}
