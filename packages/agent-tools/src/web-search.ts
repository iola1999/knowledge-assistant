type EnvMap = Record<string, string | undefined>;

export const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_BRAVE_SEARCH_LANG = "zh-hans";
const BRAVE_SUPPORTED_SEARCH_LANGS = new Set([
  "ar",
  "eu",
  "bn",
  "bg",
  "ca",
  "zh-hans",
  "zh-hant",
  "hr",
  "cs",
  "da",
  "nl",
  "en",
  "en-gb",
  "et",
  "fi",
  "fr",
  "gl",
  "de",
  "el",
  "gu",
  "he",
  "hi",
  "hu",
  "is",
  "it",
  "jp",
  "kn",
  "ko",
  "lv",
  "lt",
  "ms",
  "ml",
  "mr",
  "nb",
  "pl",
  "pt-br",
  "pt-pt",
  "pa",
  "ro",
  "ru",
  "sr",
  "sk",
  "sl",
  "es",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
]);
const BRAVE_SEARCH_LANGUAGE_ALIASES: Record<string, string> = {
  zh: "zh-hans",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans",
  "zh-tw": "zh-hant",
  "zh-hk": "zh-hant",
  "zh-mo": "zh-hant",
};

export type WebSearchProviderConfig =
  | {
      type: "none";
    }
  | {
      type: "brave";
      url: string;
      apiKey: string;
      country: string;
      searchLang: string;
      uiLang: string;
    };

type BraveWebSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      extra_snippets?: string[];
    }>;
  };
};

export type NormalizedWebSearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

function normalizeValue(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeProviderName(value: string | undefined) {
  return normalizeValue(value).toLowerCase();
}

function normalizeBraveSearchLang(value: string | undefined) {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) {
    return DEFAULT_BRAVE_SEARCH_LANG;
  }

  const canonical = BRAVE_SEARCH_LANGUAGE_ALIASES[normalized] ?? normalized;
  if (BRAVE_SUPPORTED_SEARCH_LANGS.has(canonical)) {
    return canonical;
  }

  throw new Error(
    `Unsupported Brave search language "${value}". Use a Brave-supported code such as en, en-gb, zh-hans, or zh-hant.`,
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function resolveWebSearchProvider(
  env: EnvMap = process.env,
): WebSearchProviderConfig {
  const explicit = normalizeProviderName(env.WEB_SEARCH_PROVIDER);
  const apiKey = normalizeValue(env.BRAVE_SEARCH_API_KEY);

  if (explicit && explicit !== "brave") {
    return { type: "none" };
  }

  if (!apiKey) {
    return { type: "none" };
  }

  return {
    type: "brave",
    url: normalizeValue(env.BRAVE_SEARCH_API_URL) || BRAVE_WEB_SEARCH_URL,
    apiKey,
    country: normalizeValue(env.WEB_SEARCH_COUNTRY) || "CN",
    searchLang: normalizeBraveSearchLang(env.WEB_SEARCH_SEARCH_LANG),
    uiLang: normalizeValue(env.WEB_SEARCH_UI_LANG) || "zh-CN",
  };
}

export function normalizeBraveWebSearchResponse(
  payload: unknown,
  topK = Number.POSITIVE_INFINITY,
) {
  const parsed = payload as BraveWebSearchResponse;
  const results = parsed.web?.results ?? [];

  return results
    .map((item): NormalizedWebSearchResult | null => {
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      const url = typeof item?.url === "string" ? item.url.trim() : "";
      if (!title || !url) {
        return null;
      }

      let domain = "";
      try {
        domain = new URL(url).hostname;
      } catch {
        return null;
      }

      const snippet = uniqueStrings([
        typeof item.description === "string" ? item.description : "",
        ...((Array.isArray(item.extra_snippets) ? item.extra_snippets : []).slice(0, 2) as string[]),
      ]).join(" ");

      return {
        title,
        url,
        domain,
        snippet,
      };
    })
    .filter((item): item is NormalizedWebSearchResult => item !== null)
    .slice(0, topK);
}

export function buildBraveWebSearchUrl(input: {
  baseUrl?: string;
  query: string;
  topK: number;
  country?: string;
  searchLang?: string;
  uiLang?: string;
}) {
  const url = new URL(input.baseUrl ?? BRAVE_WEB_SEARCH_URL);
  url.searchParams.set("q", input.query.trim());
  url.searchParams.set("count", String(input.topK));
  url.searchParams.set("country", input.country?.trim() || "CN");
  url.searchParams.set("search_lang", normalizeBraveSearchLang(input.searchLang));
  url.searchParams.set("ui_lang", input.uiLang?.trim() || "zh-CN");
  url.searchParams.set("extra_snippets", "true");
  return url;
}

const STATUTE_DOMAIN_QUERIES: Record<string, string[]> = {
  CN: ["flk.npc.gov.cn", "www.gov.cn", "www.moj.gov.cn"],
  US: ["congress.gov", "ecfr.gov", "uscode.house.gov"],
};

export function buildStatuteSearchQueries(input: {
  query: string;
  jurisdiction: string;
}) {
  const query = input.query.trim();
  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  const domains = STATUTE_DOMAIN_QUERIES[jurisdiction];

  if (jurisdiction === "CN" && domains) {
    return domains.map((domain) => `${query} 法律 法规 条例 site:${domain}`);
  }

  if (jurisdiction === "US" && domains) {
    return domains.map((domain) => `${query} statute regulation site:${domain}`);
  }

  return [`${query} statute regulation law official source`];
}

export function inferStatuteEffectiveStatus(input: {
  title: string;
  snippet?: string;
}) {
  const text = `${input.title} ${input.snippet ?? ""}`.toLowerCase();

  if (
    text.includes("废止") ||
    text.includes("失效") ||
    text.includes("repealed") ||
    text.includes("rescinded")
  ) {
    return "inactive";
  }

  if (
    text.includes("现行有效") ||
    text.includes("有效") ||
    text.includes("in effect") ||
    text.includes("effective")
  ) {
    return "effective";
  }

  return "unknown";
}
