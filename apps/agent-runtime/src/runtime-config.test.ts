import { describe, expect, test } from "vitest";

import {
  DEFAULT_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY,
  MAX_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY,
} from "@anchordesk/contracts";

import { resolveRespondWorkerConcurrency } from "./runtime-config";

describe("resolveRespondWorkerConcurrency", () => {
  test("defaults to the shared runtime worker concurrency", () => {
    expect(resolveRespondWorkerConcurrency({})).toBe(
      DEFAULT_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY,
    );
  });

  test("defaults to 5 concurrent respond workers", () => {
    expect(DEFAULT_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY).toBe(5);
    expect(resolveRespondWorkerConcurrency({})).toBe(5);
  });

  test("accepts a configured positive integer", () => {
    expect(
      resolveRespondWorkerConcurrency({
        AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY: "4",
      }),
    ).toBe(4);
  });

  test("falls back on invalid values and caps oversized input", () => {
    expect(
      resolveRespondWorkerConcurrency({
        AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY: "0",
      }),
    ).toBe(DEFAULT_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY);

    expect(
      resolveRespondWorkerConcurrency({
        AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY: "999",
      }),
    ).toBe(MAX_AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY);
  });
});
