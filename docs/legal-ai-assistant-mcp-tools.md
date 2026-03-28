# 律师 AI 助手 MCP Tool 契约

版本：v0.1  
日期：2026-03-28

> 文档角色说明：
>
> - 本文件只负责 MCP tool 的命名、输入输出契约和错误模型。
> - 如果工具集合、调用模式或实现细节与当前代码冲突，以 [legal-ai-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-technical-design-nodejs.md) 和 `packages/contracts` / `packages/agent-tools` 当前代码为准。

## 1. 设计目标

- 让 `@anthropic-ai/claude-agent-sdk` 只看到清晰、可控、边界明确的工具。
- 把工具输入输出做成稳定契约，方便后续落地为 MCP server。
- 让工作空间隔离、引用锚点、官方来源优先级都能通过工具层体现出来。

## 2. 命名约定

统一挂在 `legal` MCP server 下。

最终对 Agent 暴露的工具名：

- `mcp__legal__search_workspace_knowledge`
- `mcp__legal__read_citation_anchor`
- `mcp__legal__search_statutes`
- `mcp__legal__search_web_general`
- `mcp__legal__fetch_source`
- `mcp__legal__create_report_outline`
- `mcp__legal__write_report_section`

可选增强工具：

- `mcp__legal__search_official_sources`
- `mcp__legal__list_workspace_tree`
- `mcp__legal__compare_documents`

## 3. 模式与 allowedTools

### 3.1 问答模式

允许：

- `search_workspace_knowledge`
- `read_citation_anchor`

### 3.2 研究模式

允许：

- 问答模式全部工具
- `search_statutes`
- `search_web_general`
- `fetch_source`

### 3.3 写作模式

允许：

- 研究模式全部工具
- `create_report_outline`
- `write_report_section`

## 4. 通用错误模型

所有工具统一返回：

```json
{
  "ok": false,
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "Workspace not found",
    "retryable": false
  }
}
```

错误码建议：

- `WORKSPACE_NOT_FOUND`
- `DOCUMENT_NOT_FOUND`
- `ANCHOR_NOT_FOUND`
- `INVALID_INPUT`
- `SEARCH_UNAVAILABLE`
- `FETCH_BLOCKED_DOMAIN`
- `FETCH_TIMEOUT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## 5. 工具契约

### 5.1 `search_workspace_knowledge`

作用：

- 在当前工作空间知识库中做混合检索。

输入：

```json
{
  "workspace_id": "ws_xxx",
  "query": "不可抗力与违约金是否冲突",
  "filters": {
    "doc_types": ["contract", "memo"],
    "directory_prefix": "资料库/客户A/主合同",
    "tags": ["违约责任"]
  },
  "top_k": 8
}
```

输出：

```json
{
  "ok": true,
  "results": [
    {
      "anchor_id": "anc_001",
      "document_id": "doc_001",
      "document_title": "采购主合同",
      "document_path": "资料库/客户A/主合同/2024版/采购主合同.pdf",
      "page_no": 12,
      "section_label": "第8条",
      "snippet": "......",
      "score": 0.93
    }
  ]
}
```

实现要求：

- 服务端强制校验 `workspace_id`。
- 检索层必须按 `user_id + workspace_id` 过滤。

### 5.2 `read_citation_anchor`

作用：

- 读取某个 anchor 的原文和附近上下文。

输入：

```json
{
  "anchor_id": "anc_001"
}
```

输出：

```json
{
  "ok": true,
  "anchor": {
    "anchor_id": "anc_001",
    "document_id": "doc_001",
    "document_title": "采购主合同",
    "document_path": "资料库/客户A/主合同/2024版/采购主合同.pdf",
    "page_no": 12,
    "bbox": {
      "x1": 0.1,
      "y1": 0.2,
      "x2": 0.7,
      "y2": 0.3
    },
    "text": "......",
    "context_before": "......",
    "context_after": "......"
  }
}
```

### 5.3 `search_statutes`

作用：

- 专门查法条、司法解释、官方规范性文件。

输入：

```json
{
  "query": "民法典 不可抗力",
  "jurisdiction": "CN",
  "top_k": 5
}
```

输出：

```json
{
  "ok": true,
  "results": [
    {
      "title": "中华人民共和国民法典",
      "url": "https://flk.npc.gov.cn/...",
      "publisher": "全国人大",
      "effective_status": "effective",
      "snippet": "......"
    }
  ]
}
```

域名策略：

- 默认允许 `flk.npc.gov.cn`
- 允许补充权威法院与政府站点

### 5.4 `search_web_general`

作用：

- 搜通用互联网结果，补充公开观点、新闻、公开案例解读。

输入：

```json
{
  "query": "供应商不可抗力违约责任 最新实务观点",
  "top_k": 5
}
```

输出：

```json
{
  "ok": true,
  "results": [
    {
      "title": "......",
      "url": "https://example.com/...",
      "domain": "example.com",
      "snippet": "......"
    }
  ]
}
```

约束：

- 该工具不直接返回正文，只返回候选结果。
- 需要正文时，Agent 再调 `fetch_source`。

### 5.5 `fetch_source`

作用：

- 抓取网页或公开 PDF 的规范化正文。

输入：

```json
{
  "url": "https://flk.npc.gov.cn/..."
}
```

输出：

```json
{
  "ok": true,
  "source": {
    "url": "https://flk.npc.gov.cn/...",
    "title": "中华人民共和国民法典",
    "fetched_at": "2026-03-28T10:00:00Z",
    "content_type": "text/html",
    "paragraphs": [
      "第一条 ......",
      "第二条 ......"
    ]
  }
}
```

安全要求：

- 必须做域名白名单校验。
- 默认只抓用户显式提供或前序搜索结果返回的 URL。

### 5.6 `create_report_outline`

作用：

- 基于已有证据生成长文写作大纲。

输入：

```json
{
  "workspace_id": "ws_xxx",
  "title": "合同风险审查意见",
  "task": "审查采购主合同中的违约责任与不可抗力条款",
  "evidence_anchor_ids": ["anc_001", "anc_002"]
}
```

输出：

```json
{
  "ok": true,
  "outline": {
    "title": "合同风险审查意见",
    "sections": [
      {
        "section_key": "background",
        "title": "一、审查范围与背景"
      },
      {
        "section_key": "risk_points",
        "title": "二、主要风险点"
      }
    ]
  }
}
```

### 5.7 `write_report_section`

作用：

- 生成某个报告章节的正文。

输入：

```json
{
  "report_id": "rep_001",
  "section_id": "sec_001",
  "instruction": "输出正式法律写作风格，结论前置",
  "evidence_anchor_ids": ["anc_001", "anc_002"]
}
```

输出：

```json
{
  "ok": true,
  "section": {
    "markdown": "......",
    "citations": [
      {
        "anchor_id": "anc_001",
        "label": "采购主合同 · 第12页 · 第8条"
      }
    ]
  }
}
```

## 6. 实现建议

### 6.1 Tool handler 分层

建议三层：

- `packages/contracts`
  - Zod 输入输出 schema
- `packages/agent-tools`
  - 具体 handler
- `apps/agent-runtime`
  - MCP server 注册

### 6.2 Tool run 日志

每次调用工具都写入：

- `workspace_id`
- `conversation_id`
- `message_id`
- `tool_name`
- `input_json`
- `output_json`
- `status`
- `latency_ms`

### 6.3 Tool 返回风格

建议：

- 统一 `ok: true | false`
- 统一错误模型
- 统一带 `document_path` 和 `anchor_id`

## 7. 后续可追加工具

- `list_workspace_tree`
- `move_document`
- `compare_documents`
- `extract_timeline`
- `summarize_document`
