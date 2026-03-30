import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  ASSISTANT_MCP_SERVER_NAME,
  ASSISTANT_TOOL,
  DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K,
  createReportOutlineInputSchema,
  fetchSourceInputSchema,
  readCitationAnchorInputSchema,
  searchConversationAttachmentsInputSchema,
  searchStatutesInputSchema,
  searchWebGeneralInputSchema,
  searchWorkspaceKnowledgeInputSchema,
  writeReportSectionInputSchema,
} from "@anchordesk/contracts";
import {
  buildAnthropicClientConfig,
  citationAnchors,
  conversationAttachments,
  documentBlocks,
  documentChunks,
  documents,
  getDb,
  getConfiguredAnthropicApiKey,
  getKnowledgeSourceScope,
  knowledgeLibraries,
  retrievalResults,
  retrievalRuns,
  reports,
  resolveWorkspaceLibraryScope,
  reportSections,
} from "@anchordesk/db";
import {
  describeRetrievalProvider,
  searchLocalChunks,
  scoreToBasisPoints,
  searchWorkspaceKnowledge,
} from "@anchordesk/retrieval";

import {
  buildBraveWebSearchUrl,
  buildStatuteSearchQueries,
  inferStatuteEffectiveStatus,
  normalizeBraveWebSearchResponse,
  resolveWebSearchProvider,
} from "./web-search";
import { fetchMarkdownSource } from "./fetch-source";
import {
  buildReportOutlinePrompt,
  buildReportSectionMarkdown,
  buildReportSectionPrompt,
  normalizeOutlineSections,
} from "./report-generation";

function getReportModel() {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
}

const DEFAULT_REPORT_OUTLINE_MAX_TOKENS = 900;
const DEFAULT_REPORT_SECTION_MAX_TOKENS = 1_400;

const REPORT_OUTLINE_SYSTEM_PROMPT = [
  "You generate a concise report outline for a grounded workspace assistant.",
  "Use the task and workspace evidence when they are available.",
  "Keep the outline practical and easy to execute.",
  "Do not invent citations, evidence, or section requirements that are not supported.",
].join("\n");

const REPORT_SECTION_SYSTEM_PROMPT = [
  "You draft a single report section for a grounded workspace assistant.",
  "Use only the provided evidence dossier.",
  "If evidence is insufficient, say so plainly and list the missing information.",
  "Never invent anchor IDs, quotes, or claims beyond the evidence dossier.",
].join("\n");

const reportOutlineModelSchema = z.object({
  title: z.string().trim().min(1),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        section_key: z.string().trim().optional(),
      }),
    )
    .min(3)
    .max(6),
});

const reportSectionModelSchema = z.object({
  markdown_body: z.string().trim().min(1),
  citation_anchor_ids: z.array(z.string().uuid()).default([]),
  missing_information: z.array(z.string().trim().min(1)).default([]),
});

let anthropicClient: Anthropic | null = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic(buildAnthropicClientConfig());
  }

  return anthropicClient;
}

function asToolText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value),
      },
    ],
  };
}

function parseAllowedDomains() {
  const raw = (process.env.FETCH_ALLOWED_DOMAINS ?? "").trim();
  if (!raw) {
    return null;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildToolFailure(code: string, message: string, retryable: boolean) {
  return {
    ok: false as const,
    error: {
      code,
      message,
      retryable,
    },
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readLocatorValue(locator: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = locator?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(1, Math.trunc(value));
    }
  }

  return null;
}

function readCitationLocator(metadataJson: Record<string, unknown> | null | undefined) {
  const locator =
    metadataJson?.locator && typeof metadataJson.locator === "object"
      ? (metadataJson.locator as Record<string, unknown>)
      : null;

  if (!locator) {
    return null;
  }

  return {
    lineStart: readLocatorValue(locator, ["line_start", "lineStart"]),
    lineEnd: readLocatorValue(locator, ["line_end", "lineEnd"]),
    pageLineStart: readLocatorValue(locator, ["page_line_start", "pageLineStart"]),
    pageLineEnd: readLocatorValue(locator, ["page_line_end", "pageLineEnd"]),
    blockIndex: readLocatorValue(locator, ["block_index", "blockIndex"]),
  };
}

async function performWebSearch(input: { query: string; topK: number }) {
  const provider = resolveWebSearchProvider();
  if (provider.type === "none") {
    throw new Error("Web search provider is not configured.");
  }

  const requestUrl = buildBraveWebSearchUrl({
    baseUrl: provider.url,
    query: input.query,
    topK: input.topK,
    country: provider.country,
    searchLang: provider.searchLang,
    uiLang: provider.uiLang,
  });
  const response = await fetch(requestUrl, {
    headers: {
      accept: "application/json",
      "x-subscription-token": provider.apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      body.trim() ||
        `Web search provider responded with ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as unknown;
  return normalizeBraveWebSearchResponse(payload, input.topK);
}

async function resolveEvidenceAnchors(input: {
  workspaceId: string;
  evidenceAnchorIds: string[];
  fallbackQuery: string;
}) {
  const db = getDb();
  const scope = await resolveWorkspaceLibraryScope(input.workspaceId, db);
  let anchorIds = uniqueStrings(input.evidenceAnchorIds);

  if (anchorIds.length === 0 && input.fallbackQuery.trim()) {
    const ranked = await searchWorkspaceKnowledge({
      libraryIds: scope.searchableLibraryIds,
      privateLibraryId: scope.privateLibraryId,
      query: input.fallbackQuery.trim(),
      topK: Math.min(6, DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K),
    });
    anchorIds = ranked.map((item) => item.anchorId);
  }

  if (anchorIds.length === 0) {
    return [];
  }

  if (scope.accessibleLibraryIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      anchorId: citationAnchors.id,
      documentPath: citationAnchors.documentPath,
      pageNo: citationAnchors.pageNo,
      anchorText: citationAnchors.anchorText,
    })
    .from(citationAnchors)
    .where(
      and(
        inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
        inArray(citationAnchors.id, anchorIds),
      ),
    );

  const rowById = new Map(rows.map((row) => [row.anchorId, row] as const));

  return anchorIds
    .map((anchorId) => rowById.get(anchorId))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => ({
      anchor_id: row.anchorId,
      label: `${row.documentPath} · 第${row.pageNo}页`,
      quote_text: row.anchorText,
    }));
}

export async function searchWorkspaceKnowledgeHandler(input: unknown) {
  const args = searchWorkspaceKnowledgeInputSchema.parse(input);
  const db = getDb();

  try {
    const scope = await resolveWorkspaceLibraryScope(args.workspace_id, db);
    const ranked = await searchWorkspaceKnowledge({
      libraryIds: scope.searchableLibraryIds,
      privateLibraryId: scope.privateLibraryId,
      query: args.query,
      topK: args.top_k,
      filters: {
        directoryPrefix: args.filters?.directory_prefix,
        docTypes: args.filters?.doc_types,
        tags: args.filters?.tags,
      },
    });

    const [retrievalRun] = await db
      .insert(retrievalRuns)
      .values({
        workspaceId: args.workspace_id,
        query: args.query,
        rawQueriesJson: {
          filters: args.filters ?? null,
          provider: describeRetrievalProvider(),
          scope: {
            searchable_library_ids: scope.searchableLibraryIds,
            private_library_id: scope.privateLibraryId,
          },
        },
        searchedLibraryIdsJson: scope.searchableLibraryIds,
        topK: args.top_k,
      })
      .returning({
        id: retrievalRuns.id,
      });

    if (retrievalRun && ranked.length > 0) {
      await db.insert(retrievalResults).values(
        ranked.map((item, index) => ({
          retrievalRunId: retrievalRun.id,
          anchorId: item.anchorId,
          chunkId: item.chunkId,
          rank: index + 1,
          rawScoreBp: scoreToBasisPoints(item.rawScore),
          rerankScoreBp: scoreToBasisPoints(item.score),
        })),
      );
    }

    if (ranked.length === 0) {
      return {
        ok: true,
        results: [],
      };
    }

    const anchorIds = ranked.map((item) => item.anchorId);
    const hydrated = await db
      .select({
        anchorId: citationAnchors.id,
        libraryId: citationAnchors.libraryId,
        documentId: citationAnchors.documentId,
        documentPath: citationAnchors.documentPath,
        documentTitle: documents.title,
        libraryTitle: knowledgeLibraries.title,
        libraryType: knowledgeLibraries.libraryType,
        anchorLabel: citationAnchors.anchorLabel,
        pageNo: citationAnchors.pageNo,
        sectionLabel: documentChunks.sectionLabel,
        snippet: citationAnchors.anchorText,
      })
      .from(citationAnchors)
      .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
      .innerJoin(documentChunks, eq(documentChunks.id, citationAnchors.chunkId))
      .innerJoin(knowledgeLibraries, eq(knowledgeLibraries.id, citationAnchors.libraryId))
      .where(
        and(
          inArray(citationAnchors.libraryId, scope.accessibleLibraryIds),
          inArray(citationAnchors.id, anchorIds),
        ),
      );

    const hydratedByAnchorId = new Map(
      hydrated.map((item) => [item.anchorId, item] as const),
    );

    return {
      ok: true,
      results: ranked
        .map((item) => {
          const row = hydratedByAnchorId.get(item.anchorId);
          if (!row) {
            return null;
          }

          return {
            anchor_id: row.anchorId,
            library_id: row.libraryId,
            library_title: row.libraryTitle,
            source_scope: getKnowledgeSourceScope(row.libraryType),
            document_id: row.documentId,
            document_title: row.documentTitle,
            document_path: row.documentPath,
            anchor_label: row.anchorLabel,
            page_no: row.pageNo,
            section_label: row.sectionLabel,
            snippet: row.snippet,
            score: item.score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workspace retrieval failed";
    return {
      ok: false,
      error: {
        code: "SEARCH_UNAVAILABLE",
        message,
        retryable: true,
      },
    };
  }
}

export async function searchConversationAttachmentsHandler(input: unknown) {
  const args = searchConversationAttachmentsInputSchema.parse(input);
  const db = getDb();

  try {
    const hydrated = await db
      .select({
        anchorId: citationAnchors.id,
        libraryId: documents.libraryId,
        chunkId: documentChunks.id,
        documentId: documents.id,
        documentVersionId: documentChunks.documentVersionId,
        documentPath: citationAnchors.documentPath,
        documentTitle: documents.title,
        anchorLabel: citationAnchors.anchorLabel,
        pageNo: citationAnchors.pageNo,
        sectionLabel: documentChunks.sectionLabel,
        headingPath: documentChunks.headingPath,
        docType: documents.docType,
        keywords: documentChunks.keywords,
        snippet: citationAnchors.anchorText,
      })
      .from(conversationAttachments)
      .innerJoin(
        documentChunks,
        eq(documentChunks.documentVersionId, conversationAttachments.documentVersionId),
      )
      .innerJoin(citationAnchors, eq(citationAnchors.chunkId, documentChunks.id))
      .innerJoin(documents, eq(documents.id, conversationAttachments.documentId))
      .where(eq(conversationAttachments.conversationId, args.conversation_id));

    const ranked = searchLocalChunks({
      query: args.query,
      topK: args.top_k,
      chunks: hydrated.map((row) => ({
        anchorId: row.anchorId,
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        documentPath: row.documentPath,
        libraryId: row.libraryId ?? "",
        pageStart: row.pageNo,
        pageEnd: row.pageNo,
        sectionLabel: row.sectionLabel ?? null,
        headingPath: row.headingPath ?? [],
        docType: row.docType,
        keywords: row.keywords ?? [],
        snippet: row.snippet,
      })),
    });

    const hydratedByAnchorId = new Map(
      hydrated.map((item) => [item.anchorId, item] as const),
    );

    return {
      ok: true,
      results: ranked
        .map((item) => {
          const row = hydratedByAnchorId.get(item.anchorId);
          if (!row) {
            return null;
          }

          return {
            anchor_id: row.anchorId,
            document_id: row.documentId,
            document_title: row.documentTitle,
            document_path: row.documentPath,
            anchor_label: row.anchorLabel,
            page_no: row.pageNo,
            section_label: row.sectionLabel ?? null,
            snippet: row.snippet,
            score: item.score,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Conversation attachment search failed";
    return {
      ok: false,
      error: {
        code: "CONVERSATION_ATTACHMENT_SEARCH_UNAVAILABLE",
        message,
        retryable: true,
      },
    };
  }
}

export async function readCitationAnchorHandler(input: unknown) {
  const args = readCitationAnchorInputSchema.parse(input);
  const db = getDb();

  const result = await db
    .select({
      anchorId: citationAnchors.id,
      documentId: citationAnchors.documentId,
      documentPath: citationAnchors.documentPath,
      pageNo: citationAnchors.pageNo,
      anchorText: citationAnchors.anchorText,
      anchorLabel: citationAnchors.anchorLabel,
      bboxJson: citationAnchors.bboxJson,
      blockMetadataJson: documentBlocks.metadataJson,
      documentTitle: documents.title,
    })
    .from(citationAnchors)
    .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
    .leftJoin(documentBlocks, eq(documentBlocks.id, citationAnchors.blockId))
    .where(eq(citationAnchors.id, args.anchor_id))
    .limit(1);

  const anchor = result[0];
  if (!anchor) {
    return {
      ok: false,
      error: {
        code: "ANCHOR_NOT_FOUND",
        message: "Anchor not found",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    anchor: {
      anchor_id: anchor.anchorId,
      document_id: anchor.documentId,
      document_title: anchor.documentTitle,
      document_path: anchor.documentPath,
      anchor_label: anchor.anchorLabel,
      page_no: anchor.pageNo,
      bbox: anchor.bboxJson ?? null,
      locator: readCitationLocator(
        (anchor.blockMetadataJson as Record<string, unknown> | null | undefined) ?? null,
      ),
      text: anchor.anchorText,
      context_before: "",
      context_after: "",
    },
  };
}

export async function searchStatutesHandler(input: unknown) {
  const args = searchStatutesInputSchema.parse(input);

  try {
    const searchQueries = buildStatuteSearchQueries({
      query: args.query,
      jurisdiction: args.jurisdiction,
    });
    const batches = await Promise.all(
      searchQueries.map((query) => performWebSearch({ query, topK: args.top_k })),
    );
    const results = batches
      .flat()
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.url === item.url) === index,
      )
      .slice(0, args.top_k)
      .map((item) => ({
        title: item.title,
        url: item.url,
        publisher: item.domain,
        effective_status: inferStatuteEffectiveStatus({
          title: item.title,
          snippet: item.snippet,
        }),
        snippet: item.snippet,
      }));

    return {
      ok: true,
      results,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Statute search failed";
    return buildToolFailure("STATUTE_SEARCH_UNAVAILABLE", message, true);
  }
}

export async function searchWebGeneralHandler(input: unknown) {
  const args = searchWebGeneralInputSchema.parse(input);

  try {
    return {
      ok: true,
      results: await performWebSearch({
        query: args.query,
        topK: args.top_k,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "General web search failed";
    return buildToolFailure("WEB_SEARCH_UNAVAILABLE", message, true);
  }
}

export async function fetchSourceHandler(input: unknown) {
  const args = fetchSourceInputSchema.parse(input);
  const url = new URL(args.url);
  const allowed = parseAllowedDomains();

  if (allowed && !allowed.includes(url.hostname)) {
    return {
      ok: false,
      error: {
        code: "FETCH_BLOCKED_DOMAIN",
        message: `Domain ${url.hostname} is not allowed`,
        retryable: false,
      },
    };
  }

  try {
    return {
      ok: true,
      source: await fetchMarkdownSource({
        url: args.url,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Source fetch failed";
    return buildToolFailure("FETCH_SOURCE_UNAVAILABLE", message, true);
  }
}

export async function createReportOutlineHandler(input: unknown) {
  const args = createReportOutlineInputSchema.parse(input);

  if (!getConfiguredAnthropicApiKey()) {
    return buildToolFailure(
      "REPORT_OUTLINE_NOT_CONFIGURED",
      "Anthropic API key is not configured for report generation.",
      false,
    );
  }

  try {
    const evidence = await resolveEvidenceAnchors({
      workspaceId: args.workspace_id,
      evidenceAnchorIds: args.evidence_anchor_ids,
      fallbackQuery: [args.title, args.task].filter(Boolean).join(" "),
    });
    const message = await getAnthropicClient().messages.parse({
      model: getReportModel(),
      max_tokens: DEFAULT_REPORT_OUTLINE_MAX_TOKENS,
      system: REPORT_OUTLINE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildReportOutlinePrompt({
            title: args.title,
            task: args.task,
            evidence,
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(reportOutlineModelSchema),
      },
    });
    const parsedOutput = message.parsed_output;
    if (!parsedOutput) {
      return buildToolFailure(
        "REPORT_OUTLINE_EMPTY",
        "Report outline generation returned no structured output.",
        true,
      );
    }

    const sections = normalizeOutlineSections(parsedOutput.sections);
    if (sections.length === 0) {
      return buildToolFailure(
        "REPORT_OUTLINE_EMPTY",
        "Report outline generation did not return any valid sections.",
        true,
      );
    }

    return {
      ok: true,
      outline: {
        title: parsedOutput.title.trim() || args.title,
        sections,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report outline generation failed";
    return buildToolFailure("REPORT_OUTLINE_UNAVAILABLE", message, true);
  }
}

export async function writeReportSectionHandler(input: unknown) {
  const args = writeReportSectionInputSchema.parse(input);
  const db = getDb();
  const [reportSection] = await db
    .select({
      reportTitle: reports.title,
      workspaceId: reports.workspaceId,
      title: reportSections.title,
    })
    .from(reportSections)
    .innerJoin(reports, eq(reports.id, reportSections.reportId))
    .where(and(eq(reportSections.id, args.section_id), eq(reports.id, args.report_id)))
    .limit(1);

  if (!reportSection) {
    return buildToolFailure("REPORT_SECTION_NOT_FOUND", "Report section not found.", false);
  }

  if (!getConfiguredAnthropicApiKey()) {
    return buildToolFailure(
      "REPORT_SECTION_NOT_CONFIGURED",
      "Anthropic API key is not configured for report generation.",
      false,
    );
  }

  try {
    const evidence = await resolveEvidenceAnchors({
      workspaceId: reportSection.workspaceId,
      evidenceAnchorIds: args.evidence_anchor_ids,
      fallbackQuery: [reportSection.reportTitle, reportSection.title, args.instruction]
        .filter(Boolean)
        .join(" "),
    });
    const evidenceById = new Map(
      evidence.map((item) => [item.anchor_id, item] as const),
    );
    const message = await getAnthropicClient().messages.parse({
      model: getReportModel(),
      max_tokens: DEFAULT_REPORT_SECTION_MAX_TOKENS,
      system: REPORT_SECTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildReportSectionPrompt({
            reportTitle: reportSection.reportTitle,
            sectionTitle: reportSection.title,
            instruction: args.instruction,
            evidence,
          }),
        },
      ],
      output_config: {
        format: zodOutputFormat(reportSectionModelSchema),
      },
    });
    const parsedOutput = message.parsed_output;
    if (!parsedOutput) {
      return buildToolFailure(
        "REPORT_SECTION_EMPTY",
        "Report section generation returned no structured output.",
        true,
      );
    }

    const citations = uniqueStrings(parsedOutput.citation_anchor_ids)
      .map((anchorId) => evidenceById.get(anchorId))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map((item) => ({
        anchor_id: item.anchor_id,
        label: item.label,
      }));
    const markdown = buildReportSectionMarkdown({
      title: reportSection.title,
      body: parsedOutput.markdown_body,
      citations,
      missingInformation: parsedOutput.missing_information,
    });

    return {
      ok: true,
      section: {
        markdown,
        citations,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Report section generation failed";
    return buildToolFailure("REPORT_SECTION_UNAVAILABLE", message, true);
  }
}

export function createAssistantMcpServer() {
  return createSdkMcpServer({
    name: ASSISTANT_MCP_SERVER_NAME,
    version: "0.1.0",
    tools: [
      tool(
        ASSISTANT_TOOL.SEARCH_CONVERSATION_ATTACHMENTS,
        "Search temporary files attached to the current conversation",
        searchConversationAttachmentsInputSchema.shape,
        async (args) => asToolText(await searchConversationAttachmentsHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE,
        "Search documents inside a workspace knowledge base",
        searchWorkspaceKnowledgeInputSchema.shape,
        async (args) => asToolText(await searchWorkspaceKnowledgeHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.READ_CITATION_ANCHOR,
        "Read a citation anchor and nearby context",
        readCitationAnchorInputSchema.shape,
        async (args) => asToolText(await readCitationAnchorHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.SEARCH_STATUTES,
        "Search statutes and official legal texts when the task requires legal references",
        searchStatutesInputSchema.shape,
        async (args) => asToolText(await searchStatutesHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.SEARCH_WEB_GENERAL,
        "Search the public web for general context",
        searchWebGeneralInputSchema.shape,
        async (args) => asToolText(await searchWebGeneralHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.FETCH_SOURCE,
        "Fetch text content from an allowed URL",
        fetchSourceInputSchema.shape,
        async (args) => asToolText(await fetchSourceHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.CREATE_REPORT_OUTLINE,
        "Create a report outline from workspace evidence",
        createReportOutlineInputSchema.shape,
        async (args) => asToolText(await createReportOutlineHandler(args)),
      ),
      tool(
        ASSISTANT_TOOL.WRITE_REPORT_SECTION,
        "Write a report section from evidence anchors",
        writeReportSectionInputSchema.shape,
        async (args) => asToolText(await writeReportSectionHandler(args)),
      ),
    ],
  });
}
