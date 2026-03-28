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

- 传统主链路已经具备基础可用性。
- 当前最缺的不是更多 agent 花样，而是资料管理 CRUD、报告编辑保存、真实文档阅读器和会话管理完善。

## 3. 最近完成

### 已完成

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

- 工作空间首页仍是基础工作台，不是最终桌面级 UX
- 文档页当前展示的是结构化解析文本，不是真实 PDF.js 阅读器
- 报告页支持生成与导出，但还不是“可编辑工作文档”

## 4. 活跃待办

### P0.1 资料管理 CRUD

状态：`pending`

范围：

- 文档删除
- 重命名
- 移动目录
- 文档类型/标签编辑

验收口径：

- 用户不需要离开 Web UI 就能完成基础资料整理
- 目录树和文档详情状态保持一致

### P0.2 报告编辑与保存

状态：`pending`

范围：

- 报告正文编辑
- 手动保存
- 分节内容二次编辑
- 基础版本/更新时间反馈

验收口径：

- 报告不是只读生成结果，而是可以继续工作的草稿

### P0.3 文档阅读器增强

状态：`pending`

范围：

- PDF.js 接入
- 页码跳转
- 锚点高亮
- 文本搜索

验收口径：

- 点击引用后能在真正阅读器中看到对应页和足够上下文

### P0.4 会话管理补齐

状态：`pending`

范围：

- 会话重命名
- 会话归档
- 更完整的会话列表/最近访问

验收口径：

- 工作空间中同时存在多个会话时仍可管理和回访

### P0.5 上传与任务反馈增强

状态：`pending`

范围：

- 更明确的失败原因展示
- 任务详情查看
- 手动刷新/重试入口

验收口径：

- 上传失败时用户知道失败在哪一步、下一步怎么做

## 5. 下一步

默认按以下顺序推进：

1. `P0.1 资料管理 CRUD`
2. `P0.2 报告编辑与保存`
3. `P0.3 文档阅读器增强`
4. `P0.4 会话管理补齐`
5. `P0.5 上传与任务反馈增强`

完成以上五项后，再继续：

1. parser 真实 OCR provider 接入（默认仍关闭）
2. sparse/BM25 混合检索
3. Agent evidence dossier
4. SSE 工具时间线

## 6. 风险与注意事项

- OCR 不要默认开启，避免给“本来可直接解析的上传链路”增加成本和时延。
- 现阶段的文档页是结构化阅读过渡方案；不要把它误当成最终 PDF 阅读器方案。
- grounded answer 已经开始收口，但前端还没显式展示 `confidence / unsupported_reason / missing_information`。
- `docs/legal-ai-assistant-architecture.md` 是历史调研/备选方案，不能再被当作当前实施口径。
