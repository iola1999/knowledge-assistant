# 实施跟踪

版本：v0.6
日期：2026-03-29

> 本文件是项目的执行跟踪文档。
>
> - 当前阶段进度、活跃待办和下一步顺序，以本文件为准。
> - 产品目标以 [knowledge-assistant-prd.md](/Users/fan/project/tmp/law-doc/docs/knowledge-assistant-prd.md) 为准。
> - 架构与实现约束以 [knowledge-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/knowledge-assistant-technical-design-nodejs.md) 为准。

## 1. 当前阶段

当前阶段：`P0 Web / BFF 主链路拉通`

阶段目标：

- 先把“注册登录 -> 工作空间 -> 上传资料 -> 查看处理状态 -> 创建对话 -> 阅读文档 -> 回访报告”做顺。
- 在此基础上补 parser、retrieval、grounded answer、SSE 等可信回答底座。

当前结论：

- 传统主链路已经具备基础可用性。
- 资料管理 CRUD 已补齐基础版。
- 第一版口径是“助手优先、问答优先”；报告保留 Agent 生成与导出，不做平台内编辑器。
- 会话管理、文档阅读器和上传任务反馈都已有基础版。
- 主会话链路的 assistant draft streaming 已打通，Claude Agent SDK 仍留在独立 `agent-runtime` 进程中负责决策与工具调用。
- 本地开发一键启动脚本已补齐。
- 数据库与应用升级开始从 ad-hoc bootstrap 收敛到 versioned SQL migrations + tracked app upgrades。
- 已新增生产单机 Docker 多容器部署资产与基础健康检查。
- 当前最缺的不是更多 agent 花样，而是先把 P0 承诺和实际实现对齐，再继续深化 retrieval / grounded answer / SSE。
- 产品整体已切换为通用知识库助手定位，但保留 `search_statutes` 专项工具。

当前实现快照：

- `web -> BullMQ conversation.respond -> agent-runtime -> grounded final answer -> citations` 主问答链路已通；发送消息后会先落 user message + assistant placeholder，再异步生成最终回答。
- 问答策略已固定为“本地资料优先 + 联网查询补充”；不再保留 `kb_only / kb_plus_web` 模式切换与相关设置入口。
- 首屏提问区已支持先上传“会话级临时资料”；首条消息创建会话后会自动认领这些附件，并把它们连同 locator 信息一起送给 agent。
- 账号页已补齐修改密码与退出登录的基础入口；工作空间当前只保留软删除，不再提供归档。
- `/api/conversations/[conversationId]/stream` 现在会持续推送数据库里的 `tool` 消息、assistant draft `answer_delta` 和完成/失败事件；前端会在当前会话里实时更新 assistant 气泡。
- 当前回答流式是“数据库轮询 + assistant draft 持久化”链路；它已经满足 P0 的流式呈现，但仍不是 provider 直连 token transport，最终 grounded answer 与 citations 仍在完成态统一落库。
- `presign -> documents/document_versions/document_jobs -> BullMQ parse/chunk/embed/index` 上传消化链路已通，解析结果会落到 `document_pages / document_blocks / document_chunks / citation_anchors`，并同步进入 Qdrant。
- 会话级临时资料走独立的 `attachments/presign -> conversation_attachments -> parse/chunk/index(parse-only finalize)` 链路；它会生成 `document_pages / document_blocks / document_chunks / citation_anchors`，但不会写入 Qdrant。
- 上传链路已明确收口：OCR 明确保持 disabled，图片/扫描件暂不纳入当前可用范围，前后端会直接限制并提示。
- 文档阅读页已经支持 PDF 基础阅读、解析块查看和按引用锚点回跳，但仍没有 bbox 级高亮与更细粒度定位。
- 新增 `search_conversation_attachments` tool，临时资料现在可在回答中被检索、引用，并跳转到对应文档块或行号附近。
- 会话已支持生成公开只读分享链接；匿名访问共享会话时，内部资料引用不提供跳转，外部链接仍可打开。
- 系统参数页和 `system_settings` 已经接管大部分 provider / infra 配置，并新增了注册开关；`DATABASE_URL` 与 `AUTH_SECRET` 继续保持 env-only。
- 报告链路已具备“创建 -> 默认大纲 -> 章节生成 -> DOCX 导出”的基础版，但当前章节生成仍偏占位实现，不代表完整研究写作能力。
- parser 已有无文本 PDF 的 OCR 降级路径，但真实 OCR provider 仍未接入；当前仅有 `disabled/mock` 级别能力。
- OCR 下一步不再尝试本地 provider；待商业 API 方案确定后再接入，当前继续保持默认关闭。
- retrieval 已具备 dense + BM25 候选窗口混合打分 + 可选 DashScope rerank 的基础版，但仍未完成更完整的 sparse 候选扩展与回归。
- 去法律化重定位已完成大部分命名与主流程调整，但仍需继续做回归清理，避免通用定位被后续改动带偏。

## 2. 最近完成

- `working tree` Remove workspace archive controls and switch workspace delete to soft delete
- `working tree` Add account security page with password change and logout
- `working tree` Add read-only conversation sharing with revocable share links and public share page
- `working tree` Align upload scope with OCR-disabled policy and reject image/scanned uploads early
- `working tree` Remove workspace mode toggles and fix answer strategy to knowledge-first plus web search
- `working tree` 去法律化重定位
  - 产品定位改成通用知识库助手
  - 保留 `search_statutes` 专项工具
  - package scope、默认 bucket、默认 collection 与 MCP namespace 改为通用命名
  - 文档类型 taxonomy 改成通用分类
- `working tree` Move system config into database-backed settings
- `working tree` Redesign workspace shell around assistant-first flow
- `working tree` Migrate web styling to Tailwind design system
- `working tree` Add Docker infra commands and dev guide
- `working tree` Add local development startup scripts
- `working tree` Add PDF viewer and upload job feedback
- `working tree` Finish workspace conversation management
- `working tree` Implement document management CRUD
- `working tree` Document implementation snapshot and current gap assessment
- `working tree` Finish de-legalization brand cleanup for workspace shell and add regression guard
- `working tree` Reconfirm OCR stays disabled pending commercial API decision and verify current batch with `pnpm verify`
- `working tree` Add BM25 scoring over dense retrieval candidates with regression tests
- `working tree` Surface grounded answer confidence / unsupported reason / missing information in workspace conversation UI
- `working tree` Replace empty-state helper copy with temporary attachment upload entry and parse-only conversation attachment flow
- `working tree` Persist tool timeline into conversation messages and stream it over SSE
- `working tree` Stream assistant draft content over SSE with local mock tool fallback for the main conversation chain
- `f0e431a` Prioritize DashScope retrieval providers
- `70aa665` Add parser OCR fallback and grounded answer validation

## 3. 活跃待办

- 去法律化后的回归清理与文案收口
  - 继续检查其余页面和占位实现中的垂类默认文案
  - 回归补齐相关测试，防止后续再漂回法律垂类默认文案
- OCR 商业 API provider 方案待定
  - 当前继续保持 `disabled`
  - 候选方向优先考虑百炼，但在 provider 口径确认前暂不开发 OCR 接入
- 主会话链路后的回答可信度与收尾体验
  - 当前已能展示 tool start / completed / failed、assistant `answer_delta`、`answer_done`、`run_failed`
  - grounded final answer、citations 和引用跳转仍在完成态刷新后统一呈现
  - 仍需继续补 evidence dossier、引用说明和完成态切换体验
- 会话级临时资料
  - 当前已支持上传、解析、会话绑定、本地检索和引用跳转
  - 仍缺草稿附件清理和更显式的附件管理入口
- 工具占位实现替换与研究/写作链路增强
  - `search_web_general` / `search_statutes` / 报告章节生成仍有占位能力，但当前不再优先于主会话链路打磨
- grounded answer 证据 dossier 与更清晰的证据展示
- sparse/BM25 混合检索深化
  - 当前已补 dense 候选窗口上的 BM25 打分
  - 后续仍需要更完整的 sparse 候选扩展与 rerank 回归测试

## 4. 下一步

默认按以下顺序推进：

1. 稳定主会话链路的完成态体验
2. Agent evidence dossier / grounded answer 证据展示 / citation 刷新与阅读器联动
3. sparse retrieval 深化与引用准确性回归
4. 工具占位实现替换并回到真实研究/写作链路
5. OCR 商业 API provider 方案确认后再接入

## 5. 风险与注意事项

- 当前改造默认允许破坏性重置，不保留旧数据兼容层。
- 本地一键启动脚本只代管应用进程；基础设施默认通过 `pnpm infra:up` 拉起。
- `AUTH_SECRET` 不进入 `system_settings`。
- `/settings` 保存的是数据库配置，不会热更新到已运行进程。
- OCR 不要默认开启。
- OCR 当前明确保持 disabled，不应在未确认商业 provider 前继续扩展本地实现。
- 公开分享链接本质是 bearer URL；公开页必须保持 `noindex`，且不能提供空间内资料跳转。
- PDF 阅读器当前仍是基础版，没有 bbox 级高亮。
- 当前 SSE 已支持数据库轮询驱动的 assistant draft `answer_delta`；不要把它误判为 provider 直连 token stream。
- 当前最终 grounded answer、structured state 和 citations 仍在完成态统一落库，前端依赖刷新后显示最终版本。
