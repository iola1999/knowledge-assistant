import {
  DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_BATCH_SIZE,
  EMBEDDING_PROVIDER,
  EMBEDDING_PROVIDER_ALIAS,
  RERANK_PROVIDER,
  RERANK_PROVIDER_ALIAS,
} from "@anchordesk/contracts";

type EnvMap = Record<string, string | undefined>;

export type EmbeddingProviderConfig =
  | {
      type: typeof EMBEDDING_PROVIDER.LOCAL_HASH;
    }
  | {
      type: typeof EMBEDDING_PROVIDER.OPENAI_COMPATIBLE;
      url: string;
      apiKey?: string;
      model?: string;
      dimensions?: number;
    }
  | {
      type: typeof EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE;
      url: string;
      apiKey: string;
      model: string;
      dimensions?: number;
    };

export type RerankProviderConfig =
  | {
      type: typeof RERANK_PROVIDER.LOCAL_HEURISTIC;
    }
  | {
      type: typeof RERANK_PROVIDER.DASHSCOPE;
      url: string;
      apiKey: string;
      model: string;
      topN?: number;
    };

type DashScopeRerankResponse = {
  output?: {
    results?: Array<{
      index?: number;
      relevance_score?: number;
      document?: {
        text?: string;
      };
    }>;
  };
};

export type DashScopeRerankResult = {
  index: number;
  relevance_score: number;
  document_text: string | null;
};

type DashScopeRerankResponseItem = NonNullable<
  NonNullable<DashScopeRerankResponse["output"]>["results"]
>[number];

function normalizeProviderName(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parsePositiveInt(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveEmbeddingProvider(env: EnvMap = process.env): EmbeddingProviderConfig {
  const explicit = normalizeProviderName(env.EMBEDDING_PROVIDER);

  if (explicit === EMBEDDING_PROVIDER.LOCAL_HASH) {
    return { type: EMBEDDING_PROVIDER.LOCAL_HASH };
  }

  if (
    explicit === EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE ||
    explicit === EMBEDDING_PROVIDER_ALIAS.DASHSCOPE
  ) {
    const apiKey = env.DASHSCOPE_EMBEDDING_API_KEY ?? env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return { type: EMBEDDING_PROVIDER.LOCAL_HASH };
    }

    return {
      type: EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE,
      url:
        env.DASHSCOPE_EMBEDDING_API_URL ??
        "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      apiKey,
      model: env.DASHSCOPE_EMBEDDING_MODEL ?? env.EMBEDDING_MODEL ?? "text-embedding-v4",
      dimensions: parsePositiveInt(
        env.DASHSCOPE_EMBEDDING_DIMENSIONS ?? env.EMBEDDING_VECTOR_SIZE,
      ),
    };
  }

  if (explicit === EMBEDDING_PROVIDER.OPENAI_COMPATIBLE) {
    if (!env.EMBEDDING_API_URL) {
      return { type: EMBEDDING_PROVIDER.LOCAL_HASH };
    }

    return {
      type: EMBEDDING_PROVIDER.OPENAI_COMPATIBLE,
      url: env.EMBEDDING_API_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimensions: parsePositiveInt(env.EMBEDDING_VECTOR_SIZE),
    };
  }

  if (env.EMBEDDING_API_URL) {
    return {
      type: EMBEDDING_PROVIDER.OPENAI_COMPATIBLE,
      url: env.EMBEDDING_API_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimensions: parsePositiveInt(env.EMBEDDING_VECTOR_SIZE),
    };
  }

  const dashscopeApiKey = env.DASHSCOPE_EMBEDDING_API_KEY ?? env.DASHSCOPE_API_KEY;
  if (dashscopeApiKey) {
    return {
      type: EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE,
      url:
        env.DASHSCOPE_EMBEDDING_API_URL ??
        "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      apiKey: dashscopeApiKey,
      model: env.DASHSCOPE_EMBEDDING_MODEL ?? env.EMBEDDING_MODEL ?? "text-embedding-v4",
      dimensions: parsePositiveInt(
        env.DASHSCOPE_EMBEDDING_DIMENSIONS ?? env.EMBEDDING_VECTOR_SIZE,
      ),
    };
  }

  return { type: EMBEDDING_PROVIDER.LOCAL_HASH };
}

export function getEmbeddingBatchSize(
  provider: EmbeddingProviderConfig,
  env: EnvMap = process.env,
) {
  const configured = parsePositiveInt(env.EMBEDDING_BATCH_SIZE) ?? DEFAULT_EMBEDDING_BATCH_SIZE;
  if (provider.type === EMBEDDING_PROVIDER.DASHSCOPE_COMPATIBLE) {
    return Math.min(configured, DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE);
  }
  return configured;
}

export function resolveRerankProvider(env: EnvMap = process.env): RerankProviderConfig {
  const explicit = normalizeProviderName(env.RERANK_PROVIDER);

  if (explicit === RERANK_PROVIDER.LOCAL_HEURISTIC || explicit === RERANK_PROVIDER_ALIAS.LOCAL) {
    return { type: RERANK_PROVIDER.LOCAL_HEURISTIC };
  }

  const dashscopeApiKey = env.DASHSCOPE_RERANK_API_KEY ?? env.DASHSCOPE_API_KEY;
  if (explicit === RERANK_PROVIDER.DASHSCOPE) {
    if (!dashscopeApiKey) {
      return { type: RERANK_PROVIDER.LOCAL_HEURISTIC };
    }

    return {
      type: RERANK_PROVIDER.DASHSCOPE,
      url:
        env.DASHSCOPE_RERANK_API_URL ??
        "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
      apiKey: dashscopeApiKey,
      model: env.DASHSCOPE_RERANK_MODEL ?? "gte-rerank-v2",
      topN: parsePositiveInt(env.DASHSCOPE_RERANK_TOP_N ?? env.RERANK_TOP_N),
    };
  }

  if (dashscopeApiKey) {
    return {
      type: RERANK_PROVIDER.DASHSCOPE,
      url:
        env.DASHSCOPE_RERANK_API_URL ??
        "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
      apiKey: dashscopeApiKey,
      model: env.DASHSCOPE_RERANK_MODEL ?? "gte-rerank-v2",
      topN: parsePositiveInt(env.DASHSCOPE_RERANK_TOP_N ?? env.RERANK_TOP_N),
    };
  }

  return { type: RERANK_PROVIDER.LOCAL_HEURISTIC };
}

export function parseDashScopeRerankResponse(
  payload: unknown,
): DashScopeRerankResult[] {
  const parsed = payload as DashScopeRerankResponse;
  const results = parsed.output?.results ?? [];

  return results
    .filter(
      (item): item is DashScopeRerankResponseItem & {
        index: number;
        relevance_score: number;
      } =>
        typeof item?.index === "number" && typeof item?.relevance_score === "number",
    )
    .map((item) => ({
      index: item.index,
      relevance_score: item.relevance_score,
      document_text: item.document?.text ?? null,
    }));
}

export function describeRetrievalProvider(env: EnvMap = process.env) {
  const embeddingProvider = resolveEmbeddingProvider(env);
  const rerankProvider = resolveRerankProvider(env);

  return [
    "qdrant_dense",
    embeddingProvider.type,
    rerankProvider.type,
  ].join("_");
}
