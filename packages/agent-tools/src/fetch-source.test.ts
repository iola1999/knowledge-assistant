import { describe, expect, it, vi } from "vitest";

import {
  MARKDOWN_FETCH_API_URL,
  fetchMarkdownSource,
  parseMarkdownSourceDocument,
  resolveMarkdownFetchProvider,
} from "./fetch-source";

describe("resolveMarkdownFetchProvider", () => {
  it("defaults to markdown.new", () => {
    expect(resolveMarkdownFetchProvider()).toEqual({
      url: MARKDOWN_FETCH_API_URL,
    });
  });

  it("allows overriding the provider url via env", () => {
    expect(
      resolveMarkdownFetchProvider({
        MARKDOWN_FETCH_API_URL: "https://internal-gateway.example/markdown",
      }),
    ).toEqual({
      url: "https://internal-gateway.example/markdown",
    });
  });
});

describe("parseMarkdownSourceDocument", () => {
  it("reads title from frontmatter and removes the duplicate first heading", () => {
    expect(
      parseMarkdownSourceDocument(`---
title: Markdown for Agents
---

# Markdown for Agents

The web was built for humans.

## Why this matters

Structured Markdown saves tokens.
`),
    ).toEqual({
      title: "Markdown for Agents",
      paragraphs: [
        "The web was built for humans.",
        "## Why this matters",
        "Structured Markdown saves tokens.",
      ],
    });
  });

  it("falls back to the first heading and preserves markdown lists", () => {
    expect(
      parseMarkdownSourceDocument(`
# Example Page

- first item
- second item
`),
    ).toEqual({
      title: "Example Page",
      paragraphs: ["- first item\n- second item"],
    });
  });
});

describe("fetchMarkdownSource", () => {
  it("posts the original url to markdown.new and returns parsed markdown", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe(MARKDOWN_FETCH_API_URL);
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          accept: "text/markdown",
          "content-type": "application/json",
        },
      });
      expect(init?.body).toBe(
        JSON.stringify({
          url: "https://example.com/article",
          method: "auto",
          retain_images: false,
        }),
      );

      return new Response(
        `---
title: Example Article
---

# Example Article

First paragraph.

Second paragraph.
`,
        {
          status: 200,
          headers: {
            "content-type": "text/markdown; charset=utf-8",
          },
        },
      );
    });

    await expect(
      fetchMarkdownSource({
        url: "https://example.com/article",
        fetchFn,
        now: () => new Date("2026-03-30T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      url: "https://example.com/article",
      title: "Example Article",
      fetched_at: "2026-03-30T12:00:00.000Z",
      content_type: "text/markdown; charset=utf-8",
      paragraphs: ["First paragraph.", "Second paragraph."],
    });
  });

  it("surfaces provider failures with the response body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response("temporarily unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      fetchMarkdownSource({
        url: "https://example.com/article",
        fetchFn,
      }),
    ).rejects.toThrow("temporarily unavailable");
  });

  it("unwraps JSON provider responses that carry markdown content", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          success: true,
          title: "Wrapped Example Article",
          content: `# Wrapped Example Article

First paragraph.

Second paragraph.
`,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        },
      ),
    );

    await expect(
      fetchMarkdownSource({
        url: "https://example.com/wrapped",
        fetchFn,
        now: () => new Date("2026-03-30T13:00:00.000Z"),
      }),
    ).resolves.toEqual({
      url: "https://example.com/wrapped",
      title: "Wrapped Example Article",
      fetched_at: "2026-03-30T13:00:00.000Z",
      content_type: "application/json; charset=utf-8",
      paragraphs: ["First paragraph.", "Second paragraph."],
    });
  });
});
