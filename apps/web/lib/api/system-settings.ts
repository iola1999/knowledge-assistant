import { z } from "zod";

export type SystemSettingRow = {
  settingKey: string;
  valueText: string | null;
  isSecret: boolean;
  description: string | null;
};

export type SystemSettingInputKind = "text" | "password" | "textarea";

export type SystemSettingField = SystemSettingRow & {
  inputKind: SystemSettingInputKind;
};

export type SystemSettingSection = {
  id: string;
  title: string;
  description: string;
  items: SystemSettingField[];
};

const SECTION_DEFINITIONS = [
  {
    id: "application",
    title: "应用与服务",
    description: "前端、Agent、Parser 的基础地址和工具访问白名单。",
    match: (settingKey: string) =>
      settingKey.startsWith("app_") ||
      settingKey.startsWith("agent_runtime_") ||
      settingKey.startsWith("parser_service_") ||
      settingKey.startsWith("fetch_"),
  },
  {
    id: "storage",
    title: "存储与检索",
    description: "Redis、Qdrant、S3 / MinIO 等底层基础设施参数。",
    match: (settingKey: string) =>
      settingKey.startsWith("redis_") ||
      settingKey.startsWith("qdrant_") ||
      settingKey.startsWith("s3_"),
  },
  {
    id: "model",
    title: "模型与检索策略",
    description: "Anthropic、embedding、DashScope、rerank 等模型侧配置。",
    match: (settingKey: string) =>
      settingKey.startsWith("anthropic_") ||
      settingKey.startsWith("embedding_") ||
      settingKey.startsWith("dashscope_") ||
      settingKey.startsWith("rerank_"),
  },
  {
    id: "other",
    title: "其他",
    description: "当前还未归类的系统参数。",
    match: () => true,
  },
];

const KNOWN_SETTING_ORDER = [
  "app_url",
  "agent_runtime_url",
  "parser_service_url",
  "fetch_allowed_domains",
  "redis_url",
  "qdrant_url",
  "qdrant_collection",
  "qdrant_api_key",
  "s3_endpoint",
  "s3_region",
  "s3_bucket",
  "s3_access_key_id",
  "s3_secret_access_key",
  "s3_force_path_style",
  "anthropic_api_key",
  "anthropic_model",
  "anthropic_final_answer_model",
  "anthropic_final_answer_max_tokens",
  "embedding_provider",
  "embedding_api_url",
  "embedding_api_key",
  "embedding_model",
  "embedding_vector_size",
  "embedding_batch_size",
  "dashscope_api_key",
  "dashscope_embedding_api_key",
  "dashscope_embedding_api_url",
  "dashscope_embedding_model",
  "dashscope_embedding_dimensions",
  "dashscope_rerank_api_key",
  "dashscope_rerank_api_url",
  "dashscope_rerank_model",
  "dashscope_rerank_top_n",
  "rerank_provider",
  "rerank_top_n",
];

const knownSettingOrder = new Map(
  KNOWN_SETTING_ORDER.map((settingKey, index) => [settingKey, index]),
);

function getSectionDefinition(settingKey: string) {
  return SECTION_DEFINITIONS.find((section) => section.match(settingKey))!;
}

function compareSettingKeys(left: string, right: string) {
  const leftRank = knownSettingOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = knownSettingOrder.get(right) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.localeCompare(right);
}

function getInputKind(setting: SystemSettingRow): SystemSettingInputKind {
  if (setting.isSecret) {
    return "password";
  }

  if (setting.settingKey === "fetch_allowed_domains") {
    return "textarea";
  }

  return "text";
}

export function buildSystemSettingSections(rows: SystemSettingRow[]) {
  const itemsBySection = new Map<string, SystemSettingField[]>();

  for (const row of [...rows].sort((left, right) =>
    compareSettingKeys(left.settingKey, right.settingKey),
  )) {
    const section = getSectionDefinition(row.settingKey);
    const items = itemsBySection.get(section.id) ?? [];
    items.push({
      ...row,
      valueText: row.valueText ?? "",
      inputKind: getInputKind(row),
    });
    itemsBySection.set(section.id, items);
  }

  return SECTION_DEFINITIONS.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    items: itemsBySection.get(section.id) ?? [],
  })).filter((section) => section.items.length > 0);
}

export const systemSettingsUpdateSchema = z.object({
  settings: z
    .array(
      z.object({
        settingKey: z.string().trim().min(1, "settingKey is required"),
        valueText: z.string(),
      }),
    )
    .min(1, "At least one setting is required"),
});

export function normalizeSystemSettingUpdates(
  settings: Array<{ settingKey: string; valueText: string }>,
  knownKeys: Iterable<string>,
) {
  const knownKeySet = new Set(knownKeys);
  const normalized = new Map<string, { settingKey: string; valueText: string }>();

  for (const setting of settings) {
    if (!knownKeySet.has(setting.settingKey)) {
      throw new Error(`Unknown system setting: ${setting.settingKey}`);
    }

    normalized.set(setting.settingKey, {
      settingKey: setting.settingKey,
      valueText: setting.valueText.trim(),
    });
  }

  return [...normalized.values()].sort((left, right) =>
    compareSettingKeys(left.settingKey, right.settingKey),
  );
}
