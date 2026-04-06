// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SystemRuntimeOverviewPanel } from "./system-runtime-overview-panel";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

function buildWindowSummary(overrides: Record<string, unknown> = {}) {
  return {
    activeUsers: 0,
    activeWorkspaces: 0,
    newConversations: 0,
    userMessages: 0,
    documentsCreated: 0,
    assistantCompleted: 0,
    assistantFailed: 0,
    assistantStreaming: 0,
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
    documentJobsCancelled: 0,
    assistantTerminalCount: 0,
    assistantSuccessRate: null,
    citationCoverageRate: null,
    toolSuccessRate: null,
    retrievalHitRate: null,
    averageRetrievalResultsPerRun: null,
    ingestSuccessRate: null,
    ...overrides,
  };
}

describe("SystemRuntimeOverviewPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("renders 0-width bars when the rate is 0%", async () => {
    await act(async () => {
      root.render(
        createElement(SystemRuntimeOverviewPanel, {
          overview: {
            generatedAt: "2026-04-07T00:00:00.000Z",
            windows: {
              "24h": buildWindowSummary({ assistantSuccessRate: 0, assistantTerminalCount: 10, assistantFailed: 10 }),
              "7d": buildWindowSummary({ assistantSuccessRate: 0, assistantTerminalCount: 10, assistantFailed: 10 }),
              "30d": buildWindowSummary({ assistantSuccessRate: 0, assistantTerminalCount: 10, assistantFailed: 10 }),
            },
            snapshot: {
              totalUsers: 0,
              activeSessions: 0,
              totalWorkspaces: 0,
              archivedWorkspaces: 0,
              totalConversations: 0,
              archivedConversations: 0,
              totalLibraries: 0,
              globalLibraries: 0,
              activeGlobalLibraries: 0,
              totalDocuments: 0,
              readyDocuments: 0,
              processingDocuments: 0,
              failedDocuments: 0,
              archivedDocuments: 0,
              totalConversationAttachments: 0,
              queuedDocumentJobs: 0,
              runningDocumentJobs: 0,
            },
            readiness: {
              registrationOpen: false,
              totalModels: 0,
              enabledModels: 0,
              hasDefaultModel: false,
              runningUpgrades: 0,
              failedUpgrades: 0,
              configuredCriticalSettings: 0,
              totalCriticalSettings: 0,
              criticalSettings: [],
            },
            freshness: {
              lastLoginAt: null,
              lastUserMessageAt: null,
              lastAssistantCompletedAt: null,
              lastAssistantFailedAt: null,
              lastDocumentJobCompletedAt: null,
              lastDocumentJobFailedAt: null,
              lastRetrievalRunAt: null,
            },
            documentStageBacklog: [],
            assistantFailures: { "24h": [], "7d": [], "30d": [] },
            ingestFailures: { "24h": [], "7d": [], "30d": [] },
          },
        }),
      );
    });

    const card = Array.from(container.querySelectorAll("section")).find((section) =>
      section.textContent?.includes("回答成功率"),
    );
    expect(card).toBeTruthy();

    const bar = card?.querySelector('div[style*="width"]') as HTMLDivElement | null;
    expect(bar).toBeTruthy();
    expect(bar?.style.width).toBe("0%");
  });
});
