# AnchorDesk技术设计（Node.js / Next.js / Claude Agent SDK）

版本：v0.7
日期：2026-03-30

> 文档角色说明：
>
> - 本文件是当前实现的架构/技术约束主文档。
> - 当前阶段进度、活跃待办和下一步顺序请看 [implementation-tracker.md](./implementation-tracker.md)。
> - 本地开发启动、Docker 依赖和日常操作请看 [development-setup.md](./development-setup.md)。
> - 若与其他支持性文档冲突，以本文件为准。

## 1. 已确认约束

- 产品定位是“通用工作空间知识库助手”，不是法律垂类产品。
- 仍保留一个专项的“法律条文搜索”工具，用于需要法规引用的任务。
- 主站和主后端使用 Node.js。
- Web 框架使用 Next.js。
- 文档解析允许使用 Python。
- Agent 决策与规划固定使用 `@anthropic-ai/claude-agent-sdk`。
- 当前阶段执行策略是“先收口对话链路，并按真实 provider 行为开发”；缺少关键配置时应显式失败，而不是回退本地 mock。
- 文档解析、切块质量、OCR 和更深的 retrieval 优化当前默认暂缓，除非它们直接阻断对话链路联调。

第一版产品核心：

- 单用户账号体系
- 账号注册开关由 `system_settings` 控制
- 工作空间级知识库
- 工作空间级会话与报告
- 会话级公开只读分享链接
- 支持按目录组织资料
- 上传后异步消化
- 基于 MD5/SHA256 的解析缓存
- 基于资料库的带引用问答
- 可选联网补充搜索

## 2. 技术栈

- Web + BFF：`Next.js 16 App Router`
- 认证：`Auth.js`
- 数据库：`PostgreSQL`
- ORM：`Drizzle ORM`
- 队列与缓存：`Redis + BullMQ`
- 对象存储：`S3 Compatible`（开发期可用 MinIO）
- 向量检索：`Qdrant`
- Agent 规划：`@anthropic-ai/claude-agent-sdk`
- 最终答案结构化输出：`@anthropic-ai/sdk`
- 文档解析：`Python + FastAPI`
- PDF 阅读：`PDF.js`

当前 provider 策略：

- Agent 规划固定 Anthropic
- embedding / rerank 优先 DashScope，未配置时回退本地方案
- 工具 provider 未就绪时，应保持稳定契约并返回明确失败，不再提供本地 mock fallback
- OCR 默认关闭，只有扫描件、图片型 PDF 或无文本层材料才启用
- OCR provider 暂不推进本地实现；后续待商业 API 口径确认后再接入，候选方向优先考虑百炼

## 3. 总体架构

```mermaid
flowchart LR
    B[Browser / Next.js UI] --> N[Next.js BFF]
    N --> PG[(PostgreSQL)]
    N --> RS[(Redis)]
    N --> S3[(Object Storage)]
    N --> AG[Agent Runtime]
    N --> QE[Queue Events API]

    N --> Q1[ingest queue]
    Q1 --> W[Node Worker / BullMQ]
    W --> PY[Python Parser Service]
    W --> V[(Qdrant)]
    W --> PG

    AG --> MCP[MCP Tool Server]
    MCP --> V
    MCP --> PG
    MCP --> S3
    MCP --> WEB[HTTP Fetch / Search]
    AG --> CLAUDE[Claude Agent SDK]
    AG --> ANTH[Anthropic Messages API]
```

架构原则：

- Next.js 负责 UI 与轻量 BFF，不直接做重计算。
- 长耗时任务都走 BullMQ Worker。
- Agent Runtime 独立成常驻 Node 进程。
- 文档解析放到 Python Parser Service。
- 检索证据和最终生成分层，避免把所有责任压给 Agent SDK。

当前实现快照：

- `Next.js BFF` 已经承接注册登录、工作空间、上传签名、文档管理、会话消息落库、报告基础操作和文档阅读页。
- 账号认证仍使用 `Auth.js` 的 JWT session，但服务端会把有效 session 的稳定 `sessionId` claim 记录到 Redis，并在每次读取 session 时执行 allowlist 校验与 TTL 续期；登出、改密和后续管理员强制下线都依赖这层撤销能力。
- `Next.js BFF` 已补齐会话分享管理，可为单个会话生成 bearer-style 公开链接，并提供匿名只读分享页。
- 工作空间当前不再提供归档入口；删除改为软删除，已删除空间会从默认列表和资源访问链路中隐藏。
- `BullMQ Worker` 已经跑通 `parse -> chunk -> embed -> index` 流程，解析产物会同时落 PostgreSQL 与 Qdrant。
- 工作空间与会话附件上传当前由前端先计算文件 SHA256，再由 Web 下发 `blobs/<sha256>` 的 presigned PUT；若已有已验证 blob 则直接复用，不再按工作空间或目录前缀组织对象。
- `Agent Runtime` 已经能协调工作空间检索、联网检索与工具调用证据回收，再交给最终 grounded answer renderer。
- 回答策略当前固定为“工作空间资料优先 + 联网补充检索”，不再提供 `kb_only / kb_plus_web` 模式分支。
- `conversation.respond` 队列已接入 `Agent Runtime` Worker；用户发消息后会先落 user message + assistant placeholder，再异步执行 Claude Agent SDK。
- `Agent Runtime` 现在会抽取 Claude Agent SDK 的 assistant text delta，并把 assistant draft 持久化回 `messages`，供前端会话气泡实时更新。
- 当本地缺少 `ANTHROPIC_API_KEY` 时，`Agent Runtime` 会直接失败，并通过既有 `run_failed` / assistant failed 链路把错误返回前端。
- Agent 工具调用事件现在会以 `messages.role = "tool"` 持久化到数据库，并由 `/api/conversations/[conversationId]/stream` 作为 SSE 工具时间线持续推送到前端；同一路 SSE 也会推送 assistant `answer_delta` / `answer_done` / `run_failed`。
- `answer_done` / `run_failed` 终态事件现在会附带最终 assistant 内容、structured state 和当前 message citations，前端会先切到本地最终态，再做后台刷新以保持页面其余部分一致。
- 会话页和共享页当前都会直接展示持久化的 citation `quote_text`，让终态证据展示不再只停留在标签层。
- 当最新 assistant 消息失败时，会话页现在支持直接复用上一条 user prompt 重新入队当前回答，前端会先本地清空旧回答/citation/工具时间线并恢复 streaming，再由 SSE 接管后续状态。
- streaming assistant placeholder 现在会写入运行 lease，`agent-runtime` 处理期间持续 heartbeat；如果 worker 崩溃或长时间失联，SSE 轮询会把过期回答收敛成 `run_failed`，避免前端无限等待。
- assistant / tool 的失败态 message payload 已收口为共享 helper，消息发送、重试、过期收敛和 worker 失败路径复用同一套错误语义。
- 当前阶段对非核心工具的要求是“先保持稳定契约和可观测事件流”；真实 provider 是否接齐不是阻塞主会话链路的前置条件。
- `Python Parser Service` 已支持 PDF / DOCX / text 基础解析、结构块构建、无文本 PDF 的 OCR 降级入口。
- 首条消息前可先上传“会话级临时资料”；这条链路会走 `parse/chunk/citation anchor`，但明确跳过 embedding 和 Qdrant indexing。
- 会话级临时资料会落到 `conversation_attachments`，回答阶段可通过独立 MCP tool 检索，并继续复用 `citation_anchors -> message_citations -> 阅读页跳转` 链路。
- 文本类临时资料现在会额外保留 line / block locator，前端引用标签和阅读页可显示行号或段号。

当前已知缺口：

- 当前回答流式仍是“数据库轮询 + assistant draft 持久化”链路，不是 provider 直连 token transport。
- 主会话链路的 completed/failed 收尾体验已补到“终态事件先切本地最终态 + 最新失败回答可直接重试并本地恢复 streaming”，但页面其余部分的一致性和更完整的失败恢复路径仍需要继续收口。
- 证据展示已从“标签计数”推进到“标签 + 引用摘录”，但更完整的 evidence dossier、claim-to-evidence 映射和分享页最终态联动仍未完成。
- 当前仍有部分工具停留在基础真实实现；这些工具当前的主要要求是稳定契约、明确失败语义和不伪造引用。
- OCR 真实 provider 尚未接入；当前仅支持关闭，并继续保持 disabled 直到商业 API 方案确定。
- retrieval 已补上 dense 候选窗口内的 BM25 混合打分，但更完整的 sparse 候选扩展不是当前阶段的主线。
- 前端与文案仍存在少量去法律化未收口残留。
- 会话级临时资料当前只做 parse-only 本地检索，不进入工作空间全局检索，也还没有后台清理任务。
- parser / chunking 质量深化在当前阶段只处理阻断会话链路的缺口，不主动扩范围。

## 4. 运行时分层

### 4.1 运行时与升级约束

当前版本演进采用双轨升级模型：

- 数据库结构变更：Drizzle versioned SQL migrations
- 非 SQL 一次性升级：app upgrades

约束：

- `packages/db/src/schema.ts` 是 schema source of truth。
- `packages/db/drizzle/**` 必须提交到仓库，作为可审计 migration 历史。
- app upgrades 通过 `app_upgrades` 表记录执行状态。
- 开发启动前执行 safe blocking upgrades。
- 生产发布时先执行 dedicated upgrade step，再启动运行时服务。
- 运行时服务启动前只做 `pnpm app:upgrade:check`，若仍有 blocking pending upgrades 则 fail-fast。
- schema 变更应遵守 `expand -> migrate -> contract`，避免多进程部署期间直接破坏兼容性。

### 4.2 运行时配置加载

应用进程在启动时通过 `initRuntimeSettings()`（`packages/db/src/runtime-settings.ts`）从 `system_settings` 表读取运行时配置并注入 `process.env`。

优先级：显式环境变量 > 数据库值 > 模块默认值。

bootstrap env-only（不进入 `system_settings`）：

- `DATABASE_URL`
- `AUTH_SECRET`
- `SUPER_ADMIN_USERNAMES`

其余所有 provider / 基础设施参数（Redis、S3、Qdrant、Anthropic、DashScope 等）均存储在 `system_settings`，可通过 `/settings` 管理。变更后需重启相关进程。

`upgrade` 服务在首次运行时将 `.env.production` 中的值写入 `system_settings`（`INSERT ... ON CONFLICT DO NOTHING`），后续运行不会覆盖已有值。

`parser`（Python）当前仍直接读取环境变量，不经过 `system_settings`。

### 4.3 单机 Docker 生产部署

生产部署目标为单机 Docker 多容器。

- Node 侧服务复用根目录 `Dockerfile`
- Parser 使用独立 Python 镜像
- Web 采用 Next.js `output: "standalone"`
- `upgrade` 容器负责执行 SQL migrations + blocking app upgrades + bucket ensure

### 4.4 健康检查

生产编排中的健康检查约定：

- web: `/api/health`
- worker: `/health`
- agent-runtime: `/health`
- parser: `/health`


负责：

- 多步任务规划和工具调用
- 管理会话 session
- 管理工具调用与 grounded answer 校验链路
- 组织问答、研究和写作流程
- 在工具结果与最终答案之间插入 grounded final answer 校验层

### 4.5 Python Parser Service

负责：

- 文本抽取
- OCR 降级入口
- 表格和版面结构恢复
- 页码与坐标映射

## 5. 代码组织

```text
.
├─ apps/
│  ├─ web/
│  ├─ worker/
│  └─ agent-runtime/
├─ services/
│  └─ parser/
├─ packages/
│  ├─ db/
│  ├─ contracts/
│  ├─ queue/
│  ├─ storage/
│  ├─ retrieval/
│  ├─ agent-tools/
│  └─ auth/
└─ docs/
```

## 6. 数据与检索

核心对象：

- `users`
- `workspaces`
- `documents`
- `document_versions`
- `document_jobs`
- `document_pages`
- `document_blocks`
- `document_chunks`
- `citation_anchors`
- `conversations`
- `conversation_attachments`
- `messages`
- `message_citations`
- `conversation_shares`
- `reports`
- `report_sections`
- `retrieval_runs`
- `retrieval_results`

文档类型采用通用 taxonomy：

- `reference`
- `guide`
- `policy`
- `spec`
- `report`
- `note`
- `email`
- `meeting_note`
- `other`

检索原则：

- 工作空间是最小隔离边界。
- 目录树只影响过滤和展示，不改变底层 chunk 平铺索引。
- 对象存储不承担工作空间隔离或目录表达；这两层语义只存在于数据库 metadata。
- 回答引用落到 `citation_anchors`。

### 6.1 对象存储布局

对象存储采用“单 bucket + 内容寻址 blob”模型：

- 原始文件对象统一写到 `blobs/<sha256>`。
- 工作空间、目录树、逻辑路径、软删除和权限判断全部由 PostgreSQL 中的 `workspaces`、`workspace_directories`、`documents`、`document_versions` 等表维护，不从对象 key 反推。
- 上传链路采用两段式：
  1. 前端计算文件 SHA256
  2. Web 基于 SHA256 下发 `blobs/<sha256>` 的 presigned PUT；若数据库中已有已验证 blob，可直接跳过上传
  3. 前端提交 `sha256 + 目录路径 + 文件元数据` 创建 `documents` / `document_versions` 并入队
  4. Worker 读取 `blobs/<sha256>`，复核实际 SHA256 与 `storage_key` 是否一致，再写入 `file_size_bytes` 并继续 parse / chunk / index
- `document_versions.sha256` 在 finalize 时即写入客户端声明的 SHA256；worker 必须复核内容和 key 是否匹配，不允许在正式 key 上静默改写成其他 hash。
- 删除资料时不能只看当前 document 是否被删；必须先检查同一个 `storage_key` 是否仍被其他 `document_versions` 引用，只有最后一个引用消失时才删除 blob。

数据库关系约束保持不变：

- 对象 key 扁平化不等于放弃关系完整性。
- `documents -> workspaces`、`document_versions -> documents`、`document_jobs -> document_versions`、`conversation_attachments -> document_versions / documents` 等核心链路继续保留外键。
- 这些外键的职责是防止悬挂版本、悬挂任务和悬挂附件；对象存储已经不再表达层级归属后，数据库更需要保留这层硬约束。

## 7. Tool 设计

当前工具集合：

- `search_workspace_knowledge`
- `search_conversation_attachments`
- `read_citation_anchor`
- `search_web_general`
- `fetch_source`
- `create_report_outline`
- `write_report_section`
- `search_statutes`

说明：

- `search_statutes` 是保留的专项工具，用于法律条文或法规引用场景。
- 其他工具和主流程都以通用知识库助手为中心组织。
- 当前阶段要求 `search_web_general`、`search_statutes`、报告生成相关工具按真实 provider 或明确失败语义运行；输出契约必须稳定，且不得伪造 citation。

## 8. 当前阶段关注点

优先级统一以 [implementation-tracker.md](./implementation-tracker.md) 为准。当前重点调整为：

1. 基于已打通的主会话链路，先稳住回答完成态、失败态和前端收尾体验
2. 固化 tool timeline、assistant streaming 和 completed/failed 事件，并继续对齐真实 provider 失败语义
3. grounded answer 与证据展示 / citation 联动
4. 只处理阻断会话链路的临时附件、解析和检索问题
5. 主链路稳定后，再恢复真实工具 provider、retrieval 深化和 OCR 接入评估
