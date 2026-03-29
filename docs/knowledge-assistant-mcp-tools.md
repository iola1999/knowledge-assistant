# AnchorDesk MCP Tool 契约

版本：v0.2  
日期：2026-03-28

> 文档角色说明：
>
> - 本文件描述当前 MCP tool 集合和职责边界。
> - 若与当前代码冲突，以 `packages/contracts` 与 `packages/agent-tools` 为准。

## 1. Server 命名

当前工具统一挂在 `assistant` MCP server 下。

## 2. 核心工具

### 2.1 `search_workspace_knowledge`

- 作用：检索当前工作空间资料库。
- 输入：`workspace_id`、`query`、可选过滤器、`top_k`
- 输出：`anchor_id`、文档路径、页码、片段、分数

### 2.2 `search_conversation_attachments`

- 作用：检索当前会话里临时上传并已完成 parse-only 的附件。
- 输入：`conversation_id`、`query`、`top_k`
- 输出：`anchor_id`、文档路径/标签、页码、片段、分数

### 2.3 `read_citation_anchor`

- 作用：读取某条引用锚点及其上下文。
- 输入：`anchor_id`
- 输出：文档、页码、locator、bbox、正文片段

### 2.4 `search_web_general`

- 作用：检索公开网络结果。
- 输入：`query`、`top_k`
- 输出：标题、URL、域名、摘要

### 2.5 `fetch_source`

- 作用：抓取指定 URL 的文本内容。
- 输入：`url`
- 输出：标题、抓取时间、内容类型、段落数组

### 2.6 `create_report_outline`

- 作用：基于当前任务生成报告大纲。
- 输入：`workspace_id`、`title`、`task`、可选 `evidence_anchor_ids`
- 输出：标题和 section 列表

### 2.7 `write_report_section`

- 作用：基于指令和证据生成某个章节草稿。
- 输入：`report_id`、`section_id`、`instruction`、可选 `evidence_anchor_ids`
- 输出：章节 markdown 与 citations

## 3. 保留的专项工具

### 3.1 `search_statutes`

- 作用：保留一个专项的法律条文/法规搜索工具。
- 说明：它不是产品主定位，但作为独立工具继续保留。
- 输入：`query`、`jurisdiction`、`top_k`
- 输出：标题、URL、发布方、状态、摘要
