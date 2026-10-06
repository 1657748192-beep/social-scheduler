# TikTok Sandbox 验收记录

目标：andypeng97；生产发布授权保持独立。代码已部署，测试入口保持关闭，真实账号验收尚未完成。

- 独立代码工作区：`source/.worktrees/tiktok-sandbox-metrics`，分支 `codex/tiktok-sandbox-metrics`。
- 本地独立 PostgreSQL 容器：`codex-tiktok-sandbox-test`，端口仅绑定 `127.0.0.1:55439`，测试库 `tiktok_sandbox_test`。
- 基线：193 项测试通过；访问控制后 208 项测试通过。
- 加法迁移已在本地测试库验证，不采纳历史 schema drift 中的删表或外键修改。
- 授权、回调重放、角色失效、并发刷新、断开隔离测试已通过（仅网络边界使用测试响应）。
- 2026-10-06 最终全量测试 231/231 通过，包含专用 PostgreSQL 并发续期/断开测试；lint、build、git diff --check 通过。
- 独立审查发现两项 Important：容器未接收测试配置、授权回跳无提示。已补回归测试，分别观察失败后修复通过；未发现 Critical 或 Minor。
- 本地浏览器使用真实面板、明确标注的网络测试响应验证：不自动读统计、双击仅一次请求、切换工作区和退出后旧响应不显示、失败提示可见。该验证不是 TikTok 真实数据验收。
- 2026-10-06 服务器由 `fb2256c` 快进至 `a63f632a9480ce47beca7daaf9e159d48503544b`，三项应用镜像构建通过。
- 更新前受限目录内 PostgreSQL 自定义归档备份约 1016 KB，`pg_restore --list` 检查通过；旧 api/worker/web 镜像保存标签 `before-sandbox-20261006034713`。没有删除旧数据、镜像或环境备份。
- `20261006000100_tiktok_sandbox_metrics` 迁移成功，api/worker/web 更新成功；数据库、Redis 保持原容器运行。
- 公网 `/api/v1/health` 返回 ok、database ok、redis PONG；`/dashboard` HTTP 200；测试 status 未登录 HTTP 401；无 state 的独立 callback 返回固定失败跳转、no-store/no-referrer。
- API 实际配置：Sandbox=false，测试 client key/secret 未配置；两张测试表记录数均为 0。未更改服务器 .env 或生产 TikTok scopes，测试配置只映射 API。
- 只读 Creator Info 核验：现有正式连接没有用户名 `andypeng97`。需用户确认目标是否改名或先连接正确账号，不能按昵称推断或自动放宽限制。
- 尚待完成：指定账号身份确认、独立密钥安全配置、Sandbox callback 添加、用户本人授权，以及账号统计和至少一条真实公开视频指标验收。
- 依赖安装报告现有 18 项漏洞（4 moderate、12 high、2 critical），本功能未升级依赖；需另行评估，不代表已修复。

## 上线前必须确认

1. 服务器数据库备份已生成且可验证；旧镜像有回滚引用。
2. 两个新增 Sandbox 表迁移成功，开关默认关闭，生产配置未覆盖。
3. 指定用户、工作区和 andypeng97 正式账号 ID 明确匹配。
4. Sandbox client secret 通过安全服务器输入方式配置，不经聊天或日志。
5. 用户亲自完成测试授权；账号统计和本软件真实公开视频数据返回后才能记录端到端完成。
