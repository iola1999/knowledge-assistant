import {
  CONVERSATION_STATUS,
  type ConversationStatus,
  DOCUMENT_STATUS,
  type DocumentStatus,
  PARSE_STATUS,
  type ParseStatus,
  RUN_STATUS,
  type RunStatus,
} from "@anchordesk/contracts";

type WorkspaceOverviewDocument = {
  status: DocumentStatus;
  latestVersion: {
    parseStatus: ParseStatus;
  } | null;
  latestJob: {
    status: RunStatus;
  } | null;
};

type WorkspaceOverviewConversation = {
  status: ConversationStatus;
};

export function isWorkspaceDocumentProcessing(document: WorkspaceOverviewDocument) {
  if (
    document.latestJob?.status === RUN_STATUS.QUEUED ||
    document.latestJob?.status === RUN_STATUS.RUNNING
  ) {
    return true;
  }

  if (!document.latestVersion) {
    return (
      document.status === DOCUMENT_STATUS.UPLOADING ||
      document.status === DOCUMENT_STATUS.PROCESSING
    );
  }

  return (
    document.latestVersion.parseStatus !== PARSE_STATUS.READY &&
    document.latestVersion.parseStatus !== PARSE_STATUS.FAILED
  );
}

export function isWorkspaceDocumentFailed(document: WorkspaceOverviewDocument) {
  return (
    document.status === DOCUMENT_STATUS.FAILED ||
    document.latestJob?.status === RUN_STATUS.FAILED ||
    document.latestVersion?.parseStatus === PARSE_STATUS.FAILED
  );
}

export function isWorkspaceDocumentReady(document: WorkspaceOverviewDocument) {
  return !isWorkspaceDocumentProcessing(document) && !isWorkspaceDocumentFailed(document);
}

export function summarizeWorkspaceOverview(input: {
  documents: WorkspaceOverviewDocument[];
  conversations: WorkspaceOverviewConversation[];
  reportsCount: number;
}) {
  const processingDocuments = input.documents.filter(isWorkspaceDocumentProcessing).length;
  const failedDocuments = input.documents.filter(isWorkspaceDocumentFailed).length;
  const readyDocuments = input.documents.filter(isWorkspaceDocumentReady).length;
  const activeConversations = input.conversations.filter(
    (conversation) => conversation.status === CONVERSATION_STATUS.ACTIVE,
  ).length;
  const archivedConversations = input.conversations.length - activeConversations;

  return {
    totalDocuments: input.documents.length,
    readyDocuments,
    processingDocuments,
    failedDocuments,
    activeConversations,
    archivedConversations,
    reportsCount: input.reportsCount,
    hasKnowledgeReady: readyDocuments > 0,
    hasPendingWork: processingDocuments > 0,
  };
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});

export function formatRelativeWorkspaceActivity(
  value: Date,
  now = new Date(),
) {
  const diffMs = value.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "刚刚";
  }

  if (absMs < hour) {
    return relativeTimeFormatter.format(Math.round(diffMs / minute), "minute");
  }

  if (absMs < day) {
    return relativeTimeFormatter.format(Math.round(diffMs / hour), "hour");
  }

  if (absMs < week) {
    return relativeTimeFormatter.format(Math.round(diffMs / day), "day");
  }

  if (absMs < month) {
    return relativeTimeFormatter.format(Math.round(diffMs / week), "week");
  }

  if (absMs < year) {
    return relativeTimeFormatter.format(Math.round(diffMs / month), "month");
  }

  return relativeTimeFormatter.format(Math.round(diffMs / year), "year");
}
