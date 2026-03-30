import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

import {
  ASSISTANT_MCP_SERVER_NAME,
  ASSISTANT_TOOL,
  createReportOutlineInputSchema,
  fetchSourceInputSchema,
  readCitationAnchorInputSchema,
  searchConversationAttachmentsInputSchema,
  searchStatutesInputSchema,
  searchWebGeneralInputSchema,
  searchWorkspaceKnowledgeInputSchema,
  writeReportSectionInputSchema,
} from "@anchordesk/contracts";

import { asToolText } from "./tool-output";
import { createReportOutlineHandler } from "./tools/create-report-outline";
import { fetchSourceHandler } from "./tools/fetch-source-tool";
import { readCitationAnchorHandler } from "./tools/read-citation-anchor";
import { searchConversationAttachmentsHandler } from "./tools/search-conversation-attachments";
import { searchStatutesHandler } from "./tools/search-statutes";
import { searchWebGeneralHandler } from "./tools/search-web-general";
import { searchWorkspaceKnowledgeHandler } from "./tools/search-workspace-knowledge";
import { writeReportSectionHandler } from "./tools/write-report-section";

export {
  createReportOutlineHandler,
  fetchSourceHandler,
  readCitationAnchorHandler,
  searchConversationAttachmentsHandler,
  searchStatutesHandler,
  searchWebGeneralHandler,
  searchWorkspaceKnowledgeHandler,
  writeReportSectionHandler,
};

export const assistantToolDefinitions = [
  {
    name: ASSISTANT_TOOL.SEARCH_CONVERSATION_ATTACHMENTS,
    description: "Search temporary files attached to the current conversation",
    inputShape: searchConversationAttachmentsInputSchema.shape,
    handler: searchConversationAttachmentsHandler,
  },
  {
    name: ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
    description: "Search documents inside a workspace knowledge base",
    inputShape: searchWorkspaceKnowledgeInputSchema.shape,
    handler: searchWorkspaceKnowledgeHandler,
  },
  {
    name: ASSISTANT_TOOL.READ_CITATION_ANCHOR,
    description: "Read a citation anchor and nearby context",
    inputShape: readCitationAnchorInputSchema.shape,
    handler: readCitationAnchorHandler,
  },
  {
    name: ASSISTANT_TOOL.SEARCH_STATUTES,
    description: "Search statutes and official legal texts when the task requires legal references",
    inputShape: searchStatutesInputSchema.shape,
    handler: searchStatutesHandler,
  },
  {
    name: ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
    description: "Search the public web for general context",
    inputShape: searchWebGeneralInputSchema.shape,
    handler: searchWebGeneralHandler,
  },
  {
    name: ASSISTANT_TOOL.FETCH_SOURCE,
    description: "Fetch text content from an allowed URL",
    inputShape: fetchSourceInputSchema.shape,
    handler: fetchSourceHandler,
  },
  {
    name: ASSISTANT_TOOL.CREATE_REPORT_OUTLINE,
    description: "Create a report outline from workspace evidence",
    inputShape: createReportOutlineInputSchema.shape,
    handler: createReportOutlineHandler,
  },
  {
    name: ASSISTANT_TOOL.WRITE_REPORT_SECTION,
    description: "Write a report section from evidence anchors",
    inputShape: writeReportSectionInputSchema.shape,
    handler: writeReportSectionHandler,
  },
] as const;

export function createAssistantMcpServer() {
  return createSdkMcpServer({
    name: ASSISTANT_MCP_SERVER_NAME,
    version: "0.1.0",
    tools: assistantToolDefinitions.map((definition) =>
      tool(
        definition.name,
        definition.description,
        definition.inputShape,
        async (args) => asToolText(await definition.handler(args)),
      ),
    ),
  });
}
