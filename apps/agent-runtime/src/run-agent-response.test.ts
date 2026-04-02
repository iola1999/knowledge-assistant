import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
} from "@anchordesk/contracts";

import {
  buildAgentSystemPrompt,
  getAllowedTools,
  parseToolPayload,
  runAgentResponse,
} from "./run-agent-response";

const temporaryDirs: string[] = [];

afterEach(async () => {
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
    expect(prompt).toContain("do not jump straight to search_statutes or search_web_general");
    expect(prompt).toContain("Use search_statutes after local search");
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
    expect(prompt).toContain(
      "If attachment text is preloaded into the user prompt for quick reading, treat it as orientation only",
    );
    expect(prompt).toContain("read_conversation_attachment_range");
    expect(prompt).toContain(
      "Use search_statutes only when the user explicitly asks for laws, regulations, or statute-level references and local workspace materials or attachments do not already cover the needed legal text.",
    );
    expect(prompt).toContain(
      "If retrieval tools fail, are unavailable, or return no usable evidence, do not present unsupported factual claims as verified from sources.",
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
            modelProfile: {
              id: "model-profile-1",
              apiType: "anthropic",
              displayName: "Sonnet 4.5",
              modelName: "claude-sonnet-4-5",
              baseUrl: "https://api.anthropic.com",
              apiKey: "",
              enabled: true,
              isDefault: true,
            },
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

  test("parses content block arrays even when the text block omits its type field", () => {
    expect(
      parseToolPayload([
        {
          text: "{\"ok\":true,\"results\":[{\"title\":\"Alibaba Investor Relations\",\"url\":\"https://www.alibabagroup.com/en-US/ir-financial-results\"}]}",
        },
      ]),
    ).toEqual({
      ok: true,
      results: [
        {
          title: "Alibaba Investor Relations",
          url: "https://www.alibabagroup.com/en-US/ir-financial-results",
        },
      ],
    });
  });
});
