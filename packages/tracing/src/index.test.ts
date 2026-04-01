import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  getActiveTraceLogContext,
  injectTraceContextHeaders,
  readTraceContextHeaders,
  shutdownNodeTracing,
  startNodeTracing,
  withClientSpan,
  withConsumerSpan,
  withProducerSpan,
} from "./index";

beforeAll(() => {
  startNodeTracing({
    serviceName: "anchordesk-tracing-test",
    env: {
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv,
  });
});

afterAll(async () => {
  await shutdownNodeTracing();
});

describe("trace context headers", () => {
  test("injects the current active span context into W3C headers", async () => {
    const headers = await withProducerSpan({ name: "queue publish" }, async () =>
      injectTraceContextHeaders(),
    );

    expect(headers).toEqual(
      expect.objectContaining({
        traceparent: expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[0-9a-f]$/u),
      }),
    );
  });

  test("continues the same trace when extracting upstream headers", async () => {
    const upstreamHeaders = await withProducerSpan({ name: "enqueue" }, async () =>
      injectTraceContextHeaders(),
    );

    const downstreamTrace = await withConsumerSpan(
      {
        carrier: upstreamHeaders,
        name: "consume",
      },
      async () => getActiveTraceLogContext(),
    );

    expect(downstreamTrace.trace_id).toBe(upstreamHeaders?.traceparent?.split("-")[1]);
    expect(downstreamTrace.span_id).not.toBe(upstreamHeaders?.traceparent?.split("-")[2]);
  });

  test("reads trace headers from a Headers carrier", () => {
    const headers = new Headers({
      baggage: "tenant.id=tenant-1",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    });

    expect(readTraceContextHeaders(headers)).toEqual({
      baggage: "tenant.id=tenant-1",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      tracestate: null,
    });
  });
});

describe("trace log context", () => {
  test("exposes trace ids while a span is active", async () => {
    const traceContext = await withClientSpan({ name: "parser request" }, async () =>
      getActiveTraceLogContext(),
    );

    expect(traceContext).toEqual(
      expect.objectContaining({
        span_id: expect.stringMatching(/^[0-9a-f]{16}$/u),
        trace_flags: expect.stringMatching(/^[0-9a-f]{2}$/u),
        trace_id: expect.stringMatching(/^[0-9a-f]{32}$/u),
      }),
    );
  });
});
