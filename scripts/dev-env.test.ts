import { describe, expect, it } from "vitest";

import {
  listMissingRequiredEnvNames,
  normalizeEnvExampleContent,
  parseConnectionTarget,
  parseEnvText,
  parseInfrastructureTargets,
  parseRuntimeEndpoints,
  selectDevEnvFile,
} from "./lib/dev-env.mjs";

describe("selectDevEnvFile", () => {
  it("prefers .env.local over .env", () => {
    expect(
      selectDevEnvFile({
        envLocalExists: true,
        envExists: true,
      }),
    ).toBe(".env.local");
  });

  it("returns null when no environment file exists", () => {
    expect(
      selectDevEnvFile({
        envLocalExists: false,
        envExists: false,
      }),
    ).toBeNull();
  });
});

describe("parseEnvText", () => {
  it("ignores comments and strips matching quotes", () => {
    expect(
      parseEnvText(`
# comment
DATABASE_URL="postgres://postgres:postgres@localhost:5432/law_doc"
export REDIS_URL='redis://localhost:6379'
EMPTY=
`),
    ).toEqual({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/law_doc",
      REDIS_URL: "redis://localhost:6379",
      EMPTY: "",
    });
  });
});

describe("normalizeEnvExampleContent", () => {
  it("ensures the copied example ends with a single newline", () => {
    expect(
      normalizeEnvExampleContent(
        "DATABASE_URL=postgres://postgres:postgres@localhost:5432/law_doc\nAUTH_SECRET=replace-me\n",
      ),
    ).toBe("DATABASE_URL=postgres://postgres:postgres@localhost:5432/law_doc\nAUTH_SECRET=replace-me\n");
  });
});

describe("listMissingRequiredEnvNames", () => {
  it("reports missing startup env values", () => {
    expect(
      listMissingRequiredEnvNames({
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/law_doc",
      }),
    ).toEqual(["AUTH_SECRET"]);
  });
});

describe("connection target parsing", () => {
  it("uses default ports when the URL omits them", () => {
    expect(parseConnectionTarget("redis://localhost")).toEqual({
      url: "redis://localhost",
      protocol: "redis:",
      host: "localhost",
      port: 6379,
    });
  });

  it("resolves infrastructure and runtime endpoints from environment variables", () => {
    const env = {
      DATABASE_URL: "postgres://postgres:postgres@localhost/law_doc",
      REDIS_URL: "redis://127.0.0.1",
      QDRANT_URL: "http://localhost:6333",
      S3_ENDPOINT: "http://localhost:9000",
      APP_URL: "http://localhost:3000",
      PARSER_SERVICE_URL: "http://localhost:8001",
      AGENT_RUNTIME_URL: "http://localhost:4001",
    };

    expect(parseInfrastructureTargets(env)).toEqual([
      {
        id: "postgres",
        name: "PostgreSQL",
        envName: "DATABASE_URL",
        url: "postgres://postgres:postgres@localhost/law_doc",
        protocol: "postgres:",
        host: "localhost",
        port: 5432,
      },
      {
        id: "redis",
        name: "Redis",
        envName: "REDIS_URL",
        url: "redis://127.0.0.1",
        protocol: "redis:",
        host: "127.0.0.1",
        port: 6379,
      },
      {
        id: "qdrant",
        name: "Qdrant",
        envName: "QDRANT_URL",
        url: "http://localhost:6333/",
        protocol: "http:",
        host: "localhost",
        port: 6333,
      },
      {
        id: "s3",
        name: "S3 / MinIO",
        envName: "S3_ENDPOINT",
        url: "http://localhost:9000/",
        protocol: "http:",
        host: "localhost",
        port: 9000,
      },
    ]);

    expect(parseRuntimeEndpoints(env)).toEqual({
      app: {
        url: "http://localhost:3000/",
        protocol: "http:",
        host: "localhost",
        port: 3000,
      },
      parser: {
        url: "http://localhost:8001/",
        protocol: "http:",
        host: "localhost",
        port: 8001,
      },
      agent: {
        url: "http://localhost:4001/",
        protocol: "http:",
        host: "localhost",
        port: 4001,
      },
    });
  });
});
