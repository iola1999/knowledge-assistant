import { and, eq, inArray } from "drizzle-orm";

import { searchWorkspaceKnowledgeInputSchema } from "@anchordesk/contracts";
import {
  citationAnchors,
  documents,
  getDb,
  getKnowledgeSourceScope,
  knowledgeLibraries,
  retrievalResults,
  retrievalRuns,
  resolveWorkspaceLibraryScope,
  documentChunks,
} from "@anchordesk/db";
import {
  describeRetrievalProvider,
  scoreToBasisPoints,
  searchWorkspaceKnowledge,
} from "@anchordesk/retrieval";

import { buildToolFailure } from "../tool-output";

export async function searchWorkspaceKnowledgeHandler(input: unknown) {
  const args = searchWorkspaceKnowledgeInputSchema.parse(input);
  const db = getDb();

  try {
    const scope = await resolveWorkspaceLibraryScope(args.workspace_id, db);
    const ranked = await searchWorkspaceKnowledge({
      libraryIds: scope.searchableLibraryIds,
      privateLibraryId: scope.privateLibraryId,
      query: args.query,
      topK: args.top_k,
      filters: {
        directoryPrefix: args.filters?.directory_prefix,
        docTypes: args.filters?.doc_types,
        tags: args.filters?.tags,
      },
    });

    const [retrievalRun] = await db
      .insert(retrievalRuns)
      .values({
        workspaceId: args.workspace_id,
        query: args.query,
        rawQueriesJson: {
          filters: args.filters ?? null,
          provider: describeRetrievalProvider(),
          scope: {
            searchable_library_ids: scope.searchableLibraryIds,
            private_library_id: scope.privateLibraryId,
          },
        },
        searchedLibraryIdsJson: scope.searchableLibraryIds,
        topK: args.top_k,
      })
      .returning({
        id: retrievalRuns.id,
      });

    if (retrievalRun && ranked.length > 0) {
      await db.insert(retrievalResults).values(
        ranked.map((item, index) => ({
          retrievalRunId: retrievalRun.id,
          anchorId: item.anchorId,
          chunkId: item.chunkId,
          rank: index + 1,
          rawScoreBp: scoreToBasisPoints(item.rawScore),
          rerankScoreBp: scoreToBasisPoints(item.score),
        })),
      );
    }

    if (ranked.length === 0) {
      return {
        ok: true,
        results: [],
      };
    }

    const anchorIds = ranked.map((item) => item.anchorId);
    const hydrated = await db
      .select({
        anchorId: citationAnchors.id,
        libraryId: citationAnchors.libraryId,
        documentId: citationAnchors.documentId,
        documentPath: citationAnchors.documentPath,
        documentTitle: documents.title,
        libraryTitle: knowledgeLibraries.title,
        libraryType: knowledgeLibraries.libraryType,
        anchorLabel: citationAnchors.anchorLabel,
        pageNo: citationAnchors.pageNo,
        sectionLabel: documentChunks.sectionLabel,
        snippet: citationAnchors.anchorText,
      })
      .from(citationAnchors)
      .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
      .innerJoin(documentChunks, eq(documentChunks.id, citationAnchors.chunkId))
      .innerJoin(knowledgeLibraries, eq(knowledgeLibraries.id, citationAnchors.libraryId))
      .where(
        and(
          inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
          inArray(citationAnchors.id, anchorIds),
        ),
      );

    const hydratedByAnchorId = new Map(
      hydrated.map((item) => [item.anchorId, item] as const),
    );

    return {
      ok: true,
      results: ranked
        .map((item) => {
          const row = hydratedByAnchorId.get(item.anchorId);
          if (!row) {
            return null;
          }

          return {
            anchor_id: row.anchorId,
            library_id: row.libraryId,
            library_title: row.libraryTitle,
            source_scope: getKnowledgeSourceScope(row.libraryType),
            document_id: row.documentId,
            document_title: row.documentTitle,
            document_path: row.documentPath,
            anchor_label: row.anchorLabel,
            page_no: row.pageNo,
            section_label: row.sectionLabel,
            snippet: row.snippet,
            score: item.score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workspace retrieval failed";
    return buildToolFailure("SEARCH_UNAVAILABLE", message, true);
  }
}
