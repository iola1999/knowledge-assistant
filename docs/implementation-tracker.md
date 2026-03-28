# 实施跟踪

版本：v0.1  
日期：2026-03-28

> 本文件是项目的执行跟踪文档。
>
> - 当前阶段进度、活跃待办、下一步顺序，以本文件为准。
> - 产品目标以 [legal-ai-assistant-prd.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-prd.md) 为准。
> - 架构与实现约束以 [legal-ai-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-technical-design-nodejs.md) 为准。

## 1. 更新规则

每次阶段性任务完成后，至少同步更新以下内容：

1. `当前阶段`
2. `最近完成`
3. `活跃待办`
4. `下一步`

不要把同一份待办同时维护在多个文档里。  
`AGENTS.md` 和技术设计文档只保留高层优先级与约束，不重复维护操作级 backlog。

## 2. 当前阶段

当前阶段：`P0 Web / BFF 主链路拉通`

阶段目标：

- 先把“注册登录 -> 工作空间 -> 上传资料 -> 查看处理状态 -> 创建对话 -> 阅读文档 -> 回访报告”做顺。
- 在此基础上再继续补 parser、retrieval、grounded answer、agent 增强能力。

当前结论：

- 传统主链路已经具备较完整的基础可用性。
- 资料管理 CRUD 已补齐基础版。
- 第一版产品口径调整为“助手优先、问答优先”；报告保留 Agent 生成与导出，不做平台内编辑器。
- 会话管理已补齐基础版。
- 文档阅读器和上传任务反馈已补齐基础版。
- 本地开发一键启动脚本已补齐，联调不再需要手工逐个拉起 `web/worker/agent/parser`。
- 系统级 provider / infra 配置开始从 env 收敛到数据库 `system_settings`。
- 系统设置后台页已补齐基础版；大部分配置现在可在 `/settings` 页面维护，但仅超管可见。
- 工作空间主界面已重构为“先选空间 -> 左侧会话/设置 -> 中央问答主舞台”的助手式产品壳层，不再平铺功能卡片。
- 开发期基础设施推荐统一走 Docker Compose，而不是手工本机安装 Qdrant / MinIO。
- 当前最缺的不是更多 agent 花样，而是 parser/retrieval/grounded answer/SSE 这些“可信回答底座”能力。

## 3. 最近完成

### 已完成

- `working tree` `Move system config into database-backed settings`
  - 新增 `system_settings` 表承载系统级 provider / infra 参数
  - 建表后会立即补齐默认系统参数，避免出现“表已建但配置为空”的状态
  - `pnpm dev` / `pnpm dev:web` / `pnpm dev:worker` / `pnpm dev:agent` 启动前会自动补齐并加载系统参数
  - Web 端新增 `/settings` 页面和 `/api/system-settings` 接口，用于超管可视化维护系统参数
  - `.env.example` 收敛为最小配置；进程外只保留 `DATABASE_URL` 与 `AUTH_SECRET`
- `working tree` `Redesign workspace shell around assistant-first flow`
  - 登录后先进入 `/workspaces` 选择具体空间，再进入空间内的问答工作台
  - 空会话态改成大输入框的新问题页，提交首问后前端会自动创建会话
  - 空间内改成“顶部面包屑/空间切换 + 左侧历史会话 + 左侧当前空间设置 + 中央会话主舞台”的产品结构
  - 资料库、上传入口和空间名称维护统一收进 `/workspaces/[workspaceId]/settings`
  - 视觉设计系统同步收口到更轻、更规整的助手风格：弱化后台卡片感，统一边框、圆角、输入区、消息气泡和侧栏列表语言
- `working tree` `Migrate web styling to Tailwind design system`
  - `apps/web` 已接入 `Tailwind CSS v4 + @tailwindcss/postcss`
  - `globals.css` 收敛为 theme token 与 base 样式，不再承载整站组件样式
  - 共享视觉 token 和按钮/面板/input 等 primitive 收敛到 `apps/web/lib/ui.ts`
  - `auth / workspaces / settings / documents / reports` 页面与相关组件已迁到 Tailwind utility class，样式就近跟随组件维护
- `working tree` `Add Docker infra commands and dev guide`
  - 根目录新增 `pnpm infra:up` / `pnpm infra:down` / `pnpm infra:logs`
  - 新增本地开发指引文档，明确推荐“应用跑宿主机，依赖跑 Docker Compose”
- `working tree` `Add local development startup scripts`
  - 根目录新增 `pnpm dev` / `pnpm dev:status` / `pnpm dev:down`
  - 启动脚本会检查 `.env.local/.env`、本地基础设施连通性、数据库 schema 和对象存储 bucket
  - 当前策略是不自动代管 PostgreSQL / Redis / Qdrant / MinIO 进程；缺失时明确失败并给出缺口
- `working tree` `Add PDF viewer and upload job feedback`
  - 文档页接入基础版 PDF.js 阅读器
  - 支持页码跳转、页内文本搜索、按引用页打开
  - 上传任务支持详情查看、手动刷新和失败任务重试
- `working tree` `Finish workspace conversation management`
  - 会话支持重命名
  - 会话支持归档与恢复
  - 工作空间首页按活跃/已归档分组展示，并显示最近访问时间
- `working tree` `Implement document management CRUD`
  - 文档详情页支持重命名、移动目录、文档类型/标签编辑与删除
  - 目录树同步展示文档类型与标签
  - 文档路径/类型/标签变更后同步刷新 citation 元数据与 Qdrant payload
- `8753b7c` `Harden workspace main flow`
  - 工作空间首页补了对话创建入口、对话切换、目录树、报告回访入口
  - 文档详情页补了结构化正文阅读、页级分组、引用上下文展示
  - 上传表单补了错误处理和自动刷新
- `f0e431a` `Prioritize DashScope retrieval providers`
  - retrieval 改成百炼优先的 embedding / rerank provider
  - 未配置时回退本地 hashed embedding + heuristic rerank
- `70aa665` `Add parser OCR fallback and grounded answer validation`
  - parser 支持 `disabled/mock` OCR fallback
  - 最终回答走结构化 grounded answer，并收紧 citation 校验

### 已完成但仍属基础版

- 工作空间壳层已换成产品化结构，但视觉细节、快捷操作和会话筛选仍是基础版
- PDF 阅读器当前是基础版：已能渲染 PDF、页码跳转和文本搜索，但还没有 bbox 级高亮
- 文档标签当前保存在 `documents.tags_json`，还没有独立标签管理页和过滤器 UI
- 报告页支持生成与导出，但当前定位是结果页，不是在线编辑器
- 会话列表已支持重命名/归档，但还没有独立筛选、搜索和批量管理
- 上传任务已支持失败原因、详情和重试，但还没有独立任务中心页

## 4. 活跃待办

- parser 真实 OCR provider 接入，默认仍保持关闭。
- sparse/BM25 混合检索与 rerank 回归测试。
- SSE 工具时间线和 grounded answer 状态信息前端补齐。

## 5. 下一步

默认按以下顺序推进：

1. parser 真实 OCR provider 接入（默认仍关闭）
2. sparse/BM25 混合检索
3. Agent evidence dossier
4. SSE 工具时间线
5. 报告一键生成质量优化（不引入平台内编辑器）

## 6. 风险与注意事项

- 本地一键启动脚本只代管应用进程；基础设施默认通过 `pnpm infra:up` 拉起，而不是由应用脚本隐式代管。
- `AUTH_SECRET` 仍然不会进入 `system_settings`；它是启动根密钥，不应回存业务数据库。
- `/settings` 与 `/api/system-settings` 仅允许 `SUPER_ADMIN_USERNAMES` 中声明的注册用户名访问。
- `/settings` 保存的是数据库配置，不会热更新到已运行进程；保存后需要重启 `pnpm dev`。
- OCR 不要默认开启，避免给“本来可直接解析的上传链路”增加成本和时延。
- 现阶段的 PDF 阅读器仍是基础版；不要把“文本高亮近似定位”误当成最终 bbox 定位方案。
- grounded answer 已经开始收口，但前端还没显式展示 `confidence / unsupported_reason / missing_information`。
- `docs/legal-ai-assistant-architecture.md` 是历史调研/备选方案，不能再被当作当前实施口径。
