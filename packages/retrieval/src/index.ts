import { QdrantClient } from "@qdrant/js-client-rest";
import {
  DEFAULT_HASH_VECTOR_SIZE,
  DEFAULT_QDRANT_COLLECTION_NAME,
  DEFAULT_QUERY_CANDIDATE_LIMIT,
  DEFAULT_QUERY_CANDIDATE_MULTIPLIER,
  EMBEDDING_PROVIDER,
  RERANK_PROVIDER,
} from "@anchordesk/contracts";
import {
  buildDirectoryPrefixes,
  buildHashedEmbedding,
  chunkTextSnippet,
  computeBm25SparseScores,
  computeKeywordScore,
  normalizeToken,
  textContainsToken,
  uniqueNormalized,
} from "./scoring";
import {
  describeRetrievalProvider,
  getEmbeddingBatchSize,
  parseDashScopeRerankResponse,
  resolveEmbeddingProvider,
  resolveRerankProvider,
} from "./providers";

type PayloadSchema =
  | "keyword"
  | "integer"
  | "float"
  | "geo"
  | "text"
  | "bool"
  | "datetime"
  | "uuid"
  | Record<string, unknown>;

type QdrantFilter = {
  must?: Array<Record<string, unknown>>;
  should?: Array<Record<string, unknown>>;
  must_not?: Array<Record<string, unknown>>;
};

export type RetrievalChunkRecord = {
  pointId: string;
  libraryId: string;
  workspaceId: string | null;
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  anchorId: string;
  docType: string;
  documentPath: string;
  directoryPath: string;
  pageStart: number;
  pageEnd: number;
  headingPath: string[];
  sectionLabel: string | null;
  tags: string[];
  keywords: string[];
  text: string;
};

export type WorkspaceKnowledgeFilters = {
  directoryPrefix?: string;
  docTypes?: string[];
  tags?: string[];
};

export type WorkspaceKnowledgeSearchParams = {
  libraryIds: string[];
  privateLibraryId?: string | null;
  query: string;
  topK: number;
  filters?: WorkspaceKnowledgeFilters;
};

export type WorkspaceKnowledgeSearchResult = {
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
  snippet: string;
  rawScore: number;
  rerankScore: number;
  score: number;
};

type OpenAiCompatibleEmbeddingsResponse = {
  data?: Array<{ embedding?: number[] }>;
};

type SearchCandidate = WorkspaceKnowledgeSearchResult & {
  bm25Score: number;
  keywordScore: number;
};

type RetrievalPointPayload = {
  library_id: string;
  workspace_id: string | null;
  document_id: string;
  document_version_id: string;
  chunk_id: string;
  anchor_id: string;
  doc_type: string;
  document_path: string;
  directory_path: string;
  directory_prefixes: string[];
  page_start: number;
  page_end: number;
  heading_path: string[];
  section_label: string | null;
  keywords: string[];
  tag_values: string[];
  chunk_text: string;
};

let qdrantClient: QdrantClient | null = null;
let ensureCollectionPromise: Promise<void> | null = null;
let resolvedVectorSizePromise: Promise<number> | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

function roundScore(score: number) {
  return Number(score.toFixed(6));
}

function toRoundedBasisPoints(score: number) {
  return Math.round(clampScore(score) * 10_000);
}

export function buildRetrievalTagValues(input: {
  docType: string;
  tags: string[];
  sectionLabel: string | null;
  headingPath: string[];
  keywords: string[];
}) {
  return uniqueNormalized([
    input.docType,
    ...input.tags,
    input.sectionLabel,
    ...input.headingPath,
    ...input.keywords,
  ]);
}

function getCollectionName() {
  return process.env.QDRANT_COLLECTION ?? DEFAULT_QDRANT_COLLECTION_NAME;
}

function getQdrantClient() {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: getRequiredEnv("QDRANT_URL"),
      apiKey: process.env.QDRANT_API_KEY,
    });
  }

  return qdrantClient;
}

async function fetchRemoteEmbeddings(texts: string[]) {
  const provider = resolveEmbeddingProvider();
  if (provider.type === EMBEDDING_PROVIDER.LOCAL_HASH) {
    throw new Error("Remote embedding provider is not configured");
  }

  const response = await fetch(provider.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      input: texts,
      ...(provider.model ? { model: provider.model } : {}),
      ...(provider.type === EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE
        ? { encoding_format: "float" }
        : {}),
      ...(provider.dimensions ? { dimensions: provider.dimensions } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenAiCompatibleEmbeddingsResponse;
  const embeddings = payload.data?.map((item) => item.embedding ?? []) ?? [];

  if (embeddings.length !== texts.length || embeddings.some((item) => !item.length)) {
    throw new Error("Embedding API returned an unexpected payload");
  }

  return embeddings;
}

async function resolveVectorSize() {
  if (!resolvedVectorSizePromise) {
    resolvedVectorSizePromise = (async () => {
      const configured = process.env.EMBEDDING_VECTOR_SIZE;
      if (configured) {
        const parsed = Number.parseInt(configured, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }

      const provider = resolveEmbeddingProvider();
      if (provider.type !== EMBEDDING_PROVIDER.LOCAL_HASH && provider.dimensions) {
        return provider.dimensions;
      }

      if (provider.type !== EMBEDDING_PROVIDER.LOCAL_HASH) {
        const [probe] = await fetchRemoteEmbeddings(["dimension probe"]);
        if (!probe?.length) {
          throw new Error("Failed to infer embedding vector size");
        }
        return probe.length;
      }

      return DEFAULT_HASH_VECTOR_SIZE;
    })().catch((error) => {
      resolvedVectorSizePromise = null;
      throw error;
    });
  }

  return resolvedVectorSizePromise;
}

async function createPayloadIndexes() {
  const client = getQdrantClient();
  const collectionName = getCollectionName();
  const indexes: Array<{ fieldName: string; schema: PayloadSchema }> = [
    { fieldName: "library_id", schema: "keyword" },
    { fieldName: "workspace_id", schema: "keyword" },
    { fieldName: "document_id", schema: "keyword" },
    { fieldName: "document_version_id", schema: "keyword" },
    { fieldName: "anchor_id", schema: "keyword" },
    { fieldName: "doc_type", schema: "keyword" },
    { fieldName: "directory_prefixes", schema: "keyword" },
    { fieldName: "page_start", schema: "integer" },
    { fieldName: "page_end", schema: "integer" },
  ];

  for (const indexConfig of indexes) {
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: indexConfig.fieldName,
        field_schema: indexConfig.schema,
        wait: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/already exists|existing/i.test(message)) {
        throw error;
      }
    }
  }
}

export async function ensureRetrievalCollection() {
  if (!ensureCollectionPromise) {
    ensureCollectionPromise = (async () => {
      const client = getQdrantClient();
      const collectionName = getCollectionName();
      const vectorSize = await resolveVectorSize();
      const existing = await client.getCollections();
      const exists = existing.collections.some((collection) => collection.name === collectionName);

      if (!exists) {
        await client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
          on_disk_payload: true,
        });
      }

      await createPayloadIndexes();
    })().catch((error) => {
      ensureCollectionPromise = null;
      throw error;
    });
  }

  return ensureCollectionPromise;
}

export async function embedTexts(texts: string[]) {
  if (!texts.length) {
    return [] as number[][];
  }

  const provider = resolveEmbeddingProvider();
  if (provider.type === EMBEDDING_PROVIDER.LOCAL_HASH) {
    const dimensions = await resolveVectorSize();
    return texts.map((text) => buildHashedEmbedding(text, dimensions));
  }

  const batchSize = getEmbeddingBatchSize(provider);
  const result: number[][] = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const embeddings = await fetchRemoteEmbeddings(batch);
    result.push(...embeddings);
  }

  return result;
}

export async function deleteDocumentVersionPoints(input: {
  libraryId: string;
  documentVersionId: string;
}) {
  await ensureRetrievalCollection();

  await getQdrantClient().delete(getCollectionName(), {
    wait: true,
    filter: {
      must: [
        { key: "library_id", match: { value: input.libraryId } },
        { key: "document_version_id", match: { value: input.documentVersionId } },
      ],
    },
  } as never);
}

function toPayload(chunk: RetrievalChunkRecord): RetrievalPointPayload {
  const tagValues = buildRetrievalTagValues({
    docType: chunk.docType,
    tags: chunk.tags,
    sectionLabel: chunk.sectionLabel,
    headingPath: chunk.headingPath,
    keywords: chunk.keywords,
  });

  return {
    library_id: chunk.libraryId,
    workspace_id: chunk.workspaceId,
    document_id: chunk.documentId,
    document_version_id: chunk.documentVersionId,
    chunk_id: chunk.chunkId,
    anchor_id: chunk.anchorId,
    doc_type: chunk.docType,
    document_path: chunk.documentPath,
    directory_path: chunk.directoryPath,
    directory_prefixes: buildDirectoryPrefixes(chunk.directoryPath, chunk.documentPath),
    page_start: chunk.pageStart,
    page_end: chunk.pageEnd,
    heading_path: chunk.headingPath,
    section_label: chunk.sectionLabel,
    keywords: chunk.keywords,
    tag_values: tagValues,
    chunk_text: chunkTextSnippet(chunk.text),
  };
}

export async function upsertDocumentChunks(
  chunks: RetrievalChunkRecord[],
  options?: { vectors?: number[][] },
) {
  if (!chunks.length) {
    return;
  }

  await ensureRetrievalCollection();

  const vectors = options?.vectors ?? (await embedTexts(chunks.map((chunk) => chunk.text)));
  const collectionName = getCollectionName();
  const client = getQdrantClient();

  const points = chunks.map((chunk, index) => ({
    id: chunk.pointId,
    vector: vectors[index] ?? [],
    payload: toPayload(chunk),
  }));

  for (let index = 0; index < points.length; index += 64) {
    await client.upsert(collectionName, {
      wait: true,
      points: points.slice(index, index + 64),
    });
  }
}

function matchesPostFilters(payload: RetrievalPointPayload, filters?: WorkspaceKnowledgeFilters) {
  if (!filters) {
    return true;
  }

  if (filters.docTypes?.length && !filters.docTypes.includes(payload.doc_type)) {
    return false;
  }

  if (filters.tags?.length) {
    const haystack = new Set(payload.tag_values.map((item) => normalizeToken(item)));
    const matchesTag = filters.tags.some((tag) => haystack.has(normalizeToken(tag)));
    if (!matchesTag) {
      return false;
    }
  }

  return true;
}

export function buildLibrarySearchFilter(
  libraryIds: string[],
  filters?: WorkspaceKnowledgeFilters,
): QdrantFilter {
  const normalizedLibraryIds = uniqueNormalized(libraryIds);
  const must: Array<Record<string, unknown>> = [
    normalizedLibraryIds.length <= 1
      ? {
          key: "library_id",
          match: { value: normalizedLibraryIds[0] ?? "__missing_library_scope__" },
        }
      : {
          key: "library_id",
          match: { any: normalizedLibraryIds },
        },
  ];

  if (filters?.directoryPrefix) {
    must.push({
      key: "directory_prefixes",
      match: { value: filters.directoryPrefix.replace(/^\/+|\/+$/g, "") },
    });
  }

  return { must };
}

function buildRerankDocumentText(item: WorkspaceKnowledgeSearchResult) {
  return [
    item.documentPath,
    item.sectionLabel ?? "",
    ...item.headingPath,
    item.snippet,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSparseSearchText(payload: RetrievalPointPayload) {
  return [
    payload.document_path,
    payload.section_label ?? "",
    ...payload.heading_path,
    ...payload.keywords,
    payload.chunk_text,
  ]
    .filter(Boolean)
    .join("\n");
}

function sortCandidatesByScore<T extends WorkspaceKnowledgeSearchResult>(items: T[]) {
  return [...items].sort((left, right) => right.score - left.score);
}

async function rerankCandidates(
  query: string,
  candidates: SearchCandidate[],
): Promise<WorkspaceKnowledgeSearchResult[]> {
  if (!candidates.length) {
    return [];
  }

  const provider = resolveRerankProvider();
  if (provider.type === RERANK_PROVIDER.LOCAL_HEURISTIC) {
    return sortCandidatesByScore(
      candidates.map(({ keywordScore: _keywordScore, ...item }) => item),
    );
  }

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        input: {
          query,
          documents: candidates.map((item) => buildRerankDocumentText(item)),
        },
        parameters: {
          top_n: Math.min(provider.topN ?? candidates.length, candidates.length),
          return_documents: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`DashScope rerank failed with ${response.status}`);
    }

    const payload = await response.json();
    const rerankScores = new Map(
      parseDashScopeRerankResponse(payload).map((item) => [
        item.index,
        clampScore(item.relevance_score),
      ]),
    );

    return sortCandidatesByScore(
      candidates.map(({ keywordScore, ...item }, index) => {
        const bm25Score = candidates[index]?.bm25Score ?? 0;
        const rerankScore = rerankScores.get(index);
        if (typeof rerankScore !== "number") {
          return item;
        }

        const exactBoost =
            textContainsToken(item.snippet, query) ||
            textContainsToken(item.sectionLabel ?? "", query)
            ? 0.05
            : 0;
        const finalScore = clampScore(
          rerankScore * 0.72 +
            bm25Score * 0.13 +
            keywordScore * 0.1 +
            item.rawScore * 0.05 +
            exactBoost,
        );

        return {
          ...item,
          rerankScore: roundScore(rerankScore),
          score: roundScore(finalScore),
        };
      }),
    );
  } catch {
    return sortCandidatesByScore(
      candidates.map(({ keywordScore: _keywordScore, ...item }) => item),
    );
  }
}

export async function searchWorkspaceKnowledge(
  params: WorkspaceKnowledgeSearchParams,
): Promise<WorkspaceKnowledgeSearchResult[]> {
  if (params.libraryIds.length === 0) {
    return [];
  }

  await ensureRetrievalCollection();

  const [queryVector] = await embedTexts([params.query]);
  const candidateLimit = Math.max(
    params.topK * DEFAULT_QUERY_CANDIDATE_MULTIPLIER,
    DEFAULT_QUERY_CANDIDATE_LIMIT,
  );

  const results = await getQdrantClient().search(getCollectionName(), {
    vector: queryVector,
    limit: candidateLimit,
    with_payload: true,
    filter: buildLibrarySearchFilter(params.libraryIds, params.filters) as never,
  });

  const denseCandidates = results
    .map((item) => {
      const payload = (item.payload ?? {}) as RetrievalPointPayload;
      if (!payload.anchor_id || !payload.chunk_id || !matchesPostFilters(payload, params.filters)) {
        return null;
      }

      return {
        item,
        payload,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const bm25Scores = computeBm25SparseScores(
    params.query,
    denseCandidates.map((candidate) => buildSparseSearchText(candidate.payload)),
  );

  const reranked = await rerankCandidates(
    params.query,
    denseCandidates
    .map(({ item, payload }, index) => {
      const denseScore = clampScore(typeof item.score === "number" ? item.score : 0);
      const bm25Score = bm25Scores[index] ?? 0;
      const keywordScore = computeKeywordScore(params.query, payload);
      const privateLibraryBoost =
        params.privateLibraryId && payload.library_id === params.privateLibraryId ? 0.03 : 0;
      const rerankScore = clampScore(
        denseScore * 0.52 + bm25Score * 0.28 + keywordScore * 0.2 + privateLibraryBoost,
      );
      const exactBoost =
        textContainsToken(payload.chunk_text, params.query) ||
        textContainsToken(payload.section_label ?? "", params.query)
          ? 0.05
          : 0;
      const finalScore = clampScore(rerankScore + exactBoost);

      return {
        libraryId: payload.library_id,
        anchorId: payload.anchor_id,
        chunkId: payload.chunk_id,
        documentId: payload.document_id,
        documentVersionId: payload.document_version_id,
        documentPath: payload.document_path,
        pageStart: payload.page_start,
        pageEnd: payload.page_end,
        sectionLabel: payload.section_label,
        headingPath: payload.heading_path ?? [],
        docType: payload.doc_type,
        snippet: payload.chunk_text,
        rawScore: roundScore(denseScore),
        rerankScore: roundScore(rerankScore),
        score: roundScore(finalScore),
        bm25Score: roundScore(bm25Score),
        keywordScore: roundScore(keywordScore),
      } satisfies SearchCandidate;
    })
  );

  const deduped: WorkspaceKnowledgeSearchResult[] = [];
  const seen = new Set<string>();

  for (const item of reranked) {
    if (seen.has(item.anchorId)) {
      continue;
    }

    seen.add(item.anchorId);
    deduped.push(item);

    if (deduped.length >= params.topK) {
      break;
    }
  }

  return deduped;
}

export function scoreToBasisPoints(score: number) {
  return toRoundedBasisPoints(score);
}

export { describeRetrievalProvider } from "./providers";
export { searchLocalChunks, type LocalSearchChunkRecord } from "./local-search";
