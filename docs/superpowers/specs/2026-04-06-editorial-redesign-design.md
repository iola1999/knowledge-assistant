# AnchorDesk Editorial Redesign Design

日期：2026-04-06

## 1. 背景

本次任务的目标不是做局部美化，而是将 AnchorDesk 全站 UI 统一切换到新的 editorial 设计系统。事实来源如下：

- 视觉方向与组件语言以 [docs/DESIGN.md](../DESIGN.md) 为主
- Stitch 产出的参考页面以 [docs/redesign-code/1.html](../redesign-code/1.html)、[docs/redesign-code/2.html](../redesign-code/2.html)、[docs/redesign-code/3.html](../redesign-code/3.html)、[docs/redesign-code/4.html](../redesign-code/4.html) 为主
- 当前产品/工程约束以 [docs/anchor-desk-technical-design-nodejs.md](../anchor-desk-technical-design-nodejs.md)、[docs/implementation-tracker.md](../implementation-tracker.md)、[docs/anchor-desk-nextjs-app-structure.md](../anchor-desk-nextjs-app-structure.md) 为主

当前阶段仍然是 `P0 对话链路收口优先`。因此 redesign 必须满足两个硬约束：

1. 允许全面替换视觉系统、shell 和共享展示原语
2. 不允许为了视觉改造打乱现有对话、上传、citation、权限、SSE 和 provider 主链路

用户额外要求：

- 页面文案仍然是中文
- Stitch 页面中的英文仅作为视觉参考，不作为最终产品语言
- 本轮最终目标是“所有页面都按这个视觉系统设计”，不是只改 4 个示例页

## 2. 设计目标

新的 AnchorDesk 应从“暖纸感、厚卡片、偏传统工作台”切到“冷静、留白、editorial intelligence”方向，具体目标如下：

- 让产品整体更接近高端数字资料室，而不是传统 SaaS 后台
- 用表面层级、留白和排版建立结构感，减少对边框和重阴影的依赖
- 让 workspace、chat、knowledge base、settings、admin、auth、share 在同一视觉语言下成立
- 在不降低中文可读性的前提下，引入 Stitch 的 `Manrope + Inter` 气质
- 通过共享 shell 和共享原语统一页面，而不是逐页散写 className

非目标：

- 不重做产品信息架构
- 不改变 API、数据库、权限模型、消息流或 citation 契约
- 不借机重构复杂业务组件的核心状态管理
- 不为了贴近 stitch 样稿而引入英文产品文案

## 3. 现状判断

当前前端已存在两条主要 shell 族：

1. workspace family
   - `/workspaces`
   - `/workspaces/[workspaceId]`
   - `/workspaces/[workspaceId]/knowledge-base`
   - `/workspaces/[workspaceId]/settings`
   - `/workspaces/[workspaceId]/documents/[documentId]`
   - `/workspaces/[workspaceId]/reports/[reportId]`

2. management family
   - `/settings`
   - `/settings/libraries`
   - `/settings/libraries/[libraryId]`
   - `/admin/models`
   - `/admin/runtime`
   - `/account`

另有两类独立页面族：

3. auth family
   - `/login`
   - `/register`

4. public family
   - `/share/[shareToken]`

当前代码的最大问题不是“没有共享组件”，而是“共享层只覆盖了一部分”：

- `WorkspaceShellFrame` 已经是稳定壳层，但视觉语言仍是旧系统
- `SettingsShell` 只提供左右布局，没有提供新的 editorial page scaffold
- `ui.ts` 将旧的颜色、圆角、边框、阴影语义硬编码在 panel/button/input 上
- `.impeccable.md` 与本次 redesign 在配色、字体、圆角、边框策略上存在明显冲突

因此本次实现必须先重建设计系统底座，再让页面接入。否则只会形成“两套设计语言并存”的中间态。

## 4. 新设计系统

### 4.1 视觉北极星

采用 `The Digital Curator` 方向：

- 冷静
- 安静
- 高级
- 聚焦
- 编辑性强

结构感主要通过以下手段产生：

- tonal surfaces，而不是大量 1px border
- frosted app bar 和轻玻璃浮层
- 大小对比明显的标题层级
- 更长的阅读带和更克制的动作区
- 选中态的 anchor line，而不是卡片式高亮块

### 4.2 颜色

全局 token 改为 redesign 提供的 surface 语义：

- `primary`: `#000000`
- `background/surface`: `#F7F9FB`
- `surface-container-low`: `#F2F4F6`
- `surface-container`: `#ECEEF0`
- `surface-container-high`: `#E6E8EA`
- `surface-container-lowest`: `#FFFFFF`
- `secondary`: `#565E74`
- `tertiary-fixed`: `#F0E0CB`
- `outline-variant`: `#C6C6CD`
- `secondary-fixed`: `#DAE2FD`

设计规则：

- 默认不使用明确分区边框
- 只有白底叠白底、或可访问性需要时才使用 ghost border
- 危险操作继续保留红色，但只在 delete、不可逆动作中使用
- citation、AI 结果、资料来源标签优先使用暖 beige，而不是当前描边 chip

### 4.3 字体

视觉参考沿用 `Manrope + Inter`，但产品仍以中文为主，因此实现中不直接使用英文单字体栈，而采用混合 fallback：

- headline: `"Manrope", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif`
- body: `"Inter", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif`

规则：

- 取消当前 serif heading 方案
- 页面主标题、区块标题、workspace 名称、auth 标题全部切到 headline sans
- 元信息、标签、表单、正文全部走 body sans
- 中文文案保持中文，不引入 stitch 示例中的英文标题和说明

### 4.4 圆角、深度、边框

新的共享尺度：

- 大型面板：16px
- 普通卡片：14px
- 工具条/输入/次级按钮：12px
- pill/tag：9999px

规则：

- 废弃当前 20px/24px 为主的大圆角系统
- 深度优先靠 tonal layering，环境阴影只做极轻补充
- `panel` 不再默认携带实边框和可见卡片感
- `popover/dialog` 允许继续使用 blur，但边界改为 ghost border

## 5. 共享原语重建

本次实现先重建共享原语，再做页面接入。第一批要替换的原语如下。

### 5.1 Surface 家族

在 `ui.ts` 中新增或重命名以下 surface 语义：

- `pageSurface`
- `insetSurface`
- `raisedSurface`
- `glassSurface`
- `editorialPanel`
- `editorialSection`

这些原语负责统一：

- 页面大背景
- 侧栏、工具条、列表容器
- 主内容卡片
- sticky frosted top bar
- dialog/popover 的玻璃感表现

### 5.2 Button 家族

按钮体系统一为：

- `primary`
- `integrated`
- `ghost`
- `icon`
- `danger`

行为要求：

- `secondary` 由当前“白底描边”切到 integrated fill
- `ghost` hover 走 surface shift，不走黑色透明遮罩
- icon button 统一尺寸、hover 和 active 手感

### 5.3 Field 家族

输入体系统一为 filled field：

- `textInput`
- `textarea`
- `select`
- `searchField`

规则：

- 默认使用 `surface-container-low`
- focus 时切到 `surface-container-lowest` 并补轻 ghost border
- 去掉当前明显描边和强 ring 的视觉

### 5.4 Tag/Chip/Status 家族

需要从当前描边 pill 改成语义填充：

- citation chip
- source chip
- category tag
- status pill
- counter badge

### 5.5 Navigation 家族

统一以下模式：

- workspace sidebar item
- management sidebar item
- top tab
- breadcrumb trigger

规则：

- active 态使用左侧 2px anchor line 或下划线
- 不再用白底浮起的 nav selected block 作为主模式

### 5.6 Header 家族

新增共享 page/header scaffold：

- frosted app bar
- editorial page hero
- compact section header
- toolbar shell

这层用于统一 `/workspaces`、workspace 内页、settings/admin 页面顶部结构。

## 6. 页面家族设计

### 6.1 Workspace Family

#### `/workspaces`

改造成 stitch 的 workspace overview 语言：

- 左上品牌
- 顶部轻 app bar
- editorial hero
- workspace tiles 改成更轻的 raised surfaces
- tile 内部使用更明显的标题/元信息层级

保留：

- 工作空间数量
- 会话数、资料数、最后活跃
- 新建 workspace 入口

#### `/workspaces/[workspaceId]`

保留现有业务结构：

- `WorkspaceShellFrame`
- `ConversationPageActions`
- `WorkspaceConversationPanel`

但视觉上调整为：

- 新的 sidebar 导航语言
- 顶部 frosted bar + breadcrumb
- 聊天气泡、引用 capsule、composer shell 切到 editorial 风格
- 过程状态 capsule 采用轻 surface + 语义 chip

高风险边界：

- 不拆 `WorkspaceChatView` 的状态编排
- 不改 composer 提交、stop、retry、SSE、quoted follow-up 逻辑

#### `/workspaces/[workspaceId]/knowledge-base`

保留 `KnowledgeBaseExplorer` 的业务能力，但替换其外观：

- page hero 和 toolbar 改为 stitch 风格
- 数据表格弱化边框，增强留白和 hover
- 只读 mounted library 与可编辑 private library 必须继续明确区分
- toolbar、批量操作区、row actions 使用新的 integrated/ghost 控件

高风险边界：

- 不改上传状态机
- 不改拖拽、轮询、任务刷新逻辑
- 不模糊权限差异

#### `/workspaces/[workspaceId]/settings`

保留信息架构：

- 基础信息
- 全局资料库订阅
- 生命周期/删除

但整体切成更统一的 editorial settings 页面：

- 顶部 hero
- 更轻的 section 容器
- 两栏 setting row 重做为共享原语
- danger zone 用新的危险动作视觉，但仍保持强识别

#### `/workspaces/[workspaceId]/documents/[documentId]`

沿用 workspace shell，但让阅读区、文档元信息、页内导航、引用跳转视觉与新系统统一。阅读体验优先简洁，避免过度卡片化。

#### `/workspaces/[workspaceId]/reports/[reportId]`

沿用 workspace shell，使报告页与 chat 的阅读带、引用/附件卡片、章节结构语言统一。

### 6.2 Management Family

对 `SettingsShell` 做升级，使其不再只是左右分栏，而是完整的 management shell：

- 冷色 sidebar
- sticky frosted top region
- 统一 page header
- 统一 content width 和 section rhythm

覆盖页面：

- `/settings`
- `/settings/libraries`
- `/settings/libraries/[libraryId]`
- `/admin/models`
- `/admin/runtime`
- `/account`

其中：

- `/settings` 维持“section form 列表”
- `/settings/libraries` 维持“创建表单 + 卡片列表”
- `/admin/models` 维持 master-detail，但重做左右密度和层级
- `/admin/runtime` 维持 dashboard，但套入同一套 management shell
- `/account` 改成同一视觉语言下的 personal settings workbench

### 6.3 Auth Family

新增共享 auth frame：

- editorial brand block
- centered auth surface
- 更纯净的登录/注册布局

保留：

- `AuthForm` 逻辑
- 注册开关判断

替换：

- 表单容器、间距、标题、底部链接的视觉

### 6.4 Public Share Family

`/share/[shareToken]` 使用独立 public frame：

- frosted sticky header
- 更开放的阅读带
- 对话正文与 citation 面板沿用 chat 系统视觉

高风险边界：

- 只改视觉壳层和只读展示
- 不改 share 权限与 citation 链路

## 7. 文档与规范同步

本次 redesign 不能只改代码，必须同步更新规范文件：

1. `.impeccable.md`
   - 用新的颜色、字体、圆角、surface、按钮、输入、导航、页面头部规则替换旧系统
2. 必要时补充 `docs/DESIGN.md` 与项目内部规范之间的落地映射
3. 若页面家族或前端共享层组织方式发生结构性变化，应同步更新 `docs/anchor-desk-nextjs-app-structure.md`

原则：

- `.impeccable.md` 最终必须和代码一致
- 不允许 redesign 落地后，仓库长期保留过期视觉规范

## 8. 实施策略

采用“共享底座先行，再全站接入”的实现策略。

### 8.1 第一步：设计系统底座

- 更新 `globals.css` token
- 更新 `ui.ts`
- 新增或改造共享 surface/button/field/tag/nav/header 原语
- 重做 `WorkspaceShellFrame`
- 重做 `SettingsShell`
- 抽出 auth frame 和 public frame

### 8.2 第二步：页面接入

按页面家族逐步接入：

1. `/workspaces`
2. workspace family 内页
3. management family
4. auth family
5. public share family

### 8.3 第三步：文档同步

- 更新 `.impeccable.md`
- 视需要更新 app structure 文档

## 9. 测试策略

本次是视觉系统级改造，但仍需保持 TDD 纪律，至少补以下验证：

- `apps/web/lib/ui.test.ts`
  - 新的 variant/size/class 语义
- `apps/web/lib/workspace-shell.test.ts`
  - shell 关键状态与导航路径不回退
- 涉及重构的组件测试
  - 保留现有行为断言
  - 如需调整 snapshot 或 DOM 查询，应围绕真实交互而不是 className 细节

手工验证范围：

- `/workspaces`
- `/workspaces/[workspaceId]`
- `/workspaces/[workspaceId]/knowledge-base`
- `/workspaces/[workspaceId]/settings`
- `/settings`
- `/settings/libraries`
- `/admin/models`
- `/admin/runtime`
- `/account`
- `/login`
- `/register`
- `/share/[shareToken]`

必须重点验证：

- 会话发送、停止、失败重试
- citation 展示与分享页只读展示
- 知识库上传、任务刷新、只读挂载库
- 设置页保存与删除类操作
- 移动端 drawer 与响应式布局

## 10. 风险与缓解

### 10.1 视觉规范冲突

风险：

- `.impeccable.md` 现有规则与 redesign 正面冲突

缓解：

- 将 `.impeccable.md` 视为本轮必须更新的交付物，而不是后补

### 10.2 共享层变更过大

风险：

- `ui.ts`、`WorkspaceShellFrame`、`SettingsShell` 一旦改错，会影响大量页面

缓解：

- 优先保持 API 形状稳定，只替换 class 和局部结构
- 页面接入阶段尽量不同时做业务重构

### 10.3 聊天与知识库业务回归

风险：

- 对话主链路和资料库操作链路都带复杂状态

缓解：

- 只改展示层
- 不改变业务状态来源和数据流向
- 对高风险页面先做局部原语接入，再做整体整理

### 10.4 范围膨胀

风险：

- “全站 redesign”容易演变为“顺便重构半个前端”

缓解：

- 以页面家族和共享原语为边界
- 不把信息架构重设计加入本轮
- 复杂领域组件以换皮和局部结构调整为主

## 11. 交付结果

本轮实现完成后，应满足以下结果：

- AnchorDesk 全站使用同一套 editorial 设计系统
- 中文产品文案保留
- workspace、management、auth、public 四类页面视觉统一且边界清晰
- `.impeccable.md` 与代码实现一致
- 对话、citation、上传、权限主链路保持现有行为
