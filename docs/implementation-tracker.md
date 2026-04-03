# 实施跟踪

版本：v0.13
日期：2026-04-03

> 本文件是项目的执行跟踪文档。
>
> - 当前阶段进度、活跃待办和下一步顺序，以本文件为准。
> - 产品目标以 [anchor-desk-prd.md](./anchor-desk-prd.md) 为准。
> - 架构与实现约束以 [anchor-desk-technical-design-nodejs.md](./anchor-desk-technical-design-nodejs.md) 为准。

## 1. 当前阶段

当前阶段：`P0 对话链路收口优先`

阶段目标：

- 先把“工作空间 -> 创建对话 -> 消息入队 -> agent-runtime -> tool timeline -> assistant streaming -> 单次回答落库 -> citations -> 分享/回访”做顺。
- 当前阶段要求主会话链路按真实 provider 行为运行；缺少关键配置或 provider 不可用时应走明确失败语义，而不是回退本地 mock。
- 资料解析、切块质量、OCR 和更深的 retrieval 优化暂缓；除非它们直接阻断对话链路联调，否则不优先推进。

当前结论：

- 传统主链路已经具备基础可用性，但当前最需要收口的是对话链路完成态，而不是继续扩 parser 和 retrieval 范围。
- 资料管理 CRUD、会话管理、文档阅读器和上传任务反馈都已有基础版，可支撑当前阶段联调。
- 资料模型已升级为“workspace 私有库 + 可订阅全局库”；对话检索、文档授权和引用跳转开始统一围绕 library scope 组织。
- 第一版口径仍然是“助手优先、问答优先”；报告保留 Agent 生成与导出，不做平台内编辑器。
- 主会话链路现已切到“Claude Agent SDK partial events + Redis Streams live transport + 单次流式回答 + 应用层 citation materialization”模型；Claude Agent SDK 仍留在独立 `agent-runtime` 进程中负责决策与工具调用，并在 provider 返回时透传 raw thinking delta。
- 当前阶段不再接受本地 mock 会话回退；链路联调应直接暴露真实 provider 缺失或调用失败，并保持错误语义稳定。
- 本地开发一键启动脚本已补齐。
- `pnpm dev` 现在会在 parser 的 `requirements.txt` 变化时自动刷新 `.venv`，避免旧 Python 依赖残留导致 parser 无法启动。
- 数据库与应用升级开始从 ad-hoc bootstrap 收敛到 versioned SQL migrations + tracked app upgrades。
- 已新增生产单机 Docker 多容器部署资产与基础健康检查。
- 运行时配置已收口为"bootstrap env + DB system_settings"模型：web / worker / agent-runtime 启动时从 DB 加载配置；steady state 的 Node runtime 只保留极少量 bootstrap env（`DATABASE_URL`，以及 Web 侧的 `AUTH_SECRET`）。若希望 fresh deployment 自动 seed 可用默认模型，仍应在 `upgrade` 阶段提供初始 Anthropic 模型参数。
- Claude-compatible 模型已从 `system_settings` 迁到 `llm_model_profiles`；管理员通过 `/admin/models` 维护模型，用户按 conversation 维度选择模型，切换模型时当前版本不主动重置 `Agent Session`。
- 当 workspace 已有可检索本地资料，或当前聊天里已有会话附件时，agent 编排现在会优先走本地检索，再决定是否调用 `search_statutes` / `search_web_general`。
- 当前最缺的不是更多 agent 花样，而是先把 P0 承诺和实际实现对齐，把主会话链路、SSE、完成态刷新和 citation 展示彻底走顺。
- 产品整体已切换为通用知识库助手定位，但保留 `search_statutes` 专项工具。
- 全局资料库第一版已补齐管理员维护、workspace 订阅、资料页只读挂载和 citation 来源展示；后续以回归和细化为主，不单独上调优先级。

当前实现快照：

- `web -> BullMQ conversation.respond -> agent-runtime -> single answer stream -> citations` 主问答链路已通；发送消息后会先落 user message + assistant placeholder，再异步生成最终回答。
- `agent-runtime` 当前支持通过 `agent_runtime_respond_worker_concurrency` 配置 `conversation.respond` worker 并发，允许多条会话在同一进程内并行处理。
- 问答策略已固定为“本地资料优先 + 联网查询补充”；不再保留 `kb_only / kb_plus_web` 模式切换与相关设置入口。
- 工作空间对话页已提供 conversation-scoped 模型选择器；创建新会话时会把选中的 `model_profile_id` 持久化到 `conversations`，后续重试和报告工具沿用同一份模型配置解析逻辑。
- 账号认证仍采用 `Auth.js` JWT session，但服务端现在会把有效 session 的稳定 `sessionId` claim 记录到 Redis，并在每次读取 session 时做 allowlist 校验与 TTL 续期；登出、改密和后续管理员强制下线都可走这层撤销机制。
- 第一个注册成功的用户现在会被持久化为 super admin（`users.is_super_admin = true`）；`/settings` 和全局资料库入口统一读取该标记授权，不再依赖 `SUPER_ADMIN_USERNAMES`。
- 首屏提问区已支持先上传“会话级临时资料”；首条消息创建会话后会自动认领这些附件，并把附件清单与“小文档全文 / 长文档节选”一起预载给 agent；被截断的内容仍通过附件工具按需读取。
- 当问题可能依赖本地政策、规范、法条整理稿或聊天里刚上传的附件时，agent prompt 会优先尝试 `search_conversation_attachments` / `search_workspace_knowledge`；只有本地证据不足或用户明确要求时才继续走法规/外网搜索。
- 账号页已补齐修改密码与退出登录的基础入口；工作空间当前只保留软删除，不再提供归档。
- 资料边界已提升为 `knowledge_libraries`：每个 workspace 会自动拥有一个 private library；super admin 可维护 `global_managed` library；workspace 通过 `workspace_library_subscriptions` 决定可挂载、可读和可检索的全局资料范围。
- `search_workspace_knowledge`、文档阅读授权和 citation 跳转都已切到 library scope；默认召回 workspace 私有库 + 已激活且开启检索的全局订阅库。
- `/api/conversations/[conversationId]/stream` 现在会先发数据库快照，再转发 Redis Streams live event；前端会实时接收 `assistant_status` / `assistant_thinking_delta` / `tool_progress` / `tool_message` / `answer_delta` / `answer_done` / `run_failed`。
- assistant 正文现已具备 token 级流式：主回答只生成一次，SSE 会持续推送同一条答案的增量，而不是先出草稿再二次重写。
- 当 Claude Agent SDK/模型返回 thinking delta 时，会话页现在会把 raw thinking、tool 事件和 runtime status 合流成统一 process timeline；thinking 内容会随 streaming assistant 的 `structured_json` 一起更新，SSE 重连后可恢复。
- process timeline 当前会优先展示稳定可解释的参数、进度和结果摘录；对无法可靠判定的 tool summary 不再猜测性生成结果文案。
- 当前 live stream 已改为 `assistant_message_id + run_id` 作用域；retry 同一 assistant turn 时会生成新的 `run_id`，旧 run 的 Redis event、BullMQ job 和 tool timeline 不会再回灌到新一轮。
- 无论当前是否已经进入会话，发送成功后前端都会先本地插入 user message 和 assistant placeholder，再由 SSE 接上后续工具时间线与回答流式更新；首条消息创建新会话时会同时在后台补上 URL 切换。
- 用户现在可在 assistant 回复中框选一段内容发起引用式 follow-up；引用片段会以 `follow_up_quote` snapshot 写入 user message，quote-only 追问和失败回答重试都会沿用这段上下文。
- 当前会话在本地提交后，侧栏会话列表也会立即同步最新会话标题、更新时间和选中态，不再只能等下一次服务端刷新。
- 当前侧栏还会对正在回答的会话显示 responding/loading 态，并在终态事件到达后同步收口。
- 当前会话页头的标题、最后更新时间、消息数与附件数也会在本地提交后立即更新，不再只能等服务端重新返回当前页。
- user turn 左侧已补 hover copy action，便于快速复制原始提问文本且不打断当前线程。
- `answer_done` / `run_failed` 事件现在会附带最终 assistant 内容、structured state 和当前 message citations；前端会直接切到本地最终态，并同步更新当前会话页头与侧栏活动时间，不再依赖这一步的整页刷新。
- 如果终态 `run_failed` 事件没有带回 `message_id`，前端也会把当前本地 streaming assistant 收口为 failed，避免界面停在“仍在生成”。
- streaming 期间输入区主动作会切换为“停止生成”；调用 `/api/conversations/[conversationId]/stop` 后，前端会保留已生成片段并结束当前 assistant streaming，`agent-runtime` 会在发现该消息不再处于 streaming 时协作停止后续落库。
- 会话页和共享页的 citation 卡片现在会直接展示持久化的引用摘录 `quote_text`，不再只显示标签计数与跳转入口。
- 会话页和共享页的 citation 卡片现在还会展示来源 badge，区分 `工作空间资料` 与 `全局资料库 · <title>`。
- citation 证据链现在已收口成统一模型：内部资料/附件引用和外部网页引用都会先进入验证过的 evidence 集合，再统一落到 `message_citations`。
- `search_web_general` 现在只负责返回候选链接；只有 `fetch_source` 拉回的网页正文才会进入最终 citation，因此“工具时间线里做过联网搜索”与“终态存在可展示网页引用”这两件事已被明确区分。
- 当前已新增 `fetch_sources` 批量抓取工具；当模型需要抓取多个独立网页时，可在单次工具调用内并发拉取，并由 `fetch_source_max_concurrency` 控制该工具的进程内最大并发数。
- `message_citations` 现已支持外部网页来源字段（`source_url` / `source_domain` / `source_title`）；会话页 source panel 可同时渲染工作空间文档跳转和网页外链。
- 应用层内联 citation marker 已收口为固定协议：工具结果提供 `citation_id` / `citation_token`，模型在正文里输出 `[[cite:N]]`，应用层再规范化为 `[^n]` 并复用同一条 citation 卡片数据。
- `fetch_source` 现已兼容 markdown provider 返回 JSON envelope 的情况，会先解包 `content` 再抽标题和段落，避免网页引用卡片落成整段 JSON。
- `agent.log` 已补充 citation 排障字段；详见 [anchor-desk-citation-debugging.md](./anchor-desk-citation-debugging.md)。
- 工具层现在会为可引用证据注入运行期数字 citation id；对话主链路已移除第二次 grounded rewrite，改为单次回答 fail-closed 校验。
- assistant / tool 的失败态 payload 已收口为共享构造函数，消息发送、重试、运行过期和 worker 失败路径复用同一套错误语义。
- 主链路已接入 OpenTelemetry trace context：`web` 入口、BullMQ enqueue/consume、`worker -> parser` HTTP 调用会沿用同一条 `traceparent`，Node `pino` 日志和 parser 日志都可按同一个 `trace_id` 关联。
- 上传链路现在由前端先计算 SHA256，再直传 `blobs/<sha256>`；worker 负责复核对象内容和 hash/key 一致性，对象层不再按工作空间前缀组织，目录归属仅由数据库 metadata 表达。
- 本地缺少 `ANTHROPIC_API_KEY` 或关键 provider 时，主会话链路会直接进入失败态，并继续通过既有 SSE / message failed 链路暴露给前端。
- 会话页现在已提供“重新生成”入口；当最新 assistant 消息处于 failed 状态时，可复用上一条 user prompt 直接重试当前回答，前端会先本地重置该轮的回答/citation/工具时间线，再交给 SSE 持续接管。
- `presign -> documents/document_versions/document_jobs -> BullMQ parse/chunk/embed/index` 上传消化链路已通，解析结果会落到 `document_pages / document_blocks / document_chunks / citation_anchors`，并同步进入 Qdrant。
- 管理员侧已补齐 `/settings/libraries` 全局资料库 CRUD、上传、目录整理、任务重试与下载入口；workspace owner 可在工作空间设置页直接订阅、暂停或移除全局资料库。
- workspace 资料库页会在根层挂出已订阅全局资料库；切入后使用只读挂载视图，workspace 侧不能修改共享资料目录和文件。
- 会话级临时资料走独立的 `attachments/presign -> conversation_attachments -> parse/chunk/index(parse-only finalize)` 链路；它会生成 `document_pages / document_blocks / document_chunks / citation_anchors`，但不会写入 Qdrant。
- 上传链路已明确收口：原始图片仍不纳入当前可用范围，前后端会直接限制并提示；扫描件要求先转成 PDF，再由 parser 仅在无原生文本且含图的页上走 OCR。
- 文档阅读页已经支持 PDF 基础阅读、解析块查看和按引用锚点回跳，但仍没有 bbox 级高亮与更细粒度定位。
- 新增 `search_conversation_attachments` tool，临时资料现在可在回答中被检索、引用，并跳转到对应文档块或行号附近。
- 新增 `read_conversation_attachment_range` tool，模型现在可按 `document_id + page_start/page_end` 成批读取会话附件的几页正文，而不是只能逐段检索或逐锚点读取。
- 会话已支持生成公开只读分享链接；匿名访问共享会话时，内部资料引用不提供跳转，外部链接仍可打开。
- 系统参数页和 `system_settings` 已经接管大部分 provider / infra 配置，并新增了注册开关；Claude-compatible 模型改由 `/admin/models` 与 `llm_model_profiles` 维护，`DATABASE_URL`、`AUTH_SECRET` 继续保持 env-only。
- web / worker / agent-runtime 启动时通过 `initRuntimeSettings()` 从 DB 加载运行时配置到 `process.env`；Docker 生产部署中这三个服务只需 bootstrap env。
- 报告链路已具备“创建 -> 默认大纲 -> 章节生成 -> DOCX 导出”的基础版；当前阶段只要求它不阻断主会话链路，不把研究/写作能力深化作为优先项。
- parser 已接入阿里云百炼 DashScope OCR provider：worker 会透传结构化 parser 错误，`document_jobs.error_code` / `error_message` 与 `document_versions.ocr_required` 会反映 OCR 需求和失败原因。
- OCR 当前默认 provider 为 `dashscope`，并且只会在 PDF 原生文本抽取失败且页面含图时触发；原始图片上传继续禁用。
- retrieval 已具备 dense + BM25 候选窗口混合打分 + 可选 DashScope rerank 的基础版；后续深化在当前阶段降级为非阻塞项。
- 去法律化重定位已完成大部分命名与主流程调整，但仍需继续做回归清理，避免通用定位被后续改动带偏。

## 2. 最近完成

- `e017bf9` 为 user turn 增加 hover copy action，复制原始提问时给出轻量确认态。
- `723a0de` 公开分享页在禁用本地文档跳转时，继续允许外部网页 citation 打开 `source_url`。
- `d1466f3` 会话支持从 assistant 回复中框选文本发起引用式 follow-up；quote-only 追问与失败回答重试都可沿用该上下文。
- `27eacb2` 侧栏会话列表可直接显示正在回答的 responding/loading 态。
- `c5f5d19` process timeline 不再为不确定的 tool payload 猜测结果摘要，降低误导性文案。
- `853a599` thinking、tool 事件与 runtime status 已合并为统一 process timeline 视图。
- `23cf410` `pnpm dev` 会在 parser `requirements.txt` 变化时自动刷新 `.venv`。
- `46d5a8e` OCR 默认 provider 切到 `dashscope`，用于无原生文本且页面含图的 PDF 页。
- `e005e34` `web -> queue -> agent-runtime/worker -> parser` 已贯通 W3C Trace Context。
- `48ddb3b` 会话级临时资料支持 prompt 预载与按页范围读取。
- `29178a4` 新增 `/admin/models` 与 conversation-scoped 模型选择。
- `391d70b` / `8034566` 当 workspace 存在可检索本地资料时，agent 编排会更明确地优先本地知识与附件，再决定是否走法规/外网搜索。

## 3. 活跃待办

- 主会话链路完成态收口
  - 当前已能展示 `assistant_status`、tool start / progress / completed / failed、assistant `answer_delta`、`answer_done`、`run_failed`
  - thinking / tool / status 已合并为统一 process timeline；后续仍需继续收口 raw thinking 的噪音控制与展示边界
  - assistant placeholder 到 completed/failed 的本地状态切换已补齐；当前会话继续发送、首条消息创建新会话、主动停止生成与最新失败回答重试都已支持直接本地恢复或收口 streaming
  - 侧栏与页头的核心 conversation meta 已能跟随本地提交即时更新
  - 当前“停止生成”仍是基于数据库状态的协作式 stop，不是 provider-side cancel；更完整的中断语义仍待后续收口
  - 仍需继续收口除重试外更完整的失败恢复体验，以及更少依赖服务端返回的收尾断层
  - 单次回答的正文、citations 和引用跳转已能在终态事件到达后直接切到本地最终态；后续仍需继续收口更完整的失败恢复和其余收尾断层
- 工具契约与真实 provider 对齐
  - `search_web_general` / `search_statutes` / 报告生成等工具应逐步切到真实 provider 或明确失败语义
- tool response 必须保持稳定契约，能持续驱动 tool timeline、tool progress、assistant streaming、completed/failed 和前端展示
- 不得伪造 citation、置信度覆盖度或外部来源
- tracing / observability
  - 当前已能跨 `web -> queue -> agent-runtime/worker -> parser` 以同一 `trace_id` 关联日志
  - 后续若需要完整 span 树、聚合检索与 trace UI，仍需在部署环境补齐 OTLP collector / backend
- citation/evidence dossier 与更清晰的证据展示
  - 当前已补齐引用摘录展示，仍需继续补 evidence dossier、引用说明和完成态切换体验
  - 收口 citation 刷新、阅读器联动和分享页最终态一致性
- 会话级临时资料
  - 当前已支持上传、解析、会话绑定、本地检索和引用跳转
  - 当前只修阻断对话链路的附件问题；草稿附件清理和显式管理入口暂列次优先级
- 去法律化后的回归清理与文案收口
  - 继续检查其余页面和占位实现中的垂类默认文案
  - 回归补齐相关测试，防止后续再漂回法律垂类默认文案
- 暂缓项
  - OCR 默认 provider 已切到 `dashscope`，但仍只覆盖 PDF 内含图页；原始图片上传、bbox 映射和阅读器高亮暂不进入本轮
  - 原始图片上传、OCR bbox 到 PDF 坐标映射、阅读器高亮联动暂缓
  - parser / chunking 质量深化暂缓，除非直接阻断会话链路或临时附件链路
  - sparse/BM25 混合检索深化与 rerank 回归测试暂缓，待主会话链路稳定后再恢复

## 4. 下一步

默认按以下顺序推进：

1. 稳定主会话链路的完成态与失败态体验
2. 固化 tool timeline、真实 provider 失败语义和前端状态切换
3. 收口 citation 证据展示、citation 刷新和阅读器/分享页联动
4. 只修阻断主链路的会话级临时资料问题
5. 主链路稳定后，再恢复 retrieval 深化、真实工具 provider 和 OCR 深化项（原始图片、bbox 映射、阅读器高亮）

## 5. 风险与注意事项

- 当前改造默认允许破坏性重置，不保留旧数据兼容层。
- 本地一键启动脚本只代管应用进程；基础设施默认通过 `pnpm infra:up` 拉起。
- `AUTH_SECRET` 不进入 `system_settings`。
- JWT 登录态现在依赖 Redis allowlist；如果 Redis 不可用，服务端应按会话失效处理，而不是继续无状态放行旧 token。
- `/settings` 与 `/admin/models` 的改动都不会热更新到已运行进程；涉及运行时 provider 的变更仍需重启相关服务。
- OTLP exporter 仍是进程启动时读取的 env-only 配置；修改 collector endpoint 或 headers 后同样需要重启对应服务。
- OCR 当前默认 provider 为 `dashscope`，但仍只对无原生文本且含图的 PDF 页触发；未配置可用 DashScope API Key / endpoint 时应显式失败，不得伪造成功。
- 原始图片上传当前仍保持禁用。
- 公开分享链接本质是 bearer URL；公开页必须保持 `noindex`，且不能提供空间内资料跳转。
- PDF 阅读器当前仍是基础版，没有 bbox 级高亮。
- 当前 SSE 主通道已切到 Redis Streams live event；数据库只负责恢复快照、过期收敛与终态真相源，不再承担主 token transport。
- 当前最终 assistant answer、structured state 和 citations 仍在完成态统一落库；前端已可在终态事件到达时切到本地最终态，但刷新后仍以落库结果为准。
- 当前单次回答链路保持显式失败语义；当引用缺失、引用 id 非法或 provider 失败时，不再静默回退为 completed draft。
- 当前“停止生成”通过把 streaming assistant 收口为 completed 并让 `agent-runtime` 停止后续持久化实现，不是 provider-side cancel。
- 当前阶段不再提供本地 mock 会话回退；联调应以真实 provider 或明确失败为准，且不能伪造 workspace 证据、citation 或外部来源。
- 全局资料库当前只支持 super admin 维护、workspace owner 订阅；不含审批流、细粒度 ACL、本地覆盖层或挂载别名。
- parser、chunking、OCR 和 retrieval 深化当前都不是默认插队项；只有在它们直接阻断对话链路时才提前处理。
