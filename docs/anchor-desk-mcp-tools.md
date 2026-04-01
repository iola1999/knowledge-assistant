# AnchorDesk MCP Tool 契约

版本：v0.6
日期：2026-04-01

> 文档角色说明：
>
> - 本文件描述当前 MCP tool 集合和职责边界。
> - 若与当前代码冲突，以 `packages/contracts` 与 `packages/agent-tools` 为准。

## 1. Server 命名

当前产品运行时工具统一挂在 `assistant` MCP server 下。

补充说明：

- 协作者开发环境可额外使用 `Context7` 查询开源库 / 框架文档与示例。
- `Context7` 仅用于开发期查第三方资料，不属于本文件定义的产品运行时 tool 契约，也不对最终用户暴露。
- 涉及第三方库 API、版本升级或配置差异时，应优先使用 `Context7` 核对文档，再回到仓库代码实现。

## 2. 返回约束

- 所有工具都返回稳定 union：
  - 成功：`{ ok: true, ... }`
  - 失败：`{ ok: false, error: { code, message, retryable } }`
- 当前阶段工具 provider 可以失败，但失败时必须保持上述结构，不能伪造 citation、来源或成功结果。

## 3. 核心工具

### 3.1 `search_workspace_knowledge`

- 作用：检索当前 workspace 可访问的资料范围。
- 输入：`workspace_id`、`query`、可选过滤器、`top_k`
- 当前默认范围：workspace 私有资料库 + 已激活且开启检索的全局资料库订阅。
- 输出：`anchor_id`、`document_id`、`document_title`、`document_path`、`anchor_label`、`page_no`、`section_label`、`locator`、`snippet`、`score`
- 编排约束：当 workspace 已有可检索本地资料，且问题可能依赖内部规范、政策、报告、法条整理稿或其他本地文档时，应优先尝试这个工具，再考虑 `search_web_general` 或 `search_statutes`。

### 3.2 `search_conversation_attachments`

- 作用：检索当前会话里临时上传并已完成 parse-only 的附件。
- 输入：`conversation_id`、`query`、`top_k`
- 输出：与 `search_workspace_knowledge` 同形的结果结构，包含 `locator`
- 编排约束：当用户提到“这次聊天里刚上传的文件”或当前 prompt 已预载附件摘录时，应先尝试这个工具，再回退到 workspace 知识库。

### 3.3 `read_conversation_attachment_range`

- 作用：按 `document_id + page_start/page_end` 读取当前会话附件中的一段连续页正文。
- 输入：`conversation_id`、`document_id`、`page_start`、`page_end`
- 输出：文档元信息、实际加载页范围、是否因窗口上限被截断，以及逐页正文数组
- 约束：单次最多返回一个小页窗；当预载 prompt 已提示“内容过长已省略”时，模型应优先用这个工具深读附件正文。

### 3.4 `read_citation_anchor`

- 作用：读取某条引用锚点及其上下文。
- 输入：`anchor_id`
- 授权：按当前 workspace 的 accessible library scope 校验，而不是仅按 `documents.workspace_id`
- 输出：文档、页码、`locator`、`bbox`、正文片段及其上下文

### 3.5 `search_web_general`

- 作用：检索公开网络结果。
- 输入：`query`、`top_k`
- provider：当前优先走配置好的公共 web search provider；未配置时返回明确失败
- 输出：标题、URL、域名、摘要
- 约束：它只提供候选链接与摘要，不直接形成最终 citation。

### 3.6 `fetch_source`

- 作用：抓取指定 URL 的文本内容。
- 输入：`url`
- provider：当前通过 `markdown.new` 请求 `text/markdown`，再在本地归一化为段落数组
- 输出：标题、抓取时间、内容类型、段落数组
- 约束：网页引用必须基于 `fetch_source` 返回的正文段落进入 grounded evidence；不要直接把搜索结果摘要当成最终引用。

### 3.7 `fetch_sources`

- 作用：批量抓取多个 URL 的文本内容。
- 输入：`urls[]`
- provider：与 `fetch_source` 相同，当前通过 `markdown.new` 获取 `text/markdown`
- 输出：`sources[]` 与 `failures[]`
- 约束：批量抓取仍受 `fetch_allowed_domains` 白名单与 `fetch_source_max_concurrency` 并发上限约束；单个 URL 失败不应伪造成功结果，也不应吞掉其他已成功抓取的网页正文。

### 3.8 `create_report_outline`

- 作用：基于当前任务生成报告大纲。
- 输入：`workspace_id`、`title`、`task`、可选 `evidence_anchor_ids`
- 输出：标题和 section 列表

### 3.9 `write_report_section`

- 作用：基于指令和证据生成某个章节草稿。
- 输入：`report_id`、`section_id`、`instruction`、可选 `evidence_anchor_ids`
- 输出：章节 markdown 与 citations

## 4. 保留的专项工具

### 4.1 `search_statutes`

- 作用：保留一个专项的法律条文/法规搜索工具。
- 说明：它不是产品主定位，但作为独立工具继续保留。
- 输入：`query`、`jurisdiction`、`top_k`
- 输出：标题、URL、发布方、状态、摘要
- 编排约束：优先在会话附件和 workspace 本地知识中查找已有的法条、制度或整理稿；只有用户明确需要法规原文/法条级引用，且本地资料不足时，再调用本工具。
