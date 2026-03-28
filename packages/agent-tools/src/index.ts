import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  createReportOutlineInputSchema,
  fetchSourceInputSchema,
  readCitationAnchorInputSchema,
  searchStatutesInputSchema,
  searchWebGeneralInputSchema,
  searchWorkspaceKnowledgeInputSchema,
  writeReportSectionInputSchema,
} from "@law-doc/contracts";
import {
  citationAnchors,
  documentChunks,
  documents,
  getDb,
  retrievalResults,
  retrievalRuns,
  reports,
  reportSections,
} from "@law-doc/db";
import {
  describeRetrievalProvider,
  scoreToBasisPoints,
  searchWorkspaceKnowledge,
} from "@law-doc/retrieval";

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
  const raw =
    process.env.FETCH_ALLOWED_DOMAINS ??
    "flk.npc.gov.cn,court.gov.cn,rmfyalk.court.gov.cn";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function searchWorkspaceKnowledgeHandler(input: unknown) {
  const args = searchWorkspaceKnowledgeInputSchema.parse(input);
  const db = getDb();

  try {
    const ranked = await searchWorkspaceKnowledge({
      workspaceId: args.workspace_id,
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
        mode: "kb_only",
        rawQueriesJson: {
          filters: args.filters ?? null,
          provider: describeRetrievalProvider(),
        },
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
        documentId: citationAnchors.documentId,
        documentPath: citationAnchors.documentPath,
        documentTitle: documents.title,
        pageNo: citationAnchors.pageNo,
        sectionLabel: documentChunks.sectionLabel,
        snippet: citationAnchors.anchorText,
      })
      .from(citationAnchors)
      .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
      .innerJoin(documentChunks, eq(documentChunks.id, citationAnchors.chunkId))
      .where(
        and(
          eq(citationAnchors.workspaceId, args.workspace_id),
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
            document_id: row.documentId,
            document_title: row.documentTitle,
            document_path: row.documentPath,
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
      documentTitle: documents.title,
    })
    .from(citationAnchors)
    .innerJoin(documents, eq(documents.id, citationAnchors.documentId))
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
      page_no: anchor.pageNo,
      bbox: anchor.bboxJson ?? null,
      text: anchor.anchorText,
      context_before: "",
      context_after: "",
    },
  };
}

export async function searchStatutesHandler(input: unknown) {
  const args = searchStatutesInputSchema.parse(input);

  return {
    ok: true,
    results: [
      {
        title: `待接入法条搜索：${args.query}`,
        url: "https://flk.npc.gov.cn/",
        publisher: "Official source pending integration",
        effective_status: "unknown",
        snippet: "Statute search provider is not configured yet.",
      },
    ],
  };
}

export async function searchWebGeneralHandler(input: unknown) {
  const args = searchWebGeneralInputSchema.parse(input);

  return {
    ok: true,
    results: [
      {
        title: `待接入通用网络搜索：${args.query}`,
        url: "https://example.com/",
        domain: "example.com",
        snippet: "General web search provider is not configured yet.",
      },
    ],
  };
}

export async function fetchSourceHandler(input: unknown) {
  const args = fetchSourceInputSchema.parse(input);
  const url = new URL(args.url);
  const allowed = parseAllowedDomains();

  if (!allowed.includes(url.hostname)) {
    return {
      ok: false,
      error: {
        code: "FETCH_BLOCKED_DOMAIN",
        message: `Domain ${url.hostname} is not allowed`,
        retryable: false,
      },
    };
  }

  const response = await fetch(args.url);
  const contentType = response.headers.get("content-type") ?? "text/plain";
  const text = await response.text();
  const normalized = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const paragraphs = normalized
    .split(/(?<=。)|(?<=\.)/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);

  return {
    ok: true,
    source: {
      url: args.url,
      title: url.hostname,
      fetched_at: new Date().toISOString(),
      content_type: contentType,
      paragraphs,
    },
  };
}

export async function createReportOutlineHandler(input: unknown) {
  const args = createReportOutlineInputSchema.parse(input);
  const db = getDb();

  const [report] = await db
    .select({
      id: reports.id,
      title: reports.title,
    })
    .from(reports)
    .where(eq(reports.workspaceId, args.workspace_id))
    .orderBy(desc(reports.createdAt))
    .limit(1);

  return {
    ok: true,
    outline: {
      title: report?.title ?? args.title,
      sections: [
        { section_key: "background", title: "一、背景与范围" },
        { section_key: "analysis", title: "二、核心分析" },
        { section_key: "conclusion", title: "三、结论与建议" },
      ],
    },
  };
}

export async function writeReportSectionHandler(input: unknown) {
  const args = writeReportSectionInputSchema.parse(input);
  const db = getDb();
  const [section] = await db
    .select({
      title: reportSections.title,
    })
    .from(reportSections)
    .where(eq(reportSections.id, args.section_id))
    .limit(1);

  return {
    ok: true,
    section: {
      markdown: `## ${section?.title ?? "章节"}\n\n${args.instruction}\n`,
      citations: [],
    },
  };
}

export function createLegalMcpServer() {
  return createSdkMcpServer({
    name: "legal",
    version: "0.1.0",
    tools: [
      tool(
        "search_workspace_knowledge",
        "Search documents inside a workspace knowledge base",
        searchWorkspaceKnowledgeInputSchema.shape,
        async (args) => asToolText(await searchWorkspaceKnowledgeHandler(args)),
      ),
      tool(
        "read_citation_anchor",
        "Read a citation anchor and nearby context",
        readCitationAnchorInputSchema.shape,
        async (args) => asToolText(await readCitationAnchorHandler(args)),
      ),
      tool(
        "search_statutes",
        "Search statutes and official legal texts",
        searchStatutesInputSchema.shape,
        async (args) => asToolText(await searchStatutesHandler(args)),
      ),
      tool(
        "search_web_general",
        "Search the public web for general legal context",
        searchWebGeneralInputSchema.shape,
        async (args) => asToolText(await searchWebGeneralHandler(args)),
      ),
      tool(
        "fetch_source",
        "Fetch text content from an allowed URL",
        fetchSourceInputSchema.shape,
        async (args) => asToolText(await fetchSourceHandler(args)),
      ),
      tool(
        "create_report_outline",
        "Create a report outline from workspace evidence",
        createReportOutlineInputSchema.shape,
        async (args) => asToolText(await createReportOutlineHandler(args)),
      ),
      tool(
        "write_report_section",
        "Write a report section from evidence anchors",
        writeReportSectionInputSchema.shape,
        async (args) => asToolText(await writeReportSectionHandler(args)),
      ),
    ],
  });
}
