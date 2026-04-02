# NEXT

## 当前保留议题

- 切换 conversation 模型时是否需要主动重置 `Agent Session`。当前版本先保持不自动 reset，后续根据 Claude Agent SDK `resume` 的跨模型稳定性再决定。
- `/admin/models` 之外的后台运行状况、错误日志和更完整的运维面板暂缓，不和当前多模型能力一起推进。
- 快速会话模式、深度研究模式选择仍未立项，等待主会话链路与失败恢复体验进一步稳定后再评估。
- 当 workspace 已有可检索本地资料时，是否再增加一次显式 retrieval preflight 或更强的工具编排；当前只通过 agent prompt 强化“附件/本地知识优先”。
- 选区追问

## 最近完成

- 会话侧栏在 assistant 生成中时，右侧时间位改为 loading；hover / focus 时仍切到省略号，点击后继续提供删除操作。
