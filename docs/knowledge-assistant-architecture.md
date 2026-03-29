# 通用知识库 Agent 助手架构背景

版本：v0.2  
日期：2026-03-28

> 本文件保留为宏观背景与备选方案说明，不作为当前实施口径。
> 当前实施请优先参考 [knowledge-assistant-technical-design-nodejs.md](./knowledge-assistant-technical-design-nodejs.md) 和 [implementation-tracker.md](./implementation-tracker.md)。

## 1. 总体方向

系统的核心不是“更花哨的 agent”，而是稳定的：

- 上传与异步消化
- 结构化解析
- 工作空间隔离检索
- 可点击、可回溯的引用
- 受控的最终回答

## 2. 长期可扩展方向

- sparse + dense 混合检索
- evidence dossier
- 更完整的 SSE 工具时间线
- 更细粒度的文档阅读定位
- 更多专项工具

## 3. 专项工具边界

虽然产品整体去垂类化，但可继续保留少量专项工具。当前已确认保留的专项工具是：

- `search_statutes`

它作为独立能力存在，不改变产品整体的通用知识库助手定位。
