# AnchorDesk Next.js App Router 结构

版本：v0.5
日期：2026-03-29

> 文档角色说明：
>
> - 本文件描述 Web/BFF 层的页面与 Route Handler 组织方式。
> - 当前页面实现进度请看 [implementation-tracker.md](./implementation-tracker.md)。

## 1. 目标

- Next.js 同时承担 Web UI 与轻量 BFF。
- 所有知识库和会话入口围绕 `workspaceId`。
- Server/Client 边界尽量清晰。

## 2. 主要页面

- `/account`
  - 账号与安全页
- `/workspaces`
  - 空间选择页
- `/settings`
  - 系统参数维护页
- `/workspaces/[workspaceId]`
  - 空间内问答工作台
- `/workspaces/[workspaceId]/settings`
  - 当前空间设置
- `/workspaces/[workspaceId]/knowledge-base`
  - 当前空间资料库
- `/workspaces/[workspaceId]/documents/[documentId]`
  - 单文档阅读页
- `/workspaces/[workspaceId]/reports/[reportId]`
  - 报告结果页
- `/share/[shareToken]`
  - 公开只读会话分享页，不要求登录

## 3. 主要 API

- `/api/account/password`
- `/api/system-settings`
- `/api/workspaces`
- `/api/workspaces/[workspaceId]`
- `/api/workspaces/[workspaceId]/uploads/presign`
  - 接收前端计算好的 `sha256`，为 `blobs/<sha256>` 返回 presigned PUT；若已有已验证 blob，可直接返回复用结果
- `/api/workspaces/[workspaceId]/directories`
- `/api/workspaces/[workspaceId]/attachments/presign`
  - 与资料库上传相同，但用于会话级临时附件
- `/api/workspaces/[workspaceId]/attachments`
- `/api/workspaces/[workspaceId]/documents`
- `/api/workspaces/[workspaceId]/knowledge-base/operations`
- `/api/workspaces/[workspaceId]/knowledge-base/download`
- `/api/workspaces/[workspaceId]/tree`
- `/api/workspaces/[workspaceId]/conversations`
- `/api/conversations/[conversationId]/messages`
  - 写入 user message
  - 创建 assistant placeholder
  - 入队 `conversation.respond`
- `/api/conversations/[conversationId]/stream`
  - 轮询数据库里的 `tool` 消息和 assistant draft
  - 推送 `answer_delta` / `answer_done` / `run_failed`
  - `answer_done` / `run_failed` 终态事件会附带最终 assistant 内容、structured state 和当前 message citations，供前端先切到本地最终态再刷新
- `/api/conversations/[conversationId]/retry`
  - 当最新 assistant 消息为 failed 时，复用上一条 user prompt 重新入队当前回答
- `/api/conversations/[conversationId]/share`
  - 查询当前会话分享状态
  - 创建或撤销公开分享链接
- `/api/workspaces/[workspaceId]/reports`
- `/api/reports/[reportId]/outline`
- `/api/reports/[reportId]/sections/[sectionId]/generate`
- `/api/reports/[reportId]/export-docx`

## 4. Server / Client 边界

Server Components：

- 工作空间列表首屏
- 工作空间主舞台首屏
- 文档详情首屏
- 报告详情首屏

Client Components：

- AccountPasswordForm
- Composer
- ConversationSession
- ConversationTimeline
- ConversationSharePopover
- PDF Viewer
- 临时附件上传与轮询状态
- 上传表单
- 会话操作与自动刷新

## 5. Web UI 复用约定

- **视觉规格以 [.impeccable.md](../.impeccable.md) 为准**。色彩系统、圆角/阴影/间距数值、弹出面板/按钮/菜单项等组件规格、文案规则都在该文件定义。改 UI 前必须先读。
- 基础 UI 原语优先集中在 `apps/web/lib/ui.ts` 与 `apps/web/components/shared/**`。
- 新页面或新组件落地前，先检查是否已有可复用的按钮、表单控件、popover/menu、dialog、列表行、状态 chip；优先复用已有实现或扩展已有 `variant` / `size` / `tone`。
- 不允许因为页面局部视觉差异就复制一套近似控件；若确实存在新模式，应先抽成共享原语，再在页面里接入。
- 当同一种 UI 模式出现到第二处时，应默认进入“抽取共享组件/共享样式”评估，而不是继续散写 className。
- 页面组件尽量保留为“业务编排 + 数据接线”，把可复用的呈现层和轻交互层下沉到共享组件，避免相同按钮/菜单/列表在多个页面各自维护。

## 6. 前端文案约束

- 设置页、表单页、空状态、帮助提示默认使用高信息密度文案，只保留字段名、当前状态、错误结果和直接影响操作的一句话。
- 不要在 UI 中写“解释需求”“复述已知行为”“示例堆砌式说明”这类提示语；没有直接操作价值的文案默认删除。
- 若确实需要补充提示，优先用短句说明风险、不可逆后果或提交结果，不写长段说明。
