# Conversation Runtime Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a single stuck provider call from starving `conversation.respond`, make stop/stale flows actually terminate in-flight Claude Agent SDK work, and harden SSE against writes after the stream is already closed.

**Architecture:** Keep the current `web -> BullMQ -> agent-runtime -> Redis Streams/SSE -> completed/failed` flow and fail-closed semantics. Add a bounded provider execution layer in `agent-runtime`, expose a narrow internal cancel path for active runs, and move raw SSE controller writes behind a tiny safe writer so terminal/abort races stop throwing `ERR_INVALID_STATE`.

**Tech Stack:** Next.js Route Handlers, BullMQ, Redis Streams, Drizzle ORM, Vitest, `@anthropic-ai/claude-agent-sdk`

---

### Task 1: Bound Provider Execution With Explicit Timeouts

**Files:**
- Create: `apps/agent-runtime/src/agent-query-guard.ts`
- Create: `apps/agent-runtime/src/agent-query-guard.test.ts`
- Modify: `apps/agent-runtime/src/run-agent-response.ts`
- Test: `apps/agent-runtime/src/agent-query-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";

import {
  AgentQueryTimeoutError,
  guardAgentQueryStream,
} from "./agent-query-guard";

async function collect<T>(iterable: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

describe("guardAgentQueryStream", () => {
  test("fails when the provider never yields its first event", async () => {
    async function* neverStarts() {
      await new Promise(() => undefined);
    }

    await expect(
      collect(
        guardAgentQueryStream(neverStarts(), {
          firstEventTimeoutMs: 5,
          idleTimeoutMs: 50,
          onTimeout: vi.fn(),
        }),
      ),
    ).rejects.toThrow(AgentQueryTimeoutError);
  });

  test("fails when the provider stream goes idle mid-run", async () => {
    async function* stallsAfterFirstChunk() {
      yield { type: "system", subtype: "init" };
      await new Promise(() => undefined);
    }

    await expect(
      collect(
        guardAgentQueryStream(stallsAfterFirstChunk(), {
          firstEventTimeoutMs: 50,
          idleTimeoutMs: 5,
          onTimeout: vi.fn(),
        }),
      ),
    ).rejects.toThrow("Claude Agent SDK query went idle.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/agent-runtime/src/agent-query-guard.test.ts`
Expected: FAIL because `agent-query-guard.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export class AgentQueryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentQueryTimeoutError";
  }
}

export async function* guardAgentQueryStream<T>(
  source: AsyncIterable<T>,
  input: {
    firstEventTimeoutMs: number;
    idleTimeoutMs: number;
    onTimeout?: (error: AgentQueryTimeoutError) => Promise<void> | void;
  },
) {
  const iterator = source[Symbol.asyncIterator]();
  let seenFirstEvent = false;

  const nextWithTimeout = async () => {
    const timeoutMs = seenFirstEvent
      ? input.idleTimeoutMs
      : input.firstEventTimeoutMs;

    const timeoutError = new AgentQueryTimeoutError(
      seenFirstEvent
        ? "Claude Agent SDK query went idle."
        : "Claude Agent SDK query timed out before first event.",
    );

    return Promise.race([
      iterator.next(),
      new Promise<IteratorResult<T>>((_, reject) => {
        const timer = setTimeout(async () => {
          await input.onTimeout?.(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  };

  try {
    while (true) {
      const result = await nextWithTimeout();
      if (result.done) {
        return;
      }
      seenFirstEvent = true;
      yield result.value;
    }
  } finally {
    await iterator.return?.();
  }
}
```

- [ ] **Step 4: Wire the guard into the live Claude Agent query**

Modify `apps/agent-runtime/src/run-agent-response.ts` so the SDK query is created with an explicit `AbortController`, then consumed through the guard:

```ts
const abortController = new AbortController();
const queryHandle = query({
  prompt,
  options: {
    ...claudeAgentQueryOptions,
    abortController,
  },
});

for await (const message of guardAgentQueryStream(queryHandle, {
  firstEventTimeoutMs: 15_000,
  idleTimeoutMs: 45_000,
  onTimeout: async (error) => {
    abortController.abort(error.message);
    queryHandle.close();
  },
})) {
  const textDelta = extractAssistantTextDelta(message);
  if (textDelta) {
    streamedAnswer += textDelta;
  }
}
```

Also normalize timeout failures into one user-facing error string, for example:

```ts
if (error instanceof AgentQueryTimeoutError) {
  throw new Error("模型供应商长时间未响应，当前回答已超时。");
}
```

- [ ] **Step 5: Run tests to verify it passes**

Run: `pnpm vitest run apps/agent-runtime/src/agent-query-guard.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/agent-runtime/src/agent-query-guard.ts apps/agent-runtime/src/agent-query-guard.test.ts apps/agent-runtime/src/run-agent-response.ts
git commit -m "fix: bound stuck agent provider streams"
```

### Task 2: Propagate Real Cancellation From Stop And Stale Expiry

**Files:**
- Modify: `apps/agent-runtime/src/active-conversation-runs.ts`
- Create: `apps/agent-runtime/src/active-conversation-runs.test.ts`
- Modify: `apps/agent-runtime/src/run-agent-response.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Create: `apps/web/lib/api/agent-runtime.ts`
- Create: `apps/web/lib/api/conversation-run-control.ts`
- Create: `apps/web/lib/api/conversation-run-control.test.ts`
- Modify: `apps/web/app/api/conversations/[conversationId]/stop/route.ts`
- Modify: `apps/web/app/api/conversations/[conversationId]/stream/route.ts`
- Test: `apps/agent-runtime/src/active-conversation-runs.test.ts`
- Test: `apps/web/lib/api/conversation-stop-route.test.ts`
- Test: `apps/web/lib/api/conversation-run-control.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test, vi } from "vitest";

import {
  cancelActiveConversationRun,
  registerActiveConversationRun,
} from "./active-conversation-runs";

describe("cancelActiveConversationRun", () => {
  test("invokes the registered cancel handler for the matching run", async () => {
    const cancel = vi.fn(async () => undefined);
    const unregister = registerActiveConversationRun({
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      cancel,
    });

    await expect(
      cancelActiveConversationRun({
        assistantMessageId: "assistant-1",
        runId: "run-1",
        reason: "user_stop",
      }),
    ).resolves.toBe(true);

    expect(cancel).toHaveBeenCalledWith("user_stop");
    unregister();
  });
});
```

Add a stop-route test that expects the web route to request runtime cancellation with the latest run ID:

```ts
expect(requestAgentRuntimeCancel).toHaveBeenCalledWith({
  assistantMessageId: "assistant-1",
  runId: "run-1",
  reason: "user_stop",
});
```

Add a stale-expiry test around `conversation-run-control.ts` that expects expiration to both mark the assistant failed and emit a cancellation request:

```ts
expect(requestAgentRuntimeCancel).toHaveBeenCalledWith({
  assistantMessageId: "assistant-1",
  runId: "run-1",
  reason: "stale_stream_expired",
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `pnpm vitest run apps/agent-runtime/src/active-conversation-runs.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-stop-route.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-run-control.test.ts`

Expected: FAIL because the cancel API surface does not exist yet.

- [ ] **Step 3: Extend the active run registry with cancel handles**

Update `apps/agent-runtime/src/active-conversation-runs.ts`:

```ts
export type ActiveConversationRun = {
  conversationId: string;
  assistantMessageId: string;
  runId: string;
  cancel?: (reason: string) => Promise<void> | void;
};

export async function cancelActiveConversationRun(input: {
  assistantMessageId: string;
  runId: string;
  reason: string;
}) {
  const run = activeConversationRuns.get(`${input.assistantMessageId}:${input.runId}`);
  if (!run?.cancel) return false;
  await run.cancel(input.reason);
  return true;
}
```

- [ ] **Step 4: Register a real provider-side cancel handler**

Modify `apps/agent-runtime/src/run-agent-response.ts` so each active run owns both an `AbortController` and the live query handle:

```ts
const abortController = new AbortController();
const queryHandle = query({
  prompt,
  options: {
    ...claudeAgentQueryOptions,
    abortController,
  },
});

const cancel = async (reason: string) => {
  abortController.abort(reason);
  queryHandle.close();
};
```

Then pass that `cancel` function into `registerActiveConversationRun(...)` from `process-conversation-job.ts`.

- [ ] **Step 5: Add an internal agent-runtime cancel endpoint**

Add a narrow Express endpoint in `apps/agent-runtime/src/index.ts`:

```ts
app.post("/runs/cancel", async (req, res) => {
  const cancelled = await cancelActiveConversationRun({
    assistantMessageId: String(req.body?.assistantMessageId ?? ""),
    runId: String(req.body?.runId ?? ""),
    reason: String(req.body?.reason ?? "manual_cancel"),
  });

  res.json({ ok: true, cancelled });
});
```

Add `apps/web/lib/api/agent-runtime.ts` as the only caller:

```ts
export async function requestAgentRuntimeCancel(input: {
  assistantMessageId: string;
  runId: string;
  reason: string;
}) {
  const baseUrl = process.env.AGENT_RUNTIME_BASE_URL ?? "http://127.0.0.1:4001";
  await fetch(`${baseUrl}/runs/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 6: Move web stop/expire logic behind one shared helper**

Create `apps/web/lib/api/conversation-run-control.ts`:

```ts
export async function cancelStreamingAssistantRun(input: {
  conversationId: string;
  assistantMessageId: string;
  runId: string | null;
  reason: "user_stop" | "stale_stream_expired";
}) {
  if (!input.runId) return;

  await requestAgentRuntimeCancel({
    assistantMessageId: input.assistantMessageId,
    runId: input.runId,
    reason: input.reason,
  }).catch(() => null);
}
```

Then:
- use it in `/stop` after the assistant row is finalized as completed
- use it in `/stream` immediately after a stale streaming run is converted to failed

This keeps the current database-first truth model while still terminating provider work in the background.

- [ ] **Step 7: Run tests to verify they pass**

Run:
- `pnpm vitest run apps/agent-runtime/src/active-conversation-runs.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-stop-route.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-run-control.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/agent-runtime/src/active-conversation-runs.ts apps/agent-runtime/src/active-conversation-runs.test.ts apps/agent-runtime/src/run-agent-response.ts apps/agent-runtime/src/index.ts apps/web/lib/api/agent-runtime.ts apps/web/lib/api/conversation-run-control.ts apps/web/lib/api/conversation-run-control.test.ts apps/web/app/api/conversations/[conversationId]/stop/route.ts apps/web/app/api/conversations/[conversationId]/stream/route.ts apps/web/lib/api/conversation-stop-route.test.ts
git commit -m "fix: propagate conversation run cancellation"
```

### Task 3: Make SSE Writes Safe After Client Abort Or Terminal Close

**Files:**
- Create: `apps/web/lib/api/sse-writer.ts`
- Create: `apps/web/lib/api/sse-writer.test.ts`
- Modify: `apps/web/app/api/conversations/[conversationId]/stream/route.ts`
- Test: `apps/web/lib/api/sse-writer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test, vi } from "vitest";

import { createSseWriter } from "./sse-writer";

describe("createSseWriter", () => {
  test("treats ERR_INVALID_STATE as a closed stream and stops writing", () => {
    const controller = {
      enqueue: vi
        .fn()
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          const error = new TypeError("Invalid state: Controller is already closed");
          (error as TypeError & { code?: string }).code = "ERR_INVALID_STATE";
          throw error;
        }),
      close: vi.fn(),
      error: vi.fn(),
    };

    const writer = createSseWriter(controller as never, new TextEncoder());

    expect(writer.comment("keepalive")).toBe(true);
    expect(writer.comment("keepalive")).toBe(false);
    expect(writer.isClosed()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web/lib/api/sse-writer.test.ts`
Expected: FAIL because `sse-writer.ts` does not exist yet.

- [ ] **Step 3: Write the minimal safe writer**

```ts
export function createSseWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  let closed = false;

  const write = (chunk: string) => {
    if (closed) return false;

    try {
      controller.enqueue(encoder.encode(chunk));
      return true;
    } catch (error) {
      if (
        error instanceof TypeError &&
        (error as TypeError & { code?: string }).code === "ERR_INVALID_STATE"
      ) {
        closed = true;
        return false;
      }

      throw error;
    }
  };

  return {
    isClosed: () => closed,
    event: (name: string, payload: unknown, id?: string | null) =>
      write(`${id ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`),
    comment: (text: string) => write(`: ${text}\n\n`),
    close: () => {
      if (closed) return false;
      closed = true;
      controller.close();
      return true;
    },
  };
}
```

- [ ] **Step 4: Replace raw controller operations in the stream route**

Update `apps/web/app/api/conversations/[conversationId]/stream/route.ts` so all writes go through the wrapper:

```ts
const writer = createSseWriter(controller, encoder);

function enqueueEvent(event: ConversationStreamEvent, id?: string | null) {
  return writer.event(event.type, event, id);
}
```

Then make the loop stop when the stream is already closed:

```ts
if (!writer.comment("keepalive")) {
  return;
}
```

Also do not call `controller.error(error)` if `writer.isClosed()` is already true.

- [ ] **Step 5: Run tests to verify it passes**

Run: `pnpm vitest run apps/web/lib/api/sse-writer.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/sse-writer.ts apps/web/lib/api/sse-writer.test.ts apps/web/app/api/conversations/[conversationId]/stream/route.ts
git commit -m "fix: harden conversation sse stream shutdown"
```

### Final Verification

**Files:**
- Modify: `apps/agent-runtime/src/process-conversation-job.test.ts`
- Modify: `apps/web/lib/api/conversation-stream.test.ts`
- Modify: `docs/implementation-tracker.md`

- [ ] **Step 1: Add one regression test for each user-visible failure mode**

```ts
test("a stuck provider fails the assistant run instead of blocking forever", async () => {
  await expect(
    processConversationResponseJob({
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      userMessageId: "user-1",
      runId: "run-1",
      prompt: "hello",
      modelProfileId: "model-1",
    }),
  ).resolves.toBeUndefined();

  expect(failConversationResponseRun).toHaveBeenCalledWith(
    expect.objectContaining({
      assistantMessageId: "assistant-1",
      runId: "run-1",
      error: expect.any(Error),
    }),
  );
});

test("stopping a streaming assistant requests provider cancellation", async () => {
  const response = await POST(
    new Request("http://localhost/api/conversations/conversation-1/stop", {
      method: "POST",
    }),
    { params: Promise.resolve({ conversationId: "conversation-1" }) },
  );

  expect(response.status).toBe(200);
  expect(requestAgentRuntimeCancel).toHaveBeenCalledWith({
    assistantMessageId: "assistant-1",
    runId: "run-1",
    reason: "user_stop",
  });
});

test("the stream route ignores keepalive writes after the SSE controller closes", async () => {
  const controller = {
    enqueue: vi.fn(() => {
      const error = new TypeError("Invalid state: Controller is already closed");
      (error as TypeError & { code?: string }).code = "ERR_INVALID_STATE";
      throw error;
    }),
    close: vi.fn(),
    error: vi.fn(),
  };

  const writer = createSseWriter(controller as never, new TextEncoder());

  expect(writer.comment("keepalive")).toBe(false);
  expect(writer.isClosed()).toBe(true);
});
```

- [ ] **Step 2: Run the focused verification suite**

Run:
- `pnpm vitest run apps/agent-runtime/src/agent-query-guard.test.ts`
- `pnpm vitest run apps/agent-runtime/src/active-conversation-runs.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-run-control.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-stop-route.test.ts`
- `pnpm vitest run apps/web/lib/api/sse-writer.test.ts`

Expected: PASS

- [ ] **Step 3: Run the broader guardrail suite**

Run:
- `pnpm vitest run apps/agent-runtime/src/process-conversation-job.test.ts`
- `pnpm vitest run apps/web/lib/api/conversation-stream.test.ts`
- `pnpm vitest run apps/agent-runtime/src/conversation-run-failure.test.ts`

Expected: PASS

- [ ] **Step 4: Update the tracker after behavior changes land**

Add one short note to `docs/implementation-tracker.md` that the main conversation chain now:
- times out stuck provider streams
- propagates stop/stale expiry into provider-side cancellation
- treats SSE close races as non-fatal transport shutdown

- [ ] **Step 5: Commit**

```bash
git add apps/agent-runtime/src/process-conversation-job.test.ts apps/web/lib/api/conversation-stream.test.ts apps/agent-runtime/src/conversation-run-failure.test.ts docs/implementation-tracker.md
git commit -m "docs: record conversation runtime resilience fixes"
```
