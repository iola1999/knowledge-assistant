import { describe, expect, test } from "vitest";
import {
  CONVERSATION_STATUS,
  DOCUMENT_STATUS,
  PARSE_STATUS,
  RUN_STATUS,
} from "@anchordesk/contracts";

import {
  formatRelativeWorkspaceActivity,
  isWorkspaceDocumentFailed,
  isWorkspaceDocumentProcessing,
  isWorkspaceDocumentReady,
  summarizeWorkspaceOverview,
} from "./workspace-overview";

describe("workspace overview document state", () => {
  test("treats queued or running jobs as processing", () => {
    expect(
      isWorkspaceDocumentProcessing({
        status: DOCUMENT_STATUS.READY,
        latestVersion: {
          parseStatus: PARSE_STATUS.READY,
        },
        latestJob: {
          status: RUN_STATUS.RUNNING,
        },
      }),
    ).toBe(true);
  });

  test("treats failed job or parse status as failed instead of ready", () => {
    const document = {
      status: DOCUMENT_STATUS.READY,
      latestVersion: {
        parseStatus: PARSE_STATUS.FAILED,
      },
      latestJob: null,
    };

    expect(isWorkspaceDocumentFailed(document)).toBe(true);
    expect(isWorkspaceDocumentReady(document)).toBe(false);
  });

  test("treats ready version with no active job as ready", () => {
    const document = {
      status: DOCUMENT_STATUS.READY,
      latestVersion: {
        parseStatus: PARSE_STATUS.READY,
      },
      latestJob: null,
    };

    expect(isWorkspaceDocumentProcessing(document)).toBe(false);
    expect(isWorkspaceDocumentFailed(document)).toBe(false);
    expect(isWorkspaceDocumentReady(document)).toBe(true);
  });
});

describe("summarizeWorkspaceOverview", () => {
  test("counts document, conversation, and report buckets for the workspace shell", () => {
    expect(
      summarizeWorkspaceOverview({
        documents: [
          {
            status: DOCUMENT_STATUS.READY,
            latestVersion: {
              parseStatus: PARSE_STATUS.READY,
            },
            latestJob: null,
          },
          {
            status: DOCUMENT_STATUS.PROCESSING,
            latestVersion: {
              parseStatus: PARSE_STATUS.EMBEDDING,
            },
            latestJob: {
              status: RUN_STATUS.RUNNING,
            },
          },
          {
            status: DOCUMENT_STATUS.FAILED,
            latestVersion: {
              parseStatus: PARSE_STATUS.FAILED,
            },
            latestJob: {
              status: RUN_STATUS.FAILED,
            },
          },
        ],
        conversations: [
          { status: CONVERSATION_STATUS.ACTIVE },
          { status: CONVERSATION_STATUS.ARCHIVED },
        ],
        reportsCount: 4,
      }),
    ).toEqual({
      totalDocuments: 3,
      readyDocuments: 1,
      processingDocuments: 1,
      failedDocuments: 1,
      activeConversations: 1,
      archivedConversations: 1,
      reportsCount: 4,
      hasKnowledgeReady: true,
      hasPendingWork: true,
    });
  });
});

describe("formatRelativeWorkspaceActivity", () => {
  test("formats very recent activity as just now", () => {
    expect(
      formatRelativeWorkspaceActivity(
        new Date("2026-03-29T12:00:30Z"),
        new Date("2026-03-29T12:01:00Z"),
      ),
    ).toBe("刚刚");
  });

  test("formats recent activity in relative hours", () => {
    expect(
      formatRelativeWorkspaceActivity(
        new Date("2026-03-29T09:00:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("3小时前");
  });

  test("formats older activity in relative days", () => {
    expect(
      formatRelativeWorkspaceActivity(
        new Date("2026-03-26T12:00:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("3天前");
  });
});
