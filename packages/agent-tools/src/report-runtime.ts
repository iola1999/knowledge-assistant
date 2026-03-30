import Anthropic from "@anthropic-ai/sdk";
import { and, inArray } from "drizzle-orm";

import { DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K } from "@anchordesk/contracts";
import {
  buildAnthropicClientConfig,
  citationAnchors,
  getDb,
  resolveWorkspaceLibraryScope,
} from "@anchordesk/db";
import { searchWorkspaceKnowledge } from "@anchordesk/retrieval";

import type { ReportEvidenceAnchor } from "./report-generation";
import { uniqueStrings } from "./tool-output";

let anthropicClient: Anthropic | null = null;

export function getReportModel() {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
}

export function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic(buildAnthropicClientConfig());
  }

  return anthropicClient;
}

export async function resolveEvidenceAnchors(input: {
  workspaceId: string;
  evidenceAnchorIds: string[];
  fallbackQuery: string;
}): Promise<ReportEvidenceAnchor[]> {
  const db = getDb();
  const scope = await resolveWorkspaceLibraryScope(input.workspaceId, db);
  let anchorIds = uniqueStrings(input.evidenceAnchorIds);

  if (anchorIds.length === 0 && input.fallbackQuery.trim()) {
    const ranked = await searchWorkspaceKnowledge({
      libraryIds: scope.searchableLibraryIds,
      privateLibraryId: scope.privateLibraryId,
      query: input.fallbackQuery.trim(),
      topK: Math.min(6, DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K),
    });
    anchorIds = ranked.map((item) => item.anchorId);
  }

  if (anchorIds.length === 0 || scope.accessibleLibraryIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      anchorId: citationAnchors.id,
      documentPath: citationAnchors.documentPath,
      pageNo: citationAnchors.pageNo,
      anchorText: citationAnchors.anchorText,
    })
    .from(citationAnchors)
    .where(
      and(
        inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
        inArray(citationAnchors.id, anchorIds),
      ),
    );

  const rowById = new Map(rows.map((row) => [row.anchorId, row] as const));

  return anchorIds
    .map((anchorId) => rowById.get(anchorId))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      anchor_id: row.anchorId,
      label: `${row.documentPath} · 第${row.pageNo}页`,
      quote_text: row.anchorText,
    }));
}
