# 通用知识库 Agent 助手 ERD

版本：v0.2  
日期：2026-03-28

> 文档角色说明：
>
> - 本文件给出当前数据模型的业务视图。
> - 若与当前 Drizzle schema 冲突，以 [packages/db/src/schema.ts](/Users/fan/project/tmp/law-doc/packages/db/src/schema.ts) 为准。
> - 架构约束以 [knowledge-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/knowledge-assistant-technical-design-nodejs.md) 为准。

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
      │   └─ messages
      │       └─ message_citations
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
- `messages` 保存用户与助手消息，`message_citations` 保存回答中的引用映射。
- `reports / report_sections` 承载大纲和分段生成结果。
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
