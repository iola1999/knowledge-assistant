import { searchWebGeneralInputSchema } from "@anchordesk/contracts";

import { buildToolFailure } from "../tool-output";
import { performWebSearch } from "../web-search-client";

export async function searchWebGeneralHandler(input: unknown) {
  const args = searchWebGeneralInputSchema.parse(input);

  try {
    return {
      ok: true,
      results: await performWebSearch({
        query: args.query,
        topK: args.top_k,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "General web search failed";
    return buildToolFailure("WEB_SEARCH_UNAVAILABLE", message, true);
  }
}
