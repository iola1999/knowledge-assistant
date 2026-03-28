import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Draft schema for the workspace-centered legal AI assistant.
 * The schema intentionally prefers explicit fields over aggressive abstraction
 * so the ingestion, retrieval, and citation flows remain easy to evolve.
 */

export const workspaceModeEnum = pgEnum("workspace_mode", [
  "kb_only",
  "kb_plus_web",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
  "archived",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "contract",
  "pleading",
  "evidence",
  "statute",
  "case_law",
  "memo",
  "email",
  "meeting_note",
  "other",
]);

export const parseStatusEnum = pgEnum("parse_status", [
  "queued",
  "extracting_text",
  "parsing_layout",
  "chunking",
  "embedding",
  "indexing",
  "ready",
  "failed",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "streaming",
  "completed",
  "failed",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "draft",
  "generating",
  "ready",
  "failed",
  "exported",
]);

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 120 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => ({
    usernameUid: uniqueIndex("users_username_uid").on(table.username),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionToken: text("session_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionTokenUid: uniqueIndex("sessions_token_uid").on(table.sessionToken),
    sessionsUserIdx: index("sessions_user_idx").on(table.userId),
  }),
);

export const systemSettings = pgTable("system_settings", {
  settingKey: varchar("setting_key", { length: 120 }).primaryKey(),
  valueText: text("value_text").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    industry: varchar("industry", { length: 80 }),
    defaultMode: workspaceModeEnum("default_mode").notNull().default("kb_only"),
    allowWebSearch: boolean("allow_web_search").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    workspaceUserSlugUid: uniqueIndex("workspaces_user_slug_uid").on(
      table.userId,
      table.slug,
    ),
    workspacesUserIdx: index("workspaces_user_idx").on(table.userId),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    sourceFilename: varchar("source_filename", { length: 255 }).notNull(),
    logicalPath: text("logical_path").notNull(),
    directoryPath: text("directory_path").notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    docType: documentTypeEnum("doc_type").notNull().default("other"),
    tagsJson: jsonb("tags_json").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: documentStatusEnum("status").notNull().default("uploading"),
    latestVersionId: uuid("latest_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    documentsWorkspacePathUid: uniqueIndex("documents_workspace_path_uid").on(
      table.workspaceId,
      table.logicalPath,
    ),
    documentsWorkspaceDirIdx: index("documents_workspace_dir_idx").on(
      table.workspaceId,
      table.directoryPath,
    ),
  }),
);

export const parseArtifacts = pgTable(
  "parse_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    artifactStorageKey: text("artifact_storage_key").notNull(),
    pageCount: integer("page_count"),
    parseScoreBp: integer("parse_score_bp"),
    parserVersion: varchar("parser_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    parseArtifactsShaUid: uniqueIndex("parse_artifacts_sha_uid").on(table.sha256),
  }),
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    clientMd5: varchar("client_md5", { length: 32 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    pageCount: integer("page_count"),
    parseStatus: parseStatusEnum("parse_status").notNull().default("queued"),
    parseScoreBp: integer("parse_score_bp"),
    ocrRequired: boolean("ocr_required").notNull().default(false),
    parseArtifactId: uuid("parse_artifact_id").references(() => parseArtifacts.id, {
      onDelete: "set null",
    }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentVersionsDocVersionUid: uniqueIndex("document_versions_doc_version_uid").on(
      table.documentId,
      table.version,
    ),
    documentVersionsShaIdx: index("document_versions_sha_idx").on(table.sha256),
  }),
);

export const documentJobs = pgTable(
  "document_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    queueJobId: text("queue_job_id").notNull(),
    stage: parseStatusEnum("stage").notNull().default("queued"),
    status: runStatusEnum("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    errorCode: varchar("error_code", { length: 80 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    documentJobsVersionIdx: index("document_jobs_version_idx").on(table.documentVersionId),
    documentJobsQueueUid: uniqueIndex("document_jobs_queue_uid").on(table.queueJobId),
  }),
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    width: integer("width"),
    height: integer("height"),
    textLength: integer("text_length"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentPagesVersionPageUid: uniqueIndex("document_pages_version_page_uid").on(
      table.documentVersionId,
      table.pageNo,
    ),
  }),
);

export const documentBlocks = pgTable(
  "document_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    orderIndex: integer("order_index").notNull(),
    blockType: varchar("block_type", { length: 40 }).notNull(),
    sectionLabel: varchar("section_label", { length: 120 }),
    headingPath: jsonb("heading_path").$type<string[]>(),
    text: text("text").notNull(),
    bboxJson: jsonb("bbox_json").$type<{ x1: number; y1: number; x2: number; y2: number }>(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentBlocksVersionPageIdx: index("document_blocks_version_page_idx").on(
      table.documentVersionId,
      table.pageNo,
    ),
  }),
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    sourceBlockId: uuid("source_block_id").references(() => documentBlocks.id, {
      onDelete: "set null",
    }),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    sectionLabel: varchar("section_label", { length: 120 }),
    headingPath: jsonb("heading_path").$type<string[]>(),
    chunkText: text("chunk_text").notNull(),
    plainText: text("plain_text"),
    keywords: jsonb("keywords").$type<string[]>(),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentChunksWorkspaceIdx: index("document_chunks_workspace_idx").on(table.workspaceId),
    documentChunksVersionPageIdx: index("document_chunks_version_page_idx").on(
      table.documentVersionId,
      table.pageStart,
    ),
  }),
);

export const citationAnchors = pgTable(
  "citation_anchors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => documentBlocks.id, { onDelete: "set null" }),
    pageNo: integer("page_no").notNull(),
    documentPath: text("document_path").notNull(),
    anchorLabel: text("anchor_label").notNull(),
    anchorText: text("anchor_text").notNull(),
    bboxJson: jsonb("bbox_json").$type<{ x1: number; y1: number; x2: number; y2: number }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    citationAnchorsChunkIdx: index("citation_anchors_chunk_idx").on(table.chunkId),
    citationAnchorsDocPageIdx: index("citation_anchors_doc_page_idx").on(
      table.documentVersionId,
      table.pageNo,
    ),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    status: conversationStatusEnum("status").notNull().default("active"),
    mode: workspaceModeEnum("mode").notNull().default("kb_only"),
    agentSessionId: text("agent_session_id"),
    agentWorkdir: text("agent_workdir"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    conversationsWorkspaceIdx: index("conversations_workspace_idx").on(table.workspaceId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    status: messageStatusEnum("status").notNull().default("completed"),
    contentMarkdown: text("content_markdown").notNull(),
    structuredJson: jsonb("structured_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messagesConversationIdx: index("messages_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);

export const messageCitations = pgTable(
  "message_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    anchorId: uuid("anchor_id")
      .notNull()
      .references(() => citationAnchors.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    documentPath: text("document_path").notNull(),
    pageNo: integer("page_no").notNull(),
    blockId: uuid("block_id"),
    quoteText: text("quote_text").notNull(),
    label: text("label").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageCitationsMessageIdx: index("message_citations_message_idx").on(table.messageId),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 200 }).notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportsWorkspaceIdx: index("reports_workspace_idx").on(table.workspaceId),
  }),
);

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    sectionKey: varchar("section_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    orderIndex: integer("order_index").notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    contentMarkdown: text("content_markdown").notNull().default(""),
    citationsJson: jsonb("citations_json").$type<
      Array<{ anchorId: string; label: string }>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportSectionsReportOrderUid: uniqueIndex("report_sections_report_order_uid").on(
      table.reportId,
      table.orderIndex,
    ),
  }),
);

export const retrievalRuns = pgTable(
  "retrieval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    query: text("query").notNull(),
    mode: workspaceModeEnum("mode").notNull(),
    rawQueriesJson: jsonb("raw_queries_json").$type<Record<string, unknown>>(),
    topK: integer("top_k").notNull().default(6),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    retrievalRunsWorkspaceIdx: index("retrieval_runs_workspace_idx").on(table.workspaceId),
  }),
);

export const retrievalResults = pgTable(
  "retrieval_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    retrievalRunId: uuid("retrieval_run_id")
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: "cascade" }),
    anchorId: uuid("anchor_id").references(() => citationAnchors.id, {
      onDelete: "set null",
    }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id, {
      onDelete: "set null",
    }),
    rank: integer("rank").notNull(),
    rawScoreBp: integer("raw_score_bp"),
    rerankScoreBp: integer("rerank_score_bp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    retrievalResultsRunRankUid: uniqueIndex("retrieval_results_run_rank_uid").on(
      table.retrievalRunId,
      table.rank,
    ),
  }),
);

export const toolRuns = pgTable(
  "tool_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    toolName: varchar("tool_name", { length: 120 }).notNull(),
    status: runStatusEnum("status").notNull().default("queued"),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    toolRunsWorkspaceIdx: index("tool_runs_workspace_idx").on(table.workspaceId),
    toolRunsConversationIdx: index("tool_runs_conversation_idx").on(table.conversationId),
  }),
);

export const modelRuns = pgTable(
  "model_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    operation: varchar("operation", { length: 80 }).notNull(),
    status: runStatusEnum("status").notNull().default("queued"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    costMicrosUsd: bigint("cost_micros_usd", { mode: "number" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    modelRunsWorkspaceIdx: index("model_runs_workspace_idx").on(table.workspaceId),
    modelRunsConversationIdx: index("model_runs_conversation_idx").on(table.conversationId),
  }),
);
