# Facebook Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有 Facebook Page 绑定上提供真实评论读取/人工回复、Messenger 收件箱及实时接收，不破坏原有发布。

**Architecture:** Facebook 使用独立平台适配器、服务、数据表及路由，复用工作区鉴权与加密凭据。Webhook 先写入数据库，再由 worker 处理。收件箱入口增加平台标签，不改写 Instagram 服务。

**Tech Stack:** TypeScript、Express、Prisma/PostgreSQL、Next.js/React、现有 worker、node:test/tsx；不增加运行时依赖。

**Spec:** `docs/superpowers/specs/2026-10-07-facebook-engagement-design.md`

## Global Constraints

- 保持软件名称、现有发布功能、Instagram 和 TikTok 接入不变。
- 仅支持公共主页，不读取 Facebook 个人账号私信。
- 首期不做自动回复、群发、广告评论、评论转私信、消息模板或超出标准消息窗口的发送。
- 默认沿用现有接收数据 90 天保留策略。
- 新增功能通过配置开关控制，默认关闭，测试通过后启用。
- 互动权限不足仅禁用相应功能，不把全账号标记为发布权限缺失。
- 不从生产库运行测试，不输出令牌/秘密，不修改无关 dirty 文件。
- 实施之前核实当前官方端点、字段、权限、主页任务和版本；实际 Meta 配置与真实发送单独确认。

## Review Focus

- OAuth 在授权过程中账号被解绑或凭据已更新：不能覆盖新授权或恢复被删除的账号（任务 2）。
- 单次 Webhook 含多个主页且部分事件失败：有效事件持久化、失败可重投，不能整批丢弃（任务 4）。
- 同一评论编辑/删除事件乱序：旧事件不复活已删除评论（任务 4）。
- 同一主页多工作区绑定且收到迟到事件：数据隔离、最后解绑后不重新建账号（任务 4）。
- 用户切换工作区/主页期间请求返回或双击发送：旧响应不污染新界面，发送不自动重复（任务 6）。

## File structure and shared contracts

新增 `apps/api/src/integrations/social/facebookEngagementTypes.ts` 定义：

```ts
type FacebookCapability = 'readComments' | 'replyComments' | 'readMessages' | 'replyMessages' | 'subscription';
type CapabilityState = { status: 'available' | 'missing' | 'unknown'; reason?: string };
type FacebookCapabilities = Record<FacebookCapability, CapabilityState>;
type FacebookPage<T> = { items: T[]; nextCursor: string | null };
type FacebookComment = { id: string; postId: string; text: string; senderId?: string; senderName?: string; timestamp: string; deleted?: boolean };
type FacebookConversation = { id: string; counterpartyId: string; counterpartyName?: string; updatedAt: string };
type FacebookMessage = { id: string; conversationId: string; senderId: string; recipientId: string; text: string; timestamp: string; inbound: boolean };
type FacebookSendResult = { status: 'sent'; providerId: string } | { status: 'unknown'; diagnosticId: string };
```

新增适配器 `facebookEngagement.ts`：`createFacebookEngagementClient({pageId,accessToken,apiVersion,fetchImpl})`。返回 `inspectCapabilities()`、`listComments(postId,after?)`、`getComment(commentId)`、`replyComment(commentId,text)`、`listConversations(after?)`、`listMessages(conversationId,after?)`、`getConversation(conversationId)`、`sendMessage(counterpartyId,text)`、`getSubscription()`、`subscribe()`、`unsubscribe()`。分页方法返回上述 `FacebookPage<T>`；发送返回 `FacebookSendResult`。令牌参数只在服务端使用。

持久化仓库 `facebookReceptionStore.ts` 提供 `enqueue(events)`、`claimBatch(now,limit)`、`processClaim(event,now)`、`finishClaim(id,claimToken)`、`failClaim(id,claimToken,reason)`、`cleanup(now)`，事件归属始终为本地 socialAccountId；claim 使用租约与随机 claimToken 防止旧 worker 完成新租约。

后端服务 `facebookEngagementService.ts` 导出工厂 `createFacebookEngagementService(deps)`，注入 prisma、membership、解密、客户端工厂、接收仓库和 now。方法第一参数统一 `{userId,workspaceId,socialAccountId}`；帖子方法再接 `scheduleId`，会话方法再接 `conversationId`。客户端永远不提交 Page token 或任意收件人 ID。

任务中列出的新 tests 均使用 `node:test` 与 `node:assert/strict`，每个任务按红→绿→回归→作用域 commit 执行。

### Task 1: Facebook Graph adapter and policy

**Files:** Create `apps/api/src/integrations/social/facebookEngagementTypes.ts`, `facebookEngagement.ts`, `facebookMessagingPolicy.ts`; test `apps/api/tests/facebookEngagement.test.ts`。

**Interfaces:** 产出上文客户端契约及 `isFacebookMessagingWindowOpen(lastInboundAt: Date | null, now: Date): boolean`。错误分类为 `permission_missing`, `authorization_invalid`, `task_missing`, `access_level`, `rate_limited`, `temporary_failure`，附可安全展示的 diagnosticId。

- [ ] 写测试 `capabilitiesDoNotAssumeRequestedScopes`：debug token 实际未获准 pages_messaging 时，replyMessages.status 为 missing，不影响已有发布字段；网络失败为 unknown。
- [ ] 写测试 `safePagingAndOwnership`：只从游标构造 Graph 请求，拒绝外部 next URL；getComment 返回父帖子用于服务层归属校验，getConversation 返回主页参与者用于校验；分页空结果不是权限错误。
- [ ] 写测试 `messagingWindowBoundary`：`assert.equal(isFacebookMessagingWindowOpen(new Date(now.getTime()-86400000),now),false)`；未来/null 时间 false，23 小时 true。
- [ ] 写测试 `uncertainSendNotRetried`：模拟发送超时，调用数为 1，结果 status 为 unknown；确定 Graph 错误必须抛分类错误。
- [ ] 运行 `npx tsx --test apps/api/tests/facebookEngagement.test.ts`，确认测试因缺少实现失败。
- [ ] 核实官方文档并将本项目 Graph 版本对应的字段/端点记录到设计旁的验证文档；实现上述契约，使用固定 Graph 主机、请求超时与 URL 编码，不自动重试发送。
- [ ] 重跑相同命令，全部 PASS；仅 stage 本任务文件，commit `feat: add Facebook engagement client and policy`。

### Task 2: Supplemental authorization and independent capabilities

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/config.ts`, `apps/api/src/services/socialAccountService.ts`, `apps/api/src/routes/socialAccountRoutes.ts`, `apps/api/src/controllers/socialAccountController.ts`；create `apps/api/src/services/facebookEngagementOAuth.ts`, `facebookCapabilityService.ts`；create timestamped migration under `apps/api/prisma/migrations/`；test `apps/api/tests/facebookEngagementOAuth.test.ts`。

**Interfaces:** `startFacebookEngagementAuthorization(userId,workspaceId,socialAccountId): Promise<{authorizationUrl:string}>`；OAuthState 新增可空 facebookEngagementSocialAccountId 与关系。能力服务 `inspectFacebookAccountCapabilities(accountId): Promise<FacebookCapabilities>`；新增 boolean `FACEBOOK_ENGAGEMENT_ENABLED=false`，专用 `FACEBOOK_WEBHOOK_VERIFY_TOKEN`。

- [ ] 写测试 `reauthPreservesPublishing`：申请现有发布权限与新增互动权限的并集；取消、少授原有权限、错主页时旧凭据完全不变；禁止默认 scope 回退把请求权限当实际权限。
- [ ] 写测试 `reauthRaceAndRoles`：非 manager 拒绝开始授权；OAuthState 一次性、有期；被删账号回调拒绝，旧凭据版本已变拒绝覆盖，不影响普通 Facebook 绑定。
- [ ] 写测试 `interactionMissingIsNotPublishFailure`：缺 pages_messaging 不写 SocialAccount.status=permission_missing；全令牌失效仍正确提示；配置开关关闭入口拒绝。
- [ ] 运行 `npx tsx --test apps/api/tests/facebookEngagementOAuth.test.ts`，观察 RED。
- [ ] 实现目标账号约束、事务内一次性消费及凭据 compare-and-swap。回调核验实际获准 scopes 与 Page token 身份/任务；只原子替换同账号凭据，不新增其他主页绑定。补充授权不改全局 FACEBOOK_OAUTH_SCOPES。
- [ ] 使用独立开发库生成并审阅增量迁移，运行 `npm run db:generate -w apps/api`；测试 PASS 后作用域 commit `feat: add safe Facebook engagement authorization`。

### Task 3: Workspace-scoped comments and Messenger API

**Files:** Create `apps/api/src/services/facebookEngagementService.ts`, `apps/api/src/controllers/facebookEngagementController.ts`, `apps/api/src/routes/facebookEngagementRoutes.ts`；modify `apps/api/src/app.ts`；test `apps/api/tests/facebookEngagementService.test.ts`。

**Interfaces:** 服务按 shared contracts；GET `/workspaces/:workspaceId/social-accounts/:socialAccountId/facebook/capabilities`, `/conversations`, `/conversations/:conversationId/messages`；POST `/conversations/:conversationId/replies`。帖子路径 `/workspaces/:workspaceId/facebook/posts/:scheduleId/comments` 和 `/comments/:commentId/replies`，账号从 schedule 推导，不由客户端指定。请求正文只含 text。

- [ ] 写测试 `workspaceAndTargetIsolation`：非成员、错工作区/平台/主页/帖子/会话全部拒绝；已解绑记录不可访问；权限与团队回复角色沿用 Instagram 已有规则。
- [ ] 写测试 `replyNeedsVerifiedTargetAndWindow`：评论父帖不匹配拒绝；收件人从已验证会话推导；无法核实最近入站或窗口关闭拒绝，Graph 发送调用数为 0。
- [ ] 写测试 `publishedPostIdRequiredAndErrorsVisible`：无真实 providerPostId 返回明确错误、不猜 ID；权限失败不同于空列表；不确定发送结果原样返回。
- [ ] 运行 `npx tsx --test apps/api/tests/facebookEngagementService.test.ts`，观察 RED。
- [ ] 实现服务工厂、真实依赖绑定、Zod 参数校验及 requireAuth 路由；所有读取先校验工作区，所有发送先校验目标和能力。能力查询不返回密钥或 token。
- [ ] 重跑测试 PASS；运行 `npm run build -w apps/api`；作用域 commit `feat: add scoped Facebook comment and inbox endpoints`。

### Task 4: Durable webhook processing and retention

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/app.ts`, `apps/api/src/worker.ts`；create migration, `apps/api/src/routes/facebookWebhookRoutes.ts`, `controllers/facebookWebhookController.ts`, `services/facebookWebhookService.ts`, `facebookReceptionStore.ts`, `facebookReception.ts`；test `apps/api/tests/facebookWebhook.test.ts`, `facebookReception.integration.test.ts`。

**Interfaces:** 回调 `/api/v1/webhooks/facebook` 在 express.json 前注册原始 body 解析。新增 FacebookReceivedEvent（账号/事件唯一键、payload、状态、租约、重试）、FacebookReceivedComment（账号/评论唯一键、发生时间、删除 tombstone）、FacebookReceivedThread（账号/对方唯一键）、FacebookReceivedMessage（thread/message唯一键）、FacebookReceptionState（revision）。外键删除 cascade。

- [ ] 写测试 `signatureAndDurableAck`：无/错误签名拒绝；verify token 不符拒绝；落库失败不回成功；合格批次先事务落库再 200；多主页分解且重投不重复。
- [ ] 写测试 `eventOrderAndIsolation`：重复、评论编辑/删除乱序保持最新状态；两个工作区同主页分别隔离副本；解绑后迟到事件不得重建账号；echo 不开启回复窗口。
- [ ] 写测试 `leaseRetriesAndRetention`：worker 崩溃后租约到期可处理；旧 claimToken 不能完成新租约；有限重试后失败可诊断；超过 90 天正文、消息、事件与无消息会话清理。
- [ ] 运行单元测试确认 RED；integration 必须显式 `FACEBOOK_TEST_DATABASE_URL` 指向独立库，否则 skip 并报告，禁止 fallback DATABASE_URL。
- [ ] 实现契约：持久化解析后的有效事件，不保存无关 payload；worker 每 5 秒处理最多 50 个，租约 60 秒，最多 5 次，指数退避上限 60 秒；成功清除事件正文。未知字段忽略，非法已知事件不作为成功事件计入。
- [ ] 生成审阅迁移、generate；运行上述 tests、API build，确认正常/重启/重投路径；作用域 commit `feat: receive Facebook webhook events durably`。

### Task 5: Page subscription lifecycle and deletion

**Files:** Create `apps/api/src/services/facebookSubscriptionService.ts`；modify `apps/api/src/services/socialAccountService.ts`, `facebookEngagementOAuth.ts`, `facebookCapabilityService.ts`；test `apps/api/tests/facebookSubscription.test.ts`。

**Interfaces:** `ensureFacebookPageSubscription(socialAccountId): Promise<CapabilityState>` 与 `releaseFacebookPageSubscription(socialAccountId): Promise<void>`；订阅 feed/messages，验证实际订阅结果，应用回调配置状态独立展示。

- [ ] 写测试 `subscriptionNeedsActualGrant`：请求过 metadata 但未获准不可订阅；订阅失败不撤销发布授权，返回诊断；授权完成后仅指定主页订阅。
- [ ] 写测试 `sharedPageDisconnect`：仍有其他有效绑定时不调用 unsubscribe；最后绑定在锁定主页的事务/并发保护下释放，不能与新绑定竞态误退订；本地解绑删除当前数据即使远端暂时失败。
- [ ] 写测试 `privacyDeletion`：既有用户/工作区删除通过 cascade 清除新表，有限重试操作不含已删除正文；解绑重新绑定不恢复旧缓存。
- [ ] 运行 `npx tsx --test apps/api/tests/facebookSubscription.test.ts` 观察 RED；实现与任务 2 补充授权及已有解绑接点。需要独立记录远端退订待处理状态，以便失败重试并重新检查有效绑定。
- [ ] 测试 PASS、API build；作用域 commit `feat: manage Facebook Page subscription lifecycle`。

### Task 6: UI integration without disturbing existing flows

**Files:** Create `apps/web/components/inbox/FacebookInbox.tsx`, `components/posts/FacebookPostComments.tsx`, `components/social/FacebookEngagementStatus.tsx`, `lib/facebookEngagement.ts`；modify `apps/web/app/inbox/page.tsx`, `components/AppShell.tsx`, `apps/web/app/posts/page.tsx`, `components/dashboard/DashboardPageContent.tsx`, `lib/api.ts`；test `apps/web/tests/facebookInbox.test.ts`, `facebookEngagementUI.test.ts`。

**Interfaces:** 三组件分别接 `{token,workspaces}`、`{token,workspaceId,scheduleId}`、`{token,workspaceId,socialAccountId,canManage}`；新增 lib 的 DTO 与后端 shared contracts 保持字段一致，但不导入服务端代码。

- [ ] 写测试 `platformTabsPreserveInstagram`：收件箱改为可切换 Instagram/Facebook，默认 Instagram，原 Instagram 组件行为保留；开关关闭不展示 Facebook 标签或回复入口。
- [ ] 写测试 `accountStatusAndCommentRendering`：真实缺权限、未知、未订阅、空数据分别呈现；帖子只对 Facebook 展示对应评论组件；没有 provider ID 不显示零条伪成功。
- [ ] 写测试 `staleResponsesAndDuplicateSubmit`：切换账号/工作区后旧请求响应丢弃；发送中不可重复提交；发送 unknown 提示待核实、不自动重试；错误保留旧数据和读取时间。交互测试使用现有可用测试设施，不能只用源码字符串断言替代行为验证。
- [ ] 运行 `npx tsx --test apps/web/tests/facebookInbox.test.ts apps/web/tests/facebookEngagementUI.test.ts` 观察 RED。
- [ ] 实现中英双语页面、官方 Facebook logo、分页和人工发送。沿用解绑确认，不新增自动授权；前端开关状态从后端读取，不能靠 NEXT_PUBLIC 环境值与后端不同步。
- [ ] 测试 PASS，运行 `npm run build -w apps/web`；作用域 commit `feat: add Facebook comments and Messenger inbox UI`。

### Task 7: Regression, gated rollout and review recording

**Files:** Modify `scripts/deploy-server.sh`, `docker-compose.server.yml`（仅新增配置确有需要时）；create `docs/facebook-engagement-verification.md`。

**Interfaces:** 发布记录明确 commit、开关、迁移、镜像及测试结果；真实测试账号/主页 ID 由用户提供和确认，不在计划中猜测。

- [ ] 运行 `git diff --check`、`npm run build`，API/web 全量测试；测试 env 使用假连接串及测试 JWT。明确报告已知 TikTok Sandbox 隔离测试需要 SANDBOX_TEST_DATABASE_URL；新 Facebook integration 测试必须运行独立测试库才能算验证通过。
- [ ] 按 requesting-code-review 技能进行整分支审查，修复关键/重要问题后重新运行对应测试；记录未解决限制。
- [ ] 编写部署步骤：明确服务器仓库及当前 SHA，备份数据库到独立指定文件、保留 api/worker/web 旧镜像、核对备份可恢复；关闭开关，构建，执行增量 migrate deploy，再启动兼容的新 API/worker/web。禁止先启用功能或删表。
- [ ] 部署前向用户列出备份、迁移、服务重启及回滚影响，获得部署确认再在腾讯云执行；健康检查及新路由关闭状态通过，原发布/Instagram 路由无回归。
- [ ] 向用户确认 Meta 应用、测试主页、角色及新增权限配置；配置回调、应用订阅、主页订阅后启用受控测试。对指定账号完成补充授权，不修改其他账号。
- [ ] 用户从测试账号发送真实评论和消息；核查 Graph 读取/Webhook 两条路径、持久化与界面。确认回复对象与文本后人工发送测试回复；录屏包含授权→选择主页→读取→回复→官方端确认，不录 token。
- [ ] 保存证据与结果，公开客户启用只在审核和访问等级满足后另行确认；没有真实回复/独立数据库验证不宣称全面完成。

## Self-review

设计中的授权、评论、消息、回调、隔离、保留/删除、错误处理、UI、测试、部署、真实发送与审核分别对应任务 1–7。所有交叉调用遵守 shared contracts；所有 Review Focus 已分配行为测试。不包含产品代码改动；等待用户计划审核与执行方式选择。
