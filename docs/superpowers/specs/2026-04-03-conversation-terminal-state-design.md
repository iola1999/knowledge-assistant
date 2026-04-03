# 主会话链路终态/失败态收口设计

日期：2026-04-03
状态：已在对话中确认，待用户审阅

## 1. 背景

当前项目已完成主会话链路的大部分骨架：

- `web -> queue -> agent-runtime -> SSE -> completed/failed -> citations` 已贯通
- tool timeline、thinking、answer delta、终态事件都已接入
- retry、引用式 follow-up、会话附件、分享页、source panel 已有第一版

但主链路终态仍有一个关键缺口：用户点击“停止生成”时，当前实现只是 Web 侧直接把 streaming assistant 收口为 `completed`，并不是真正的 provider-side cancel。这会带来三类问题：

1. 用户可见状态与 provider 实际运行状态分裂
2. `completed / failed / stop` 语义不清，后续 regenerate 和恢复逻辑容易继续变脏
3. stopped 场景下正文与 citation 没有独立收口语义

本设计专注解决这个缺口，不扩展到 retrieval、OCR、parser 或 citation dossier 深化。

## 2. 目标

本轮要实现的目标：

- 用户点击“停止生成”时，优先执行真正的 Claude Agent SDK cancel，而不是只改数据库状态
- 引入一等 `stopped` assistant 终态，而不是复用 `completed` 或 `failed`
- `stopped` 回答保留已生成文本
- `stopped` 回答允许保留已经能校验通过的 citations，不保留未完成或未引用到正文的 evidence
- `stopped` 回答直接提供“重新生成”入口
- 会话页、SSE 重连、刷新后快照恢复、分享页、侧栏和页头都对 `stopped` 保持一致

本轮明确不做：

- evidence dossier/claim-to-evidence 新 UI
- OCR、bbox、高亮联动
- retrieval 深化
- 新的 provider 抽象层
- 与 stop 无关的 tool provider 深化

## 3. 已确认决策

### 3.1 方案

采用“方案 2：一等 `stopped` 终态，带真实 provider cancel”。

不采用轻量补丁方案，也不把这轮扩大成通用任务控制层重构。

### 3.2 用户确认的语义

- 要做真正的 stop；Claude Agent SDK 有 cancel 能力就必须接上
- stop 后最终状态不是 `completed`、不是 `failed`，而是正式的 `stopped`
- stopped 回答直接提供 regenerate
- stopped 回答保留已生成文本
- stopped 回答只保留“当前正文里已经能校验通过”的 citations

## 4. Claude Agent SDK cancel 能力确认

本项目当前锁定 `@anthropic-ai/claude-agent-sdk@0.2.85`。

通过官方文档与本地类型声明确认，当前版本已具备以下控制能力：

- `query()` 的 `options.abortController`
- `Query.interrupt()`
- `Query.stopTask(taskId)`
- `Query.close()`

因此本轮不需要先假设 SDK 没有取消能力。

## 5. 设计总览

本设计围绕四个层面收口：

1. 运行时控制面：把当前“只记录 active run ID”的 registry 升级为可取消的 run controller registry
2. 状态模型：新增 `stopped` message/run 终态与对应 SSE 终态事件
3. 部分 citation 物化：对 stopped 回答采用“前缀安全截断 + 只落合法引用”的局部 materialization
4. 前端收口：会话页、快照恢复、分享页、regenerate、sidebar/header 状态全部对齐 `stopped`

## 6. 运行时控制设计

### 6.1 新的 run controller registry

当前 `apps/agent-runtime/src/active-conversation-runs.ts` 只保存：

- `conversationId`
- `assistantMessageId`
- `runId`

本轮将其升级为运行时控制注册表，新增保存：

- `abortController`
- `queryHandle`
- `activeTaskIds`
- `stopRequestedAt`
- `state: running | stopping | stopped`

registry key 继续使用 `assistantMessageId + runId`，不改当前 run 作用域模型。

### 6.2 agent-runtime stop 控制面

当前 `agent-runtime` 只有：

- `POST /respond`
- `GET /health`

本轮新增：

- `POST /runs/stop`

请求体最少包含：

- `conversationId`
- `assistantMessageId`
- `runId`
- `requestedByUserId`

返回值分三类：

- `200 { ok: true, accepted: true }`
  说明已找到对应 live run，并开始执行真实 stop
- `409 { ok: false, error: ... }`
  当前消息不是可停止的 live run，或 run 已经结束
- `503 { ok: false, error: ... }`
  runtime 无法执行 stop

### 6.3 runtime 内部 stop 顺序

stop 请求命中 live run 后，`agent-runtime` 按以下顺序尝试取消：

1. 对当前已知 `taskId` 调 `query.stopTask(taskId)`
2. 调 `query.interrupt()`
3. 调 `abortController.abort()`
4. 若短超时内仍未退出，最后调用 `query.close()`

这个顺序的目的：

- 优先停止当前显式 task
- 再停止整轮查询
- 再用 abort signal 触发底层清理
- 最后才做强制 close

终态判定规则：

- 只有在 query 循环确认退出，或 runtime 已成功执行强制 `close()` 并完成本地清理后，才允许把消息收口为 `stopped`
- 如果 stop 控制链全部用尽后，run 仍然保持 live，不允许伪造 `stopped`
- 上述场景下，stop 请求返回显式错误；该 run 后续要么自然完成，要么按现有 lease/过期逻辑收敛到 `failed`

### 6.4 stop 请求的真相源

`POST /api/conversations/[conversationId]/stop` 不再直接把 assistant 写成终态。

改为：

1. Web 校验用户与 conversation 所有权
2. 找到当前最新 streaming assistant 及其 `run_id`
3. 转发 stop 请求到 `agent-runtime`
4. 返回“停止请求已接受/未接受”的结果
5. 由 `agent-runtime` 在真实 cancel 成功或确认结束后统一落 `stopped` 终态与 SSE 事件

这使得 provider cancel 的真相源回到 runtime，而不是 Web route。

### 6.5 runtime 缺失控制句柄时的行为

如果 stop 请求到达时，`agent-runtime` 找不到对应的 live query handle：

- 不允许伪造 `stopped`
- stop API 返回显式错误
- 当前消息继续保持原状，后续由既有 lease/过期逻辑收敛到 `failed` 或继续完成

这是为了保持“真正 stop”语义，不回退到“只改数据库状态”的假停止。

## 7. 状态模型与 SSE 契约

### 7.1 新增状态

本轮新增一等状态：

- `MESSAGE_STATUS.STOPPED`

不新增持久化的 `stopping` 状态。`stopping` 只作为前端本地 UI 文案和 runtime status 文案存在。

### 7.2 stopped 的持久化元数据

assistant `structured_json` 新增 stopped 元数据：

- `stop_reason: "user_requested"`
- `stopped_at`
- `partial_completion: true`
- 可选 `stopped_by_user_id`

若当前 run state 中仍存在 active tool / task / thinking step，终态落库时全部关闭。

### 7.3 新增 SSE 终态事件

新增终态事件：

- `run_stopped`

形状尽量对齐 `run_failed`：

- `conversation_id`
- `message_id`
- `status: "stopped"`
- `content_markdown`
- `structured`
- `citations`
- `reason: "user_requested"`

不复用 `answer_done`。`answer_done` 继续只表示 `completed`。

### 7.4 DB 快照恢复

`/api/conversations/[conversationId]/stream` 的快照恢复层要支持：

- assistant message status 为 `stopped` 时，构造 `run_stopped`
- SSE 重连时，前端可从数据库直接恢复到 stopped 最终态

## 8. stopped 回答的部分 citation 物化

### 8.1 总原则

`completed` 回答继续保持现有 fail-closed 语义。

`stopped` 回答改为“前缀安全截断 + 只落合法引用”的局部 materialization：

- 保留当前已生成正文的可安全前缀
- 只保留正文中已合法引用且能在 evidence registry 中解析成功的 citations
- 不把未完成的 evidence、未引用到正文的 evidence、非法 citation token 一起落成成功结果

### 8.2 处理步骤

对 stop 时刻的正文快照执行：

1. 提取当前正文中的原始 `[[cite:N]]`
2. 仅保留能在当前 evidence registry 中解析成功的 citation
3. 若正文尾部存在半截 citation token、半段 markdown 结构、明显被中断的尾部文本，则从最近安全边界向前裁掉
4. 对截断后的正文重新做 citation marker 归一化与 ordinal 重排
5. 仅对正文中实际还引用到的 citation 落 `message_citations`

### 8.3 安全边界

裁剪优先级：

1. 完整段落结尾
2. 句号 / 问号 / 叹号 / 换行
3. 最后一个合法 citation token 之后

### 8.4 completed 与 stopped 的差异

对 `completed`：

- 继续严格 fail-closed
- 缺失 marker、未知 citation id、引用校验失败，都进入 `failed`

对 `stopped`：

- 不把整轮直接打成 `failed`
- 只保留能通过校验的安全前缀
- 非法或未完成部分从最后一个安全边界往前裁掉

### 8.5 无可保留 citations 的 stopped 回答

如果 stop 时没有形成任何可合法保留的 citation：

- 仍可保留已生成文本
- `message_citations` 为空
- sources panel 为空
- UI 明确提示“该回答已停止，仅保留已生成内容，引用可能不完整”

## 9. 前端行为设计

### 9.1 会话页

用户点击停止后：

1. 本地进入“正在停止”态
2. 按钮禁用，避免重复请求
3. 收到 `run_stopped` 后，当前 assistant 收口为终态 `stopped`

`stopped` assistant 的表现：

- 展示已生成文本
- 展示已保留的 citations/source panel
- 展示显式“已停止”标识
- 提供 regenerate
- 不使用 `failed` 的错误样式

### 9.2 regenerate

`findRetryableConversationTurn()` 的语义扩展为：

- `failed` 可 regenerate
- `stopped` 也可 regenerate

用户停止后的最新 assistant，应直接看到 regenerate 入口。

### 9.3 sidebar/header/local optimistic state

stop 终态到达后：

- 侧栏会话 responding/loading 态结束
- 页头最后更新时间、消息数等本地状态同步收口
- 当前 session snapshot 切换到 `stopped`

### 9.4 分享页

分享页与主会话页对 `stopped` 保持一致：

- 显示 stopped 正文
- 显示保留下来的 citations
- 内部资料仍不可跳转，外部网页链接仍可打开

不允许主会话页和分享页对同一条消息产生不同终态语义。

## 10. 迁移与代码组织

### 10.1 涉及模块

- `packages/contracts`
  - status / event constants
  - stream schema
  - message state helpers
  - stopped 终态与部分 materialization 的纯函数
- `packages/db`
  - `messages.status` 支持 `stopped`
  - 仅在实现引入新的数据库约束、字段或 supporting storage 时才需要 versioned SQL migration
- `apps/agent-runtime`
  - run controller registry
  - runtime stop endpoint
  - query cancel 接入
  - stopped 终态落库与 `run_stopped` 广播
- `apps/web`
  - stop route 改为请求 runtime stop
  - stream 快照恢复支持 `stopped`
  - `ConversationSession` / sidebar / share page / retry 状态对齐

### 10.2 拆分原则

避免把 stopped 规则埋在 route handler 或大函数分支里。优先抽成：

- 运行时控制模块
- stopped materialization 纯函数
- stopped stream event builder
- 前端 stopped 状态 reducer / session helper

补充说明：

- 目前 `messages.status` 在数据库层是 `varchar`，新增 `stopped` 这一取值本身不要求 SQL migration
- 如果实现中顺手引入了新的 DB check constraint、控制表、停止请求持久化字段或其他结构变更，则必须补对应 migration

## 11. 测试计划

### 11.1 contracts / pure logic

- `MESSAGE_STATUS.STOPPED` 与 `CONVERSATION_STREAM_EVENT.RUN_STOPPED` schema
- stopped partial materialization
- 非法/半截 citation token 的安全截断
- stopped 与 failed/completed 的状态映射差异

### 11.2 agent-runtime

- stop 请求命中当前 `assistant_message_id + run_id`
- runtime 按顺序尝试 `stopTask -> interrupt -> abortController -> close`
- stop 后 assistant 落 `stopped`
- stop 后广播 `run_stopped`
- stop 后仅保留正文中合法引用到的 citations
- stop 后旧 run 继续吐流也不会再写库
- controller 缺失时返回显式错误，不伪造 stopped

### 11.3 web

- stop route 不再直接 finalize message
- stream 快照恢复可恢复 stopped
- `ConversationSession` 收到 `run_stopped` 后本地收口
- stopped assistant 显示 regenerate
- share page 对 stopped 一致渲染

### 11.4 回归

- `completed` 继续 fail-closed
- `failed` 重试不回归
- 普通 `answer_done` / `run_failed` 不回归
- sidebar/header/local optimistic state 在 stopped 场景不漂移

## 12. 验收口径

以下结果同时满足，视为本轮完成：

1. 用户点击停止后，当前回答不再继续增长
2. 终态是 `stopped`
3. 已生成正文可见
4. 只有已合法引用到正文的 sources 会保留
5. stopped 回答可以直接重新生成
6. 刷新页面、重连 SSE、打开分享页时，正文、状态、citations 一致
7. 若 runtime 找不到 live controller，系统显式报错而不是伪造 stopped

## 13. 风险

- 新增 `stopped` 会影响 status 枚举、前端分支和 SQL migration，必须统一改完
- stop 的真相源迁到 runtime 后，Web route 与 runtime 之间需要新的控制接口
- partial materialization 的边界处理若写得含糊，容易把 stopped 变成“半真半假”的引用结果
- 若 Claude Agent SDK 在个别场景下 `interrupt()` 不足以立即结束，必须保留 `abortController` 与 `close()` 兜底

## 14. 本轮不延伸的问题

这些问题在本轮有意不处理：

- evidence dossier 新界面
- share 页额外的 stopped 专属视觉设计
- parser/OCR/retrieval 深化
- 通用 provider stop 抽象
- 更完整的 tracing span 树
