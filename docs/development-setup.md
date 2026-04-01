# 本地开发指引

版本：v0.5
日期：2026-03-31

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

### 1.1 开发期第三方文档查询

当前协作者环境可使用 `Context7` 查询常见开源库 / 框架的最新文档与示例。

使用原则：

- 涉及第三方库 API、配置项、版本差异、迁移说明或废弃行为时，先查 `Context7`，再动代码或更新仓库文档。
- `Context7` 查不到或结果不够具体时，再回到对应库的官方文档、源码或 release note 交叉确认。
- `Context7` 仅用于开发期查外部资料，不属于 AnchorDesk 产品运行时依赖，也不属于 `assistant` MCP server 对最终用户暴露的工具集合。

## 2. 首次启动

先准备：

1. 安装 `pnpm`
2. 安装 Docker Desktop / Colima + Docker CLI
3. 根目录执行 `pnpm install`
4. 根目录执行 `pnpm setup:python`

环境变量最小化后，必须保留在进程外的启动根配置只有：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/anchor_desk
AUTH_SECRET=dev-auth-secret
```

说明：

- `AUTH_SECRET` 不会自动生成，也不会被回写到本地 env 文件。
- 仓库根目录的 `.env.example` 已给出可直接启动的开发默认值，通常你只需要按本机环境改 `DATABASE_URL`。
- 第一个注册成功的用户会自动成为 super admin；`/settings` 与全局资料库入口会直接读取 `users.is_super_admin`，不需要额外 env 白名单。
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

1. 检查 `node_modules`，并在 `.venv` 缺失或 `services/parser/requirements.txt` 变化时自动执行 `pnpm setup:python`
2. 执行 SQL migrations + safe blocking app upgrades
3. 从数据库解析 `system_settings` 并生成受管进程运行时环境
4. 校验 PostgreSQL / Redis / Qdrant / MinIO 连通性
5. 自动确保 S3 bucket 存在
6. 在启动受管进程前重建 `/tmp/anchordesk-dev/logs`
7. 拉起 `web` / `worker` / `agent-runtime` / `parser`

补充说明：

- parser 现在走受管稳定启动模式，优先保证 `pnpm dev` / `pnpm dev:status` 可可靠接管。
- `pnpm dev` 不再只按“.venv 是否存在”判断 parser 环境可用；如果 parser 的 `requirements.txt` 更新过，会自动刷新已有虚拟环境，避免复用过期依赖。
- 如果你改了 `services/parser/**` 里的代码，当前建议手动重启一次 `pnpm dev`。
- 如果检测到已有受管进程仍在运行，`pnpm dev` 会保留现有日志目录，避免删除正在写入的日志句柄。
- 受管进程状态统一写到 `/tmp/anchordesk-dev`：
  - 日志在 `/tmp/anchordesk-dev/logs`
  - PID 文件在 `/tmp/anchordesk-dev/pids`
- 应用层日志当前统一走结构化 stdout/stderr；开发期由 `pnpm dev` 捕获到上述日志目录，生产环境默认输出 JSON 到容器 stdout。
- 可选通过 `LOG_LEVEL` 调整日志级别；默认行为是开发期 `debug`、生产期 `info`、测试期 `silent`。
- 如果当前问题集中在回答引用、citation、sources panel 或引用落库链路，优先查看 [anchor-desk-citation-debugging.md](./anchor-desk-citation-debugging.md)。
- 这样可以避免在仓库内留下 `.dev` 状态目录，减少对前端 dev watch 的干扰。

当前对象存储 key 布局：

- 客户端在浏览器侧先计算 SHA256，再直传到：`blobs/<sha256>`
- worker 会复核对象内容的 SHA256 与 key 是否一致，并补齐 `file_size_bytes`
- 资料所属工作空间、目录层级与逻辑路径只保存在数据库；在 MinIO / R2 里不要再期待 `workspaces/<workspaceId>/...` 这类前缀

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

## 5. SQL migration 与 app upgrade 怎么写

### 5.1 改 schema

`packages/db/src/schema.ts` 是 schema source of truth。

新增或修改表结构时：

1. 修改 `packages/db/src/schema.ts`
2. 生成 migration：

```bash
pnpm db:generate -- --name <migration-name>
```

3. 提交生成出的 `packages/db/drizzle/**`
4. 本地执行：

```bash
pnpm db:migrate
```

要求：

- 不再使用 `drizzle-kit push --force` 作为长期演进方案。
- 改 schema 时必须提交 versioned SQL migration，不能只改 schema 文件。
- 线上默认按 roll-forward 处理，不设计自动 down migration。

### 5.2 改一次性应用升级逻辑

非 SQL 的一次性升级动作放到 app upgrade：

1. 在 `scripts/upgrades/*.mjs` 新增 upgrade
2. 在 `scripts/upgrades/index.mjs` 注册
3. 至少声明：
   - `key`
   - `description`
   - `blocking`
   - `safeInDevStartup`
   - `run(context)`

常见场景：

- 补齐新的 `system_settings` key
- 历史数据 backfill
- key rename / 值迁移
- 外部系统的幂等初始化

### 5.3 常用命令

```bash
pnpm app:upgrade:dev   # 开发启动前自动执行的 safe blocking upgrades
pnpm app:upgrade       # 执行全部 blocking upgrades
pnpm app:upgrade:all   # 执行所有 upgrades（含 non-blocking）
pnpm app:upgrade:check # 只检查是否还有 blocking pending upgrades
```

开发环境的 `pnpm dev` 会自动执行 `pnpm app:upgrade:dev`。
如果存在 blocking 但非 safe 的 pending upgrade，启动会直接失败，并提示你手动执行升级命令。

## 6. 系统参数怎么改

首次完成 safe blocking upgrade 后，系统参数默认值会自动写入 `system_settings` 表。
当前已经提供两个后台入口：

- `/settings`：系统参数页，维护底层运行参数
- `/admin/models`：模型管理页，维护 Claude-compatible 模型配置

推荐改法：

1. 先启动 `pnpm dev`
2. 使用第一个注册成功的账号登录
3. 打开 `http://localhost:3000/settings`
4. 在页面里修改系统参数；如果要新增或切换对话模型，改去 `http://localhost:3000/admin/models`
5. 保存后重启 `pnpm dev`

说明：

- `/settings` 只有 `users.is_super_admin = true` 的账号可以访问；默认就是第一个注册成功的用户。
- `/admin/models` 同样只允许 super admin 访问。
- `web` / `worker` / `agent-runtime` 会在启动时调用 `initRuntimeSettings()`；`parser` 进程本身仍直接读取 env，但在 `pnpm dev` 下会由启动脚本注入解析后的系统参数。
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
docker compose exec postgres psql -U postgres -d anchor_desk
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
set value_text = 'brave', updated_at = now()
where setting_key = 'web_search_provider';

update system_settings
set value_text = 'http://localhost:9000', updated_at = now()
where setting_key = 's3_endpoint';
```

常见会放在 `system_settings` 里的配置：

- S3 / MinIO endpoint、bucket、凭证
- Qdrant endpoint / collection / api key
- 联网搜索、embedding、rerank 的运行参数
- grounded final answer 的低层参数（如 `anthropic_final_answer_max_tokens`）
- Agent / Parser / Web 的基础地址

修改后重启相关进程即可生效。

## 7. 为什么不是“所有配置都进 DB”

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
