import { searchStatutesInputSchema } from "@anchordesk/contracts";

import { buildToolFailure } from "../tool-output";
import { performWebSearch } from "../web-search-client";
import { buildStatuteSearchQueries, inferStatuteEffectiveStatus } from "../web-search";

export async function searchStatutesHandler(input: unknown) {
  const args = searchStatutesInputSchema.parse(input);

  try {
    const searchQueries = buildStatuteSearchQueries({
      query: args.query,
      jurisdiction: args.jurisdiction,
    });
    const batches = await Promise.all(
      searchQueries.map((query) => performWebSearch({ query, topK: args.top_k })),
    );
    const results = batches
      .flat()
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.url === item.url) === index,
      )
      .slice(0, args.top_k)
      .map((item) => ({
        title: item.title,
        url: item.url,
        publisher: item.domain,
        effective_status: inferStatuteEffectiveStatus({
          title: item.title,
          snippet: item.snippet,
        }),
        snippet: item.snippet,
      }));

    return {
      ok: true,
      results,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Statute search failed";
    return buildToolFailure("STATUTE_SEARCH_UNAVAILABLE", message, true);
  }
}
