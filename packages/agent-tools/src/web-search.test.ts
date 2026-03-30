import { describe, expect, it } from "vitest";

import {
  BRAVE_WEB_SEARCH_URL,
  buildBraveWebSearchUrl,
  buildStatuteSearchQueries,
  normalizeBraveWebSearchResponse,
  resolveWebSearchProvider,
} from "./web-search";

describe("resolveWebSearchProvider", () => {
  it("uses Brave when an API key is configured", () => {
    expect(
      resolveWebSearchProvider({
        BRAVE_SEARCH_API_KEY: "secret-key",
      }),
    ).toMatchObject({
      type: "brave",
      apiKey: "secret-key",
      url: BRAVE_WEB_SEARCH_URL,
      country: "CN",
      searchLang: "zh-hans",
      uiLang: "zh-CN",
    });
  });

  it("returns none when the provider is explicitly enabled but the API key is missing", () => {
    expect(
      resolveWebSearchProvider({
        WEB_SEARCH_PROVIDER: "brave",
      }),
    ).toEqual({
      type: "none",
    });
  });

  it("canonicalizes legacy Chinese search language aliases into Brave-supported values", () => {
    expect(
      resolveWebSearchProvider({
        BRAVE_SEARCH_API_KEY: "secret-key",
        WEB_SEARCH_SEARCH_LANG: "zh",
      }),
    ).toMatchObject({
      type: "brave",
      searchLang: "zh-hans",
    });

    expect(
      resolveWebSearchProvider({
        BRAVE_SEARCH_API_KEY: "secret-key",
        WEB_SEARCH_SEARCH_LANG: "zh-TW",
      }),
    ).toMatchObject({
      type: "brave",
      searchLang: "zh-hant",
    });
  });

  it("fails fast when the configured Brave search language is unsupported", () => {
    expect(() =>
      resolveWebSearchProvider({
        BRAVE_SEARCH_API_KEY: "secret-key",
        WEB_SEARCH_SEARCH_LANG: "xx",
      }),
    ).toThrow(/Unsupported Brave search language/i);
  });
});

describe("buildBraveWebSearchUrl", () => {
  it("writes a Brave-supported search_lang value into the request", () => {
    const url = buildBraveWebSearchUrl({
      query: "latest news",
      topK: 5,
      searchLang: "zh",
    });

    expect(url.searchParams.get("search_lang")).toBe("zh-hans");
  });
});

describe("normalizeBraveWebSearchResponse", () => {
  it("maps Brave web results into the assistant tool shape", () => {
    expect(
      normalizeBraveWebSearchResponse({
        web: {
          results: [
            {
              title: "政策解读",
              url: "https://example.com/policy",
              description: "第一段摘要",
              extra_snippets: ["第二段补充", "第三段补充"],
            },
          ],
        },
      }),
    ).toEqual([
      {
        title: "政策解读",
        url: "https://example.com/policy",
        domain: "example.com",
        snippet: "第一段摘要 第二段补充 第三段补充",
      },
    ]);
  });

  it("skips malformed results and respects the requested topK", () => {
    expect(
      normalizeBraveWebSearchResponse(
        {
          web: {
            results: [
              {
                title: "A",
                url: "https://example.com/a",
              },
              {
                title: "",
                url: "https://example.com/b",
              },
              {
                title: "C",
                url: "not-a-url",
              },
            ],
          },
        },
        1,
      ),
    ).toEqual([
      {
        title: "A",
        url: "https://example.com/a",
        domain: "example.com",
        snippet: "",
      },
    ]);
  });
});

describe("buildStatuteSearchQueries", () => {
  it("targets official CN domains for statute search", () => {
    expect(
      buildStatuteSearchQueries({
        query: "个人信息保护法",
        jurisdiction: "CN",
      }),
    ).toEqual([
      "个人信息保护法 法律 法规 条例 site:flk.npc.gov.cn",
      "个人信息保护法 法律 法规 条例 site:www.gov.cn",
      "个人信息保护法 法律 法规 条例 site:www.moj.gov.cn",
    ]);
  });

  it("falls back to broad official US domains for US jurisdiction", () => {
    expect(
      buildStatuteSearchQueries({
        query: "artificial intelligence executive order",
        jurisdiction: "US",
      }),
    ).toEqual([
      "artificial intelligence executive order statute regulation site:congress.gov",
      "artificial intelligence executive order statute regulation site:ecfr.gov",
      "artificial intelligence executive order statute regulation site:uscode.house.gov",
    ]);
  });
});
