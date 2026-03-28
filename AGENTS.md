# AGENTS

本文件定义本仓库中 agent / 协作者的默认工作方式。目标是让后续开发始终以 `docs/` 为事实来源，并按 TDD 稳定推进。

## 1. 先看什么

开始任何任务前，先按这个顺序阅读需求与设计：

1. [docs/legal-ai-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-technical-design-nodejs.md)
   用它作为当前实现的主设计文档和阶段计划文档。
2. [docs/legal-ai-assistant-prd.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-prd.md)
   用它确认 P0/P1 范围、业务目标、用户场景和验收口径。
3. [docs/legal-ai-assistant-erd.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-erd.md)
   当任务涉及 schema、索引、检索、引用链路时必读。
4. [docs/legal-ai-assistant-mcp-tools.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-mcp-tools.md)
   当任务涉及 agent tool、返回结构、错误模型时必读。
5. [docs/legal-ai-assistant-nextjs-app-structure.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-nextjs-app-structure.md)
   当任务涉及页面、Route Handler、SSE、组件边界时必读。
6. [docs/legal-ai-assistant-architecture.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-architecture.md)
   这是通用背景文档；需要宏观权衡时参考，不要优先于 Node.js 技术设计文档。

原则：

- 如果 `technical-design-nodejs` 和其他文档冲突，以 `technical-design-nodejs` 为准。
- 如果文档和现有代码冲突，先确认哪边代表最新决策，再动代码。
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

如果需求会影响多层，先找主链路。当前项目的主链路优先级长期保持为：

1. 先把传统前后端主工作流拉通
2. 文档解析与切块质量
3. 检索与引用准确性
4. grounded final answer
5. 工具时间线和阅读器体验
6. 其他增强型 UI 或次要工具

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
- 不为通过测试而写虚假实现；法律场景要宁可明确失败，也不要伪造成功结果。
- 对上传、检索、回答、引用、导出这五条主链路的改动，必须伴随测试或补充测试计划。

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
  - “条款切块时保留 heading_path”
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

- `pnpm setup:python`
  使用 `.venv` 安装 parser 依赖，优先选择 `python3.12`。
- `pnpm test`
  跑全部单测。
- `pnpm coverage`
  生成当前覆盖率基线。
- `pnpm verify`
  统一质量门禁，提交前必须通过。

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
- `docs/legal-ai-assistant-technical-design-nodejs.md`

## 7. 当前重点

截至当前阶段，下一批任务优先级如下：

1. web / BFF 主链路继续补齐：
   - 工作空间首用体验
   - 目录树、文档阅读、报告回访
   - 上传与处理状态的稳定反馈
2. parser 继续升级：
   - 真实 OCR provider 接入（保持当前 disabled/mock fallback 契约；默认不开）
   - 更稳的结构化 heading / table / block 映射
   - 页码与坐标质量提升
3. grounded final answer：
   - Agent SDK evidence dossier 输出
   - 结构化回答结果在 UI 中展示 `confidence / unsupported_reason / missing_information`
   - 继续补强 `anchor_id` 校验边界与测试
4. retrieval provider：
   - 百炼优先的 embedding / rerank 配置与观测
   - sparse/BM25 接入
5. 工具时间线 / SSE：
   - 工具开始、结束、回答流式增量
6. 文档阅读器能力：
   - 更真实的锚点跳转
   - 页内高亮

如果新任务不在这个优先级上，需要先说明为什么值得插队。
