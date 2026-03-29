import { describe, expect, test } from "vitest";

import { buildQueueJobId, sanitizeQueueJobIdPart } from "./index";

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
