import { z } from "zod";

import { isVisibleSystemSettingKey } from "@/lib/api/model-profiles";

export { isVisibleSystemSettingKey } from "@/lib/api/model-profiles";

export type SystemSettingRow = {
  settingKey: string;
  valueText: string | null;
  isSecret: boolean;
  summary: string | null;
  description: string | null;
};

export const AUTH_ALLOW_REGISTRATION_SETTING_KEY = "auth_allow_registration";

export type SystemSettingInputKind = "text" | "password" | "textarea" | "boolean";

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
      settingKey.startsWith("auth_") ||
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
    description: "联网搜索、embedding、DashScope、rerank 等模型侧运行参数。",
    match: (settingKey: string) =>
      settingKey.startsWith("parser_ocr_") ||
      settingKey.startsWith("anthropic_") ||
      settingKey.startsWith("web_search_") ||
      settingKey.startsWith("brave_search_") ||
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
  AUTH_ALLOW_REGISTRATION_SETTING_KEY,
  "agent_runtime_url",
  "agent_runtime_respond_worker_concurrency",
  "parser_service_url",
  "fetch_allowed_domains",
  "fetch_source_max_concurrency",
  "parser_ocr_provider",
  "parser_ocr_dashscope_api_key",
  "parser_ocr_dashscope_api_url",
  "parser_ocr_dashscope_model",
  "parser_ocr_dashscope_task",
  "web_search_provider",
  "brave_search_api_key",
  "brave_search_api_url",
  "web_search_country",
  "web_search_search_lang",
  "web_search_ui_lang",
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
const WEB_SEARCH_SEARCH_LANG_SETTING_KEY = "web_search_search_lang";
const WEB_SEARCH_LANGUAGE_ALIASES: Record<string, string> = {
  zh: "zh-hans",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans",
  "zh-tw": "zh-hant",
  "zh-hk": "zh-hant",
  "zh-mo": "zh-hant",
};

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

  if (setting.settingKey === AUTH_ALLOW_REGISTRATION_SETTING_KEY) {
    return "boolean";
  }

  if (setting.settingKey === "fetch_allowed_domains") {
    return "textarea";
  }

  return "text";
}

export function parseSystemSettingBoolean(
  valueText: string | null | undefined,
  defaultValue = false,
) {
  if (valueText == null) {
    return defaultValue;
  }

  const normalized = valueText.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export function buildSystemSettingSections(rows: SystemSettingRow[]) {
  const itemsBySection = new Map<string, SystemSettingField[]>();

  for (const row of rows
    .filter((item) => isVisibleSystemSettingKey(item.settingKey))
    .sort((left, right) =>
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

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearchTokens(haystack: string, query: string) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const normalizedHaystack = normalizeSearchText(haystack);
  return tokens.every((token) => normalizedHaystack.includes(token));
}

function buildSystemSettingSearchText(
  setting: Pick<SystemSettingField, "settingKey" | "summary" | "description">,
) {
  return [
    setting.settingKey,
    setting.summary ?? "",
    setting.description ?? "",
  ].join("\n");
}

export function filterSystemSettingSections(
  sections: SystemSettingSection[],
  query: string,
) {
  if (!normalizeSearchText(query)) {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((setting) =>
        matchesSearchTokens(buildSystemSettingSearchText(setting), query),
      ),
    }))
    .filter((section) => section.items.length > 0);
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

function normalizeSystemSettingValue(settingKey: string, valueText: string) {
  const trimmed = valueText.trim();
  if (settingKey !== WEB_SEARCH_SEARCH_LANG_SETTING_KEY) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  return WEB_SEARCH_LANGUAGE_ALIASES[normalized] ?? normalized;
}

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
      valueText: normalizeSystemSettingValue(setting.settingKey, setting.valueText),
    });
  }

  return [...normalized.values()].sort((left, right) =>
    compareSettingKeys(left.settingKey, right.settingKey),
  );
}
