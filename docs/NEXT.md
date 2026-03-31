+ 增加多种可选模型。
+ 第一阶段范围：仅支持 Claude-compatible 模型配置；新增独立模型表，字段至少包含 provider/api_type、base_url、model_name、display_name、api_key 或 credential_ref、enabled、is_default。
+ 会话支持选择模型，优先按 conversation 维度持久化 `model_profile_id`；主对话与报告相关工具统一改为按请求解析模型配置，不再依赖全局 `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL`。
+ 原有 `/settings` 明确降格为“系统参数”页，Anthropic 模型类配置从 `system_settings` 迁出；新增更友好的系统管理后台页承接模型管理。
+ 用户中途切换模型时，第一版先不主动重置 Agent Session；实现时需要验证 Claude Agent SDK `resume` 在跨模型场景下是否稳定，如出现兼容性问题再回退为切模型时重建 session。
+ 运行状况、错误日志等后台能力暂缓，不与第一阶段多模型能力绑在一起上线。
+ 快速会话模式、深度研究模式选择
+ 当 workspace 已有可检索本地资料时，可进一步评估在 agent 自由调用工具前增加一次本地资料检索预检，或把 `search_workspace_knowledge` 提升为更强的优先编排；保持其他工具仍可在证据不足时继续参与，而不是硬禁用。
