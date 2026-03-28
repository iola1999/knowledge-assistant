# 实施跟踪

版本：v0.3  
日期：2026-03-28

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
- 本地开发一键启动脚本已补齐。
- 系统级 provider / infra 配置开始从 env 收敛到数据库 `system_settings`。
- 当前最缺的不是更多 agent 花样，而是 parser / retrieval / grounded answer / SSE 这些可信回答底座能力。
- 产品整体已切换为通用知识库助手定位，但保留 `search_statutes` 专项工具。

当前实现快照：

- `web -> agent-runtime -> grounded final answer -> citations` 主问答链路已通，但当前回答仍以“同步请求 + 落库后刷新页面”为主，尚未形成真正的工具级时间线流。
- `presign -> documents/document_versions/document_jobs -> BullMQ parse/chunk/embed/index` 上传消化链路已通，解析结果会落到 `document_pages / document_blocks / document_chunks / citation_anchors`，并同步进入 Qdrant。
- 文档阅读页已经支持 PDF 基础阅读、解析块查看和按引用锚点回跳，但仍没有 bbox 级高亮与更细粒度定位。
- 系统参数页和 `system_settings` 已经接管大部分 provider / infra 配置；`DATABASE_URL` 与 `AUTH_SECRET` 继续保持 env-only。
- 报告链路已具备“创建 -> 默认大纲 -> 章节生成 -> DOCX 导出”的基础版，但当前章节生成仍偏占位实现，不代表完整研究写作能力。
- parser 已有无文本 PDF 的 OCR 降级路径，但真实 OCR provider 仍未接入；当前仅有 `disabled/mock` 级别能力。
- OCR 下一步不再尝试本地 provider；待商业 API 方案确定后再接入，当前继续保持默认关闭。
- retrieval 已具备 dense + BM25 候选窗口混合打分 + 可选 DashScope rerank 的基础版，但仍未完成更完整的 sparse 候选扩展与回归。
- 去法律化重定位已完成大部分命名与主流程调整，但仍需继续做回归清理，避免通用定位被后续改动带偏。

## 2. 最近完成

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
- `f0e431a` Prioritize DashScope retrieval providers
- `70aa665` Add parser OCR fallback and grounded answer validation

## 3. 活跃待办

- 去法律化后的回归清理与文案收口
  - 继续检查其余页面和占位实现中的垂类默认文案
  - 回归补齐相关测试，防止后续再漂回法律垂类默认文案
- OCR 商业 API provider 方案待定
  - 当前继续保持 `disabled`
  - 候选方向优先考虑百炼，但在 provider 口径确认前暂不开发 OCR 接入
- sparse/BM25 混合检索深化
  - 当前已补 dense 候选窗口上的 BM25 打分
  - 后续仍需要更完整的 sparse 候选扩展与 rerank 回归测试
- SSE 工具时间线和 grounded answer 状态信息前端补齐。
- `search_web_general` / `search_statutes` / 报告章节生成仍有占位能力，需要后续逐步替换为真实 provider 或真实生成流程。

## 4. 下一步

默认按以下顺序推进：

1. 完成去法律化改造的剩余测试与文案清理
2. sparse/BM25 混合检索
3. Agent evidence dossier
4. SSE 工具时间线
5. OCR 商业 API provider 方案确认后再接入

## 5. 风险与注意事项

- 当前改造默认允许破坏性重置，不保留旧数据兼容层。
- 本地一键启动脚本只代管应用进程；基础设施默认通过 `pnpm infra:up` 拉起。
- `AUTH_SECRET` 不进入 `system_settings`。
- `/settings` 保存的是数据库配置，不会热更新到已运行进程。
- OCR 不要默认开启。
- OCR 当前明确保持 disabled，不应在未确认商业 provider 前继续扩展本地实现。
- PDF 阅读器当前仍是基础版，没有 bbox 级高亮。
- 对话“流式”接口当前仍是回放已落库消息，不应误判为完整 SSE 工具时间线能力。
