import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
} from "@anchordesk/contracts";

import {
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
});
