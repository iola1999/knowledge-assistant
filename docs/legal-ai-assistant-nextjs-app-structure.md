# 律师 AI 助手 Next.js App Router 结构

版本：v0.1  
日期：2026-03-28

> 文档角色说明：
>
> - 本文件只负责 Next.js 页面、Route Handler、Server/Client 边界建议。
> - 当前页面实现进度和阶段优先级，请看 [implementation-tracker.md](/Users/fan/project/tmp/law-doc/docs/implementation-tracker.md)。
> - 如果目录结构建议与当前代码不完全一致，以当前代码和 [legal-ai-assistant-technical-design-nodejs.md](/Users/fan/project/tmp/law-doc/docs/legal-ai-assistant-technical-design-nodejs.md) 为准。

## 1. 目标

- 用 Next.js 作为 Web + BFF。
- 页面、Route Handler、Server Component、Client Component 职责清晰。
- 所有知识库和会话入口都围绕 `workspaceId`。

## 2. 推荐目录

```text
apps/web/
├─ app/
│  ├─ (auth)/
│  │  ├─ login/page.tsx
│  │  └─ register/page.tsx
│  ├─ (dashboard)/
│  │  ├─ layout.tsx
│  │  ├─ settings/page.tsx
│  │  ├─ workspaces/page.tsx
│  │  ├─ workspaces/new/page.tsx
│  │  ├─ workspaces/[workspaceId]/page.tsx
│  │  ├─ workspaces/[workspaceId]/settings/page.tsx
│  │  ├─ workspaces/[workspaceId]/documents/[documentId]/page.tsx
│  │  └─ workspaces/[workspaceId]/reports/[reportId]/page.tsx
│  ├─ api/
│  │  ├─ auth/[...nextauth]/route.ts
│  │  ├─ system-settings/route.ts
│  │  ├─ workspaces/route.ts
│  │  ├─ workspaces/[workspaceId]/route.ts
│  │  ├─ workspaces/[workspaceId]/tree/route.ts
│  │  ├─ workspaces/[workspaceId]/uploads/presign/route.ts
│  │  ├─ workspaces/[workspaceId]/documents/route.ts
│  │  ├─ workspaces/[workspaceId]/documents/[documentId]/route.ts
│  │  ├─ workspaces/[workspaceId]/conversations/route.ts
│  │  ├─ workspaces/[workspaceId]/reports/route.ts
│  │  ├─ conversations/[conversationId]/route.ts
│  │  ├─ conversations/[conversationId]/messages/route.ts
│  │  ├─ conversations/[conversationId]/stream/route.ts
│  │  ├─ reports/[reportId]/outline/route.ts
│  │  ├─ reports/[reportId]/sections/[sectionId]/generate/route.ts
│  │  ├─ reports/[reportId]/export-docx/route.ts
│  │  ├─ anchors/[anchorId]/route.ts
│  │  └─ document-jobs/[jobId]/route.ts
│  ├─ layout.tsx
│  └─ globals.css
├─ components/
│  ├─ chat/
│  ├─ documents/
│  ├─ reports/
│  ├─ workspaces/
│  └─ shared/
├─ lib/
│  ├─ auth/
│  ├─ db/
│  ├─ sse/
│  ├─ api/
│  ├─ ui.ts
│  └─ guards/
└─ hooks/
```

前端样式约束补充：

- Web 端统一使用 `Tailwind CSS v4`。
- `app/globals.css` 只保留 theme token 与 base reset，不再堆积页面级/组件级样式。
- 共享设计 token、按钮和面板等 primitive 放在 `lib/ui.ts`。
- 页面和组件样式优先跟随组件本身维护，而不是回到单一大 CSS 文件。

## 3. 页面职责

### 3.1 `/workspaces`

用途：

- 登录后的空间选择页
- 新建工作空间入口
- 不再承载资料上传、系统运营等后台功能

组件建议：

- `WorkspaceSelector`
- `CreateWorkspaceEntry`

### 3.2 `/settings`

用途：

- 维护系统级 provider / infra 参数
- 明确区分 env-only 启动根配置与数据库可运营配置
- 仅向 `SUPER_ADMIN_USERNAMES` 中声明的超管用户名开放

组件建议：

- `SystemSettingsForm`
- `SystemSettingsNotice`

### 3.3 `/workspaces/[workspaceId]`

用途：

- 空间内的问答主工作台
- 顶部面包屑 / 空间切换
- 左侧历史会话、左侧当前空间设置、底部用户信息
- 中央主舞台根据是否选中会话展示“新问题页”或“会话页”

组件建议：

- `WorkspaceShell`
- `ConversationSidebar`
- `ChatStage`
- `Composer`

### 3.4 `/workspaces/[workspaceId]/settings`

用途：

- 当前空间设置页
- 维护空间名称、说明、资料库、上传入口和处理状态
- 作为左侧“当前空间设置”二级入口的落点页

### 3.5 `/workspaces/[workspaceId]/documents/[documentId]`

用途：

- 单文档深度阅读
- 支持从 citation 跳入

### 3.6 `/workspaces/[workspaceId]/reports/[reportId]`

用途：

- 报告结果查看
- 分节生成
- 导出

## 4. Route Handler 职责

### 4.1 工作空间类

- `POST /api/workspaces`
  - 创建工作空间
- `GET /api/workspaces`
  - 列出当前用户工作空间
- `GET /api/workspaces/:workspaceId`
  - 读取工作空间详情
- `PATCH /api/workspaces/:workspaceId`
  - 更新工作空间名称、说明和行业

### 4.1A 系统设置类

- `GET /api/system-settings`
  - 读取当前系统参数，仅超管可调用
- `PATCH /api/system-settings`
  - 更新系统参数，仅超管可调用

### 4.2 上传与知识库类

- `POST /api/workspaces/:workspaceId/uploads/presign`
  - 返回 S3 presigned URL
- `POST /api/workspaces/:workspaceId/documents`
  - 创建文档和 ingest job
- `PATCH /api/workspaces/:workspaceId/documents/:documentId`
  - 更新文档名称、目录、类型、标签
- `DELETE /api/workspaces/:workspaceId/documents/:documentId`
  - 删除文档、版本和索引
- `GET /api/workspaces/:workspaceId/documents/:documentId/content`
  - 返回 PDF / 原始文件内容给阅读器
- `GET /api/workspaces/:workspaceId/tree`
  - 返回目录树
- `GET /api/document-jobs/:jobId`
  - 查询异步任务进度
- `POST /api/document-jobs/:jobId/retry`
  - 重新提交失败任务

### 4.3 对话类

- `POST /api/workspaces/:workspaceId/conversations`
  - 创建对话
- `GET /api/conversations/:conversationId`
  - 获取对话基础信息
- `PATCH /api/conversations/:conversationId`
  - 重命名、归档或恢复会话
- `DELETE /api/conversations/:conversationId`
  - 删除会话
- `POST /api/conversations/:conversationId/messages`
  - 发送一条用户消息
- `GET /api/conversations/:conversationId/stream`
  - SSE 推流工具状态和最终回答

### 4.4 阅读与引用类

- `GET /api/documents/:documentId`
  - 获取文档详情与版本信息
- `GET /api/anchors/:anchorId`
  - 获取引用锚点定位信息

### 4.5 报告类

- `POST /api/workspaces/:workspaceId/reports`
  - 创建报告
- `POST /api/reports/:reportId/outline`
  - 生成大纲
- `POST /api/reports/:reportId/sections/:sectionId/generate`
  - 生成某个章节
- `POST /api/reports/:reportId/export-docx`
  - 导出 DOCX

## 5. Server / Client 边界

### 5.1 Server Components

优先放：

- 工作空间列表页
- 工作空间页面首屏数据
- 文档详情页首屏
- 报告详情页首屏

原因：

- 适合首屏数据获取
- 降低客户端 bundle

### 5.2 Client Components

必须放：

- Chat composer
- SSE 对话流
- PDF viewer
- 目录树交互
- 上传进度组件

## 6. SSE 事件建议

`GET /api/conversations/:conversationId/stream` 推荐输出：

```text
event: tool_start
data: {"tool":"search_workspace_knowledge"}

event: tool_result
data: {"tool":"search_workspace_knowledge","count":6}

event: answer_delta
data: {"delta":"根据当前资料..."}

event: answer_done
data: {"message_id":"msg_xxx"}
```

## 7. 权限守卫

每个 Route Handler 都至少做两件事：

1. 校验登录态。
2. 校验目标 `workspaceId` 是否属于当前用户。

不要只校验 `conversationId` / `documentId` 是否存在。
必须追溯到 `workspace` 归属。

## 8. 建议的实现顺序

1. `/workspaces`
2. `/workspaces/[workspaceId]`
3. `/workspaces/[workspaceId]/settings`
4. 上传相关 API
5. 对话相关 API
6. 引用跳转 API
7. 报告页面和导出
