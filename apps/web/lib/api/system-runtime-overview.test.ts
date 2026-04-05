import { describe, expect, test } from "vitest";

import { summarizeSystemRuntimeWindow } from "./system-runtime-overview-shared";

describe("summarizeSystemRuntimeWindow", () => {
  test("derives success and coverage rates from terminal events only", () => {
    expect(
      summarizeSystemRuntimeWindow({
        activeUsers: 7,
        activeWorkspaces: 9,
        newConversations: 18,
        userMessages: 42,
        documentsCreated: 11,
        assistantCompleted: 18,
        assistantFailed: 2,
        assistantStreaming: 3,
        assistantWithCitations: 9,
        toolCompleted: 14,
        toolFailed: 6,
        retrievalRuns: 8,
        retrievalRunsWithHits: 5,
        retrievalResultCount: 27,
        citationCount: 31,
        citationsWorkspace: 13,
        citationsGlobal: 8,
        citationsWeb: 10,
        documentJobsCompleted: 12,
        documentJobsFailed: 1,
        documentJobsCancelled: 2,
      }),
    ).toMatchObject({
      assistantTerminalCount: 20,
      assistantSuccessRate: 90,
      citationCoverageRate: 50,
      toolSuccessRate: 70,
      retrievalHitRate: 62.5,
      averageRetrievalResultsPerRun: 3.4,
      ingestSuccessRate: 92.3,
    });
  });

  test("returns null rates when the relevant denominator has no samples", () => {
    expect(
      summarizeSystemRuntimeWindow({
        activeUsers: 0,
        activeWorkspaces: 0,
        newConversations: 0,
        userMessages: 0,
        documentsCreated: 0,
        assistantCompleted: 0,
        assistantFailed: 0,
        assistantStreaming: 4,
        assistantWithCitations: 0,
        toolCompleted: 0,
        toolFailed: 0,
        retrievalRuns: 0,
        retrievalRunsWithHits: 0,
        retrievalResultCount: 0,
        citationCount: 0,
        citationsWorkspace: 0,
        citationsGlobal: 0,
        citationsWeb: 0,
        documentJobsCompleted: 0,
        documentJobsFailed: 0,
        documentJobsCancelled: 3,
      }),
    ).toMatchObject({
      assistantTerminalCount: 0,
      assistantSuccessRate: null,
      citationCoverageRate: null,
      toolSuccessRate: null,
      retrievalHitRate: null,
      averageRetrievalResultsPerRun: null,
      ingestSuccessRate: null,
    });
  });
});
