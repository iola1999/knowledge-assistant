# 通用知识库 Agent 助手 Next.js App Router 结构

版本：v0.5
日期：2026-03-29

> 文档角色说明：
>
> - 本文件描述 Web/BFF 层的页面与 Route Handler 组织方式。
> - 当前页面实现进度请看 [implementation-tracker.md](/Users/fan/project/tmp/law-doc/docs/implementation-tracker.md)。

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
- `/api/workspaces/[workspaceId]/attachments/presign`
- `/api/workspaces/[workspaceId]/attachments`
- `/api/workspaces/[workspaceId]/documents`
- `/api/workspaces/[workspaceId]/tree`
- `/api/workspaces/[workspaceId]/conversations`
- `/api/conversations/[conversationId]/messages`
  - 写入 user message
  - 创建 assistant placeholder
  - 入队 `conversation.respond`
- `/api/conversations/[conversationId]/stream`
  - 轮询数据库里的 `tool` 消息和 assistant draft
  - 推送 `answer_delta` / `answer_done` / `run_failed`
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
