import { fetchSourceInputSchema } from "@anchordesk/contracts";

import { fetchMarkdownSource } from "../fetch-source";
import { buildToolFailure } from "../tool-output";

function parseAllowedDomains() {
  const raw = (process.env.FETCH_ALLOWED_DOMAINS ?? "").trim();
  if (!raw) {
    return null;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function fetchSourceHandler(input: unknown) {
  const args = fetchSourceInputSchema.parse(input);
  const url = new URL(args.url);
  const allowed = parseAllowedDomains();

  if (allowed && !allowed.includes(url.hostname)) {
    return buildToolFailure(
      "FETCH_BLOCKED_DOMAIN",
      `Domain ${url.hostname} is not allowed`,
      false,
    );
  }

  try {
    return {
      ok: true,
      source: await fetchMarkdownSource({
        url: args.url,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Source fetch failed";
    return buildToolFailure("FETCH_SOURCE_UNAVAILABLE", message, true);
  }
}
