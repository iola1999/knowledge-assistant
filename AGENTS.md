# AGENTS

本文件定义本仓库中 agent / 协作者的默认工作方式。目标是让后续开发始终以 `docs/` 为事实来源，并按 TDD 稳定推进。

## 1. 先看什么

开始任何任务前，先按这个顺序阅读需求与设计：

1. [docs/anchor-desk-technical-design-nodejs.md](./docs/anchor-desk-technical-design-nodejs.md)
   用它作为当前实现的主设计文档和架构/约束文档。
2. [docs/implementation-tracker.md](./docs/implementation-tracker.md)
   用它作为当前阶段进度、活跃待办和下一步执行顺序文档。
3. [docs/development-setup.md](./docs/development-setup.md)
   当任务涉及本地启动、Docker 依赖、开发环境配置或系统参数时必读。
4. [docs/anchor-desk-prd.md](./docs/anchor-desk-prd.md)
   用它确认 P0/P1 范围、业务目标、用户场景和验收口径。
5. [docs/anchor-desk-erd.md](./docs/anchor-desk-erd.md)
   当任务涉及 schema、索引、检索、引用链路时必读。
6. [docs/anchor-desk-mcp-tools.md](./docs/anchor-desk-mcp-tools.md)
   当任务涉及 agent tool、返回结构、错误模型时必读。
7. [docs/anchor-desk-citation-debugging.md](./docs/anchor-desk-citation-debugging.md)
   当任务涉及 grounded answer、citation、source panel、阅读器引用跳转或相关排障时必读。
8. [docs/anchor-desk-nextjs-app-structure.md](./docs/anchor-desk-nextjs-app-structure.md)
   当任务涉及页面、Route Handler、SSE、组件边界时必读。
9. [docs/anchor-desk-architecture.md](./docs/anchor-desk-architecture.md)
   这是通用背景文档；需要宏观权衡时参考，不要优先于 Node.js 技术设计文档。
10. [.impeccable.md](./.impeccable.md)
   **任何涉及前端 UI、视觉风格、组件样式的任务必读。** 它定义了色彩系统、圆角/阴影/间距的具体数值、弹出面板/按钮/菜单项等组件的精确规格，以及文案规则。改 UI 前必须先读这个文件，确保新代码与已有视觉体系一致。

原则：

- 如果 `technical-design-nodejs` 和其他文档冲突，以 `technical-design-nodejs` 为准。
- 如果任务优先级、当前阶段状态、最近完成与其他文档冲突，以 `implementation-tracker` 为准。
- 如果文档和现有代码冲突，先确认哪边代表最新决策，再动代码。
- 仓库外的第三方框架 / SDK / 开源库事实来源，优先使用 `Context7` 查询对应官方文档与示例；不要只凭记忆猜 API。
- 不要跳过代码检查直接按文档想象实现。

## 2. 怎么看需求

收到任务后，先做四件事：

1. 确认任务属于哪一层：
   - 产品行为
   - 数据模型
   - 检索与解析
   - agent/tool
   - 前端交互
2. 在 `docs/` 中找到对应约束和事实来源。
3. 在代码里定位当前实现状态，不要假设“还没做”或“已经做完”。
4. 明确输出：
   - 本次要新增什么
   - 本次不处理什么
   - 对应测试要覆盖什么

如果需求会影响多层，先找主链路。当前项目的主链路长期保持为：

1. 先把对话主链路拉通并稳定完成态
2. 工具时间线、工具契约和错误态先可用
3. grounded final answer、citation 刷新和前端收尾体验
4. 检索与引用准确性
5. 文档解析与切块质量
6. 阅读器增强、报告深化和其他次要工具

补充约束：

- 当前阶段要求对话主链路按真实 provider 行为运行；缺少关键配置或 provider 不可用时应显式失败，通过 `web -> queue -> agent-runtime -> SSE -> completed/failed` 主链路暴露问题。
- 工具或回答失败时必须满足真实契约结构，不得伪造 citation、证据覆盖度或外部来源。
- 文档解析、切块质量和 OCR 相关工作当前默认暂缓；只有当它们直接阻断对话链路联调时才插队处理。

当前阶段到底先做哪几个子任务，以 `docs/implementation-tracker.md` 为准，不要在这里维护重复 backlog。

## 3. 怎么开发

默认使用 TDD。

开发顺序固定为：

1. 先写失败测试，或者先补暴露当前缺口的测试。
2. 写最小实现让测试通过。
3. 重构代码，把规则抽到可测试模块。
4. 跑局部测试。
5. 跑根目录质量门禁。

工程要求：

- 纯逻辑优先抽成独立函数，不要把关键规则埋在 route handler、worker 回调、React 事件处理器里。
- 新能力优先以“可测试模块 + 薄接线层”组织。
- 避免在业务代码里直接散落魔法字符串，尤其是 status、stage、event type、provider subtype、错误码和模式值这类会跨模块复用的领域字面量；凡是会被复用、参与分支判断、需要对齐契约或存在拼写漂移风险的值，都应优先提取为 `const as const` 或 enum，并从单一来源复用。
- 不为通过测试而写虚假实现；证据不足时宁可明确失败，也不要伪造成功结果。
- 当前阶段不再为非核心工具提供本地 mock 实现来打通链路；应直接开发真实 provider，或在证据/配置不足时明确失败。
- 涉及第三方开源库、框架、SDK 的 API、配置项、版本差异或弃用行为时，优先用 `Context7` 核对最新文档；`Context7` 仍不足以确认时，再回到该库官方文档、源码或 release note 交叉确认。
- 对上传、检索、回答、引用、导出这五条主链路的改动，必须伴随测试或补充测试计划。

前端 / UI 额外要求：

- 改 UI 前先检查 `apps/web/lib/ui.ts`、`apps/web/components/shared/**` 和同域已有组件；能复用现有组件/variant 时不要重写一套样式。
- 按钮、输入框、下拉、列表项、popover/menu、dialog 这类基础控件，优先通过扩展已有共享原语的 `variant` / `size` / `tone` 解决，不要为局部页面复制一份近似实现。
- 当同一种视觉/交互模式出现到第二处时，就应评估是否抽成共享组件或共享样式函数；不要等到项目里散落多份实现后再回收。
- 抽取共享组件时，先保持业务逻辑不变，优先抽“纯展示 + 轻交互”原语，再让页面接线层继续持有具体业务状态。
- 新增共享组件后，应立即把能直接复用的旧实现切过去，避免“新旧两套原语并存”。
- 前端设置页、表单页、空状态和帮助提示默认走“高信息密度、少废话”原则。
- 不要写“解释需求”“复述显而易见行为”“举一串示例来教用户理解字段”的提示语；没有直接操作价值的文案默认删除。
- 只有当文案会直接影响用户决策、风险认知或操作结果时，才允许保留一句必要提示。

## 4. 测试怎么写

### 4.1 TypeScript / Node.js

使用 `Vitest`。

适合写单测的对象：

- `apps/web/lib/**`
- `apps/worker/src/**` 中的纯函数
- `packages/**/src/**` 中的规则、检索、格式化、工具契约处理

偏好：

- 优先测试纯函数和规则，不要先碰数据库/网络集成。
- 如果文件里既有纯逻辑又有外部依赖，先拆模块再测。
- 测试命名要直接表达业务规则，例如：
  - “按目录构建树并保证目录在文件前”
  - “按章节切块时保留 heading_path”
  - “未检索到依据时返回空结果而不是伪造引用”

### 4.2 Python parser

使用 `unittest`。

适合先测：

- 文件类型识别
- 段落切分
- heading / clause 识别
- heading_path 层级构建
- DOCX 表格抽取顺序
- OCR/无文本 PDF 的失败与降级策略

原则：

- parser 的主流程也要测，不只测 `utils`。
- 对 OCR 未实现的路径，要明确断言失败行为，不要静默通过。
- OCR 默认保持关闭；只有扫描件、图片型 PDF 或无文本层材料才需要启用。

## 5. 怎么运行测试

根目录统一执行：

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
pnpm dev
pnpm dev:status
pnpm dev:down
pnpm setup:python
pnpm test
pnpm test:ts
pnpm test:python
pnpm coverage
pnpm coverage:ts
pnpm coverage:python
pnpm typecheck
pnpm check:python
pnpm build:web
pnpm verify
```

说明：

- `pnpm infra:up`
  使用 Docker Compose 启动 PostgreSQL / Redis / Qdrant / MinIO。
- `pnpm infra:down`
  停止开发期 Docker 基础设施。
- `pnpm infra:logs`
  查看开发期 Docker 基础设施日志。
- `pnpm dev`
  一键启动本地开发栈；会检查 `node_modules`、`.venv`、`.env.local/.env`，并在 `services/parser/requirements.txt` 变化时自动重跑 `pnpm setup:python`，随后执行 safe blocking upgrade、确保 bucket，再启动 `web` / `worker` / `agent-runtime` / `parser`。受管进程的日志与 PID 状态统一写到 `/tmp/anchordesk-dev/` 下，不再落在仓库内 `.dev/`。
- `pnpm dev:status`
  查看本地基础设施连通性与受管开发进程状态。
- `pnpm dev:down`
  停止 `pnpm dev` 拉起的本地开发进程。
- `pnpm setup:python`
  使用 `.venv` 安装 parser 依赖，优先选择 `python3.12`。
- `pnpm test`
  跑全部单测。
- `pnpm coverage`
  生成当前覆盖率基线。
- `pnpm verify`
  统一质量门禁，提交前必须通过。

配置约束补充：

- 大部分 provider / infra 参数放进 `system_settings` 表管理。
- `DATABASE_URL` 仍是启动根配置，必须在进程外提供。
- `AUTH_SECRET` 不放入业务数据库，也不做自动生成或本地回写；开发环境同样要求显式从 env / `.env.local` 提供。
- 第一个注册成功的用户会被持久化为 super admin（`users.is_super_admin = true`）；`/settings` 与全局资料库入口都依赖这个数据库标记授权，不再读取额外 env 白名单。
- 改 schema 时必须同时提交 `packages/db/drizzle/**` 中对应的 versioned SQL migration。
- `system_settings` 默认值在建表后立即补齐；日常优先通过 `/settings` 页面维护，而不是直接改库。

## 6. 提交前检查

提交前最少完成：

1. 相关测试通过。
2. `pnpm verify` 通过。
3. 文档是否需要同步更新：
   - 命令变更
   - 流程变更
   - 阶段计划变更
   - 事实来源变更

如果改动影响开发流程、CI、测试命令或下一阶段优先级，必须同步更新：

- `AGENTS.md`
- `docs/anchor-desk-technical-design-nodejs.md`
- `docs/implementation-tracker.md`

## 7. 当前重点

执行中的操作级优先级、最近完成和下一步顺序，统一维护在：

- [docs/implementation-tracker.md](./docs/implementation-tracker.md)

如果新任务不在 tracker 当前优先级上，需要先说明为什么值得插队。

当前 tracker 已明确收口为“对话链路优先、按真实 provider 开发、资料解析暂缓”。除非存在直接阻断，不要把 parser、OCR 或检索深化重新提到主线前面。
