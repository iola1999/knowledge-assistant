import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
} from "@anchordesk/contracts";
import { getConfiguredAnthropicApiKey } from "@anchordesk/db";

import {
  buildAgentSystemPrompt,
  getAllowedTools,
  parseToolPayload,
  runAgentResponse,
} from "./run-agent-response";

const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
const temporaryDirs: string[] = [];

afterEach(async () => {
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  }

  await Promise.all(
    temporaryDirs.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("getAllowedTools", () => {
  test("always returns the full tool set", () => {
    expect(getAllowedTools()).toEqual([...ASSISTANT_ALLOWED_TOOL_NAMES]);
  });
});

describe("buildAgentSystemPrompt", () => {
  test("strengthens local retrieval guidance when searchable knowledge is available", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      searchableKnowledge: {
        hasReadySearchableKnowledge: true,
        totalReadyDocumentCount: 6,
        readyPrivateDocumentCount: 4,
        readyGlobalDocumentCount: 2,
        searchableGlobalLibraryCount: 1,
      },
    });

    expect(prompt).toContain(
      "This workspace currently has indexed local knowledge available",
    );
    expect(prompt).toContain("try search_workspace_knowledge early");
    expect(prompt).toContain("Still consider the other tools");
  });

  test("keeps the general tool-order guidance even when no searchable knowledge is ready", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      searchableKnowledge: {
        hasReadySearchableKnowledge: false,
        totalReadyDocumentCount: 0,
        readyPrivateDocumentCount: 0,
        readyGlobalDocumentCount: 0,
        searchableGlobalLibraryCount: 0,
      },
    });

    expect(prompt).toContain(
      "Prefer conversation attachments and workspace knowledge before web tools whenever local materials may be relevant.",
    );
    expect(prompt).not.toContain(
      "This workspace currently has indexed local knowledge available",
    );
  });
});

describe("runAgentResponse", () => {
  test.sequential(
    "fails fast when anthropic api key is missing",
    async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const agentWorkdir = await fs.mkdtemp(
        path.join(os.tmpdir(), "anchordesk-agent-runtime-"),
      );
      temporaryDirs.push(agentWorkdir);

      await expect(
        runAgentResponse(
          {
            prompt: "帮我总结当前空间里的资料",
            workspaceId: "workspace-1",
            conversationId: "conversation-1",
            agentWorkdir,
          },
          {
            onToolStarted: () => {
              throw new Error("should not emit tool events");
            },
            onAssistantDelta: () => {
              throw new Error("should not emit assistant deltas");
            },
          },
        ),
      ).rejects.toThrow("Anthropic API key is not configured");
    },
  );

  test.sequential(
    "does not special-case example anthropic api keys",
    async () => {
      process.env.ANTHROPIC_API_KEY = "example-anthropic-api-key";

      expect(getConfiguredAnthropicApiKey()).toBe("example-anthropic-api-key");
    },
  );
});

describe("parseToolPayload", () => {
  test("parses SDK tool responses shaped as content block arrays", () => {
    expect(
      parseToolPayload([
        {
          type: "text",
          text: "{\"ok\":true,\"source\":{\"url\":\"https://example.com/post\",\"title\":\"Example\",\"paragraphs\":[\"hello\"]}}",
        },
      ]),
    ).toEqual({
      ok: true,
      source: {
        url: "https://example.com/post",
        title: "Example",
        paragraphs: ["hello"],
      },
    });
  });

  test("still parses wrapped content payloads", () => {
    expect(
      parseToolPayload({
        content: [
          {
            type: "text",
            text: "{\"ok\":true,\"results\":[]}",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      results: [],
    });
  });
});
