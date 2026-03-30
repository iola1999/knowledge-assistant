import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOL } from "@anchordesk/contracts";

import { assistantToolDefinitions } from "./index";

describe("assistantToolDefinitions", () => {
  it("registers every assistant tool once in a stable order", () => {
    expect(assistantToolDefinitions.map((definition) => definition.name)).toEqual([
      ASSISTANT_TOOL.SEARCH_CONVERSATION_ATTACHMENTS,
      ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
      ASSISTANT_TOOL.READ_CITATION_ANCHOR,
      ASSISTANT_TOOL.SEARCH_STATUTES,
      ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
      ASSISTANT_TOOL.FETCH_SOURCE,
      ASSISTANT_TOOL.CREATE_REPORT_OUTLINE,
      ASSISTANT_TOOL.WRITE_REPORT_SECTION,
    ]);
  });
});
