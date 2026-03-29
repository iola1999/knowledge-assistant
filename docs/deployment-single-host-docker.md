# 单机 Docker 多容器部署说明

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

## 2. 准备环境文件

```bash
cp .env.production.example .env.production
```

必须提供的 bootstrap 变量（web / worker / agent-runtime 只需要这三项）：

- `DATABASE_URL`
- `AUTH_SECRET`
- `SUPER_ADMIN_USERNAMES`

以下变量由 `upgrade` 服务在首次启动时写入 `system_settings`，后续可通过 `/settings` 管理；
`parser`（Python）仍直接读取 S3 相关环境变量：

- `APP_URL`
- `AGENT_RUNTIME_URL`
- `PARSER_SERVICE_URL`
- `REDIS_URL`
- `QDRANT_URL` / `QDRANT_COLLECTION`
- `S3_*`
- `ANTHROPIC_API_KEY`
- 其他 provider 配置

## 3. 构建镜像

```bash
docker compose -f docker-compose.prod.yml build
```

当前仓库就是通过 `docker compose build` 构建生产镜像。

- Node 侧服务复用根目录 `Dockerfile`
- Parser 使用 `services/parser/Dockerfile`

## 4. 启动基础设施

```bash
docker compose -f docker-compose.prod.yml up -d postgres redis qdrant minio
```

等待基础设施健康检查通过。

## 5. 执行升级

```bash
docker compose -f docker-compose.prod.yml run --rm upgrade
```

这个步骤会执行：

1. `pnpm app:upgrade`
2. bucket ensure

而 `pnpm app:upgrade` 内部会执行：

1. SQL migrations
2. blocking app upgrades

Drizzle 已执行过的 SQL 会记录在数据库里的 `drizzle.__drizzle_migrations` 表中，所以不会重复执行。
app upgrades 的执行状态记录在 `app_upgrades` 表里。

## 6. 启动运行时服务

```bash
docker compose -f docker-compose.prod.yml up -d web worker agent-runtime parser
```

这些服务启动前都会先跑 `pnpm app:upgrade:check`。
如果还有 blocking pending upgrades，容器会直接失败退出，避免旧代码带着未升级状态运行。

## 7. 验证

检查服务状态：

```bash
docker compose -f docker-compose.prod.yml ps
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
