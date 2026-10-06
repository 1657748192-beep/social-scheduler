# TikTok Sandbox 验收记录

目标：andypeng97；生产发布授权保持独立。当前尚未完成真实账号验收或 Sandbox 代码部署。

- 独立代码工作区：`source/.worktrees/tiktok-sandbox-metrics`，分支 `codex/tiktok-sandbox-metrics`。
- 本地独立 PostgreSQL 容器：`codex-tiktok-sandbox-test`，端口仅绑定 `127.0.0.1:55439`，测试库 `tiktok_sandbox_test`。
- 基线：193 项测试通过；访问控制后 208 项测试通过。
- 加法迁移已在本地测试库验证，不采纳历史 schema drift 中的删表或外键修改。
- 授权、回调重放、角色失效、并发刷新、断开隔离测试已通过（仅网络边界使用测试响应）。
- 2026-10-06 最终全量测试 231/231 通过，包含专用 PostgreSQL 并发续期/断开测试；lint、build、git diff --check 通过。
- 独立审查发现两项 Important：容器未接收测试配置、授权回跳无提示。已补回归测试，分别观察失败后修复通过；未发现 Critical 或 Minor。
- 本地浏览器使用真实面板、明确标注的网络测试响应验证：不自动读统计、双击仅一次请求、切换工作区和退出后旧响应不显示、失败提示可见。该验证不是 TikTok 真实数据验收。
- 生产迁移、上线及真实授权：待完成。
- 依赖安装报告现有 18 项漏洞（4 moderate、12 high、2 critical），本功能未升级依赖；需另行评估，不代表已修复。

## 上线前必须确认

1. 服务器数据库备份已生成且可验证；旧镜像有回滚引用。
2. 两个新增 Sandbox 表迁移成功，开关默认关闭，生产配置未覆盖。
3. 指定用户、工作区和 andypeng97 正式账号 ID 明确匹配。
4. Sandbox client secret 通过安全服务器输入方式配置，不经聊天或日志。
5. 用户亲自完成测试授权；账号统计和本软件真实公开视频数据返回后才能记录端到端完成。
