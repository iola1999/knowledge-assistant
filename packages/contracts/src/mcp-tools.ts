import { z } from "zod";

import {
  DEFAULT_SEARCH_STATUTES_TOP_K,
  DEFAULT_SEARCH_WEB_GENERAL_TOP_K,
  DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K,
  DEFAULT_STATUTES_JURISDICTION,
  MAX_SEARCH_STATUTES_TOP_K,
  MAX_SEARCH_WEB_GENERAL_TOP_K,
  MAX_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K,
} from "./constants";

const bboxSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});

const citationLocatorSchema = z.object({
  lineStart: z.number().int().min(1).nullable().optional(),
  lineEnd: z.number().int().min(1).nullable().optional(),
  pageLineStart: z.number().int().min(1).nullable().optional(),
  pageLineEnd: z.number().int().min(1).nullable().optional(),
  blockIndex: z.number().int().min(1).nullable().optional(),
});

const toolErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const toolFailureSchema = z.object({
  ok: z.literal(false),
  error: toolErrorSchema,
});

export const knowledgeFiltersSchema = z.object({
  doc_types: z.array(z.string()).optional(),
  directory_prefix: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const searchWorkspaceKnowledgeInputSchema = z.object({
  workspace_id: z.string().uuid(),
  query: z.string().min(1),
  filters: knowledgeFiltersSchema.optional(),
  top_k: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K)
    .default(DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K),
});

const knowledgeSearchResultSchema = z.object({
  anchor_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_title: z.string(),
  document_path: z.string(),
  anchor_label: z.string().optional(),
  page_no: z.number().int().min(1),
  section_label: z.string().nullable().optional(),
  locator: citationLocatorSchema.nullable().optional(),
  snippet: z.string(),
  score: z.number(),
});

export const searchWorkspaceKnowledgeSuccessSchema = z.object({
  ok: z.literal(true),
  results: z.array(knowledgeSearchResultSchema),
});

export const searchWorkspaceKnowledgeOutputSchema = z.union([
  searchWorkspaceKnowledgeSuccessSchema,
  toolFailureSchema,
]);

export const searchConversationAttachmentsInputSchema = z.object({
  conversation_id: z.string().uuid(),
  query: z.string().min(1),
  top_k: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K)
    .default(DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K),
});

export const searchConversationAttachmentsSuccessSchema = z.object({
  ok: z.literal(true),
  results: z.array(knowledgeSearchResultSchema),
});

export const searchConversationAttachmentsOutputSchema = z.union([
  searchConversationAttachmentsSuccessSchema,
  toolFailureSchema,
]);

export const readCitationAnchorInputSchema = z.object({
  anchor_id: z.string().uuid(),
});

export const readCitationAnchorSuccessSchema = z.object({
  ok: z.literal(true),
  anchor: z.object({
    anchor_id: z.string().uuid(),
    document_id: z.string().uuid(),
    document_title: z.string(),
    document_path: z.string(),
    anchor_label: z.string().optional(),
    page_no: z.number().int().min(1),
    locator: citationLocatorSchema.nullable().optional(),
    bbox: bboxSchema.nullable().optional(),
    text: z.string(),
    context_before: z.string().optional(),
    context_after: z.string().optional(),
  }),
});

export const readCitationAnchorOutputSchema = z.union([
  readCitationAnchorSuccessSchema,
  toolFailureSchema,
]);

export const searchStatutesInputSchema = z.object({
  query: z.string().min(1),
  jurisdiction: z.string().min(2).max(16).default(DEFAULT_STATUTES_JURISDICTION),
  top_k: z.number().int().min(1).max(MAX_SEARCH_STATUTES_TOP_K).default(
    DEFAULT_SEARCH_STATUTES_TOP_K,
  ),
});

export const searchStatutesSuccessSchema = z.object({
  ok: z.literal(true),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      publisher: z.string().optional(),
      effective_status: z.string().optional(),
      snippet: z.string().optional(),
    }),
  ),
});

export const searchStatutesOutputSchema = z.union([
  searchStatutesSuccessSchema,
  toolFailureSchema,
]);

export const searchWebGeneralInputSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(MAX_SEARCH_WEB_GENERAL_TOP_K).default(
    DEFAULT_SEARCH_WEB_GENERAL_TOP_K,
  ),
});

export const searchWebGeneralSuccessSchema = z.object({
  ok: z.literal(true),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      domain: z.string(),
      snippet: z.string().optional(),
    }),
  ),
});

export const searchWebGeneralOutputSchema = z.union([
  searchWebGeneralSuccessSchema,
  toolFailureSchema,
]);

export const fetchSourceInputSchema = z.object({
  url: z.string().url(),
});

export const fetchSourceSuccessSchema = z.object({
  ok: z.literal(true),
  source: z.object({
    url: z.string().url(),
    title: z.string(),
    fetched_at: z.string(),
    content_type: z.string(),
    paragraphs: z.array(z.string()),
  }),
});

export const fetchSourceOutputSchema = z.union([
  fetchSourceSuccessSchema,
  toolFailureSchema,
]);

export const createReportOutlineInputSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().min(1),
  task: z.string().min(1),
  evidence_anchor_ids: z.array(z.string().uuid()).default([]),
});

export const createReportOutlineSuccessSchema = z.object({
  ok: z.literal(true),
  outline: z.object({
    title: z.string(),
    sections: z.array(
      z.object({
        section_key: z.string(),
        title: z.string(),
      }),
    ),
  }),
});

export const createReportOutlineOutputSchema = z.union([
  createReportOutlineSuccessSchema,
  toolFailureSchema,
]);

export const writeReportSectionInputSchema = z.object({
  report_id: z.string().uuid(),
  section_id: z.string().uuid(),
  instruction: z.string().min(1),
  evidence_anchor_ids: z.array(z.string().uuid()).default([]),
});

export const writeReportSectionSuccessSchema = z.object({
  ok: z.literal(true),
  section: z.object({
    markdown: z.string(),
    citations: z.array(
      z.object({
        anchor_id: z.string().uuid(),
        label: z.string(),
      }),
    ),
  }),
});

export const writeReportSectionOutputSchema = z.union([
  writeReportSectionSuccessSchema,
  toolFailureSchema,
]);

export type SearchWorkspaceKnowledgeInput = z.infer<
  typeof searchWorkspaceKnowledgeInputSchema
>;
export type SearchWorkspaceKnowledgeOutput = z.infer<
  typeof searchWorkspaceKnowledgeOutputSchema
>;
export type SearchConversationAttachmentsInput = z.infer<
  typeof searchConversationAttachmentsInputSchema
>;
export type SearchConversationAttachmentsOutput = z.infer<
  typeof searchConversationAttachmentsOutputSchema
>;

export type ReadCitationAnchorInput = z.infer<typeof readCitationAnchorInputSchema>;
export type ReadCitationAnchorOutput = z.infer<typeof readCitationAnchorOutputSchema>;

export type SearchStatutesInput = z.infer<typeof searchStatutesInputSchema>;
export type SearchStatutesOutput = z.infer<typeof searchStatutesOutputSchema>;

export type SearchWebGeneralInput = z.infer<typeof searchWebGeneralInputSchema>;
export type SearchWebGeneralOutput = z.infer<typeof searchWebGeneralOutputSchema>;

export type FetchSourceInput = z.infer<typeof fetchSourceInputSchema>;
export type FetchSourceOutput = z.infer<typeof fetchSourceOutputSchema>;

export type CreateReportOutlineInput = z.infer<typeof createReportOutlineInputSchema>;
export type CreateReportOutlineOutput = z.infer<typeof createReportOutlineOutputSchema>;

export type WriteReportSectionInput = z.infer<typeof writeReportSectionInputSchema>;
export type WriteReportSectionOutput = z.infer<typeof writeReportSectionOutputSchema>;
