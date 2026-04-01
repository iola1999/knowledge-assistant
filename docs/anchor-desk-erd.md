# AnchorDesk ERD

版本：v0.5  
日期：2026-04-01

> 文档角色说明：
>
> - 本文件给出当前数据模型的业务视图。
> - 若与当前 Drizzle schema 冲突，以 [packages/db/src/schema.ts](../packages/db/src/schema.ts) 为准。
> - 架构约束以 [anchor-desk-technical-design-nodejs.md](./anchor-desk-technical-design-nodejs.md) 为准。

## 1. 业务主链路

```text
user
  └─ workspace
      ├─ knowledge_libraries (workspace_private)
      ├─ workspace_library_subscriptions
      │   └─ knowledge_libraries (global_managed)
      ├─ conversations ──> llm_model_profiles
      │   ├─ conversation_attachments ──> documents / document_versions
      │   ├─ messages ──> message_citations
      │   └─ conversation_shares
      ├─ reports
      │   └─ report_sections
      └─ retrieval_runs
          └─ retrieval_results

knowledge_libraries
  ├─ workspace_directories
  └─ documents
      └─ document_versions
          ├─ parse_artifacts
          ├─ document_jobs
          ├─ document_pages
          ├─ document_blocks
          ├─ document_chunks
          └─ citation_anchors
```

## 2. 关键设计

- `workspace` 是会话上下文、报告容器和授权入口；`knowledge_library` 是资料归属、目录组织和检索过滤的核心边界。
- `workspace` 可携带 `workspace_prompt`，用于附加到该空间内每轮对话的统一回答要求。
- `llm_model_profiles` 保存 super admin 维护的 Claude-compatible 模型配置；`conversations.model_profile_id` 按会话持久化当前选中的模型，历史会话会在升级时回填到默认模型。
- 每个 `workspace` 自动拥有一个 `workspace_private` library；super admin 可维护 `global_managed` library；`workspace_library_subscriptions` 决定 workspace 可挂载、可读和可检索的全局资料范围。
- `workspace_directories` 保留原表名，但当前目录树已经按 `library_id` 承载；现阶段 schema 中部分表会同时保留 `workspace_id` 和 `library_id`，其中 library scope 是资料归属、授权和检索的主依据。
- `documents` 保存逻辑文档信息，`document_versions` 保存版本化文件。
- `document_versions.storage_key` 指向全局 content-addressed blob（`blobs/<sha256>`）；对象存储不表达工作空间或目录树层级。
- `parse_artifacts` 以 `sha256` 作为解析缓存复用边界。
- `document_blocks / document_chunks / citation_anchors` 支撑检索、阅读和引用；其中 chunk / anchor 当前都带有 `library_id`，用于 library scope 授权和索引过滤。
- `conversation_attachments` 绑定“会话级临时资料”和正式 `document_version`，用于首条消息前临时上传、首发后认领，以及 parse-only 附件检索。
- `messages` 保存 user / assistant / tool 消息；`message_citations` 保存回答中的引用映射，并持久化 `library_id`、`source_scope`、`library_title_snapshot` 和 `quote_text`，供来源 badge、摘录展示和分享页复用。
- `conversation_shares` 保存会话级公开分享记录；一个会话最多一个活跃分享链接，可撤销后重新生成。
- `reports / report_sections` 承载大纲和分段生成结果。
- `system_settings` 继续保存运行时参数，但模型配置已迁出到 `llm_model_profiles`。
- `app_upgrades` 记录一次性应用升级的执行状态、错误和元数据。
- `retrieval_runs / retrieval_results` 保留检索行为回放；`retrieval_runs.searched_library_ids_json` 记录当前轮实际检索过的 library scope。

## 3. 通用文档类型

- `reference`
- `guide`
- `policy`
- `spec`
- `report`
- `note`
- `email`
- `meeting_note`
- `other`
