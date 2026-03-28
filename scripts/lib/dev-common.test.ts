import { describe, expect, it } from "vitest";

import { resolveDevLogRoot, resolvePidRoot, resolveTmpRoot } from "./dev-common.mjs";

describe("resolveTmpRoot", () => {
  it("uses /tmp on POSIX platforms so dev logs stay outside the repo", () => {
    expect(
      resolveTmpRoot({
        platform: "darwin",
        tmpDir: "/var/folders/example/T",
      }),
    ).toBe("/tmp");
  });

  it("falls back to the OS temp directory on Windows", () => {
    expect(resolveTmpRoot({ platform: "win32", tmpDir: "C:/Temp" })).toBe(
      "C:/Temp",
    );
  });
});

describe("resolveDevLogRoot", () => {
  it("stores managed service logs under a project-specific tmp directory", () => {
    expect(
      resolveDevLogRoot({
        tmpRoot: "/tmp",
        projectName: "knowledge-assistant",
      }),
    ).toBe("/tmp/knowledge-assistant-dev");
  });
});

describe("resolvePidRoot", () => {
  it("stores managed service pid files alongside logs under tmp", () => {
    expect(
      resolvePidRoot({
        tmpRoot: "/tmp",
        projectName: "knowledge-assistant",
      }),
    ).toBe("/tmp/knowledge-assistant-dev/pids");
  });
});
