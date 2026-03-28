# 本地开发指引

版本：v0.1  
日期：2026-03-28

## 1. 推荐做法

开发期的最佳实践是：

- 应用进程跑在宿主机：`Next.js`、`worker`、`agent-runtime`、`parser`
- 基础设施跑在 Docker Compose：`PostgreSQL`、`Redis`、`Qdrant`、`MinIO`

原因：

- 应用层保留最快的热更新和调试体验。
- 基础设施不需要手工安装、版本更稳定、清理更简单。
- `Qdrant` 和 `MinIO` 这类组件用 Docker 明显比手工本机安装更省事。

不推荐开发期把整套 Web/Worker/Parser 也都装进 Docker 再做热更新，除非你正在排查容器化问题。  
当前项目最合适的方式仍然是“应用在本机，依赖在容器”。

## 2. 首次启动

先准备：

1. 安装 `pnpm`
2. 安装 Docker Desktop / Colima + Docker CLI
3. 根目录执行 `pnpm install`
4. 根目录执行 `pnpm setup:python`

环境变量最小化后，必须保留在进程外的启动根配置只有：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/knowledge_assistant
AUTH_SECRET=dev-auth-secret
```

说明：

- `AUTH_SECRET` 不会自动生成，也不会被回写到本地 env 文件。
- 仓库根目录的 `.env.example` 已给出可直接启动的开发默认值，通常你只需要按本机环境改 `DATABASE_URL`。
- `SUPER_ADMIN_USERNAMES` 也是 env-only 配置，但它只控制 `/settings` 的可见范围，不阻塞启动。
- 其他大部分运行参数会在数据库的 `system_settings` 表中维护。

## 3. 启动基础设施

根目录执行：

```bash
pnpm infra:up
```

这会通过仓库根目录的 `docker-compose.yml` 启动：

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Qdrant: `localhost:6333`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`

停止基础设施：

```bash
pnpm infra:down
```

查看基础设施日志：

```bash
pnpm infra:logs
```

## 4. 启动应用

基础设施起来后，根目录执行：

```bash
pnpm dev
```

这个命令会按顺序做：

1. 检查 `node_modules` 和 `.venv`
2. 自动建表
3. 自动补齐 `system_settings`
4. 校验 PostgreSQL / Redis / Qdrant / MinIO 连通性
5. 自动确保 S3 bucket 存在
6. 拉起 `web` / `worker` / `agent-runtime` / `parser`

补充说明：

- parser 现在走受管稳定启动模式，优先保证 `pnpm dev` / `pnpm dev:status` 可可靠接管。
- 如果你改了 `services/parser/**` 里的代码，当前建议手动重启一次 `pnpm dev`。
- 受管进程日志默认写到 `/tmp/knowledge-assistant-dev/logs`，避免日志文件持续落在仓库内干扰前端 dev watch。

状态检查：

```bash
pnpm dev:status
```

`pnpm dev:status` 现在会区分：

- `running`
- `running (unmanaged)`
- `not running`
- `stale pid`

停止应用层进程：

```bash
pnpm dev:down
```

## 5. 系统参数怎么改

首次建表后，系统参数默认值会自动写入 `system_settings` 表。  
当前已经提供基础版后台设置页：`/settings`。

推荐改法：

1. 先启动 `pnpm dev`
2. 在 env 中设置 `SUPER_ADMIN_USERNAMES=<注册用户名1,注册用户名2>`
3. 打开 `http://localhost:3000/settings`
4. 在页面里修改系统参数
5. 保存后重启 `pnpm dev`

说明：

- `/settings` 只有 `SUPER_ADMIN_USERNAMES` 中声明的注册用户名可以访问。
- `web` / `worker` / `agent-runtime` / `parser` 当前都在启动时读取系统参数。
- 保存数据库配置后不会热更新到已运行进程，所以需要重启开发进程。

如果你想确认当前已有的注册用户名，可以在 PostgreSQL 中查看：

```sql
select username, display_name, created_at
from users
order by created_at desc;
```

如果页面本身不可用，仍然可以直接通过 PostgreSQL 修改作为兜底方案。

如果 PostgreSQL 是通过 Docker Compose 启动的，可以直接进入数据库：

```bash
docker compose exec postgres psql -U postgres -d knowledge_assistant
```

查看当前系统参数：

```sql
select setting_key, value_text, is_secret
from system_settings
order by setting_key;
```

修改示例：

```sql
update system_settings
set value_text = 'your-anthropic-key', updated_at = now()
where setting_key = 'anthropic_api_key';

update system_settings
set value_text = 'http://localhost:9000', updated_at = now()
where setting_key = 's3_endpoint';
```

常见会放在 `system_settings` 里的配置：

- S3 / MinIO endpoint、bucket、凭证
- Qdrant endpoint / collection / api key
- Anthropic API key / model
- embedding / rerank provider 参数
- Agent / Parser / Web 的基础地址

修改后重启相关进程即可生效。

## 6. 为什么不是“所有配置都进 DB”

当前只保留极少数启动根配置在进程外：

- `DATABASE_URL`
- `AUTH_SECRET`

其中：

- `DATABASE_URL` 是数据库入口，本身不可能先存进数据库。
- `AUTH_SECRET` 是签名根密钥，最佳实践上不应该把它再存回业务数据库。

所以真正的目标不是“所有配置零 env”，而是：

- 让手工配置最小化
- 让大部分可运营参数进入数据库
- 保留最少量的启动根密钥在进程外
