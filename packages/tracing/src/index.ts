import { context, propagation, trace, SpanKind, SpanStatusCode, type Context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export const TRACE_HEADER = {
  TRACEPARENT: "traceparent",
  TRACESTATE: "tracestate",
  BAGGAGE: "baggage",
} as const;

export const TRACE_HEADER_NAMES = Object.values(TRACE_HEADER);

export type TraceContextHeaders = {
  traceparent?: string | null;
  tracestate?: string | null;
  baggage?: string | null;
};

type HeaderCarrier =
  | Headers
  | Record<string, string | string[] | undefined | null>;

type TraceAttributes = Record<string, string | number | boolean | null | undefined>;

type TracingState = {
  provider: NodeTracerProvider | null;
  serviceName: string | null;
};

const ANCHORDESK_TRACER_NAME = "anchordesk";
const TRACING_STATE_KEY = Symbol.for("anchordesk.tracing.state");
const DEFAULT_DEPLOYMENT_ENVIRONMENT = "development";

function getTracingState(): TracingState {
  const globalWithState = globalThis as typeof globalThis & {
    [TRACING_STATE_KEY]?: TracingState;
  };

  if (!globalWithState[TRACING_STATE_KEY]) {
    globalWithState[TRACING_STATE_KEY] = {
      provider: null,
      serviceName: null,
    };
  }

  return globalWithState[TRACING_STATE_KEY]!;
}

function normalizeHeaderValue(value: unknown) {
  if (Array.isArray(value)) {
    return normalizeHeaderValue(value[0]);
  }

  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : null;
}

function readHeaderValue(carrier: HeaderCarrier, key: string) {
  if (carrier instanceof Headers) {
    return normalizeHeaderValue(carrier.get(key));
  }

  const matchingKey = Object.keys(carrier).find((candidate) => candidate.toLowerCase() === key);
  if (!matchingKey) {
    return null;
  }

  return normalizeHeaderValue(carrier[matchingKey]);
}

function buildPropagator() {
  return new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
}

function parseOtlpHeaders(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const pair of normalized.split(",")) {
    const [rawKey, ...rawValueParts] = pair.split("=");
    const key = rawKey?.trim();
    const joinedValue = rawValueParts.join("=").trim();
    if (!key || !joinedValue) {
      continue;
    }
    headers[key] = joinedValue;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function resolveOtlpTraceExporterUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicitTraceEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (explicitTraceEndpoint) {
    return explicitTraceEndpoint;
  }

  const baseEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!baseEndpoint) {
    return null;
  }

  return `${baseEndpoint.replace(/\/+$/u, "")}/v1/traces`;
}

function buildOtlpTraceExporter(env: NodeJS.ProcessEnv = process.env) {
  const url = resolveOtlpTraceExporterUrl(env);
  if (!url) {
    return null;
  }

  return new OTLPTraceExporter({
    url,
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
  });
}

function getTracer() {
  return trace.getTracer(ANCHORDESK_TRACER_NAME);
}

function buildSpanAttributes(attributes: TraceAttributes | undefined) {
  if (!attributes) {
    return undefined;
  }

  const entries = Object.entries(attributes).filter(
    (
      entry,
    ): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined,
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function withResolvedParentContext<T>(
  carrier: HeaderCarrier | TraceContextHeaders | null | undefined,
  fn: (parentContext: Context) => Promise<T> | T,
) {
  return fn(resolveParentTraceContext(carrier));
}

export function resolveParentTraceContext(
  carrier: HeaderCarrier | TraceContextHeaders | null | undefined,
) {
  return trace.getActiveSpan() ? context.active() : extractTraceContext(carrier);
}

export function readTraceContextHeaders(
  carrier: HeaderCarrier | TraceContextHeaders | null | undefined,
): TraceContextHeaders | null {
  if (!carrier) {
    return null;
  }

  const traceparent = readHeaderValue(carrier, TRACE_HEADER.TRACEPARENT);
  const tracestate = readHeaderValue(carrier, TRACE_HEADER.TRACESTATE);
  const baggage = readHeaderValue(carrier, TRACE_HEADER.BAGGAGE);

  if (!traceparent && !tracestate && !baggage) {
    return null;
  }

  return {
    traceparent,
    tracestate,
    baggage,
  };
}

export function extractTraceContext(
  carrier: HeaderCarrier | TraceContextHeaders | null | undefined,
  baseContext: Context = context.active(),
) {
  if (!carrier) {
    return baseContext;
  }

  return propagation.extract(baseContext, carrier as HeaderCarrier, {
    get: (source, key) => readHeaderValue(source, key) ?? undefined,
    keys: (source) =>
      source instanceof Headers ? Array.from(source.keys()) : Object.keys(source),
  });
}

export function injectTraceContextHeaders(sourceContext: Context = context.active()) {
  const carrier: Record<string, string> = {};
  propagation.inject(sourceContext, carrier, {
    set: (target, key, value) => {
      target[key] = value;
    },
  });

  return readTraceContextHeaders(carrier);
}

export function getActiveTraceLogContext() {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !spanContext.traceId || !spanContext.spanId) {
    return {};
  }

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(16).padStart(2, "0"),
  };
}

export function startNodeTracing(input: {
  serviceName: string;
  env?: NodeJS.ProcessEnv;
}) {
  const state = getTracingState();
  if (state.provider) {
    return {
      otlpTraceExporterUrl: resolveOtlpTraceExporterUrl(input.env),
      serviceName: state.serviceName ?? input.serviceName,
      started: false,
    };
  }

  const env = input.env ?? process.env;
  const exporter = buildOtlpTraceExporter(env);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: input.serviceName,
      "deployment.environment.name": env.NODE_ENV?.trim() || DEFAULT_DEPLOYMENT_ENVIRONMENT,
    }),
    spanProcessors: exporter ? [new BatchSpanProcessor(exporter)] : [],
  });

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
    propagator: buildPropagator(),
  });

  state.provider = provider;
  state.serviceName = input.serviceName;

  return {
    otlpTraceExporterUrl: resolveOtlpTraceExporterUrl(env),
    serviceName: input.serviceName,
    started: true,
  };
}

export async function shutdownNodeTracing() {
  const state = getTracingState();
  const provider = state.provider;
  state.provider = null;
  state.serviceName = null;

  if (provider) {
    await provider.shutdown();
  }
}

async function withSpan<T>(input: {
  attributes?: TraceAttributes;
  kind: SpanKind;
  name: string;
  parentContext?: Context;
}, handler: () => Promise<T> | T) {
  const tracer = getTracer();
  const parentContext = input.parentContext ?? context.active();

  return tracer.startActiveSpan(
    input.name,
    {
      attributes: buildSpanAttributes(input.attributes),
      kind: input.kind,
    },
    parentContext,
    async (span) => {
      try {
        return await handler();
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function withServerSpan<T>(input: {
  attributes?: TraceAttributes;
  carrier?: HeaderCarrier | TraceContextHeaders | null;
  name: string;
}, handler: () => Promise<T> | T) {
  return withResolvedParentContext(input.carrier, (parentContext) =>
    withSpan(
      {
        attributes: input.attributes,
        kind: SpanKind.SERVER,
        name: input.name,
        parentContext,
      },
      handler,
    ),
  );
}

export function withClientSpan<T>(input: {
  attributes?: TraceAttributes;
  name: string;
}, handler: () => Promise<T> | T) {
  return withSpan(
    {
      attributes: input.attributes,
      kind: SpanKind.CLIENT,
      name: input.name,
    },
    handler,
  );
}

export function withProducerSpan<T>(input: {
  attributes?: TraceAttributes;
  carrier?: HeaderCarrier | TraceContextHeaders | null;
  name: string;
}, handler: () => Promise<T> | T) {
  return withResolvedParentContext(input.carrier, (parentContext) =>
    withSpan(
      {
        attributes: input.attributes,
        kind: SpanKind.PRODUCER,
        name: input.name,
        parentContext,
      },
      handler,
    ),
  );
}

export function withConsumerSpan<T>(input: {
  attributes?: TraceAttributes;
  carrier?: HeaderCarrier | TraceContextHeaders | null;
  name: string;
}, handler: () => Promise<T> | T) {
  return withResolvedParentContext(input.carrier, (parentContext) =>
    withSpan(
      {
        attributes: input.attributes,
        kind: SpanKind.CONSUMER,
        name: input.name,
        parentContext,
      },
      handler,
    ),
  );
}
