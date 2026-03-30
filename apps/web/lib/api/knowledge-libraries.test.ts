import { describe, expect, test } from "vitest";
import {
  KNOWLEDGE_LIBRARY_STATUS,
  KNOWLEDGE_SOURCE_SCOPE,
  WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS,
} from "@anchordesk/contracts";

import {
  buildKnowledgeSourceBadge,
  buildWorkspaceKnowledgeScopeSummary,
  buildCitationSourceBadges,
  filterMountedGlobalLibraries,
  normalizeKnowledgeLibrarySlug,
} from "./knowledge-libraries";

describe("normalizeKnowledgeLibrarySlug", () => {
  test("normalizes explicit slugs into lowercase dash-separated ids", () => {
    expect(normalizeKnowledgeLibrarySlug(" Product / Docs 2026 ", "Ignored")).toBe(
      "product-docs-2026",
    );
  });

  test("falls back to the title when slug input is empty", () => {
    expect(normalizeKnowledgeLibrarySlug("", "产品资料库 2026")).toBe("产品资料库-2026");
  });

  test("preserves non-ascii characters that produce stable slugs", () => {
    expect(normalizeKnowledgeLibrarySlug("", "资料库")).toBe("资料库");
  });
});

describe("buildKnowledgeSourceBadge", () => {
  test("returns a workspace badge when no explicit source scope is provided", () => {
    expect(buildKnowledgeSourceBadge({ sourceScope: null, libraryTitle: null })).toEqual({
      label: "工作空间资料",
      tone: "workspace",
    });
  });

  test("returns a global badge with the library title snapshot when available", () => {
    expect(
      buildKnowledgeSourceBadge({
        sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
        libraryTitle: "平台规范库",
      }),
    ).toEqual({
      label: "全局资料库 · 平台规范库",
      tone: "global",
    });
  });
});

describe("filterMountedGlobalLibraries", () => {
  test("keeps only active subscriptions backed by active libraries and sorts them by title", () => {
    expect(
      filterMountedGlobalLibraries([
        {
          id: "library-b",
          title: "运营资料库",
          description: null,
          status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
          documentCount: 8,
          updatedAt: new Date("2026-03-30T10:00:00.000Z"),
        },
        {
          id: "library-a",
          title: "产品规范库",
          description: null,
          status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
          documentCount: 12,
          updatedAt: new Date("2026-03-30T09:00:00.000Z"),
        },
        {
          id: "library-c",
          title: "归档库",
          description: null,
          status: KNOWLEDGE_LIBRARY_STATUS.ARCHIVED,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
          documentCount: 1,
          updatedAt: new Date("2026-03-30T11:00:00.000Z"),
        },
        {
          id: "library-d",
          title: "暂停库",
          description: null,
          status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED,
          documentCount: 3,
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
        },
      ]),
    ).toEqual([
      expect.objectContaining({ id: "library-a", title: "产品规范库" }),
      expect.objectContaining({ id: "library-b", title: "运营资料库" }),
    ]);
  });
});

describe("buildCitationSourceBadges", () => {
  test("dedupes repeated sources and keeps workspace before global libraries", () => {
    expect(
      buildCitationSourceBadges([
        {
          sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
          libraryTitle: "平台规范库",
        },
        {
          sourceScope: null,
          libraryTitle: null,
        },
        {
          sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
          libraryTitle: "平台规范库",
        },
        {
          sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
          libraryTitle: "运营手册库",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        label: "工作空间资料",
        tone: "workspace",
      }),
      expect.objectContaining({
        label: "全局资料库 · 平台规范库",
        tone: "global",
      }),
      expect.objectContaining({
        label: "全局资料库 · 运营手册库",
        tone: "global",
      }),
    ]);
  });
});

describe("buildWorkspaceKnowledgeScopeSummary", () => {
  test("builds searchable and mounted-readonly summaries from workspace subscriptions", () => {
    expect(
      buildWorkspaceKnowledgeScopeSummary([
        {
          id: "library-a",
          title: "平台规范库",
          status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
          searchEnabled: true,
        },
        {
          id: "library-b",
          title: "法务模板库",
          status: KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED,
          searchEnabled: false,
        },
        {
          id: "library-c",
          title: "归档库",
          status: KNOWLEDGE_LIBRARY_STATUS.ARCHIVED,
          subscriptionStatus: WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
          searchEnabled: true,
        },
      ]),
    ).toEqual({
      searchableBadges: [
        expect.objectContaining({
          label: "工作空间资料",
          tone: "workspace",
        }),
        expect.objectContaining({
          label: "全局资料库 · 平台规范库",
          tone: "global",
        }),
      ],
      mountedReadOnlyTitles: ["法务模板库"],
      searchableGlobalCount: 1,
    });
  });
});
