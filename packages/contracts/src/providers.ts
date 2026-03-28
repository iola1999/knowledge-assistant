type ValueOf<T> = T[keyof T];

export const EMBEDDING_PROVIDER = {
  LOCAL_HASH: "local_hash",
  OPENAI_COMPATIBLE: "openai_compatible",
  DASHSCOPE_COMPATIBLE: "dashscope_compatible",
} as const;
export type EmbeddingProviderName = ValueOf<typeof EMBEDDING_PROVIDER>;
export const EMBEDDING_PROVIDER_ALIAS = {
  DASHSCOPE: "dashscope",
} as const;

export const RERANK_PROVIDER = {
  LOCAL_HEURISTIC: "local_heuristic",
  DASHSCOPE: "dashscope",
} as const;
export type RerankProviderName = ValueOf<typeof RERANK_PROVIDER>;
export const RERANK_PROVIDER_ALIAS = {
  LOCAL: "local",
} as const;
