import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  injectTraceContextHeaders: vi.fn(),
}));

vi.mock("@anchordesk/tracing", () => ({
  injectTraceContextHeaders: mocks.injectTraceContextHeaders,
}));

import {
  buildIngestQueueJobId,
  buildQueueJobId,
  sanitizeQueueJobIdPart,
  withEnqueuedTraceContext,
} from "./index";

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

describe("buildIngestQueueJobId", () => {
  test("builds stable stage job ids for the default ingest flow", () => {
    expect(buildIngestQueueJobId("version-1", "parse")).toBe("version-1--parse");
  });

  test("adds a run identifier for re-enqueued ingest flows", () => {
    expect(buildIngestQueueJobId("version-1", "parse", "rerun-1")).toBe(
      "version-1--rerun-1--parse",
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
