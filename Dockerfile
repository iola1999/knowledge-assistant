# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

FROM deps AS web-build
RUN pnpm --filter @anchordesk/web build

FROM deps AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app /app
COPY --from=web-build /app/apps/web/.next/standalone /app/
COPY --from=web-build /app/apps/web/.next/static /app/apps/web/.next/static
CMD ["node", "server.js"]
