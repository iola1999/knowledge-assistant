import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
  ASSISTANT_TOOL,
} from "@knowledge-assistant/contracts";

import { getAllowedTools, runAgentResponse } from "./run-agent-response";

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

describe("runAgentResponse", () => {
  test.sequential(
    "streams local mock tool events and answer deltas when anthropic api key is missing",
    async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const agentWorkdir = await fs.mkdtemp(
        path.join(os.tmpdir(), "knowledge-assistant-agent-runtime-"),
      );
      temporaryDirs.push(agentWorkdir);

      const toolEvents: string[] = [];
      const toolResponses: Array<{ toolName: string; toolResponse: unknown }> = [];
      const textDeltas: string[] = [];
      const fullTexts: string[] = [];

      const response = await runAgentResponse(
        {
          prompt: "帮我总结当前空间里的资料",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          agentWorkdir,
        },
        {
          onToolStarted: ({ toolName }) => {
            toolEvents.push(`started:${toolName}`);
          },
          onToolFinished: ({ toolName, toolResponse }) => {
            toolEvents.push(`finished:${toolName}`);
            toolResponses.push({ toolName, toolResponse });
          },
          onAssistantDelta: ({ textDelta, fullText }) => {
            textDeltas.push(textDelta);
            fullTexts.push(fullText);
          },
        },
      );

      expect(toolEvents).toEqual([
        `started:${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
        `finished:${ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE}`,
      ]);
      expect(toolResponses).toEqual([
        {
          toolName: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
          toolResponse: {
            ok: true,
            results: [],
            mock: true,
          },
        },
      ]);
      expect(textDeltas.length).toBeGreaterThan(0);
      expect(textDeltas.join("")).toBe(response.text);
      expect(fullTexts.at(-1)).toBe(response.text);
      expect(response.text).toContain("mock 会话链路");
      expect(response.structured?.unsupported_reason).toContain("mock 会话链路");
    },
  );
});
