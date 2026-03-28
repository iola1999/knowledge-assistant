const DEFAULT_EMBEDDING_BATCH_SIZE = 16;
const DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE = 10;

type EnvMap = Record<string, string | undefined>;

export type EmbeddingProviderConfig =
  | {
      type: "local_hash";
    }
  | {
      type: "openai_compatible";
      url: string;
      apiKey?: string;
      model?: string;
      dimensions?: number;
    }
  | {
      type: "dashscope_compatible";
      url: string;
      apiKey: string;
      model: string;
      dimensions?: number;
    };

export type RerankProviderConfig =
  | {
      type: "local_heuristic";
    }
  | {
      type: "dashscope";
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

  if (explicit === "local_hash") {
    return { type: "local_hash" };
  }

  if (explicit === "dashscope_compatible" || explicit === "dashscope") {
    const apiKey = env.DASHSCOPE_EMBEDDING_API_KEY ?? env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return { type: "local_hash" };
    }

    return {
      type: "dashscope_compatible",
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

  if (explicit === "openai_compatible") {
    if (!env.EMBEDDING_API_URL) {
      return { type: "local_hash" };
    }

    return {
      type: "openai_compatible",
      url: env.EMBEDDING_API_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimensions: parsePositiveInt(env.EMBEDDING_VECTOR_SIZE),
    };
  }

  if (env.EMBEDDING_API_URL) {
    return {
      type: "openai_compatible",
      url: env.EMBEDDING_API_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimensions: parsePositiveInt(env.EMBEDDING_VECTOR_SIZE),
    };
  }

  const dashscopeApiKey = env.DASHSCOPE_EMBEDDING_API_KEY ?? env.DASHSCOPE_API_KEY;
  if (dashscopeApiKey) {
    return {
      type: "dashscope_compatible",
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

  return { type: "local_hash" };
}

export function getEmbeddingBatchSize(
  provider: EmbeddingProviderConfig,
  env: EnvMap = process.env,
) {
  const configured = parsePositiveInt(env.EMBEDDING_BATCH_SIZE) ?? DEFAULT_EMBEDDING_BATCH_SIZE;
  if (provider.type === "dashscope_compatible") {
    return Math.min(configured, DEFAULT_DASHSCOPE_EMBEDDING_BATCH_SIZE);
  }
  return configured;
}

export function resolveRerankProvider(env: EnvMap = process.env): RerankProviderConfig {
  const explicit = normalizeProviderName(env.RERANK_PROVIDER);

  if (explicit === "local_heuristic" || explicit === "local") {
    return { type: "local_heuristic" };
  }

  const dashscopeApiKey = env.DASHSCOPE_RERANK_API_KEY ?? env.DASHSCOPE_API_KEY;
  if (explicit === "dashscope") {
    if (!dashscopeApiKey) {
      return { type: "local_heuristic" };
    }

    return {
      type: "dashscope",
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
      type: "dashscope",
      url:
        env.DASHSCOPE_RERANK_API_URL ??
        "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
      apiKey: dashscopeApiKey,
      model: env.DASHSCOPE_RERANK_MODEL ?? "gte-rerank-v2",
      topN: parsePositiveInt(env.DASHSCOPE_RERANK_TOP_N ?? env.RERANK_TOP_N),
    };
  }

  return { type: "local_heuristic" };
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
