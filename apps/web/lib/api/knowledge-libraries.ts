import { z } from "zod";

import {
  KNOWLEDGE_LIBRARY_STATUS,
  KNOWLEDGE_LIBRARY_STATUS_VALUES,
  KNOWLEDGE_SOURCE_SCOPE,
  WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS,
  WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS_VALUES,
  type KnowledgeLibraryStatus,
  type KnowledgeSourceScope,
  type WorkspaceLibrarySubscriptionStatus,
} from "@anchordesk/contracts";

const titleSchema = z
  .string()
  .trim()
  .min(1, "资料库名称不能为空")
  .max(200, "资料库名称不能超过 200 个字符");

const slugSchema = z
  .string()
  .trim()
  .max(160, "资料库 slug 不能超过 160 个字符")
  .optional();

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "说明不能超过 2000 个字符")
  .optional()
  .transform((value) => value ?? "");

export const knowledgeLibraryCreateSchema = z.object({
  title: titleSchema,
  slug: slugSchema,
  description: descriptionSchema,
  status: z
    .enum(KNOWLEDGE_LIBRARY_STATUS_VALUES)
    .default(KNOWLEDGE_LIBRARY_STATUS.DRAFT),
});

export const knowledgeLibraryPatchSchema = z.object({
  title: titleSchema.optional(),
  slug: slugSchema,
  description: descriptionSchema,
  status: z.enum(KNOWLEDGE_LIBRARY_STATUS_VALUES).optional(),
});

export const workspaceLibrarySubscriptionMutationSchema = z.object({
  libraryId: z.string().uuid(),
  status: z.enum(WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS_VALUES),
  searchEnabled: z.boolean().optional(),
});

export function normalizeKnowledgeLibrarySlug(slug: string | null | undefined, title: string) {
  const rawValue = String(slug ?? "").trim() || String(title).trim() || "library";

  const normalized = rawValue
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "library";
}

export function buildKnowledgeSourceBadge(input: {
  sourceScope: KnowledgeSourceScope | null | undefined;
  libraryTitle: string | null | undefined;
}) {
  if (input.sourceScope === KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY) {
    return {
      label: input.libraryTitle?.trim()
        ? `全局资料库 · ${input.libraryTitle.trim()}`
        : "全局资料库",
      tone: "global" as const,
    };
  }

  return {
    label: "工作空间资料",
    tone: "workspace" as const,
  };
}

export type KnowledgeSourceBadgeSummary = ReturnType<typeof buildKnowledgeSourceBadge> & {
  sourceScope: KnowledgeSourceScope | null;
  libraryTitle: string | null;
};

export function buildCitationSourceBadges<
  T extends {
    sourceScope: KnowledgeSourceScope | null | undefined;
    libraryTitle: string | null | undefined;
  },
>(citations: T[]) {
  const badgeByKey = new Map<string, KnowledgeSourceBadgeSummary>();

  for (const citation of citations) {
    const sourceScope = citation.sourceScope ?? null;
    const libraryTitle = citation.libraryTitle?.trim() || null;
    const badge = buildKnowledgeSourceBadge({
      sourceScope,
      libraryTitle,
    });
    const key =
      sourceScope === KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY
        ? `global:${libraryTitle ?? ""}`
        : "workspace";

    if (!badgeByKey.has(key)) {
      badgeByKey.set(key, {
        ...badge,
        sourceScope,
        libraryTitle,
      });
    }
  }

  return [...badgeByKey.values()].sort((left, right) => {
    if (left.tone !== right.tone) {
      return left.tone === "workspace" ? -1 : 1;
    }

    return left.label.localeCompare(right.label, "zh-CN");
  });
}

export function buildWorkspaceKnowledgeScopeSummary<
  T extends {
    id: string;
    title: string;
    status: KnowledgeLibraryStatus;
    subscriptionStatus: WorkspaceLibrarySubscriptionStatus | null | undefined;
    searchEnabled: boolean;
  },
>(libraries: T[]) {
  const searchableGlobalLibraries = filterMountedGlobalLibraries(libraries);
  const mountedReadOnlyTitles = [...libraries]
    .filter(
      (library) =>
        library.status === KNOWLEDGE_LIBRARY_STATUS.ACTIVE &&
        (library.subscriptionStatus === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED ||
          (library.subscriptionStatus === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE &&
            !library.searchEnabled)),
    )
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
    .map((library) => library.title);

  return {
    searchableBadges: [
      {
        ...buildKnowledgeSourceBadge({
          sourceScope: null,
          libraryTitle: null,
        }),
        sourceScope: null,
        libraryTitle: null,
      },
      ...searchableGlobalLibraries.map((library) => ({
        ...buildKnowledgeSourceBadge({
          sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
          libraryTitle: library.title,
        }),
        sourceScope: KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
        libraryTitle: library.title,
      })),
    ],
    mountedReadOnlyTitles,
    searchableGlobalCount: searchableGlobalLibraries.length,
  };
}

export function formatKnowledgeLibraryStatus(status: KnowledgeLibraryStatus) {
  if (status === KNOWLEDGE_LIBRARY_STATUS.ACTIVE) {
    return "可订阅";
  }

  if (status === KNOWLEDGE_LIBRARY_STATUS.ARCHIVED) {
    return "已归档";
  }

  return "草稿";
}

export function formatWorkspaceLibrarySubscriptionStatus(
  status: WorkspaceLibrarySubscriptionStatus | null | undefined,
) {
  if (status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE) {
    return "已订阅";
  }

  if (status === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.PAUSED) {
    return "已暂停";
  }

  return "未订阅";
}

export function filterMountedGlobalLibraries<
  T extends {
    id: string;
    title: string;
    status: KnowledgeLibraryStatus;
    subscriptionStatus: WorkspaceLibrarySubscriptionStatus | null | undefined;
  },
>(libraries: T[]) {
  return [...libraries]
    .filter(
      (library) =>
        library.status === KNOWLEDGE_LIBRARY_STATUS.ACTIVE &&
        library.subscriptionStatus === WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS.ACTIVE,
    )
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}
