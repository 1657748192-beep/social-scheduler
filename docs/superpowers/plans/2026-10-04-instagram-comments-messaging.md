# Instagram 评论、私密回复与收件箱实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已由 Social Scheduler 发布的 Instagram 帖子提供互动数据、评论公开/私密回复，并增加人工操作的 Instagram 私信收件箱，同时保护现有 Instagram 发布流程。

**Architecture:** 沿用 Instagram Login 和当前 `graph.instagram.com` 接入；OAuth 增量授权单独开启新权限。API 通过工作区作用域端点访问 Meta，Webhook 在 Express JSON 中间件前验签并快速处理。互动正文只按需读取、不落库；唯一的新增数据是用于私密回复幂等控制的最小状态。前端扩展帖子管理并新增收件箱入口。

**Tech Stack:** TypeScript、Express、Prisma/PostgreSQL、React/Next.js、Node `node:test`/`tsx`。

**Spec:** `docs/superpowers/specs/2026-10-04-instagram-comments-and-post-stats-design.md`

## 全局约束

- 不更改 Facebook OAuth scopes、Facebook 功能或其他平台的授权/发布行为。
- 保留 Instagram 原有基础访问和内容发布 scopes；新权限分别控制评论能力与消息能力。用户取消/拒绝增量授权时，不覆盖原凭证、不影响已上线发布。
- Meta scope 未获批/账号未授权时，只禁用对应能力并明确提示；不得将其误判为账号整体授权失效。
- 只对存在于当前工作区、由 Instagram 成功发布且有 `providerPostId` 的帖提供评论/指标功能。绝不接受客户端提供的任意媒体 ID 作为授权依据。
- 评论/消息正文和互动指标不写入数据库、应用日志、错误日志或 webhook 事件日志；新增表只存幂等所需的 ID、状态和时间。
- 所有读取/发送均校验登录、工作区成员、Instagram 账号归属及对应权限。发送仅 owner/admin/editor；viewer 只读。
- 私密回复须遵守 Meta 的一次性和时间窗规则；普通私信仅回复先发起对话的用户并遵守消息窗口。禁止自动重试可能造成重复发送的请求。
- Webhook 保持 HTTPS 443 现有入口，无新端口；处理重复投递，伪签名不触发业务操作，不输出 token/正文。
- 任何数据库 schema 变更都随 Prisma migration 提交；不得触碰用户现存未跟踪文件或生产 `.env`。

## Review Focus

- API 权限校验必须以数据库中帖子、`PublishJob`、`SocialAccount` 的关联为准，避免 IDOR / 跨工作区访问。
- Meta API 适配层应统一解析权限不足、授权失效、时间窗、限流与暂时故障；临时错误不得更改账号授权状态。
- 增量 OAuth 的取消、回调失败、scope 部分授予必须保留原有 access token、scope、账号身份和发布能力。
- 私密回复并发请求必须由数据库唯一约束/原子状态转换防重，而非仅靠前端禁用按钮。
- 不要把 OAuth access token、评论/消息内容、用户收件箱内容或原始 webhook payload 写入日志。
- 部署脚本只补充配置检查/默认值，不强制覆写用户已配置的 Instagram scope，也不改 Facebook scope。
- UI 中英文、空/加载/权限/授权/时间窗/限流错误状态一致；键盘可操作且失败时保留用户输入。

---

## Task 1: 定义 Instagram 私密回复幂等状态与 migration

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_instagram_private_reply_attempts/migration.sql`, `apps/api/tests/instagramPrivateReplyState.test.ts`, 必要时新增 `apps/api/src/services/instagramPrivateReplyStateService.ts`。

- [ ] 先写状态服务测试：允许 `pending -> sent/failed`；同账号同评论重复创建被唯一键拒绝；失败/不确定结果不会自动转回可发送；记录不含正文、token、用户名或消息内容。
- [ ] 运行 `npx tsx --test apps/api/tests/instagramPrivateReplyState.test.ts` 并确认测试先因缺少服务/表结构失败。
- [ ] 在 Prisma 建立最小表：socialAccountId、mediaId、commentId、status、providerMessageId、createdAt、updatedAt；对 `(socialAccountId, commentId)` 建唯一约束并关联 SocialAccount cascade delete。
- [ ] 建立 migration，并实现原子创建/状态更新服务；将 `P2002` 映射为可识别的 duplicate 状态，不记录敏感请求体。
- [ ] 重新运行上述测试；再运行 `npm run db:generate -w apps/api` 与 `npm run lint -w apps/api`。
- [ ] 提交：`feat: add Instagram private reply idempotency state`。

## Task 2: 建立 Instagram Graph API 互动/消息适配层

**Files:** `apps/api/src/integrations/social/instagramEngagement.ts`, `apps/api/tests/instagramEngagement.test.ts`。

- [ ] 先写 adapter 测试，覆盖成功响应、分页游标、provider 错误码映射（permission missing、authorization invalid、window expired、rate limited、temporary failure）、缺字段/非法响应和网络故障；确保异常不包含 token 或正文。
- [ ] 运行 `npx tsx --test apps/api/tests/instagramEngagement.test.ts` 并确认新测试失败。
- [ ] 实现可注入 fetch 的小型 adapter，使用已配置的 Instagram Login API host/version；覆盖帖子点赞/评论数、评论分页、公开评论回复、对话分页、消息读取/发送、评论私密回复。请求只在调用期间持有返回正文，不写持久存储。
- [ ] 对照当前 Meta 官方 Instagram Login、Comments、Messaging、Private Replies 文档核实 endpoint、字段、分页和权限要求；不要从 Facebook Login 的 Graph API 规则推断 Instagram Login 支持情况。将 API 版本集中配置，避免在新文件重复散落硬编码。
- [ ] 测试私密回复策略：只接受 webhook/Meta 提供的有效评论上下文；7 天外及 Live 结束后的 Live 评论拒绝；调用前验证重复状态。普通 DM 只允许用户已发起的会话且由 Meta 响应确认发送窗口。
- [ ] 运行 adapter 测试及 `npm run lint -w apps/api`。
- [ ] 提交：`feat: add Instagram engagement API adapter`。

## Task 3: 安全接入 Instagram Webhook

**Files:** `apps/api/src/app.ts`, `apps/api/src/routes/instagramWebhookRoutes.ts`, `apps/api/src/controllers/instagramWebhookController.ts`, `apps/api/src/services/instagramWebhookService.ts`, `apps/api/tests/instagramWebhook.test.ts`, 以及仅在必要时的 webhook 配置 schema。

- [ ] 先写 webhook 测试：GET 验证 challenge、合法/伪造签名、缺少原始 body、comments/messages 事件解析、重复事件、未知事件、快速响应与无敏感日志。
- [ ] 运行 `npx tsx --test apps/api/tests/instagramWebhook.test.ts` 并确认新测试失败。
- [ ] 在 `express.json` 前保留 webhook 路由原始字节，仅对该 endpoint 使用；按 Meta 要求校验 `X-Hub-Signature-256` 的 HMAC 与时序安全比较，并验证订阅 challenge。Webhook verify token / app secret 从配置读取，不写入版本控制。
- [ ] 仅处理规格范围的 Instagram comments/messages 事件；去重；不保存正文。对私密回复所需信息，仅验证/关联到允许账号并更新最小幂等状态。无对应已授权账号时安全忽略。
- [ ] 确认路由仍在 API 的 HTTPS 入口 `/api/v1/...`，不新增公网端口；错误响应和日志不回显 body/token。
- [ ] 运行 webhook 测试及 API lint。
- [ ] 提交：`feat: add signed Instagram webhook handling`。

## Task 4: 增量 OAuth 授权与部署配置兼容

**Files:** `apps/api/src/integrations/oauth/oauthProviders.ts`, `apps/api/src/services/socialAccountService.ts`, `apps/api/src/controllers/socialAccountController.ts`, `apps/api/src/routes/socialAccountRoutes.ts`, `apps/api/src/config.ts`, `scripts/deploy-server.sh`, `docker-compose.server.yml`, `apps/api/tests/instagramEngagementOAuth.test.ts`, 必要的前端 API 类型。

- [ ] 先写测试：常规 Instagram 发布授权 URL 维持旧 scopes；显式启用互动功能的授权 URL 包含旧 scopes 加两个新 scopes；取消/失败不覆盖旧凭证；成功回调合并/保存 Meta 实际 scope；不改 Facebook scopes；部署脚本保留用户已设置的 scope。
- [ ] 运行 `npx tsx --test apps/api/tests/instagramEngagementOAuth.test.ts` 并确认新测试失败。
- [ ] 增加独立、显式 opt-in 的 Instagram engagement reauthorization 流程（必要时使用新的 OAuth state purpose 字段），仅 workspace manager 可发起；不把新 scopes 加入既有默认发布授权。让回调只在成功且 providerAccountId 与原账号匹配时更新同一账号；取消、部分授权、身份不匹配均不破坏可用旧凭证。
- [ ] 将评论、消息能力分别依据实际授予 scopes/权限审核状态暴露给 UI；scope 缺失不得标记 `SocialAccount` token expired。Webhook 配置在缺失时只报告 webhook unavailable。
- [ ] 更新配置 schema、compose API/worker 配置和部署检查：用非破坏性默认补齐/提示新 scopes；禁止强制重写当前 `.env` 中用户的 Instagram scopes；Facebook 配置保持原样。不得把未审核权限自动用于普通用户。
- [ ] 运行 OAuth/deploy 静态测试及 API lint。
- [ ] 提交：`feat: add opt-in Instagram engagement authorization`。

## Task 5: 工作区安全 API 与已发布帖子响应

**Files:** `apps/api/src/controllers/scheduleController.ts`, `apps/api/src/services/scheduleService.ts`, `apps/api/src/routes/scheduleRoutes.ts`, 新增 `apps/api/src/controllers/instagramEngagementController.ts`、`apps/api/src/services/instagramEngagementService.ts`、`apps/api/src/routes/instagramEngagementRoutes.ts`，`apps/api/tests/instagramEngagementRoutes.test.ts` 与相关 service tests。

- [ ] 先写路由/service 测试：只接受当前 workspace 内成功发布的 Instagram providerPostId；拒绝非 IG、无 provider ID、失败/排程中帖子、伪造 media ID、跨工作区 account/post；viewer 可读不可写；owner/admin/editor 可发送；能力缺失返回对应错误但不影响发布权限。
- [ ] 运行 `npx tsx --test apps/api/tests/instagramEngagementRoutes.test.ts` 并确认失败。
- [ ] 已发布帖子响应增加受控的 `providerPostId` 和已授权互动能力元数据；客户端发送的 account/media/comment ID 必须与数据库记录及 provider 返回关联校验。
- [ ] 实现工作区帖子 metrics/comments/reply/private-reply API 与 inbox conversations/messages/reply API；统一复用 adapter，按需拉取，不缓存正文或指标。
- [ ] 私密回复发送必须先原子占有幂等键、遵守规则、只调用一次；provider 明确失败可记 failed 并显示结果，但不得盲目自动重试不确定请求。限制 Meta 分页/超时，避免外部接口拖垮 web 请求。
- [ ] 运行全部 Instagram API 测试、`npm run lint -w apps/api` 与 `npm run build -w apps/api`。
- [ ] 提交：`feat: add workspace-scoped Instagram interaction APIs`。

## Task 6: 帖子管理互动区与 Instagram 收件箱 UI

**Files:** `apps/web/components/posts/PublishedPostManager.tsx`, `apps/web/app/inbox/page.tsx`, `apps/web/components/inbox/InstagramInbox.tsx`, `apps/web/components/AppShell.tsx`, `apps/web/lib/api.ts`, 新增对应 web tests。

- [ ] 先写 SSR/组件和交互测试：只给 Social Scheduler 发布的 Instagram 帖显示互动入口；展开后请求 metrics/comments，支持分页/刷新/公开回复/私密回复确认；权限/窗口/重复错误可见；失败保留输入；私密回复提示发送至对方收件箱且只能一次。收件箱支持列表、会话消息和人工回复；viewer 禁止发送；中英文覆盖；不出现其它平台评论 UI。
- [ ] 运行 `npx tsx --test apps/web/tests/instagramEngagementUI.test.ts apps/web/tests/instagramInbox.test.ts` 并确认新测试失败。
- [ ] 按确认设计实现可折叠互动面板和收件箱入口；所有发送由用户明确逐条点击，绝无自动回复；不将评论/消息正文持久化到本地存储或 analytics。
- [ ] API 状态提示含权限待开通、需要重新授权、Webhook 未配置、过期/不允许私密回复、消息窗口、限流与暂时故障；评论/消息权限未开时保留帖子发布功能。
- [ ] 运行 web tests、`npm run lint -w apps/web` 与 `npm run build -w apps/web`。
- [ ] 提交：`feat: add Instagram post engagement and inbox UI`。

## Task 7: 全链路回归与 Meta 审核准备

**Files:** 相关 API/web 测试、`docs/` 下的 Instagram 权限配置与审核录制清单（按项目既有文档位置新增）。

- [ ] 补端到端回归覆盖：原 Instagram 连接/发布不变；旧 scope 用户看到授权引导但仍能发布；权限缺失/取消授权不让账号失效；公开回复、私密回复和先发起会话的普通回复由用户手动触发；viewer/跨 workspace/重复 webhook 与发送均安全。
- [ ] 准备 Meta 测试账号审核清单：功能需要的权限、逐步操作、录屏应展示授权、评论读取/公开回复/私密回复、对话回复、失败状态；注明不能用普通用户在未获批权限状态验证。
- [ ] 在 `D:\社媒` 执行 `npm run lint`、`npm run build`、所有 API/web 测试（测试项目按 package 现有 `node:test` + `tsx` 方式枚举运行），`npm run db:generate -w apps/api`，并检查 `git diff --check`。
- [ ] 检查 migration、scope 变更、日志与所有工作区所有权边界；确认未包含 `.env`、凭证或用户未跟踪文件。
- [ ] 汇总测试与部署前置条件；本计划不包含提交 Meta 审核或部署生产环境。
- [ ] 提交：`test: verify Instagram engagement and messaging flows`。
