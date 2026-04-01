# Live Streaming Review Handoff

日期：2026-03-31

> 历史交接文档。
>
> - 本文只记录 2026-03-31 这一轮 live streaming review 的上下文。
> - 后续已经继续演进出 single-pass citations、`llm_model_profiles` 多模型管理、会话附件预载与按页读取等实现。
> - 当前事实来源请优先看 [anchor-desk-technical-design-nodejs.md](./anchor-desk-technical-design-nodejs.md) 和 [implementation-tracker.md](./implementation-tracker.md)。

## 1. 背景

这批变更是在已经上线的“token 级流式回答”基础上，针对一次内部 review 提出的 4 个问题做的收口：

1. retry 会复用旧 stream 历史，导致旧 run 的 live event 污染新 run
2. SSE fallback 会扫描整段会话的所有 tool message，而不是当前 assistant/current run
3. grounded final answer 失败时会静默回退为 completed draft，违反显式失败语义
4. `answer_delta` 事件虽然带了 `delta_text`，但实际仍按全文快照反复推送，导致流式路径 payload 和渲染成本过高

这次不是 UI 微调，而是对 live transport / run identity / fallback 语义做了较大收敛。

## 2. 本次设计决策

### 2.1 assistant message 和 run 的关系

- `assistant_message_id` 代表“这条 assistant 回答消息”
- `run_id` 代表“这条消息当前的某一次运行”
- retry 同一条 assistant message 时，不新建 assistant message，而是生成新的 `run_id`
- BullMQ job、Redis stream、tool timeline、SSE fallback、前端重试恢复，全部按 `assistant_message_id + run_id` 对齐

### 2.2 grounded final answer 的失败语义

- 之前：最终 grounded answer 渲染失败时，静默回退到 draft 并以 completed 结束
- 现在：最终 grounded answer 阶段 fail-closed
- 缺 key、Anthropic stream 报错、render 阶段异常，都会走 `run_failed` / assistant failed

### 2.3 answer delta 的传输语义

- live path 下，`answer_delta` 事件现在优先只传 `delta_text`
- `content_markdown` 仍保留给 DB snapshot 恢复和必要的 full-state fallback
- 前端在 live path 上按 `delta_text` 追加，不再每个 chunk 全文覆盖

### 2.4 tool timeline 的范围

- 新写入的 tool message 都带：
  - `assistant_message_id`
  - `assistant_run_id`
- SSE fallback 只读取当前 assistant 的当前 run 的 tool message
- 刷新页面后，`groupAssistantProcessMessages()` 也会优先按 `assistant_message_id + assistant_run_id` 过滤，只保留当前 run

## 3. 关键文件

### contracts / queue

- `packages/contracts/src/conversation-run.ts`
- `packages/contracts/src/conversation-run.test.ts`
- `packages/queue/src/index.ts`
- `packages/queue/src/conversation-events.ts`

### runtime

- `apps/agent-runtime/src/process-conversation-job.ts`
- `apps/agent-runtime/src/process-conversation-job.test.ts`
- `apps/agent-runtime/src/final-answerer.ts`
- `apps/agent-runtime/src/final-answerer.test.ts`
- `apps/agent-runtime/src/timeline.ts`
- `apps/agent-runtime/src/timeline.test.ts`

### web api / sse

- `apps/web/app/api/conversations/[conversationId]/messages/route.ts`
- `apps/web/app/api/conversations/[conversationId]/retry/route.ts`
- `apps/web/app/api/conversations/[conversationId]/stop/route.ts`
- `apps/web/app/api/conversations/[conversationId]/stream/route.ts`

### frontend session / timeline

- `apps/web/components/chat/conversation-session.tsx`
- `apps/web/lib/api/conversation-session.ts`
- `apps/web/lib/api/conversation-session.test.ts`
- `apps/web/lib/api/conversation-process.ts`
- `apps/web/lib/api/conversation-process.test.ts`

### docs

- `docs/anchor-desk-technical-design-nodejs.md`
- `docs/implementation-tracker.md`
- `docs/anchor-desk-nextjs-app-structure.md`

## 4. 你应该重点 review 什么

请重点 challenge 下面这些点，而不是只看语法或样式：

1. `run_id` 传播是否完整
   - 新消息
   - retry
   - stop
   - worker 执行中断
   - expired run fallback
   - live event append / read

2. 旧 job 是否还有机会误写新 run
   - worker 现在会校验 DB 中 assistant 的当前 `run_id`
   - 请确认所有关键持久化前都做了正确断言，而不是只在入口检查一次

3. SSE route 的 snapshot/live 拼接是否还有重复或漏事件
   - 特别看 reconnect、idle poll、terminal event、DB fallback 四种路径
   - 重点看 `streamCursor` 与 terminal structured state 中 `stream_event_id` 的关系是否一致

4. terminal assistant 保留 run structured state 是否合理
   - completed / failed / stop 后，不再把 `structuredJson` 清空
   - 现在会保留 `run_id` 和最后 `stream_event_id`，同时清掉 live-only fields
   - 请确认这不会影响别的旧逻辑

5. grounded final answer 改成 fail-closed 后，是否存在产品或恢复路径上的新问题
   - 当前行为是：最终 grounding 阶段失败，则整轮失败
   - 请确认这与当前 P0 “显式失败、不伪造成功”目标一致

6. 前端按 `delta_text` 追加后，是否还有 UI 状态错位
   - runtime status 文案
   - retry 后 session reset
   - terminal event 覆盖本地内容
   - stop 后立即 completed 的本地收口

7. tool timeline 的 current-run 过滤是否存在刷新后丢信息风险
   - 现在会丢掉旧 run 的 tool timeline
   - 这是有意行为，但请确认不会误丢“本应保留的当前可见调试信息”

## 5. 已知仍未处理的点

- `stop` 仍然是协作式 stop，不是 provider-side cancel
- 这次没有实现 EventSource 自定义 `cursor/runId` 前端显式持久化，仍主要依赖 SSE `Last-Event-ID` 和 DB snapshot 恢复
- 没有引入新的 DB schema；tool timeline 的 run 归属仍放在 `messages.structured_json`

## 6. 建议 reviewer 的检查顺序

1. 先看 `packages/contracts/src/conversation-run.ts`
2. 再看 `apps/web/app/api/conversations/[conversationId]/messages/route.ts`
3. 再看 `apps/web/app/api/conversations/[conversationId]/retry/route.ts`
4. 再看 `apps/agent-runtime/src/process-conversation-job.ts`
5. 再看 `apps/web/app/api/conversations/[conversationId]/stream/route.ts`
6. 最后看 `apps/web/components/chat/conversation-session.tsx` 和 `apps/web/lib/api/conversation-process.ts`

## 7. 验证结果

本地已通过：

- `pnpm test:ts`
- `pnpm typecheck`
- `pnpm build:web`

## 8. 期望 reviewer 输出

我希望第二个 AI 的 review 重点输出：

1. 真正的 correctness 风险
2. 重试 / reconnect / stop / terminal fallback 的行为缺口
3. 数据契约是否还有不一致
4. 有没有我这次为了收敛问题而引入的新复杂度或隐患

不需要把精力放在纯风格问题或命名偏好上。
