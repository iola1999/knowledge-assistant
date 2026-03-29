import { describe, expect, test } from "vitest";

import {
  ASSISTANT_ALLOWED_TOOL_NAMES,
  ASSISTANT_MCP_TOOL,
  ASSISTANT_TOOL,
  normalizeAssistantToolName,
} from "./constants";

describe("shared constants helpers", () => {
  test("strips assistant tool prefixes from MCP tool names", () => {
    expect(
      normalizeAssistantToolName(ASSISTANT_MCP_TOOL.SEARCH_WORKSPACE_KNOWLEDGE),
    ).toBe(ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE);
    expect(
      normalizeAssistantToolName(`assistant__${ASSISTANT_TOOL.READ_CITATION_ANCHOR}`),
    ).toBe(ASSISTANT_TOOL.READ_CITATION_ANCHOR);
  });

  test("includes both workspace and web tools in the default tool list", () => {
    expect(ASSISTANT_ALLOWED_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        ASSISTANT_MCP_TOOL.SEARCH_CONVERSATION_ATTACHMENTS,
        ASSISTANT_MCP_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        ASSISTANT_MCP_TOOL.READ_CITATION_ANCHOR,
        ASSISTANT_MCP_TOOL.SEARCH_WEB_GENERAL,
        ASSISTANT_MCP_TOOL.FETCH_SOURCE,
      ]),
    );
  });
});
