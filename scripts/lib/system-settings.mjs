const SYSTEM_SETTING_DEFINITIONS = [
  {
    settingKey: "app_url",
    envName: "APP_URL",
    defaultValue: "http://localhost:3000",
    description: "Public base URL for the web app.",
  },
  {
    settingKey: "auth_allow_registration",
    envName: "AUTH_ALLOW_REGISTRATION",
    defaultValue: "true",
    description: "Whether new users can create accounts.",
  },
  {
    settingKey: "agent_runtime_url",
    envName: "AGENT_RUNTIME_URL",
    defaultValue: "http://localhost:4001",
    description: "Base URL for the agent runtime service.",
  },
  {
    settingKey: "parser_service_url",
    envName: "PARSER_SERVICE_URL",
    defaultValue: "http://localhost:8001",
    description: "Base URL for the parser service.",
  },
  {
    settingKey: "redis_url",
    envName: "REDIS_URL",
    defaultValue: "redis://localhost:6379",
    description: "Redis connection URL.",
  },
  {
    settingKey: "qdrant_url",
    envName: "QDRANT_URL",
    defaultValue: "http://localhost:6333",
    description: "Qdrant base URL.",
  },
  {
    settingKey: "qdrant_collection",
    envName: "QDRANT_COLLECTION",
    defaultValue: "knowledge_chunks",
    description: "Qdrant collection name for indexed knowledge chunks.",
  },
  {
    settingKey: "qdrant_api_key",
    envName: "QDRANT_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "Optional Qdrant API key.",
  },
  {
    settingKey: "s3_endpoint",
    envName: "S3_ENDPOINT",
    defaultValue: "http://localhost:9000",
    description: "S3 compatible object storage endpoint.",
  },
  {
    settingKey: "s3_region",
    envName: "S3_REGION",
    defaultValue: "us-east-1",
    description: "S3 region.",
  },
  {
    settingKey: "s3_bucket",
    envName: "S3_BUCKET",
    defaultValue: "knowledge-assistant",
    description: "Primary object storage bucket.",
  },
  {
    settingKey: "s3_access_key_id",
    envName: "S3_ACCESS_KEY_ID",
    defaultValue: "minioadmin",
    description: "Object storage access key ID.",
  },
  {
    settingKey: "s3_secret_access_key",
    envName: "S3_SECRET_ACCESS_KEY",
    defaultValue: "minioadmin",
    isSecret: true,
    description: "Object storage secret access key.",
  },
  {
    settingKey: "s3_force_path_style",
    envName: "S3_FORCE_PATH_STYLE",
    defaultValue: "true",
    description: "Whether the S3 client should use path-style addressing.",
  },
  {
    settingKey: "fetch_allowed_domains",
    envName: "FETCH_ALLOWED_DOMAINS",
    defaultValue: "",
    description:
      "Optional comma-separated domain allowlist for fetch tools. Leave empty to allow any domain.",
  },
  {
    settingKey: "web_search_provider",
    envName: "WEB_SEARCH_PROVIDER",
    defaultValue: "",
    description: "Web search provider override. Current supported value: brave.",
  },
  {
    settingKey: "brave_search_api_key",
    envName: "BRAVE_SEARCH_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "Brave Search API key.",
  },
  {
    settingKey: "brave_search_api_url",
    envName: "BRAVE_SEARCH_API_URL",
    defaultValue: "https://api.search.brave.com/res/v1/web/search",
    description: "Brave Search API endpoint override.",
  },
  {
    settingKey: "web_search_country",
    envName: "WEB_SEARCH_COUNTRY",
    defaultValue: "CN",
    description: "Default country code passed to the web search provider.",
  },
  {
    settingKey: "web_search_search_lang",
    envName: "WEB_SEARCH_SEARCH_LANG",
    defaultValue: "zh",
    description: "Default search language passed to the web search provider.",
  },
  {
    settingKey: "web_search_ui_lang",
    envName: "WEB_SEARCH_UI_LANG",
    defaultValue: "zh-CN",
    description: "Default UI language passed to the web search provider.",
  },
  {
    settingKey: "anthropic_api_key",
    envName: "ANTHROPIC_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "Anthropic API key.",
  },
  {
    settingKey: "anthropic_model",
    envName: "ANTHROPIC_MODEL",
    defaultValue: "",
    description: "Default Anthropic model override.",
  },
  {
    settingKey: "anthropic_final_answer_model",
    envName: "ANTHROPIC_FINAL_ANSWER_MODEL",
    defaultValue: "",
    description: "Anthropic final-answer model override.",
  },
  {
    settingKey: "anthropic_final_answer_max_tokens",
    envName: "ANTHROPIC_FINAL_ANSWER_MAX_TOKENS",
    defaultValue: "1400",
    description: "Final answer maximum output tokens.",
  },
  {
    settingKey: "embedding_provider",
    envName: "EMBEDDING_PROVIDER",
    defaultValue: "",
    description: "Embedding provider override.",
  },
  {
    settingKey: "embedding_api_url",
    envName: "EMBEDDING_API_URL",
    defaultValue: "",
    description: "Embedding API URL for OpenAI-compatible providers.",
  },
  {
    settingKey: "embedding_api_key",
    envName: "EMBEDDING_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "Embedding API key for OpenAI-compatible providers.",
  },
  {
    settingKey: "embedding_model",
    envName: "EMBEDDING_MODEL",
    defaultValue: "",
    description: "Embedding model name override.",
  },
  {
    settingKey: "embedding_vector_size",
    envName: "EMBEDDING_VECTOR_SIZE",
    defaultValue: "",
    description: "Embedding vector dimensions override.",
  },
  {
    settingKey: "embedding_batch_size",
    envName: "EMBEDDING_BATCH_SIZE",
    defaultValue: "16",
    description: "Embedding batch size override.",
  },
  {
    settingKey: "dashscope_api_key",
    envName: "DASHSCOPE_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "Shared DashScope API key fallback.",
  },
  {
    settingKey: "dashscope_embedding_api_key",
    envName: "DASHSCOPE_EMBEDDING_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "DashScope embedding API key override.",
  },
  {
    settingKey: "dashscope_embedding_api_url",
    envName: "DASHSCOPE_EMBEDDING_API_URL",
    defaultValue: "",
    description: "DashScope embedding endpoint override.",
  },
  {
    settingKey: "dashscope_embedding_model",
    envName: "DASHSCOPE_EMBEDDING_MODEL",
    defaultValue: "",
    description: "DashScope embedding model override.",
  },
  {
    settingKey: "dashscope_embedding_dimensions",
    envName: "DASHSCOPE_EMBEDDING_DIMENSIONS",
    defaultValue: "",
    description: "DashScope embedding dimensions override.",
  },
  {
    settingKey: "dashscope_rerank_api_key",
    envName: "DASHSCOPE_RERANK_API_KEY",
    defaultValue: "",
    isSecret: true,
    description: "DashScope rerank API key override.",
  },
  {
    settingKey: "dashscope_rerank_api_url",
    envName: "DASHSCOPE_RERANK_API_URL",
    defaultValue: "",
    description: "DashScope rerank endpoint override.",
  },
  {
    settingKey: "dashscope_rerank_model",
    envName: "DASHSCOPE_RERANK_MODEL",
    defaultValue: "",
    description: "DashScope rerank model override.",
  },
  {
    settingKey: "dashscope_rerank_top_n",
    envName: "DASHSCOPE_RERANK_TOP_N",
    defaultValue: "",
    description: "DashScope rerank top-N override.",
  },
  {
    settingKey: "rerank_provider",
    envName: "RERANK_PROVIDER",
    defaultValue: "",
    description: "Rerank provider override.",
  },
  {
    settingKey: "rerank_top_n",
    envName: "RERANK_TOP_N",
    defaultValue: "",
    description: "Generic rerank top-N override.",
  },
];

const definitionByKey = new Map(
  SYSTEM_SETTING_DEFINITIONS.map((definition) => [definition.settingKey, definition]),
);

export function getSystemSettingDefinitions() {
  return [...SYSTEM_SETTING_DEFINITIONS];
}

export function buildSystemSettingSeedRows(env = {}) {
  return SYSTEM_SETTING_DEFINITIONS.map((definition) => ({
    settingKey: definition.settingKey,
    valueText:
      env[definition.envName] !== undefined
        ? env[definition.envName]
        : definition.defaultValue,
    isSecret: definition.isSecret ?? false,
    description: definition.description,
  }));
}

export function mapSystemSettingRowsToEnv(rows) {
  const env = {};

  for (const row of rows) {
    const definition = definitionByKey.get(row.settingKey);
    if (!definition) {
      continue;
    }

    env[definition.envName] = row.valueText ?? "";
  }

  return env;
}

export function resolveSystemSettingsEnv(baseEnv = {}, rows = []) {
  const dbEnv = mapSystemSettingRowsToEnv(rows);
  const resolved = {};

  for (const definition of SYSTEM_SETTING_DEFINITIONS) {
    if (baseEnv[definition.envName] !== undefined) {
      resolved[definition.envName] = baseEnv[definition.envName];
      continue;
    }

    if (dbEnv[definition.envName] !== undefined) {
      resolved[definition.envName] = dbEnv[definition.envName];
      continue;
    }

    resolved[definition.envName] = definition.defaultValue;
  }

  return resolved;
}

export function buildRuntimeEnvironment(baseEnv = {}, rows = []) {
  return {
    ...baseEnv,
    ...resolveSystemSettingsEnv(baseEnv, rows),
  };
}
