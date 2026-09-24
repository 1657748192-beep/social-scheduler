# YouTube、TikTok、Facebook 授权生命周期设计

**日期：** 2026-09-24
**状态：** 设计方向已确认，待用户审阅本文档
**范围：** 已连接账号的自动续期、失效分类、应用内提示与发布前校验；不改变平台 OAuth 申请权限。

## 目标与成功标准

用户希望已连接账号在正常令牌到期后继续发布，不因短暂网络故障被误标为“授权过期”；授权被撤销或发布权限不足时，应明确说明需要用户采取什么行动。正常自动续期不要求用户反复登录，也不暴露令牌或客户端密钥。

成功标准：

1. YouTube 和 TikTok 在后台及实际发布时都能使用有效 refresh token 更新 access token，续期结果安全地写回数据库。
2. 临时错误保留账号原状态并重试；确认无法续期、用户撤销授权、缺少权限时，分别显示可操作的状态或错误。
3. Facebook Page 令牌按自身规则验证，不误用 Facebook User 令牌的到期时间，也不假设 Page 令牌有 refresh token。
4. 定时发布在可恢复的令牌到期时自动继续；无法恢复时留下明确任务失败原因，账号界面与任务结果不互相矛盾。
5. 同一账号的后台检查和发布并发时，不会用旧令牌覆盖新令牌，尤其不能丢失 TikTok 轮换后的 refresh token。

## 当前实现与风险

- YouTube 在发布时检查 access token 的 `expiresAt`，临近到期时使用 refresh token 换新；没有后台检查，也没有将失效原因映射到账户状态。OAuth 已请求 `access_type=offline` 与 `prompt=consent`。
- TikTok 在发布及读取创作者发布信息时续期，保存 TikTok 返回的新 refresh token；没有后台检查。任何续期失败都会将账号设为 `token_expired`，包括可能的临时错误。
- Facebook OAuth 先换取长效 User 令牌，再用 `/me/accounts` 获取 Page 令牌；Page 凭证目前沿用 User 令牌响应的 `expires_in`。发布器直接用 Page 令牌调用 Graph API，不检查有效性或分类错误。
- Worker 已有 Pinterest、Instagram 的定期续期入口；`SocialAccountStatus` 已包含 `active`、`token_expired`、`authorization_invalid`、`permission_missing`，前端已有对应状态文案。
- 用户展示的 Google Auth Platform 截图为“正式版 / 外部”；仍需确认该项目与生产环境 YouTube OAuth 客户端一致。设计不以测试状态七天过期为前提。

## 方案比较

### 方案 A：仅保留发布时续期

改动最少，但 TikTok 与 YouTube 长时间不发布时无法提前发现 refresh token 失效；Facebook 仍可能显示“已连接”直到实际发布失败。不采用。

### 方案 B：复用现有 Worker，增加平台专用凭证服务（采用）

YouTube、TikTok 各有续期服务，Facebook 有 Page 令牌校验服务。Worker 定期扫描，发布路径调用同一服务；所有服务共用明确的错误分类与状态更新约定。沿用现有账号状态、任务队列和前端页面，仅增加必要的到期元数据与应用内提示。改动范围适中，且能覆盖定时发布场景。

### 方案 C：新建独立授权服务、通知队列和邮件告警

可扩展性更强，但需要新的部署和运维组件；本次问题不需要。不采用。后续账号规模或通知需求增长时再评估。

## 架构与数据流

```text
OAuth 回调 ──> 加密保存 access/refresh token 与各自的到期信息
                    │
Worker 定时扫描 ─────┼──> 平台凭证服务 ──> 官方续期或校验接口
                    │                         │
发布前校验 ──────────┘                         ├─ 成功：原子更新凭证，保持 active
                                              ├─ 确认失效/缺权限：更新账号状态
                                              └─ 暂时故障：保留状态，记录错误并重试
```

复用 `OauthCredential`，新增可选 `refreshTokenExpiresAt`，记录 TikTok 返回的 `refresh_expires_in`，以及 Google 在返回 `refresh_token_expires_in` 时的期限。该字段缺失表示平台未提供期限，不表示永不过期。现有 `expiresAt` 继续仅表示 **access token** 的到期时间。

续期或重新授权后写入最新期限；应用内可在已知的 refresh token 期限临近（建议 30 天、7 天）时提示重新连接。只做站内提示，本期不发邮件。不得把 refresh token 或完整第三方响应送到浏览器或普通日志。

后台扫描使用现有 Worker，按平台设置合理窗口：YouTube 每 30 分钟检查即将到期的 access token，并保留发布时兜底续期；TikTok 每 6 小时检查，在 24 小时 access token 到期前预留至少 8 小时缓冲；Facebook 每天检查有效性和 Page 发布权限。扫描应分批限流，且不得因一个账号失败中断其他账号。多 Worker 实例部署时须有跨实例互斥或等效控制，确保同一账号不会被并发续期。

## 平台行为

### YouTube

授权时继续请求离线访问并保存 refresh token。后台或发布时，若 access token 临近到期，调用 Google token endpoint 续期并更新 `expiresAt`；Google 若返回新的 refresh token，也应保存，未返回则保留旧值。若初次授权或旧数据没有 refresh token，应显示需重新连接，而不是尝试无意义重试。

Google 返回明确的 `invalid_grant` 等不可恢复凭证错误时标为 `authorization_invalid`；已知 refresh token 到期且超过期限时可标为 `token_expired`。网络超时、限流与 5xx 仅重试。YouTube API 返回缺少 `youtube.upload` 等授权权限时标为 `permission_missing`，不把配额、视频格式或普通上传错误误判为授权问题。

### TikTok

后台和发布路径共用一个续期函数。成功时**同时**保存新 access token、新 refresh token（如返回）及各自期限。由于 TikTok 可轮换 refresh token，必须按社交账号序列化续期，或用等效的并发控制，避免两个任务都使用旧 refresh token，并避免旧请求覆盖新凭证。

只在 TikTok 明确表示令牌无效、已撤销或已过期时改为 `authorization_invalid`/`token_expired`；缺少 `video.publish` 等必要权限时改为 `permission_missing`。超时、429、5xx、格式异常的暂时性响应不应直接将账号改成“授权过期”。若平台给出的 refresh token 截止日期接近，应提前在应用内提示用户重新连接；自动换取 access token 不能保证已失效的 refresh token 得以恢复。

### Facebook

继续在 OAuth 后使用 Page 令牌发布。将 Page 凭证的 `expiresAt` 与 User 令牌的 `expires_in` 解耦：连接时保存 Page 令牌自身可确认的到期信息；若 Meta 不提供明确到期时间，则记为未知，而不是复制 User 令牌的日期。既有 Facebook Page 凭证的旧日期也须在迁移/首次检查时纠正，不能仅凭该日期判定失效。

后台使用 Meta 的令牌检查机制及必要的轻量 Page 权限检查，确认 Page 令牌仍有效、当前账号仍可管理目标 Page，且具备发布所需权限。发布 API 的认证/权限错误也走同一分类。可确认的撤销或失效设为 `authorization_invalid`，缺少 Page 发布权限设为 `permission_missing`；网络、限流、5xx 保留 `active` 并重试。没有通用 refresh token 可用时，不承诺自动恢复已撤销的 Page 授权，必须引导用户重新连接。

## 共用错误、状态与界面规则

错误分类先依据平台官方机器可读错误码与 HTTP 状态，再使用保守的后备规则，不依赖英文错误文案匹配。`401` 或 `403` 也不能不经平台语义判断就统一写为过期/权限不足。

| 判定结果 | 账号处理 | 用户操作 |
| --- | --- | --- |
| 正常到期、可续期 | 续期后保持 `active` | 无需操作 |
| 已知 refresh token 期限到期 | `token_expired` | 重新连接 |
| 撤销授权或不可恢复的无效凭证 | `authorization_invalid` | 重新连接 |
| 所需授权范围或 Page 权限缺失 | `permission_missing` | 补权限后重新授权 |
| 网络、429、5xx 或不确定故障 | 保留原状态，按退避策略重试 | 暂不要求重新授权 |

账号列表与左侧平台状态继续使用现有状态文案；已知 refresh token 即将失效的提示不覆盖 `active` 状态。OAuth 重新连接成功后重置异常状态为 `active`。若另一任务已更新凭证，旧请求不得再把账号写成失效状态。

发布前继续调用平台凭证服务取得可用令牌。YouTube、TikTok 的只读授权检查若返回明确的令牌失效，可强制续期一次；对于创建帖子/视频等非幂等操作，不因不确定的响应盲目重试，以免重复发布。Facebook 没有 refresh token，遇到认证错误只做状态分类与提示重连。定时任务的失败记录应保留平台、错误类别与可操作说明，但不记录令牌。

## 测试与验收

- 单元测试覆盖：提前续期、续期后新令牌落库、TikTok refresh token 轮换、期限缺失、Google `invalid_grant`、TikTok 撤销/权限不足、Meta Page 权限缺失、429/5xx/网络故障不误标、并发续期不覆盖新令牌。
- 集成测试覆盖：Worker 扫描到期账号、发布时兜底续期、重新连接恢复状态、账号列表/侧边栏的正确文案、定时发布失败原因不泄露凭证。
- 使用模拟官方响应运行自动化测试；部署后通过受控测试账号进行一次真实续期/校验与定时发布验证，不在日志、截图或工单中展示 access token、refresh token 或客户端密钥。
- 上线顺序为数据库兼容迁移、服务端与 Worker、前端提示；保留现有发布时续期作为回退路径。验收须确认健康检查、Worker 运行、无异常重复续期、账号状态与任务结果一致。

## 边界与官方依据

本期不实现邮件通知、不改 OAuth 申请范围、不保证恢复用户主动撤销的授权，也不将 Facebook Page 令牌错误地当作可轮换 refresh token。线上实际账号状态仍需以真实 API 校验结果为准，不能从代码或截图推断。

- Google OAuth 的 [refresh token 失效条件](https://developers.google.com/identity/protocols/oauth2#expiration) 与 [离线访问续期](https://developers.google.com/identity/protocols/oauth2/web-server#offline)。
- TikTok 的 [User Access Token Management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)，包括 access token、refresh token 期限与轮换。
- Meta 的 [Page 令牌获取流程](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage)；具体令牌状态以 Meta 返回的校验结果为准。
