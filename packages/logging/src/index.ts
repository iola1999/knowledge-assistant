import { createRequire } from "node:module";
import pino, { type Logger, type LoggerOptions } from "pino";
import { getActiveTraceLogContext } from "@anchordesk/tracing";

export const LOG_LEVEL = {
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
  SILENT: "silent",
} as const;

export const LOG_LEVEL_VALUES = Object.values(LOG_LEVEL);

export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

type RuntimeEnv = Record<string, string | undefined>;

const loggingPackageRequire = createRequire(import.meta.url);
const BUNDLED_EXTERNAL_TARGET_PREFIX = "[externals]/";

function normalizeRuntimeValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parseLogLevel(value: string | undefined): LogLevel | null {
  const normalized = normalizeRuntimeValue(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  return LOG_LEVEL_VALUES.includes(normalized as LogLevel)
    ? (normalized as LogLevel)
    : null;
}

export function isProductionEnvironment(env: RuntimeEnv = process.env) {
  return normalizeRuntimeValue(env.NODE_ENV) === "production";
}

export function isTestEnvironment(env: RuntimeEnv = process.env) {
  return normalizeRuntimeValue(env.NODE_ENV) === "test";
}

export function shouldPrettyPrintLogs(env: RuntimeEnv = process.env) {
  return !isProductionEnvironment(env) && !isTestEnvironment(env);
}

export function normalizePrettyTransportTarget(target: string | null | undefined) {
  const normalized = normalizeRuntimeValue(target ?? undefined);

  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith(BUNDLED_EXTERNAL_TARGET_PREFIX) ||
    normalized.includes(" [external] ")
  ) {
    return null;
  }

  return normalized;
}

export function resolvePrettyTransportTarget() {
  return normalizePrettyTransportTarget(loggingPackageRequire.resolve("pino-pretty"));
}

export function resolveLogLevel(env: RuntimeEnv = process.env): LogLevel {
  const configured = parseLogLevel(env.LOG_LEVEL);
  if (configured) {
    return configured;
  }

  if (isProductionEnvironment(env)) {
    return LOG_LEVEL.INFO;
  }

  if (isTestEnvironment(env)) {
    return LOG_LEVEL.SILENT;
  }

  return LOG_LEVEL.DEBUG;
}

export function buildLoggerOptions(input: {
  service: string;
  env?: RuntimeEnv;
}): LoggerOptions {
  const env = input.env ?? process.env;
  const options: LoggerOptions = {
    level: resolveLogLevel(env),
    base: {
      service: input.service,
      environment: normalizeRuntimeValue(env.NODE_ENV) ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin() {
      return getActiveTraceLogContext();
    },
  };

  const prettyTransportTarget = shouldPrettyPrintLogs(env)
    ? resolvePrettyTransportTarget()
    : null;

  if (prettyTransportTarget) {
    options.transport = {
      target: prettyTransportTarget,
      options: {
        colorize: false,
        singleLine: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  return options;
}

export function createServiceLogger(input: {
  service: string;
  env?: RuntimeEnv;
}): Logger {
  return pino(buildLoggerOptions(input));
}

export function serializeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    const extra = error as Error & {
      code?: unknown;
      cause?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      code: typeof extra.code === "string" ? extra.code : null,
      cause:
        extra.cause instanceof Error
          ? extra.cause.message
          : typeof extra.cause === "string"
            ? extra.cause
            : null,
      stack: error.stack ?? null,
    };
  }

  if (error && typeof error === "object") {
    return {
      message: JSON.stringify(error),
    };
  }

  return {
    message: String(error),
  };
}
