# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first
- Use these repo-local docs as the source of truth, in this order: `@docs/knowledge-assistant-technical-design-nodejs.md`, `@docs/implementation-tracker.md`, `@docs/development-setup.md`.
- If design docs conflict, follow `@docs/knowledge-assistant-technical-design-nodejs.md`.
- If task priority or current phase conflicts, follow `@docs/implementation-tracker.md`.
- `AGENTS.md` is still relevant, but its absolute doc paths are stale; use the repo-local `docs/` files above instead.

## Repository scope
- This is a `pnpm` workspace monorepo. The main stack is Node/TypeScript. `services/parser` is a separate Python FastAPI service and is not part of the pnpm workspace.
- Product positioning is a general workspace knowledge assistant, not a legal-vertical product. Keep the remaining statute-search tool, but do not reintroduce legal-specific positioning.

## Commands
- Prefer root scripts over ad-hoc per-app commands.
- `pnpm dev` starts the managed local stack, bootstraps database/system settings, and runs `web`, `worker`, `agent-runtime`, and `parser`.
- `pnpm dev:status` checks infrastructure and managed process status.
- `pnpm dev:down` stops the managed local stack.
- `pnpm infra:up|down|logs` manages PostgreSQL, Redis, Qdrant, and MinIO for local development.
- `pnpm setup:python` creates `.venv` and installs parser dependencies.
- `pnpm verify` is the main quality gate: `pnpm test && pnpm typecheck && pnpm check:python && pnpm build:web`.
- `pnpm infra:down` only stops containers; it does not remove them.
- After editing `services/parser/**`, restart `pnpm dev`.

## Configuration
- Required env-only root config: `DATABASE_URL` and `AUTH_SECRET`.
- `SUPER_ADMIN_USERNAMES` is also env-only and controls `/settings` access.
- Most other provider and infrastructure settings live in the `system_settings` table and are loaded at process start; restart managed processes after changing them.

## Testing and implementation rules
- Default to TDD.
- Changes to upload, retrieval, answering, citations, or export flows must include tests or an explicit test plan.
- TypeScript tests use `Vitest`. Python parser tests use `unittest`.
- Do not invent repo lint/format commands or formatter rules; none are configured in-repo today.

## Product/runtime constraints
- OCR is intentionally disabled by default. Do not enable or extend OCR flows unless the task explicitly covers the approved provider plan.
- The answer strategy is fixed: workspace knowledge first, web search as a supplement. Do not reintroduce `kb_only` / `kb_plus_web` modes.
- If `ANTHROPIC_API_KEY` is absent locally, the agent runtime may use the documented mock fallback for local demo/development flows.
- Current streaming is database-polling plus persisted assistant draft, not direct provider token streaming.

## Search hygiene
- Exclude `.claude/worktrees/**` from broad searches to avoid duplicate hits from git worktrees.
