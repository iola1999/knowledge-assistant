const SYSTEM_SETTING_DEFINITIONS = [
  {
    settingKey: "app_url",
    envName: "APP_URL",
    defaultValue: "http://localhost:3000",
    summary: "浏览器访问 Web 的外部地址。",
    description: "Public base URL for the web app.",
  },
  {
    settingKey: "auth_allow_registration",
    envName: "AUTH_ALLOW_REGISTRATION",
    defaultValue: "true",
    summary: "控制是否允许新用户自行注册。",
    description: "Whether new users can create accounts.",
  },
  {
    settingKey: "agent_runtime_url",
    envName: "AGENT_RUNTIME_URL",
    defaultValue: "http://localhost:4001",
    summary: "Web 调用 Agent Runtime 的基础地址。",
    description: "Base URL for the agent runtime service.",
  },
  {
    settingKey: "agent_runtime_respond_worker_concurrency",
    envName: "AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY",
    defaultValue: "1",
    summary: "conversation.respond 队列 worker 的并发数。",
    description: "BullMQ worker concurrency for conversation.respond jobs.",
  },
  {
    settingKey: "parser_service_url",
    envName: "PARSER_SERVICE_URL",
    defaultValue: "http://localhost:8001",
    summary: "Worker 调用解析服务的基础地址。",
    description: "Base URL for the parser service.",
  },
  {
    settingKey: "parser_ocr_provider",
    envName: "PARSER_OCR_PROVIDER",
    defaultValue: "dashscope",
    summary: "Parser 处理扫描 PDF 页时默认使用的 OCR provider。",
    description:
      "OCR provider for scanned or image-backed PDF pages. Supported values: disabled, mock, dashscope.",
  },
  {
    settingKey: "parser_ocr_dashscope_api_key",
    envName: "PARSER_OCR_DASHSCOPE_API_KEY",
    defaultValue: "",
    isSecret: true,
    summary: "Parser OCR 使用的 DashScope 专用密钥。",
    description: "DashScope OCR API key override for the parser OCR provider.",
  },
  {
    settingKey: "parser_ocr_dashscope_api_url",
    envName: "PARSER_OCR_DASHSCOPE_API_URL",
    defaultValue:
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    summary: "Parser OCR 使用的 DashScope 接口地址。",
    description: "DashScope OCR endpoint override for the parser OCR provider.",
  },
  {
    settingKey: "parser_ocr_dashscope_model",
    envName: "PARSER_OCR_DASHSCOPE_MODEL",
    defaultValue: "qwen-vl-ocr-latest",
    summary: "Parser OCR 使用的 DashScope 模型名。",
    description: "DashScope OCR model override for the parser OCR provider.",
  },
  {
    settingKey: "parser_ocr_dashscope_task",
    envName: "PARSER_OCR_DASHSCOPE_TASK",
    defaultValue: "advanced_recognition",
    summary: "Parser OCR 使用的 DashScope OCR 任务。",
    description:
      "DashScope OCR task override for scanned PDFs. Default is advanced_recognition.",
  },
  {
    settingKey: "redis_url",
    envName: "REDIS_URL",
    defaultValue: "redis://localhost:6379",
    summary: "BullMQ 与会话 allowlist 使用的 Redis 地址。",
    description: "Redis connection URL.",
  },
  {
    settingKey: "qdrant_url",
    envName: "QDRANT_URL",
    defaultValue: "http://localhost:6333",
    summary: "向量检索服务 Qdrant 的地址。",
    description: "Qdrant base URL.",
  },
  {
    settingKey: "qdrant_collection",
    envName: "QDRANT_COLLECTION",
    defaultValue: "knowledge_chunks",
    summary: "知识块写入 Qdrant 的集合名。",
    description: "Qdrant collection name for indexed knowledge chunks.",
  },
  {
    settingKey: "qdrant_api_key",
    envName: "QDRANT_API_KEY",
    defaultValue: "",
    isSecret: true,
    summary: "访问 Qdrant 所需的可选密钥。",
    description: "Optional Qdrant API key.",
  },
  {
    settingKey: "s3_endpoint",
    envName: "S3_ENDPOINT",
    defaultValue: "http://localhost:9000",
    summary: "对象存储服务的访问地址。",
    description: "S3 compatible object storage endpoint.",
  },
  {
    settingKey: "s3_region",
    envName: "S3_REGION",
    defaultValue: "us-east-1",
    summary: "对象存储使用的区域标识。",
    description: "S3 region.",
  },
  {
    settingKey: "s3_bucket",
    envName: "S3_BUCKET",
    defaultValue: "anchordesk",
    summary: "上传文件与产物写入的桶名。",
    description: "Primary object storage bucket.",
  },
  {
    settingKey: "s3_access_key_id",
    envName: "S3_ACCESS_KEY_ID",
    defaultValue: "minioadmin",
    summary: "对象存储访问账号 ID。",
    description: "Object storage access key ID.",
  },
  {
    settingKey: "s3_secret_access_key",
    envName: "S3_SECRET_ACCESS_KEY",
    defaultValue: "minioadmin",
    isSecret: true,
    summary: "对象存储访问账号的密钥。",
    description: "Object storage secret access key.",
  },
  {
    settingKey: "s3_force_path_style",
    envName: "S3_FORCE_PATH_STYLE",
    defaultValue: "true",
    summary: "控制 S3 客户端是否使用 path-style。",
    description: "Whether the S3 client should use path-style addressing.",
  },
  {
    settingKey: "fetch_allowed_domains",
    envName: "FETCH_ALLOWED_DOMAINS",
    defaultValue: "",
    summary: "限制抓取工具可访问的域名白名单。",
    description:
      "Optional comma-separated domain allowlist for fetch tools. Leave empty to allow any domain.",
  },
  {
    settingKey: "fetch_source_max_concurrency",
    envName: "FETCH_SOURCE_MAX_CONCURRENCY",
    defaultValue: "3",
    summary: "抓取工具 `fetch_source` / `fetch_sources` 的最大并发数。",
    description: "Maximum in-process concurrency for fetch_source and fetch_sources.",
  },
  {
    settingKey: "web_search_provider",
    envName: "WEB_SEARCH_PROVIDER",
    defaultValue: "brave",
    summary: "联网搜索工具的 provider 选择。",
    description: "Web search provider override. Current supported value: brave.",
  },
  {
    settingKey: "brave_search_api_key",
    envName: "BRAVE_SEARCH_API_KEY",
    defaultValue: "example-brave-search-api-key",
    isSecret: true,
    summary: "Brave Search 的访问密钥。",
    description: "Brave Search API key.",
  },
  {
    settingKey: "brave_search_api_url",
    envName: "BRAVE_SEARCH_API_URL",
    defaultValue: "https://api.search.brave.com/res/v1/web/search",
    summary: "Brave Search 的接口地址覆盖值。",
    description: "Brave Search API endpoint override.",
  },
  {
    settingKey: "web_search_country",
    envName: "WEB_SEARCH_COUNTRY",
    defaultValue: "CN",
    summary: "联网搜索默认附带的国家代码。",
    description: "Default country code passed to the web search provider.",
  },
  {
    settingKey: "web_search_search_lang",
    envName: "WEB_SEARCH_SEARCH_LANG",
    defaultValue: "zh-hans",
    summary: "联网搜索默认附带的检索语言。",
    description: "Default search language passed to the web search provider.",
  },
  {
    settingKey: "web_search_ui_lang",
    envName: "WEB_SEARCH_UI_LANG",
    defaultValue: "zh-CN",
    summary: "联网搜索默认附带的界面语言。",
    description: "Default UI language passed to the web search provider.",
  },
  {
    settingKey: "anthropic_final_answer_max_tokens",
    envName: "ANTHROPIC_FINAL_ANSWER_MAX_TOKENS",
    defaultValue: "1400",
    summary: "最终答案允许输出的最大 token 数。",
    description: "Final answer maximum output tokens.",
  },
  {
    settingKey: "embedding_provider",
    envName: "EMBEDDING_PROVIDER",
    defaultValue: "local_hash",
    summary: "向量化 provider 的选择。",
    description: "Embedding provider override.",
  },
  {
    settingKey: "embedding_api_url",
    envName: "EMBEDDING_API_URL",
    defaultValue: "https://api.openai.com/v1/embeddings",
    summary: "OpenAI 兼容 embedding 接口地址。",
    description: "Embedding API URL for OpenAI-compatible providers.",
  },
  {
    settingKey: "embedding_api_key",
    envName: "EMBEDDING_API_KEY",
    defaultValue: "example-embedding-api-key",
    isSecret: true,
    summary: "OpenAI 兼容 embedding 接口密钥。",
    description: "Embedding API key for OpenAI-compatible providers.",
  },
  {
    settingKey: "embedding_model",
    envName: "EMBEDDING_MODEL",
    defaultValue: "text-embedding-3-large",
    summary: "文档向量化使用的模型名。",
    description: "Embedding model name override.",
  },
  {
    settingKey: "embedding_vector_size",
    envName: "EMBEDDING_VECTOR_SIZE",
    defaultValue: "3072",
    summary: "embedding 向量维度覆盖值。",
    description: "Embedding vector dimensions override.",
  },
  {
    settingKey: "embedding_batch_size",
    envName: "EMBEDDING_BATCH_SIZE",
    defaultValue: "16",
    summary: "批量向量化时每批的条数。",
    description: "Embedding batch size override.",
  },
  {
    settingKey: "dashscope_api_key",
    envName: "DASHSCOPE_API_KEY",
    defaultValue: "example-dashscope-api-key",
    isSecret: true,
    summary: "DashScope 通用密钥回退值。",
    description: "Shared DashScope API key fallback.",
  },
  {
    settingKey: "dashscope_embedding_api_key",
    envName: "DASHSCOPE_EMBEDDING_API_KEY",
    defaultValue: "example-dashscope-embedding-api-key",
    isSecret: true,
    summary: "DashScope embedding 专用密钥。",
    description: "DashScope embedding API key override.",
  },
  {
    settingKey: "dashscope_embedding_api_url",
    envName: "DASHSCOPE_EMBEDDING_API_URL",
    defaultValue: "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    summary: "DashScope embedding 接口地址覆盖值。",
    description: "DashScope embedding endpoint override.",
  },
  {
    settingKey: "dashscope_embedding_model",
    envName: "DASHSCOPE_EMBEDDING_MODEL",
    defaultValue: "text-embedding-v4",
    summary: "DashScope embedding 模型名覆盖值。",
    description: "DashScope embedding model override.",
  },
  {
    settingKey: "dashscope_embedding_dimensions",
    envName: "DASHSCOPE_EMBEDDING_DIMENSIONS",
    defaultValue: "1024",
    summary: "DashScope embedding 维度覆盖值。",
    description: "DashScope embedding dimensions override.",
  },
  {
    settingKey: "dashscope_rerank_api_key",
    envName: "DASHSCOPE_RERANK_API_KEY",
    defaultValue: "example-dashscope-rerank-api-key",
    isSecret: true,
    summary: "DashScope rerank 专用密钥。",
    description: "DashScope rerank API key override.",
  },
  {
    settingKey: "dashscope_rerank_api_url",
    envName: "DASHSCOPE_RERANK_API_URL",
    defaultValue: "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    summary: "DashScope rerank 接口地址覆盖值。",
    description: "DashScope rerank endpoint override.",
  },
  {
    settingKey: "dashscope_rerank_model",
    envName: "DASHSCOPE_RERANK_MODEL",
    defaultValue: "gte-rerank-v2",
    summary: "DashScope rerank 模型名覆盖值。",
    description: "DashScope rerank model override.",
  },
  {
    settingKey: "dashscope_rerank_top_n",
    envName: "DASHSCOPE_RERANK_TOP_N",
    defaultValue: "8",
    summary: "DashScope rerank 保留结果数。",
    description: "DashScope rerank top-N override.",
  },
  {
    settingKey: "rerank_provider",
    envName: "RERANK_PROVIDER",
    defaultValue: "local_heuristic",
    summary: "重排 provider 的选择。",
    description: "Rerank provider override.",
  },
  {
    settingKey: "rerank_top_n",
    envName: "RERANK_TOP_N",
    defaultValue: "8",
    summary: "通用 rerank 保留结果数。",
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
    summary: definition.summary,
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
