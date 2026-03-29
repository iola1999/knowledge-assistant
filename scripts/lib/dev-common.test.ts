import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  resetDevLogDirectory,
  resolveDevLogRoot,
  resolvePidRoot,
  resolveTmpRoot,
} from "./dev-common.mjs";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((targetPath) =>
      rm(targetPath, { recursive: true, force: true }),
    ),
  );
});

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
        projectName: "anchordesk",
      }),
    ).toBe("/tmp/anchordesk-dev");
  });
});

describe("resolvePidRoot", () => {
  it("stores managed service pid files alongside logs under tmp", () => {
    expect(
      resolvePidRoot({
        tmpRoot: "/tmp",
        projectName: "anchordesk",
      }),
    ).toBe("/tmp/anchordesk-dev/pids");
  });
});

describe("resetDevLogDirectory", () => {
  it("recreates the log directory without stale log files", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "anchordesk-dev-common-"),
    );
    tempDirs.push(tempRoot);

    const targetLogDir = path.join(tempRoot, "logs");
    await mkdir(path.join(targetLogDir, "nested"), { recursive: true });
    await writeFile(path.join(targetLogDir, "web.log"), "old web log\n", "utf8");
    await writeFile(
      path.join(targetLogDir, "nested", "worker.log"),
      "old worker log\n",
      "utf8",
    );

    await resetDevLogDirectory(targetLogDir);

    await expect(readdir(targetLogDir)).resolves.toEqual([]);
  });
});
