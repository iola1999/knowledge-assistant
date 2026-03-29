import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
} from "@anchordesk/contracts";
import { getConfiguredAnthropicApiKey } from "@anchordesk/db";

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
