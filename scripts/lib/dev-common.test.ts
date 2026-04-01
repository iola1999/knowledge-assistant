import os from "node:os";
import crypto from "node:crypto";
import path from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureToolingInstalled,
  resetDevLogDirectory,
  resolveDevLogRoot,
  resolvePidRoot,
  resolveTmpRoot,
} from "./dev-common.mjs";

const tempDirs: string[] = [];

function sha256(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

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
  it("stores managed service logs under the stable anchordesk tmp directory", () => {
    expect(
      resolveDevLogRoot({
        tmpRoot: "/tmp",
      }),
    ).toBe("/tmp/anchordesk-dev");
  });

  it("does not derive the managed service log root from the caller project name", () => {
    expect(
      resolveDevLogRoot({
        tmpRoot: "/tmp",
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

describe("ensureToolingInstalled", () => {
  it("does not rerun pnpm setup:python when the parser requirements stamp matches", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "anchordesk-python-tooling-"),
    );
    tempDirs.push(tempRoot);

    const fakeNodeModules = path.join(tempRoot, "node_modules");
    const fakePythonBinary = path.join(tempRoot, ".venv", "bin", "python");
    const fakeRequirements = path.join(tempRoot, "requirements.txt");
    const fakeRequirementsStamp = path.join(
      tempRoot,
      ".venv",
      ".parser-requirements.sha256",
    );

    await mkdir(fakeNodeModules, { recursive: true });
    await mkdir(path.dirname(fakePythonBinary), { recursive: true });
    await writeFile(fakePythonBinary, "", "utf8");
    const requirementsContent =
      "fastapi==0.115.0\nopentelemetry-api==1.40.0\n";
    await writeFile(fakeRequirements, requirementsContent, "utf8");

    const matchingStamp = sha256(requirementsContent);
    await writeFile(fakeRequirementsStamp, `${matchingStamp}\n`, "utf8");

    const commandCalls = [];

    await ensureToolingInstalled({
      nodeModulesPath: fakeNodeModules,
      pythonBinaryPath: fakePythonBinary,
      pythonRequirementsPath: fakeRequirements,
      pythonRequirementsStampPath: fakeRequirementsStamp,
      runCommand: async (input) => {
        commandCalls.push(input);
      },
      log: () => {},
    });

    expect(commandCalls).toEqual([]);
  });

  it("reruns pnpm setup:python and updates the stamp when parser requirements change", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "anchordesk-python-tooling-"),
    );
    tempDirs.push(tempRoot);

    const fakeNodeModules = path.join(tempRoot, "node_modules");
    const fakePythonBinary = path.join(tempRoot, ".venv", "bin", "python");
    const fakeRequirements = path.join(tempRoot, "requirements.txt");
    const fakeRequirementsStamp = path.join(
      tempRoot,
      ".venv",
      ".parser-requirements.sha256",
    );

    await mkdir(fakeNodeModules, { recursive: true });
    await mkdir(path.dirname(fakePythonBinary), { recursive: true });
    await writeFile(fakePythonBinary, "", "utf8");
    const requirementsContent =
      "fastapi==0.115.0\nopentelemetry-api==1.40.0\n";
    await writeFile(fakeRequirements, requirementsContent, "utf8");
    await writeFile(fakeRequirementsStamp, "stale-stamp\n", "utf8");

    const commandCalls = [];

    await ensureToolingInstalled({
      nodeModulesPath: fakeNodeModules,
      pythonBinaryPath: fakePythonBinary,
      pythonRequirementsPath: fakeRequirements,
      pythonRequirementsStampPath: fakeRequirementsStamp,
      runCommand: async (input) => {
        commandCalls.push(input);
      },
      log: () => {},
    });

    expect(commandCalls).toHaveLength(1);
    expect(commandCalls[0]).toMatchObject({
      command: expect.stringMatching(/pnpm(?:\.cmd)?$/u),
      args: ["setup:python"],
    });
    expect(await readFile(fakeRequirementsStamp, "utf8")).toBe(
      `${sha256(requirementsContent)}\n`,
    );
  });
});
