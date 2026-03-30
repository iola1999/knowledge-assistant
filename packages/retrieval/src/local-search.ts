import {
  computeBm25SparseScores,
  computeKeywordScore,
  textContainsToken,
} from "./scoring";
import type { WorkspaceKnowledgeSearchResult } from "./index";

export type LocalSearchChunkRecord = {
  libraryId: string;
  anchorId: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  documentPath: string;
  pageStart: number;
  pageEnd: number;
  sectionLabel: string | null;
  headingPath: string[];
  docType: string;
  keywords: string[];
  snippet: string;
};

function clampScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function roundScore(score: number) {
  return Number(clampScore(score).toFixed(6));
}

function buildSparseSearchText(item: LocalSearchChunkRecord) {
  return [
    item.documentPath,
    item.sectionLabel ?? "",
    ...item.headingPath,
    ...item.keywords,
    item.snippet,
  ]
    .filter(Boolean)
    .join("\n");
}

export function searchLocalChunks(input: {
  query: string;
  topK: number;
  chunks: LocalSearchChunkRecord[];
}): WorkspaceKnowledgeSearchResult[] {
  if (!input.chunks.length || !input.query.trim()) {
    return [];
  }

  const bm25Scores = computeBm25SparseScores(
    input.query,
    input.chunks.map((chunk) => buildSparseSearchText(chunk)),
  );

  return input.chunks
    .map((chunk, index) => {
      const bm25Score = bm25Scores[index] ?? 0;
      const keywordScore = computeKeywordScore(input.query, {
        document_path: chunk.documentPath,
        section_label: chunk.sectionLabel,
        heading_path: chunk.headingPath,
        keywords: chunk.keywords,
        chunk_text: chunk.snippet,
      });
      const rerankScore = clampScore(bm25Score * 0.72 + keywordScore * 0.28);
      const exactBoost =
        textContainsToken(chunk.snippet, input.query) ||
        textContainsToken(chunk.sectionLabel ?? "", input.query)
          ? 0.05
          : 0;
      const finalScore = clampScore(rerankScore + exactBoost);

      return {
        libraryId: chunk.libraryId,
        anchorId: chunk.anchorId,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        documentPath: chunk.documentPath,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionLabel: chunk.sectionLabel,
        headingPath: chunk.headingPath,
        docType: chunk.docType,
        snippet: chunk.snippet,
        rawScore: roundScore(bm25Score),
        rerankScore: roundScore(rerankScore),
        score: roundScore(finalScore),
      } satisfies WorkspaceKnowledgeSearchResult;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, input.topK);
}
