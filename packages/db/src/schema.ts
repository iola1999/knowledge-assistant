import { sql } from "drizzle-orm";
import {
  type ConversationStatus,
  DEFAULT_APP_UPGRADE_STATUS,
  DEFAULT_CONVERSATION_STATUS,
  DEFAULT_DOCUMENT_STATUS,
  DEFAULT_DOCUMENT_TYPE,
  DEFAULT_KNOWLEDGE_LIBRARY_STATUS,
  DEFAULT_MESSAGE_STATUS,
  DEFAULT_PARSE_STATUS,
  DEFAULT_REPORT_STATUS,
  DEFAULT_RETRIEVAL_RUN_TOP_K,
  DEFAULT_RUN_STATUS,
  DEFAULT_WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS,
  MODEL_PROFILE_API_TYPE,
  type ModelProfileApiType,
  type AppUpgradeStatus,
  type DocumentStatus,
  type DocumentType,
  type KnowledgeLibraryStatus,
  type KnowledgeLibraryType,
  type KnowledgeSourceScope,
  type MessageRole,
  type MessageStatus,
  type ParseStatus,
  type ReportStatus,
  type RunStatus,
  type WorkspaceLibrarySubscriptionStatus,
} from "@anchordesk/contracts";
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Draft schema for a workspace-centered grounded assistant.
 * The schema intentionally prefers explicit fields over aggressive abstraction
 * so the ingestion, retrieval, and citation flows remain easy to evolve.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 120 }),
    isActive: boolean("is_active").notNull().default(true),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_username_uid").on(table.username),
    uniqueIndex("users_single_super_admin_uid")
      .on(table.isSuperAdmin)
      .where(sql`${table.isSuperAdmin} = true`),
  ],
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
  (table) => [
    uniqueIndex("sessions_token_uid").on(table.sessionToken),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const systemSettings = pgTable("system_settings", {
  settingKey: varchar("setting_key", { length: 120 }).primaryKey(),
  valueText: text("value_text").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  summary: text("summary"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const llmModelProfiles = pgTable(
  "llm_model_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    apiType: varchar("api_type", { length: 32 })
      .$type<ModelProfileApiType>()
      .notNull()
      .default(MODEL_PROFILE_API_TYPE.ANTHROPIC),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    modelName: varchar("model_name", { length: 160 }).notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: text("api_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("llm_model_profiles_single_default_uid")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
    index("llm_model_profiles_enabled_default_idx").on(table.enabled, table.isDefault),
  ],
);

export const appUpgrades = pgTable("app_upgrades", {
  upgradeKey: varchar("upgrade_key", { length: 160 }).primaryKey(),
  description: text("description").notNull(),
  status: varchar("status", { length: 32 })
    .$type<AppUpgradeStatus>()
    .notNull()
    .default(DEFAULT_APP_UPGRADE_STATUS),
  blocking: boolean("blocking").notNull().default(true),
  safeInDevStartup: boolean("safe_in_dev_startup").notNull().default(false),
  errorMessage: text("error_message"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
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
    workspacePrompt: text("workspace_prompt"),
    industry: varchar("industry", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workspaces_user_slug_uid").on(table.userId, table.slug),
    index("workspaces_user_idx").on(table.userId),
  ],
);

export const knowledgeLibraries = pgTable(
  "knowledge_libraries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryType: varchar("library_type", { length: 32 })
      .$type<KnowledgeLibraryType>()
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 })
      .$type<KnowledgeLibraryStatus>()
      .notNull()
      .default(DEFAULT_KNOWLEDGE_LIBRARY_STATUS),
    managedByUserId: uuid("managed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("knowledge_libraries_slug_uid").on(table.slug),
    uniqueIndex("knowledge_libraries_workspace_type_uid").on(
      table.workspaceId,
      table.libraryType,
    ),
    index("knowledge_libraries_workspace_idx").on(table.workspaceId),
    index("knowledge_libraries_type_status_idx").on(table.libraryType, table.status),
  ],
);

export const workspaceLibrarySubscriptions = pgTable(
  "workspace_library_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => knowledgeLibraries.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 })
      .$type<WorkspaceLibrarySubscriptionStatus>()
      .notNull()
      .default(DEFAULT_WORKSPACE_LIBRARY_SUBSCRIPTION_STATUS),
    searchEnabled: boolean("search_enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("workspace_library_subscriptions_workspace_library_uid").on(
      table.workspaceId,
      table.libraryId,
    ),
    index("workspace_library_subscriptions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("workspace_library_subscriptions_library_status_idx").on(
      table.libraryId,
      table.status,
    ),
  ],
);

export const workspaceDirectories = pgTable(
  "workspace_directories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id").references(() => knowledgeLibraries.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 255 }).notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "workspace_directories_parent_id_workspace_directories_id_fk",
    }).onDelete("set null"),
    uniqueIndex("workspace_directories_workspace_path_uid").on(
      table.workspaceId,
      table.path,
    ),
    uniqueIndex("workspace_directories_library_path_uid").on(table.libraryId, table.path),
    index("workspace_directories_workspace_parent_idx").on(
      table.workspaceId,
      table.parentId,
    ),
    index("workspace_directories_workspace_deleted_idx").on(
      table.workspaceId,
      table.deletedAt,
    ),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id").references(() => knowledgeLibraries.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    sourceFilename: varchar("source_filename", { length: 255 }).notNull(),
    logicalPath: text("logical_path").notNull(),
    directoryPath: text("directory_path").notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    docType: varchar("doc_type", { length: 32 })
      .$type<DocumentType>()
      .notNull()
      .default(DEFAULT_DOCUMENT_TYPE),
    tagsJson: jsonb("tags_json").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 32 })
      .$type<DocumentStatus>()
      .notNull()
      .default(DEFAULT_DOCUMENT_STATUS),
    latestVersionId: uuid("latest_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("documents_library_path_uid").on(table.libraryId, table.logicalPath),
    uniqueIndex("documents_workspace_path_uid").on(table.workspaceId, table.logicalPath),
    index("documents_library_dir_idx").on(table.libraryId, table.directoryPath),
    index("documents_workspace_dir_idx").on(table.workspaceId, table.directoryPath),
  ],
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
  (table) => [uniqueIndex("parse_artifacts_sha_uid").on(table.sha256)],
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
    parseStatus: varchar("parse_status", { length: 32 })
      .$type<ParseStatus>()
      .notNull()
      .default(DEFAULT_PARSE_STATUS),
    parseScoreBp: integer("parse_score_bp"),
    ocrRequired: boolean("ocr_required").notNull().default(false),
    parseArtifactId: uuid("parse_artifact_id").references(() => parseArtifacts.id, {
      onDelete: "set null",
    }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("document_versions_doc_version_uid").on(table.documentId, table.version),
    index("document_versions_sha_idx").on(table.sha256),
  ],
);

export const documentJobs = pgTable(
  "document_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    queueJobId: text("queue_job_id").notNull(),
    stage: varchar("stage", { length: 32 })
      .$type<ParseStatus>()
      .notNull()
      .default(DEFAULT_PARSE_STATUS),
    status: varchar("status", { length: 32 })
      .$type<RunStatus>()
      .notNull()
      .default(DEFAULT_RUN_STATUS),
    progress: integer("progress").notNull().default(0),
    errorCode: varchar("error_code", { length: 80 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("document_jobs_version_idx").on(table.documentVersionId),
    uniqueIndex("document_jobs_queue_uid").on(table.queueJobId),
  ],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    width: doublePrecision("width"),
    height: doublePrecision("height"),
    textLength: integer("text_length"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("document_pages_version_page_uid").on(table.documentVersionId, table.pageNo),
  ],
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
  (table) => [
    index("document_blocks_version_page_idx").on(table.documentVersionId, table.pageNo),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id").references(() => knowledgeLibraries.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
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
  (table) => [
    index("document_chunks_library_idx").on(table.libraryId),
    index("document_chunks_workspace_idx").on(table.workspaceId),
    index("document_chunks_version_page_idx").on(table.documentVersionId, table.pageStart),
  ],
);

export const citationAnchors = pgTable(
  "citation_anchors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id").references(() => knowledgeLibraries.id, {
      onDelete: "cascade",
    }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
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
  (table) => [
    index("citation_anchors_library_idx").on(table.libraryId),
    index("citation_anchors_chunk_idx").on(table.chunkId),
    index("citation_anchors_doc_page_idx").on(table.documentVersionId, table.pageNo),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    status: varchar("status", { length: 32 })
      .$type<ConversationStatus>()
      .notNull()
      .default(DEFAULT_CONVERSATION_STATUS),
    modelProfileId: uuid("model_profile_id").references(() => llmModelProfiles.id, {
      onDelete: "set null",
    }),
    agentSessionId: text("agent_session_id"),
    agentWorkdir: text("agent_workdir"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("conversations_workspace_idx").on(table.workspaceId),
    index("conversations_model_profile_idx").on(table.modelProfileId),
  ],
);

export const conversationAttachments = pgTable(
  "conversation_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    draftUploadId: varchar("draft_upload_id", { length: 64 }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("conversation_attachments_conversation_idx").on(table.conversationId, table.createdAt),
    index("conversation_attachments_draft_idx").on(table.draftUploadId),
    uniqueIndex("conversation_attachments_version_uid").on(table.documentVersionId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).$type<MessageRole>().notNull(),
    status: varchar("status", { length: 32 })
      .$type<MessageStatus>()
      .notNull()
      .default(DEFAULT_MESSAGE_STATUS),
    contentMarkdown: text("content_markdown").notNull(),
    structuredJson: jsonb("structured_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const messageCitations = pgTable(
  "message_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    anchorId: uuid("anchor_id").references(() => citationAnchors.id, {
      onDelete: "cascade",
    }),
    libraryId: uuid("library_id").references(() => knowledgeLibraries.id, {
      onDelete: "set null",
    }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    documentVersionId: uuid("document_version_id").references(() => documentVersions.id, {
      onDelete: "cascade",
    }),
    documentPath: text("document_path"),
    pageNo: integer("page_no"),
    blockId: uuid("block_id"),
    sourceScope: varchar("source_scope", { length: 32 }).$type<KnowledgeSourceScope>(),
    libraryTitleSnapshot: text("library_title_snapshot"),
    sourceUrl: text("source_url"),
    sourceDomain: text("source_domain"),
    sourceTitle: text("source_title"),
    quoteText: text("quote_text").notNull(),
    label: text("label").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("message_citations_message_idx").on(table.messageId)],
);

export const conversationShares = pgTable(
  "conversation_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shareToken: varchar("share_token", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversation_shares_conversation_uid").on(table.conversationId),
    uniqueIndex("conversation_shares_token_uid").on(table.shareToken),
    index("conversation_shares_creator_idx").on(table.createdByUserId),
  ],
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
    status: varchar("status", { length: 32 })
      .$type<ReportStatus>()
      .notNull()
      .default(DEFAULT_REPORT_STATUS),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reports_workspace_idx").on(table.workspaceId)],
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
    status: varchar("status", { length: 32 })
      .$type<ReportStatus>()
      .notNull()
      .default(DEFAULT_REPORT_STATUS),
    contentMarkdown: text("content_markdown").notNull().default(""),
    citationsJson: jsonb("citations_json").$type<
      Array<{ anchorId: string; label: string }>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_sections_report_order_uid").on(table.reportId, table.orderIndex),
  ],
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
    rawQueriesJson: jsonb("raw_queries_json").$type<Record<string, unknown>>(),
    searchedLibraryIdsJson: jsonb("searched_library_ids_json").$type<string[]>(),
    topK: integer("top_k").notNull().default(DEFAULT_RETRIEVAL_RUN_TOP_K),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("retrieval_runs_workspace_idx").on(table.workspaceId)],
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
  (table) => [
    uniqueIndex("retrieval_results_run_rank_uid").on(table.retrievalRunId, table.rank),
  ],
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
    status: varchar("status", { length: 32 })
      .$type<RunStatus>()
      .notNull()
      .default(DEFAULT_RUN_STATUS),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>(),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tool_runs_workspace_idx").on(table.workspaceId),
    index("tool_runs_conversation_idx").on(table.conversationId),
  ],
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
    status: varchar("status", { length: 32 })
      .$type<RunStatus>()
      .notNull()
      .default(DEFAULT_RUN_STATUS),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    costMicrosUsd: bigint("cost_micros_usd", { mode: "number" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("model_runs_workspace_idx").on(table.workspaceId),
    index("model_runs_conversation_idx").on(table.conversationId),
  ],
);
