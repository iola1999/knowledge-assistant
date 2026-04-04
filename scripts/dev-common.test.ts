import { describe, expect, it } from "vitest";

import {
  getManagedServices,
  loadResolvedSystemEnvironment,
} from "./lib/dev-common.mjs";

describe("getManagedServices", () => {
  it("configures the parser service with a stable health-checked command", () => {
    const services = getManagedServices({
      APP_URL: "http://localhost:3000",
      PARSER_SERVICE_URL: "http://localhost:8001",
      AGENT_RUNTIME_URL: "http://localhost:4001",
    });

    const parser = services.find((service) => service.id === "parser");

    expect(parser).toMatchObject({
      id: "parser",
      name: "Parser service",
      host: "localhost",
      port: 8001,
      healthUrl: "http://localhost:8001/health",
    });
    expect(parser?.args).toEqual([
      "-m",
      "uvicorn",
      "main:app",
      "--host",
      "localhost",
      "--port",
      "8001",
    ]);
    expect(parser?.args).not.toContain("--reload");
  });

  it("exposes health endpoints for managed HTTP services", () => {
    const services = getManagedServices({
      APP_URL: "http://localhost:3000",
      PARSER_SERVICE_URL: "http://localhost:8001",
      AGENT_RUNTIME_URL: "http://localhost:4001",
    });

    expect(services.find((service) => service.id === "agent")?.healthUrl)
      .toBe("http://localhost:4001/health");
    expect(services.find((service) => service.id === "web")?.port)
      .toBe(3000);
    expect(services.find((service) => service.id === "worker")?.healthUrl)
      .toBeUndefined();
  });
});

describe("loadResolvedSystemEnvironment", () => {
  it("queries system settings without pre-seeding module defaults into the child env", async () => {
    const baseEnv = {
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/anchor_desk",
      PATH: "/usr/bin",
    };

    let capturedEnv;

    const resolved = await loadResolvedSystemEnvironment(baseEnv, {
      runCommandCapture: async (input) => {
        capturedEnv = input.env;
        return JSON.stringify({
          ...input.env,
          ANTHROPIC_API_KEY: "db-secret-key",
          ANTHROPIC_BASE_URL: "http://localhost:8080",
        });
      },
      pnpmBinary: "pnpm",
    });

    expect(capturedEnv).toMatchObject({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/anchor_desk",
      PATH: "/usr/bin",
    });
    expect(capturedEnv).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(capturedEnv).not.toHaveProperty("ANTHROPIC_BASE_URL");
    expect(resolved).toMatchObject({
      ANTHROPIC_API_KEY: "db-secret-key",
      ANTHROPIC_BASE_URL: "http://localhost:8080",
    });
  });

  it("falls back to the default-composed runtime environment when DB resolution fails", async () => {
    const resolved = await loadResolvedSystemEnvironment(
      {
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/anchor_desk",
      },
      {
        runCommandCapture: async () => {
          throw new Error("db unavailable");
        },
        pnpmBinary: "pnpm",
      },
    );

    expect(resolved).toMatchObject({
      REDIS_URL: "redis://localhost:6379",
      AGENT_RUNTIME_RESPOND_WORKER_CONCURRENCY: "5",
      ANTHROPIC_FINAL_ANSWER_MAX_TOKENS: "1400",
    });
  });
});
