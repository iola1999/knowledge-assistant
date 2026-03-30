import {
  buildBraveWebSearchUrl,
  normalizeBraveWebSearchResponse,
  resolveWebSearchProvider,
} from "./web-search";

export async function performWebSearch(input: { query: string; topK: number }) {
  const provider = resolveWebSearchProvider();
  if (provider.type === "none") {
    throw new Error("Web search provider is not configured.");
  }

  const requestUrl = buildBraveWebSearchUrl({
    baseUrl: provider.url,
    query: input.query,
    topK: input.topK,
    country: provider.country,
    searchLang: provider.searchLang,
    uiLang: provider.uiLang,
  });
  const response = await fetch(requestUrl, {
    headers: {
      accept: "application/json",
      "x-subscription-token": provider.apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body.trim() ||
        `Web search provider responded with ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeBraveWebSearchResponse(payload, input.topK);
}
