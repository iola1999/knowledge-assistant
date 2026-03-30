import { DEFAULT_FETCH_SOURCE_PARAGRAPH_LIMIT } from "@anchordesk/contracts";

type EnvMap = Record<string, string | undefined>;

export const MARKDOWN_FETCH_API_URL = "https://markdown.new/";

export type MarkdownFetchProviderConfig = {
  url: string;
};

export type FetchedSourceDocument = {
  url: string;
  title: string;
  fetched_at: string;
  content_type: string;
  paragraphs: string[];
};

type MarkdownFetchJsonEnvelope = {
  title?: unknown;
  content?: unknown;
};

function normalizeValue(value: string | undefined) {
  return (value ?? "").trim();
}

function parseMarkdownFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized.startsWith("---\n")) {
    return {
      metadata: {} as Record<string, string>,
      body: normalized,
    };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return {
      metadata: {} as Record<string, string>,
      body: normalized,
    };
  }

  const metadata: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key && value) {
      metadata[key] = value;
    }
  }

  return {
    metadata,
    body: normalized.slice(end + 5).trim(),
  };
}

function extractFirstHeading(markdown: string) {
  const match = markdown.match(/^#{1,6}\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function normalizeMarkdownBlock(block: string) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const isListBlock = lines.every(
    (line) => /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line),
  );

  return isListBlock ? lines.join("\n") : lines.join(" ");
}

function unwrapMarkdownFetchBody(input: {
  body: string;
  contentType: string;
}) {
  const trimmedBody = input.body.trim();
  const looksLikeJson =
    input.contentType.toLowerCase().includes("application/json") ||
    trimmedBody.startsWith("{");

  if (!looksLikeJson) {
    return {
      markdown: input.body,
      title: "",
    };
  }

  try {
    const parsed = JSON.parse(trimmedBody) as MarkdownFetchJsonEnvelope;
    if (typeof parsed.content === "string" && parsed.content.trim()) {
      return {
        markdown: parsed.content,
        title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      };
    }
  } catch {
    // Fall back to treating the response as raw markdown/plain text.
  }

  return {
    markdown: input.body,
    title: "",
  };
}

export function resolveMarkdownFetchProvider(
  env: EnvMap = process.env,
): MarkdownFetchProviderConfig {
  return {
    url: normalizeValue(env.MARKDOWN_FETCH_API_URL) || MARKDOWN_FETCH_API_URL,
  };
}

export function parseMarkdownSourceDocument(
  markdown: string,
  paragraphLimit = DEFAULT_FETCH_SOURCE_PARAGRAPH_LIMIT,
) {
  const { metadata, body } = parseMarkdownFrontmatter(markdown);
  const title = metadata.title?.trim() || extractFirstHeading(body);
  const rawBlocks = body
    .split(/\n\s*\n+/)
    .map(normalizeMarkdownBlock)
    .filter(Boolean);

  const normalizedTitle = title.replace(/^#+\s+/, "").trim().toLowerCase();
  const dedupedBlocks = rawBlocks.filter((block, index) => {
    if (index !== 0 || !normalizedTitle) {
      return true;
    }

    return block.replace(/^#+\s+/, "").trim().toLowerCase() !== normalizedTitle;
  });

  return {
    title,
    paragraphs: (dedupedBlocks.length > 0 ? dedupedBlocks : rawBlocks).slice(
      0,
      paragraphLimit,
    ),
  };
}

export async function fetchMarkdownSource(input: {
  url: string;
  env?: EnvMap;
  fetchFn?: typeof fetch;
  now?: () => Date;
  paragraphLimit?: number;
}): Promise<FetchedSourceDocument> {
  const fetchFn = input.fetchFn ?? fetch;
  const provider = resolveMarkdownFetchProvider(input.env);
  const response = await fetchFn(provider.url, {
    method: "POST",
    headers: {
      accept: "text/markdown",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: input.url,
      method: "auto",
      retain_images: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body.trim() ||
        `Markdown fetch provider responded with ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error("Markdown fetch provider returned empty content.");
  }
  const contentType = response.headers.get("content-type") ?? "text/markdown";
  const unwrapped = unwrapMarkdownFetchBody({
    body,
    contentType,
  });
  if (!unwrapped.markdown.trim()) {
    throw new Error("Markdown fetch provider returned empty content.");
  }

  const paragraphLimit =
    input.paragraphLimit ?? DEFAULT_FETCH_SOURCE_PARAGRAPH_LIMIT;
  const parsed = parseMarkdownSourceDocument(unwrapped.markdown, paragraphLimit);
  const title = parsed.title || unwrapped.title || new URL(input.url).hostname;

  return {
    url: input.url,
    title,
    fetched_at: (input.now ?? (() => new Date()))().toISOString(),
    content_type: contentType,
    paragraphs: parsed.paragraphs,
  };
}
