# TikTok Sandbox 数据测试授权隔离设计

状态：待用户审阅；尚未实现。日期：2026-10-06。

## 目标与边界

用户指定 `andypeng97` 测试 `video.list`、`user.info.stats`，用真实返回数据录制审核视频。
保留所有账号的正式发布授权，不替换生产密钥，不新增评论、私信、发布或个人资料权限。
完成意味着：独立授权部署成功、指定账号实际授权成功、账号统计与至少一条本软件发布的公开视频指标真实返回。
模拟数据、空列表、仅测试通过或仅 Sandbox 后台保存成功都不算端到端完成。

## 已查证的现状

- 已部署数据功能提交 `fb2256c`；生产 OAuth 仍使用原有配置。
- Sandbox `BufferHelp TikTok 绑定测试` 已保存两个新权限，目标用户包含 `andypeng97` 和 `mooyamcosmetic`。
- 软件目前只有全局 `TIKTOK_CLIENT_ID` / `TIKTOK_CLIENT_SECRET`，发布凭证一账号一条。
- 发布任务和后台续期都读取 `SocialAccount` / `OauthCredential`。
- 帖子数据服务只允许本工作区真实发布成功、带数字视频 ID 的 TikTok 帖子。
- `user.info.basic` 可返回 `open_id`、`union_id`，不能返回 `username`。
  官方说明：https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info
- 现有发布模块已通过 Creator Info 读取 `creator_username`，可用于核验正式绑定账号。

## 方案选择

采用独立的 Sandbox 只读授权入口和凭证表，复用现有统计展示及只读 API 适配器。
替代方案为独立测试站点及数据库，隔离更强但需要额外部署、域名及真实发布记录迁移。
不采用全局切换密钥，也不把测试账号写进正式发布账号表。

## 访问与身份校验

- 功能默认关闭，配置服务器端的单一允许用户 ID、工作区 ID、正式 TikTok 账号 ID；必须同时匹配。
- 该用户还须是工作区有效 owner/admin。前端隐藏不是安全边界，每个后端接口均重新鉴权。
- 开始授权时，用指定正式账号的有效凭证只读查询 Creator Info，严格匹配 `andypeng97`；
  同时查询其 `open_id,union_id`，校验 open_id 与原正式账号一致。
- Sandbox 回调读取相同基础字段，必须匹配预期 union_id，且 token 返回的 open_id 与基础资料一致。
- 不拿 display_name 当用户名；不假定不同 client 的 open_id 相同。
- 无正式绑定账号、缺少必要的既有权限、空 union_id 或身份不一致时拒绝，不自动放宽限制。
- 最终仍需用户本人在 TikTok 登录 `andypeng97` 并同意授权。

## 凭证与 OAuth 隔离

- 新增独立 Sandbox 凭证和 OAuth state 表，关联允许用户、工作区及原正式账号；增量迁移，不改现有表语义。
- Sandbox access/refresh token 使用现有加密工具；保存 Sandbox client key 标识、open_id、union_id、实际 scopes 和到期时间。
- 独立服务器配置 `TIKTOK_SANDBOX_CLIENT_ID`、`TIKTOK_SANDBOX_CLIENT_SECRET`；不返回给前端或记录到日志。
- 独立回调路径 `/api/v1/integrations/tiktok-sandbox/oauth/callback`，在 Sandbox Login Kit 增加该 URI，保留原 URI。
- 请求 scopes 固定为 `user.info.basic,video.list,user.info.stats`；不申请发布权限。
- 使用不可预测、短期、一次性的 state，绑定用户、工作区、正式账号和已核验的 union_id；回调原子消费，防并发重放。
- 实际授权缺项、用户拒绝、state 超时、错账号等均返回脱敏错误，不覆盖已有可用测试凭证。
- 测试 token 仅手动读取时按需续期，使用独立锁和 Sandbox 密钥；不加入生产定时续期扫描。
- 禁用、身份权限失效或 client key 改变后拒绝使用旧测试凭证。断开测试连接仅删除测试凭证，不撤销正式授权。

## 页面与数据行为

- 仅允许用户看到“TikTok Sandbox 数据测试”面板，标明只读、测试账号和授权状态。
- 提供连接、断开、手动刷新账号统计，以及从本工作区该正式账号的已发布记录中选择帖子。
- 帖子保留现有成功状态、非模拟、账号归属、隐私和数字视频 ID 校验；仅换用经身份校验的测试 token 查询。
- 不录入任意他人视频 ID，不伪造发布记录，不把 Sandbox 连接列为可发布渠道。
- 复用现有指标展示；显示真实获取时间，缺权限/限流/不可用不能显示为零。
- 不下载视频原件，不持续轮询，不定时同步；只保存授权所需少量记录。
- 如果该账号没有本软件发布的公开视频，端到端测试暂不可完成。向用户说明，并由用户选择已有记录或明确授权发布测试内容。

## 测试、部署与验收

先写失败测试，再实现：允许列表、跨工作区、错账号、空 union_id、重放和并发、拒绝授权、缺 scope、续期竞争、client 变更。
以数据库集成测试确认：测试回调/续期/断开均不更新正式凭证或正式账号状态，测试连接不进入发布队列。
保留现有权限和发布回归测试；运行完整 API/web 测试、lint 和 build。
部署前确认工作区干净，备份数据库；增量迁移后再更新应用，保留现有生产配置。
开关默认关闭，部署后健康检查通过才配置允许列表和 Sandbox 凭证；密钥不通过聊天发送。
启用后用户完成授权，实测账号四项统计、至少一条已发布公开视频四项指标；授权前后对照正式凭证未被测试流程改写。
回滚先关闭测试开关，再回退应用镜像；新增表保留，不删除正式数据。

## 需要用户配合的外部步骤

审阅本设计；后续审阅实施计划。实施和部署后，用户完成 Sandbox 登录/同意授权。
配置密钥时使用安全的服务器配置方式，不在聊天中发送 secret。
不自动替用户提交审核、接受新条款或公开发布测试视频。
