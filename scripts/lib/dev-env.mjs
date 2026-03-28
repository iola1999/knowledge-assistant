const DEFAULT_PORTS = new Map([
  ["postgres:", 5432],
  ["postgresql:", 5432],
  ["redis:", 6379],
  ["http:", 80],
  ["https:", 443],
]);

function stripMatchingQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function getDefaultPort(protocol) {
  return DEFAULT_PORTS.get(protocol) ?? null;
}

export function selectDevEnvFile(input) {
  if (input.envLocalExists) {
    return ".env.local";
  }

  if (input.envExists) {
    return ".env";
  }

  return null;
}

export function parseEnvText(text) {
  const values = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    values[key] = stripMatchingQuotes(value);
  }

  return values;
}

export function normalizeEnvExampleContent(exampleContent) {
  const lineEnding = exampleContent.includes("\r\n") ? "\r\n" : "\n";
  return `${exampleContent.replace(new RegExp(`${lineEnding}*$`, "u"), "")}${lineEnding}`;
}

export function listMissingRequiredEnvNames(
  env,
  requiredNames = ["DATABASE_URL", "AUTH_SECRET"],
) {
  return requiredNames.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function parseConnectionTarget(urlValue) {
  let url;

  try {
    url = new URL(urlValue);
  } catch (error) {
    throw new Error(`Invalid connection URL: ${urlValue}`, { cause: error });
  }

  const host = url.hostname;
  const port =
    url.port && Number.isFinite(Number.parseInt(url.port, 10))
      ? Number.parseInt(url.port, 10)
      : getDefaultPort(url.protocol);

  if (!host || !port) {
    throw new Error(`Could not resolve host/port from ${urlValue}`);
  }

  return {
    url: url.toString(),
    protocol: url.protocol,
    host,
    port,
  };
}

export function parseInfrastructureTargets(env) {
  const targets = [
    {
      id: "postgres",
      name: "PostgreSQL",
      envName: "DATABASE_URL",
    },
    {
      id: "redis",
      name: "Redis",
      envName: "REDIS_URL",
    },
    {
      id: "qdrant",
      name: "Qdrant",
      envName: "QDRANT_URL",
    },
    {
      id: "s3",
      name: "S3 / MinIO",
      envName: "S3_ENDPOINT",
    },
  ];

  return targets.map((target) => {
    const rawValue = env[target.envName];
    if (!rawValue) {
      throw new Error(`${target.envName} is not configured`);
    }

    return {
      ...target,
      ...parseConnectionTarget(rawValue),
    };
  });
}

export function parseRuntimeEndpoints(env) {
  return {
    app: parseConnectionTarget(env.APP_URL ?? "http://localhost:3000"),
    parser: parseConnectionTarget(
      env.PARSER_SERVICE_URL ?? "http://localhost:8001",
    ),
    agent: parseConnectionTarget(
      env.AGENT_RUNTIME_URL ?? "http://localhost:4001",
    ),
  };
}
