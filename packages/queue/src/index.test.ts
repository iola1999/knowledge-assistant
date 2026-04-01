import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  injectTraceContextHeaders: vi.fn(),
}));

vi.mock("@anchordesk/tracing", () => ({
  injectTraceContextHeaders: mocks.injectTraceContextHeaders,
}));

import { buildQueueJobId, sanitizeQueueJobIdPart, withEnqueuedTraceContext } from "./index";

describe("sanitizeQueueJobIdPart", () => {
  test("replaces unsupported bullmq colon delimiters", () => {
    expect(sanitizeQueueJobIdPart("assistant:message")).toBe("assistant_message");
  });
});

describe("buildQueueJobId", () => {
  test("joins sanitized queue job id parts with a stable separator", () => {
    expect(buildQueueJobId("assistant:message", "respond")).toBe(
      "assistant_message--respond",
    );
  });
});

describe("withEnqueuedTraceContext", () => {
  test("injects the current trace context when the payload does not provide one", () => {
    mocks.injectTraceContextHeaders.mockReturnValue({
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    });
    const payload = {
      assistantMessageId: "assistant-1",
    };

    expect(withEnqueuedTraceContext(payload)).toEqual({
      assistantMessageId: "assistant-1",
      traceContext: {
        traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      },
    });
  });

  test("preserves an explicit trace context", () => {
    mocks.injectTraceContextHeaders.mockReturnValue({
      traceparent: "00-overridden",
    });
    const payload = {
      assistantMessageId: "assistant-1",
      traceContext: {
        traceparent: "00-existing",
      },
    };

    expect(withEnqueuedTraceContext(payload)).toEqual({
      assistantMessageId: "assistant-1",
      traceContext: {
        traceparent: "00-existing",
      },
    });
  });
});
