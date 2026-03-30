# AnchorDesk 引用链路排障

版本：v0.1  
日期：2026-03-31

> 本文记录对话引用链路的排障入口、常见故障特征和建议检查顺序。

## 1. 先看哪里

开发环境主入口：

- agent runtime 日志：`/tmp/anchordesk-dev/logs/agent.log`
- web 日志：`/tmp/anchordesk-dev/logs/web.log`
- 数据库：`messages`、`message_citations`

优先顺序：

1. 看 `agent.log` 里该轮回答的 `workspaceEvidenceCount` 和 `citationCount`
2. 再看 `messages` 里对应 assistant/tool 行的 `structured_json`
3. 最后确认 `message_citations` 是否真的落库

## 2. 关键日志字段

`agent.log` 里当前最有用的字段：

- `workspaceEvidenceCount`
- `documentEvidenceCount`
- `webEvidenceCount`
- `citationCount`
- `inlineCitationMarkerCount`
- `hasInlineCitationMarkers`
- `finalAnswerRenderMode`
- `parsedCitationReferenceCount`

典型含义：

- `workspaceEvidenceCount = 0`
  说明 tool 响应没有被收集进 grounded evidence
- `workspaceEvidenceCount > 0` 且 `citationCount = 0`
  说明 evidence 已经存在，但 grounded answer 没有产出可用引用
- `citationCount > 0` 且 `hasInlineCitationMarkers = false`
  说明 sources tab 理论上应有内容，但正文内联角标没有产出
- `citationCount > 0` 且 `hasInlineCitationMarkers = true`
  说明后端已经产出正文 marker，若 UI 不显示，应检查前端渲染

## 3. 常见故障特征

### 3.1 tool 完成了，但 evidence 仍为 0

故障特征：

- `assistant tool completed` 出现
- 但最终 `workspaceEvidenceCount = 0`

优先检查：

- `messages.role = 'tool'` 的 `structured_json.tool_response` 真实 shape
- `parseToolPayload()` 是否覆盖了该 provider 的响应结构

已知案例：

- Claude Agent SDK 持久化的 `tool_response` 实际是 `content block array`
- 旧实现只支持 `{ content: [...] }`
- 结果是 `fetch_source` 已执行，但 evidence 没有被收集

现在运行时在这种场景会打印：

- `tool completed without a parseable payload`

## 3.2 evidence 已收集，但引用仍为 0

故障特征：

- `workspaceEvidenceCount > 0`
- `citationCount = 0`

优先检查：

- `finalAnswerRenderMode`
- `parsedCitationReferenceCount`
- `hasInlineCitationMarkers`

已知案例：

- final-answer 模型没有返回有效 `evidence_id`
- 或者没有按约定输出 inline marker
- 应用层现在会回退到 evidence dossier，避免 sources tab 为空

## 3.3 网页引用标题/摘录像一整坨 JSON

故障特征：

- `fetch_source` 成功
- 但 sources card 的 title / quote 很脏
- `tool_response.source.paragraphs[0]` 像 JSON 包裹字符串

原因：

- 当前 provider 可能返回 `application/json`
- 真正的 markdown/content 在 JSON 的 `content` 字段里

处理：

- 先在 `packages/agent-tools/src/fetch-source.ts` 解包 JSON envelope
- 再按 markdown 正文去抽标题和段落

## 4. 快速查库脚本

仓库根目录可直接执行：

```bash
pnpm --filter @anchordesk/db exec node - <<'NODE'
const fs = require('fs');
const { Client } = require('pg');
const env = fs.readFileSync('.env.local', 'utf8');
const connectionString = env.match(/^DATABASE_URL=(.*)$/m)?.[1];
const conversationId = 'your-conversation-id';

(async () => {
  const client = new Client({ connectionString });
  await client.connect();

  const messages = await client.query(`
    select id, role, status, created_at, content_markdown, structured_json
    from messages
    where conversation_id = $1
    order by created_at desc
    limit 20
  `, [conversationId]);

  const citations = await client.query(`
    select message_id, ordinal, label, source_scope, source_url, document_path, page_no
    from message_citations
    where message_id in (
      select id from messages where conversation_id = $1
    )
    order by ordinal asc
  `, [conversationId]);

  console.log(JSON.stringify({ messages: messages.rows, citations: citations.rows }, null, 2));
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

## 5. 当前正文内联引用约定

当前链路分两步：

1. final-answer 模型在 `answer_markdown` 里先输出临时 token：`[[cite:N]]`
2. 应用层归一化为最终持久化 marker：`[^1]`、`[^2]`

说明：

- `message_citations.ordinal` 与最终正文 marker 编号保持一致
- 前端会把 `[^n]` 渲染为内联小角标，并复用同一条 citation 卡片数据
- 如果模型没有返回 marker，sources tab 仍会基于应用层 fallback 展示
