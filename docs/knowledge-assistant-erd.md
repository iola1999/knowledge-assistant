# 通用知识库 Agent 助手 ERD

版本：v0.3  
日期：2026-03-29

> 文档角色说明：
>
> - 本文件给出当前数据模型的业务视图。
> - 若与当前 Drizzle schema 冲突，以 [packages/db/src/schema.ts](packages/db/src/schema.ts) 为准。
> - 架构约束以 [knowledge-assistant-technical-design-nodejs.md](./knowledge-assistant-technical-design-nodejs.md) 为准。

## 1. 业务主链路

```text
user
  └─ workspace
      ├─ documents
      │   └─ document_versions
      │       ├─ document_jobs
      │       ├─ document_pages
      │       ├─ document_blocks
      │       ├─ document_chunks
      │       └─ citation_anchors
      ├─ conversations
      │   ├─ conversation_attachments
      │   ├─ messages
      │   │   └─ message_citations
      │   └─ conversation_shares
      ├─ reports
      │   └─ report_sections
      └─ retrieval_runs
          └─ retrieval_results
```

## 2. 关键设计

- `workspace` 是知识隔离和会话上下文的核心边界。
- `workspace` 可携带 `workspace_prompt`，用于附加到该空间内每轮对话的统一回答要求。
- `documents` 保存逻辑文档信息，`document_versions` 保存版本化文件。
- `document_blocks / document_chunks / citation_anchors` 支撑检索、阅读和引用。
- `conversation_attachments` 绑定“会话级临时资料”和正式 `document_version`，用于首条消息前临时上传、首发后认领，以及 parse-only 附件检索。
- `messages` 保存用户与助手消息，`message_citations` 保存回答中的引用映射。
- `conversation_shares` 保存会话级公开分享记录；一个会话最多一个活跃分享链接，可撤销后重新生成。
- `reports / report_sections` 承载大纲和分段生成结果。
- `app_upgrades` 记录一次性应用升级的执行状态、错误和元数据。
- `retrieval_runs / retrieval_results` 保留检索行为回放。

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
