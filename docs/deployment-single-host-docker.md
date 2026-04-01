# 单机 Docker 多容器部署说明

版本：v0.2
日期：2026-04-01

## 1. 部署原则

生产环境采用单机 Docker 多容器：

- `postgres`
- `redis`
- `qdrant`
- `minio`
- `upgrade`
- `web`
- `worker`
- `agent-runtime`
- `parser`

约束：

- SQL schema 变更通过 Drizzle versioned migrations 执行。
- 非 SQL 的一次性升级通过 app upgrades 执行。
- 运行时服务启动前只做 `pnpm app:upgrade:check` fail-fast 检查。
- 常规发布采用 roll-forward，不依赖自动 down migration。
- 对象存储使用单 bucket；正式原始文件对象统一落在 `blobs/<sha256>`，不再按工作空间或目录前缀划分。

## 2. 准备环境文件

```bash
cp .env.production.example .env.production
```

注意：

- `docker compose` 默认只会自动读取项目根目录的 `.env`，不会自动读取 `.env.production`。
- 本文后续所有命令都必须显式带上 `--env-file .env.production`，否则 compose 变量不会被正确展开；`web` / `worker` / `agent-runtime` 至少会拿不到 `DATABASE_URL`，`web` 还会缺少 `AUTH_SECRET`。

必须提供的 bootstrap 变量：

- 所有 Node 运行时服务：`DATABASE_URL`
- `web`：额外需要 `AUTH_SECRET`

以下变量由 `upgrade` 服务在首次启动时写入 `system_settings`，后续可通过 `/settings` 管理；
`parser`（Python）仍直接读取 S3 相关环境变量：

- `APP_URL`
- `AGENT_RUNTIME_URL`
- `PARSER_SERVICE_URL`
- `REDIS_URL`
- `QDRANT_URL` / `QDRANT_COLLECTION`
- `S3_*`
- `WEB_SEARCH_*` / `BRAVE_SEARCH_*`
- `EMBEDDING_*` / `DASHSCOPE_*` / `RERANK_*`
- 其他非 bootstrap 的 provider 配置

Claude-compatible 模型配置是例外：

- 对话/报告模型不再写入 `system_settings`。
- 全新部署时，`upgrade` 会尝试读取 `.env.production` 中的 `ANTHROPIC_API_KEY`，以及可选的 `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`，为 `llm_model_profiles` seed 第一条默认模型。
- 如果首次升级时没有提供可用的 `ANTHROPIC_API_KEY`，升级仍可能只创建占位默认模型；上线前需要在 `/admin/models` 补全或替换它，否则主对话链路会显式失败。
- 后续新增、禁用、切换默认模型统一通过 `/admin/models` 维护，不再通过 env 或 `system_settings` 改模型。

## 3. 构建镜像

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

当前仓库就是通过 `docker compose build` 构建生产镜像。

- Node 侧服务复用根目录 `Dockerfile`
  - `web` 使用 `web-runtime` target，只复制 Next standalone 产物和升级检查所需最小文件
  - `worker` / `agent-runtime` 使用各自的 deploy target，只携带该服务的生产依赖和启动前 upgrade check 所需文件
  - `upgrade` 使用独立 target，只携带 `packages/db`、`packages/storage` 和根 `scripts/`
- Parser 使用 `services/parser/Dockerfile`

## 4. 启动基础设施

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis qdrant minio
```

等待基础设施健康检查通过。

## 5. 执行升级

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm upgrade
```

这个步骤会执行：

1. `pnpm app:upgrade`
2. bucket ensure

而 `pnpm app:upgrade` 内部会执行：

1. SQL migrations
2. blocking app upgrades（包括默认 `llm_model_profiles` seed、历史 `conversations.model_profile_id` backfill，以及废弃 Anthropic model settings 清理）

Drizzle 已执行过的 SQL 会记录在数据库里的 `drizzle.__drizzle_migrations` 表中，所以不会重复执行。
app upgrades 的执行状态记录在 `app_upgrades` 表里。

## 6. 启动运行时服务

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d web worker agent-runtime parser
```

这些服务启动前都会先跑 `pnpm app:upgrade:check`。
如果还有 blocking pending upgrades，容器会直接失败退出，避免旧代码带着未升级状态运行。

## 7. 验证

检查服务状态：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

健康检查目标：

- Web: `GET /api/health`
- Worker: `GET /health`
- Agent Runtime: `GET /health`
- Parser: `GET /health`

## 8. 重复发布流程

每次新版本发布，建议顺序：

1. 构建新镜像
2. 更新基础设施或确认基础设施已就绪
3. 执行一次 `upgrade`
4. 再启动/重建运行时服务

## 9. 回滚说明

当前策略以 roll-forward 为主。

如果升级后发现问题：

- 优先修复代码并重新发布
- 或补一个新的 forward migration / forward app upgrade
- 不默认依赖自动 down migration

如果必须回退数据库状态，应依赖发布前备份，而不是假设 migration 可自动逆转。
