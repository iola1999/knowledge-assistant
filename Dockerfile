# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
WORKDIR /app
ARG PNPM_VERSION=9.15.0
RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

FROM workspace AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --store-dir=/pnpm/store --frozen-lockfile

FROM deps AS web-build
RUN pnpm --filter @anchordesk/web build

FROM deps AS worker-deploy
RUN pnpm --filter @anchordesk/worker deploy --prod /deploy/worker

FROM deps AS agent-runtime-deploy
RUN pnpm --filter @anchordesk/agent-runtime deploy --prod /deploy/agent-runtime

FROM deps AS db-check-deploy
RUN pnpm --filter @anchordesk/db deploy --prod /deploy/packages/db

FROM deps AS upgrade-db-deploy
RUN pnpm --filter @anchordesk/db deploy /deploy/packages/db

FROM deps AS upgrade-storage-deploy
RUN pnpm --filter @anchordesk/storage deploy --prod /deploy/packages/storage

FROM base AS web-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web-build /app/apps/web/.next/standalone /app/
COPY --from=web-build /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=db-check-deploy /deploy/packages/db /app/packages/db
COPY --from=workspace /app/scripts /app/scripts
CMD ["node", "packages/db/scripts/start-web-server.mjs"]

FROM base AS worker-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=worker-deploy /deploy/worker /app
COPY --from=db-check-deploy /deploy/packages/db /app/packages/db
COPY --from=workspace /app/scripts /app/scripts
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM base AS agent-runtime-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=agent-runtime-deploy /deploy/agent-runtime /app
COPY --from=db-check-deploy /deploy/packages/db /app/packages/db
COPY --from=workspace /app/scripts /app/scripts
CMD ["node", "--import", "tsx", "src/index.ts"]

FROM base AS upgrade-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=upgrade-db-deploy /deploy/packages/db /app/packages/db
COPY --from=upgrade-storage-deploy /deploy/packages/storage /app/packages/storage
COPY --from=workspace /app/scripts /app/scripts
CMD ["sh", "-lc", "node packages/db/scripts/run-upgrades.mjs --mode=apply-blocking && node packages/storage/scripts/ensure-dev-bucket.mjs"]
