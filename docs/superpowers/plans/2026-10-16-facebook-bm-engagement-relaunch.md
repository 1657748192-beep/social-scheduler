# Facebook BM 与互动恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不写入原发布凭据、绑定和排程的前提下，提供 BM 主页只读管理、Facebook 公共主页私信及本软件发布帖的评论读取与人工回复。

**Architecture:** 在同一工作区内新增独立管理授权、主页及互动数据表。复用可验证的 Graph 解析、消息窗口和签名校验单元，不恢复旧 OAuth 的发布凭据写入路径。API 主动读取可独立使用；Webhook 持久接收与 API 任务泵为补充，不接入发布 Worker。

**Tech Stack:** TypeScript、Express、Prisma/PostgreSQL、Next.js/React、node:test/tsx、现有 Playwright 工具与 Docker；不新增服务或付费资源。

**Spec:** `docs/superpowers/specs/2026-10-16-facebook-bm-engagement-relaunch-design.md`，用户已于 2026-10-16 确认。

## Global Constraints

- 原发布权限、OauthCredential 中的凭据、SocialAccount 发布绑定、发布配置 ID 和排程均不得被这套功能更新。
- Instagram 评论／私信入口与退役接口继续下线；不恢复 Instagram Webhook。
- BM 首版只读；评论仅覆盖本软件真实发布记录；互动仅限已发布绑定且有独立授权的主页。
- 不加入点赞、自动回复、群发、陌生人主动私信、评论删除／隐藏、广告评论、BM 人员与资产分配、主页信息修改。
- 不新增收费资源；本阶段不发布 Meta 应用、不提交权限审核、不自动修改 Meta 权限或资产选择。线上部署另行确认。
- 原 Worker 代码、队列、运行进程和发布定时任务不变。新事件处理属于 API 生命周期。
- 新接收正文默认滚动保留 90 天，附件二进制不落盘；不清理旧互动表或发布数据。
- 默认关闭新功能；只有新增配置和明确授权完成后才开启。缺配置安全拒绝，不回退旧 token 或旧登录配置。
- 当前实际开发位置是已有 linked worktree `source/.worktrees/tiktok-sandbox-metrics`；执行前用 using-git-worktrees 检测并复用，不重置现有不相关文档改动。只暂存任务明确列出的文件。
- 本文件仅计划。产品实现须等用户审阅并选择执行方式；本计划不授权推送、部署、修改 Meta 配置或发送真实评论/消息。

## Review Focus

1. 同名主页、浏览器 profile ID 与 Graph Page ID 不同：仅规范 Graph 身份关联；任务 4/6 测试拒绝按名称关联。
2. 多个连接/工作区共用一主页，其中一个断开或撤权：其他连接正常、不泄漏旧数据、不撤销共享上游订阅；任务 3/8 测试。
3. 回调时软件会话已过期或操作者被移除、两个回调竞态：拒绝保存，不碰发布凭据；任务 3 测试。
4. 多页列表中途限流、循环游标、上游字段部分缺失：展示局部失败而非完整空结果；任务 2/4 测试。
5. 切换主页时发送/读取尚未返回，或发送已成功但连接断开：迟到数据不串页、不显示错误成功、不自动重发；任务 5/7/10 测试。

## 文件与接口地图

新增目录 `apps/api/src/facebookManagement/` 将新逻辑和旧发布链路隔离：

- `types.ts`：内部及安全 DTO，独立于 Prisma；`config.ts`：仅新配置的校验。
- `graphDirectory.ts`：BM/主页只读 Graph 请求和分页；`oauth.ts`：独立授权协议；`store.ts`：新表访问。
- `directory.ts`：授权范围交叉验证、刷新与安全 DTO；`access.ts`：成员、主页、发布绑定和独立 token 选择。
- `sendAttempts.ts`：发送幂等；`engagement.ts`：主动读取与人工回复。
- `receptionStore.ts`、`receptionPump.ts`：新事件持久化、租约、归一化和 90 天清理。
- `subscriptions.ts`：明确订阅操作与跨连接共享资源锁。
- `routes.ts`：独立连接、目录、互动与订阅 HTTP API；`runtime.ts`：真实依赖装配。

前端新增 `apps/web/lib/facebookManagement.ts` 与 `components/facebook/`，将 BM 目录、连接选择和互动授权提示集中；保留并修改现有 FacebookInbox/FacebookPostComments 以使用新接口。新增页面 `/facebook-management` 与 `/facebook-inbox`；旧 `/inbox` 继续跳转控制台，避免恢复 Instagram。

接口约定：

```ts
type ManagementContext = { userId: string; workspaceId: string; sessionId: string };
type PageContext = ManagementContext & { managedPageId: string };
type ManagedPageDto = {
  id: string; connectionId: string; pageId: string; name: string;
  avatarUrl: string | null; profileUrl: string | null;
  businesses: Array<{ id: string; name: string; relation: 'owned' | 'client' }>;
  publishingAccountId: string | null;
  authorization: 'available' | 'missing' | 'expired' | 'unknown';
  lastReadAt: string | null;
};
type ReadPage<T> = {
  items: T[]; nextCursor: string | null; readAt: string;
  source: 'graph' | 'received' | 'mixed'; stale: boolean;
  warnings: Array<{ code: string; diagnosticId: string }>;
};
type SendOutcome =
  | { status: 'sent'; providerId: string }
  | { status: 'unknown'; diagnosticId: string }
  | { status: 'failed'; code: string; diagnosticId: string };
```

正文 DTO 复用现有 FacebookComment/FacebookConversation/FacebookMessage；发送 token 绝不出现在 DTO。所有内部依赖以明确 factory 参数注入，单测不连接 Meta。新 API 根路径为 `/api/v1/workspaces/:workspaceId/facebook-management`，下文用 `BASE` 表示。

## 验证命令约定

- 单项：`node scripts/run-tests.cjs apps/api/tests/<文件>.test.ts`；React 用对应 `.test.tsx`。该脚本串行执行，避免固定测试 ID 冲突。
- 集成测试使用现有独立 `_test` 数据库和安全校验；新测试显式缺配置即失败，禁止 skip 后宣称通过。不要打印数据库 URL/密码，不加载线上 env。
- 完整回归：`node scripts/run-tests.cjs`；构建：`npm run build`；格式：`git diff --check`。
- Windows 若需低盘空间临时目录，仅设置进程级 TEMP/TMP 到既有任务临时目录；不删用户文件、不弱化容量检查。
- 每任务记录 RED 的具体断言失败，再记录 GREEN；导入不存在可证明测试先写，但须补充实际行为断言的失败证据。提交仅包含该任务文件，现有未提交文档不纳入。

### Task 1：官方契约核对与独立配置边界

**Files:** Create `apps/api/src/facebookManagement/types.ts`, `config.ts`; Create `apps/api/tests/facebookManagementConfig.test.ts`; Create `docs/facebook-management-provider-contract.md`。

**Interfaces:** `getFacebookManagementConfig(env: NodeJS.ProcessEnv): { enabled: boolean; appId: string; graphVersion: string; loginConfigId: string; callbackUrl: string }`，禁用时允许空项，开启时缺独立 loginConfigId/callback 或格式错误抛出配置错误。应用 ID/secret 可引用现有应用值，但授权配置 ID 不得 fallback 到原发布配置。

新配置键固定为 `FACEBOOK_MANAGEMENT_ENABLED`（默认 false）、`FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID`、`FACEBOOK_MANAGEMENT_CALLBACK_URL`、`FACEBOOK_MANAGEMENT_GRAPH_API_VERSION`（开启时必须显式设置）；复用已有 app ID/secret 只读。单测断言示例：`assert.throws(() => getFacebookManagementConfig({...env, FACEBOOK_MANAGEMENT_ENABLED:'true', FACEBOOK_MANAGEMENT_LOGIN_CONFIG_ID:''})); assert.deepEqual(env, originalEnv);`。

- [ ] 阅读目标 Graph 版本官方文档，逐条记录 User businesses、Business owned_pages/client_pages、用户 Pages/token/tasks、消息、评论和订阅的字段、权限、token 类型、限制与来源日期。SDK 不是访问许可证明；文档限流可用已登录官方界面。无法核对某项时记录证据并暂停依赖它的产品实现，不猜造字段。
- [ ] 写 `facebookManagementConfig.test.ts`：`independentConfigNeverFallsBackToPublishing`，用发布 config='publish'、独立 config=''、enabled=true，断言拒绝；disabled 不发起外部操作；配置解析前后原 env 对象深相等。
- [ ] 运行该单测，确认 RED；实现配置解析和上文 DTO，候选 scope 清单按官方契约校正，仅管理/互动用途，不主动申请 pages_manage_posts。
- [ ] 重跑单测至 GREEN；人工检查文档每个候选接口都有可核对官方来源或明确阻塞说明。
- [ ] `git add` 本任务四个文件并提交 `feat: define isolated Facebook management contracts`。

### Task 2：安全 Graph 主页目录适配器

**Files:** Create `apps/api/src/facebookManagement/graphDirectory.ts`; Test `apps/api/tests/facebookManagementGraph.test.ts`。

**Interfaces:** `createFacebookDirectoryClient({userToken, apiVersion, fetchImpl?})` 返回 `listBusinesses(after?)`, `listBusinessPages(businessId, relation, after?)`, `listUserPages(after?)`, `inspectPageToken(pageId, token)`；页形为 `{items, nextCursor}`，内部类型放 types.ts，原始 token 只供服务端 store 使用。具体 Graph fields 取任务 1 的契约。

- [ ] 写 `threePagesReturnTwentyOneDistinctPages` 测试，固定 3 页、共 21 个 Page ID，断言完整遍历不丢页；`ownedAndClientDoNotProveUserTasks` 断言目录存在与操作权限分别输出。
- [ ] 写 `rejectsPagingHostAndCursorLoops`：恶意 paging.next 不可作为请求 URL；重复游标拒绝；cursor 长度超过 2048 拒绝；单请求 limit=25、timeout=10000ms、redirect='error'，同时请求上限 2。
- [ ] 写 `partial429IsNotSuccessfulEmptyDirectory`：第二页 429/字段缺失返回安全分类，不返回假空列表；日志和 error 不含测试 token/正文。运行该文件，记录 RED。
- [ ] 实现固定 graph.facebook.com host 和目标版本路径，Bearer header、白名单字段归一化、逐页调用。网络异常不复制 Meta 错误正文。
- [ ] 重跑 GREEN；提交本任务文件 `feat: add bounded Facebook business directory reads`。

### Task 3：独立存储、迁移和授权状态机

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `apps/api/prisma/migrations/20261016000100_facebook_management/migration.sql`; Create `apps/api/src/facebookManagement/store.ts`, `oauth.ts`; Test `apps/api/tests/facebookManagementOAuth.integration.test.ts`。

**Interfaces:** `createFacebookManagementStore(db, encrypt)` 提供 `createState`, `consumeState`, `saveGrant`, `findConnection`, `disconnect`；`createFacebookManagementOAuth(deps)` 提供 `start(ctx, connectionId?) -> {authorizationUrl}`, `callback({state,code}) -> {connectionId}`。state TTL=10 分钟，绑定 userId/workspaceId/sessionId/callback 与连接版本；saveGrant 事务内重查成员/会话/版本。callback 的 sessionId 只从已保存的 state 解析，不能由客户端传入替换。

- [ ] 增加新连接、主页、OAuth state、新事件/评论/线程/消息/发送尝试模型及 workspace 关系。Page 可有多个 BM 关系，使用独立关系表而非单 BM 字段；关联新连接，发布表零写入。事件唯一键 `(managedPageId,eventKey)`，发送唯一键 `(managedPageId,requestKey)`；正文表/事件有 receivedAt 索引。只新增表/索引，不 backfill 旧凭据或正文。

Prisma 名称固定：`FacebookManagementConnection`、`FacebookManagedPage`、`FacebookManagedPageBusiness`、`FacebookManagementOAuthState`、`FacebookManagementPageSelection`、`FacebookManagementSubscription`、`FacebookInteractionEvent`、`FacebookInteractionComment`、`FacebookInteractionThread`、`FacebookInteractionMessage`、`FacebookInteractionSendAttempt`。PageSelection 以 workspaceId+pageId 唯一；Subscription 以 appId+pageId 唯一；连接含 userId 外键，事件、线程和消息经主页归属工作区；新表 cascade 不指向旧发布表。
- [ ] 在未迁移的独立测试库写 `grantDoesNotTouchPublishingSnapshot`：创建原凭据/绑定/排程，保存加密字段、scope、tokenType、expiresAt、绑定和排程摘要；授权成功/取消/失败/重放后断言完全相同。
- [ ] 写 `expiredSessionRemovedManagerAndConcurrentCallbacksCannotSave`、`disconnectOneConnectionDoesNotRevokeAppOrOtherConnection`：角色被移除、会话过期、10 分钟过期、版本竞争均拒绝；断开只清空新 token 并停用新主页，不调用 permissions DELETE。运行记录 RED。

关键断言：`assert.deepEqual(await publishingSnapshot(db), before); assert.equal(await countActiveNewConnections(db), 1); assert.equal(providerRevokeCalls, 0);`。snapshot 辅助函数在本测试文件定义，读取完整原凭据、绑定及排程字段，不将其内容输出日志。
- [ ] 用安全验证后的测试 URL 执行迁移与 Prisma generate；实现独立 store/OAuth，使用 session 状态而非浏览器需携带 token 的回调假设。回调不在 URL 携带软件 token；仅随机 state 关联起始会话。
- [ ] 集成测试 GREEN，验证迁移 SQL 不修改旧业务表；新表删除关系与工作区删除兼容。原 facebookOAuthStore.save 不供新功能调用。
- [ ] 提交本任务文件 `feat: persist independent Facebook management grants`。

### Task 4：工作区目录、关联与选择服务

**Files:** Create `apps/api/src/facebookManagement/directory.ts`, `access.ts`; Test `apps/api/tests/facebookManagementDirectory.integration.test.ts`。

**Interfaces:** `createFacebookDirectoryService(deps)` 提供 `refresh(ctx,connectionId)`, `list(ctx,{connectionId?,businessId?,query?,cursor?}) -> ReadPage<ManagedPageDto>`, `select(ctx,managedPageId)`；`resolvePageAccess(ctx: PageContext,{write?:boolean,requirePublishingBinding?:boolean})` 返回服务器独立凭据和规范 Page ID，仅供后续服务。select 保存每工作区/规范主页的显式连接选择。

- [ ] 写 `sameNameAndProfileIdCannotBindPublishingAccount`、`foreignConnectionAndPageDenied`、`twentyOnePagesSurvivePartialRefresh`：关联仅工作区+规范 Graph ID；名称/profile ID 不能替代；失败刷新保留同上下文上次成功快照，并标 stale/局部失败。
- [ ] 写 `duplicatePagesRequireExplicitConnectionChoice`：同主页多个连接只展示一组，保留候选连接；未选择拒绝互动，选择失效后不得静默换到另一人授权。无 BM 关系显示“未识别 BM”。运行记录 RED。
- [ ] 实现分页目录事务化快照与版本 CAS；短时缓存 TTL=60 秒，强制刷新显式绕过；请求超时/部分页面失败不能将未完成快照标记完整。刷新需 owner/admin，读取允许工作区成员。
- [ ] 实现 access：active 新连接、新主页、发布绑定、角色校验；校验新 Page token，永不读旧发布凭据来发请求。缺 token/task 的目录项只读展示。
- [ ] 重跑 GREEN；提交 `feat: isolate Facebook page directory and access selection`。

### Task 5：人工发送幂等与结果未知处理

**Files:** Create `apps/api/src/facebookManagement/sendAttempts.ts`; Test `apps/api/tests/facebookManagementSend.integration.test.ts`。

**Interfaces:** `executeFacebookSend(ctx: PageContext, input: {requestKey:string; targetId:string; kind:'message'|'comment'; text:string}, send:()=>Promise<SendOutcome>): Promise<SendOutcome>`；requestKey UUID，正文摘要仅用于同键参数一致性，记录不保存明文草稿。

- [ ] 写 `concurrentSameKeySendsOnce`：两次并发返回同结果，provider 调用次数=1；`sameKeyDifferentTextOrTargetRejected`；不同工作区不能复用发送记录读取结果。
- [ ] 写 `providerSuccessBeforeConnectionLossBecomesUnknownWithoutRetry`、`abandonedPendingAttemptBecomesUnknown`：未知和超过 30 秒的未完成 pending 不重发；人工更换 requestKey 前要求确认核对结果。运行 RED。

关键断言：`assert.equal(providerSendCalls, 1); assert.equal(result.status, 'unknown'); assert.equal(repeatedResult.status, 'unknown');`；两次并发请求第二次若首个仍 pending，返回 unknown 并提示处理中，不声称已有确认成功。
- [ ] 实现数据库唯一约束、上下文/请求摘要校验、pending/sent/failed/unknown 状态机。网络调用不放长事务；只有匹配版本完成更新；明确权限错误可 failed，网络/解析异常 unknown。禁止后台重试发送。
- [ ] 重跑 GREEN；提交 `feat: guard Facebook manual replies against duplicate sends`。

### Task 6：独立凭据下的私信和评论主动 API

**Files:** Create `apps/api/src/facebookManagement/engagement.ts`; Reuse `apps/api/src/integrations/social/facebookEngagement.ts`, `facebookMessagingPolicy.ts`（确有必要才修改）；Test `apps/api/tests/facebookManagementEngagement.integration.test.ts`。

**Interfaces:** `createFacebookManagementEngagement(deps)` 提供 `capabilities(ctx)`, `conversations(ctx,after?)`, `messages(ctx,conversationId,after?)`, `comments(ctx,scheduleId,after?)` 返回 ReadPage；`replyMessage(ctx,{conversationId,text,requestKey})`, `replyComment(ctx,{scheduleId,commentId,text,requestKey})` 返回 SendOutcome。

- [ ] 写 `readsGraphWithoutWebhookHistory`：接收表为空仍返回 Graph 真实数据；上游错误不能被空缓存伪装成功；能力未知拒绝发送。
- [ ] 写 `pageConversationAndPostIdentityAreServerVerified`：错工作区/主页/评论所属帖、无绑定/解绑、模拟发布均拒绝；viewer GET 可用而 POST=403；仅已绑定 Page 可进入互动。
- [ ] 写 `replyWindowUsesTrustedInboundNotEchoOrFutureTime`：23h59m 可回复，恰好 24h、未来时间、无入站时间拒绝；消息 2000 字符、评论 8000 字符上限，空白拒绝。运行 RED。
- [ ] 实现 access+capability 校验、原帖 ID 关联、Graph 主动读和任务 5 发送；新凭据无效只更新新连接状态。复用原 Graph 单元前跑其现有测试，不能复制已知有缺陷的 task 字段读取逻辑。
- [ ] 重跑新旧相关测试 GREEN，发布表快照不变；提交 `feat: restore Facebook reads and manual replies with isolated credentials`。

### Task 7：HTTP 装配与退役路径隔离

**Files:** Create `apps/api/src/facebookManagement/routes.ts`, `runtime.ts`; Modify `apps/api/src/app.ts`, `middleware/removedMetaEngagement.ts`; Test `apps/api/tests/facebookManagementRoutes.test.ts`, Modify `apps/api/tests/removedMetaEngagement.test.ts`。

如需日志清洗，明确修改 `apps/api/src/utils/requestLog.ts` 并在本任务新增 `apps/api/tests/facebookManagementRequestLog.test.ts`，不能在控制台打印 callback 原始 URL 来排查。

**Interfaces / routes:**

- `POST BASE/oauth/start`；公开 `GET /api/v1/integrations/facebook-management/oauth/callback`（state+会话重查，不要求 Meta 回调带 bearer）。
- `GET BASE/status -> {enabled:boolean,configured:boolean}`，requireAuth 和工作区成员验证；不输出配置值、权限审批结论或 secrets，供前端新入口及 useFacebookEnabled 使用。
- `GET BASE/connections`、`POST BASE/connections/:connectionId/disconnect`、`POST BASE/connections/:connectionId/refresh`。
- `GET BASE/pages`、`POST BASE/pages/:managedPageId/select`、`GET BASE/pages/:managedPageId/capabilities`。
- `GET BASE/pages/:managedPageId/conversations`、`GET .../conversations/:conversationId/messages`、`POST .../conversations/:conversationId/replies`。
- `GET BASE/pages/:managedPageId/posts/:scheduleId/comments`、`POST .../comments/:commentId/replies`。
- 旧 Facebook engagement OAuth/status/read/write 路径保留 410，不挂载会覆盖旧 token 的旧 routes；新 Facebook 功能走新 namespace。Facebook webhook 精确开放见任务 8。

- [ ] 写黑盒路由测试 `unauthenticatedForeignViewerAndDisabledRequestsFailClosed`，断言 401/403/404 分类；cursor/requestKey/body 长度校验失败=400。owner/admin 管连接、editor 仅回复。
- [ ] 写 `instagramAndLegacyFacebookOAuthStayRetired`，所有旧 Instagram 评论/私信/webhook=410，旧 Facebook OAuth=410，新 API 不被广义 engagement 正则误拦；oauth start/callback 日志不出现 code/state/token。运行 RED。
- [ ] 实现 routes 工厂，controller 只解析输入，调用服务，返回安全 DTO；runtime 装配新 store，不依赖 facebookOAuthStore。更新安全请求日志 URL 清洗工具如需，加入对应测试。
- [ ] 路由/退役/原 OAuth 回归 GREEN，提交 `feat: expose isolated Facebook management and inbox routes`。

### Task 8：有界 Webhook 持久处理与共享订阅

**Files:** Create `apps/api/src/facebookManagement/receptionStore.ts`, `receptionPump.ts`, `subscriptions.ts`; Modify `runtime.ts`, `routes.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`; Reuse `apps/api/src/routes/facebookWebhookRoutes.ts`, `services/facebookWebhookService.ts`; Test `apps/api/tests/facebookManagementReception.integration.test.ts`, `facebookManagementPump.test.ts`, `facebookManagementSubscription.integration.test.ts`。

**Interfaces:** `receptionStore.enqueue(events)`, `claimBatch(now,limit)`, `processClaim(row,now)`, `finishClaim(id,lease)`, `failClaim(id,lease)`, `prune(now)`；`startFacebookManagementPump(deps) -> {stop():Promise<void>}`；`enableNotifications(ctx)` 由 `POST BASE/pages/:managedPageId/notifications/enable` 调用，GET capabilities 只检查不写订阅。

- [ ] 写 `signedEventsPersistBeforeAckAndRecoverAfterCrash`：验签错误=403、超过1MiB拒绝、入库错误=503、持久化后=200；重复与乱序/删除不复活；多实例租约 60 秒、过期接管，旧 lease 不可完成新 claim。
- [ ] 写 `disconnectStopsLateDeliveryAndDoesNotUnsubscribeOthers`：两个工作区分别独立事件，断开一个不影响另一；原旧接收数据不被处理。订阅锁以 app+规范 Page ID 唯一，只对明确点击启用者接收；无需/缺权限时不发外部 POST。
- [ ] 写 `pumpIsBoundedStopsAndPrunesOnlyNewNinetyDayData`：每 2 秒最多取 50 条，单进程不重入，失败退避 5s 起、上限 1h、最多 8 次后 dead；最近数据不删除，90 天以前新正文/载荷清理，旧表/发布不变。发送尝试保留同样 90 天去重窗口；过期 OAuth state 清理。运行 RED。
- [ ] 实现新存储、API 生命周期任务泵和订阅；共享订阅操作用数据库锁避免并发覆盖已有 subscribed_fields，只增 feed/messages，不自动 DELETE。GET 和断开不得触发订阅变更。
- [ ] app.ts 在 JSON/parser 和退役 middleware 前精确挂载 Facebook 原始 webhook；泵随 server startup/shutdown（停止并等待 in-flight 后断 DB），原 Worker 零改动。网页主动读取用新接收表合并已知消息/评论，但 Graph 错误不能宣称刚成功刷新。
- [ ] 测试 GREEN；运行旧签名/消息窗口测试，提交 `feat: process Facebook notifications without touching publishing worker`。

### Task 9：BM 主页管理页面

**Files:** Create `apps/web/lib/facebookManagement.ts`, `apps/web/components/facebook/FacebookManagementPanel.tsx`, `FacebookConnectionStatus.tsx`, `apps/web/app/facebook-management/page.tsx`; Modify `apps/web/components/AppShell.tsx`, `apps/web/app/globals.css`; Test `apps/web/tests/facebookManagement.test.tsx`, Modify `apps/web/tests/appShellSidebar.test.ts`。

**Interfaces:** `FacebookManagementPanel({token,workspaces})`；请求工具接收 token 和 workspaceId，构造任务 7 固定新 API。DTO 与服务端一致，不引用 Prisma。官方主页链接仅允许 https Facebook 官方域名，`target=_blank` 配 `rel=noopener noreferrer`。

- [ ] 写 React 真交互测试 `filtersTwentyOnePagesAndShowsIndependentStatuses`：BM/连接/名称筛选、owned/client、无归属、无主页、部分读取失败、最后读取时间、缺权限分别呈现。
- [ ] 写 `chooseConnectionAndDisconnectDoNotChangePublishingBinding`：同主页多个授权必须选择，断开确认说明仅本地新连接、token 不渲染；viewer 不出现连接/刷新/断开按钮，拒绝也由服务器执行。
- [ ] 写 `lateDirectoryResponseCannotOverwriteAnotherWorkspace` 和恶意头像/主页 URL 安全测试。运行 RED。
- [ ] 实现目录、显式连接、跳转收件箱（只限已绑定）、未绑定提示及新独立授权入口。新增 AppShell 入口，不恢复旧 /inbox。中英双语、390px 无横向溢出。
- [ ] GREEN，提交 `feat(web): add read-only BM Page management`。

### Task 10：私信与评论 UI 恢复

**Files:** Create `apps/web/app/facebook-inbox/page.tsx`; Modify `apps/web/components/inbox/FacebookInbox.tsx`, `posts/FacebookPostComments.tsx`, `posts/PublishedPostManager.tsx`, `social/FacebookEngagementStatus.tsx`, `social/useFacebookEnabled.ts`, `AppShell.tsx`; Modify Facebook 对应测试；Create `apps/web/tests/facebookManagementInbox.test.tsx`, `facebookManagementComments.test.tsx`。

**Interfaces:** 两个互动组件显式使用 `{workspaceId,managedPageId,connectionId}`；评论另含 scheduleId。新状态组件不得调用旧 facebook-engagement oauth。每次人工发送创建 UUID requestKey；未知后不复用新键自动发。页面 query 只作为待选择项，必须向服务端验证。

- [ ] 写 `switchingPageClearsDraftAndIgnoresLateReadSendAndErrors`，延迟首个主页请求，切换第二主页后完成，断言不显示第一主页正文/提示/草稿；所有 async 分支含 catch/finally 都检查请求世代。
- [ ] 写 `manualRefreshWorksWithoutWebhookAndErrorIsNotEmpty`，Graph 读错误保留本页数据与时间；空成功与未授权分别显示；visible 30 秒轮询、hidden/卸载停止，不多层 setInterval。
- [ ] 写 `viewerAndClosedWindowCannotSendAndUnknownNeverRetries`，单次明确点击请求一次，发送展示主页和目标；成功清草稿，失败保留，未知提示核对；请求键不受双击影响。评论只在真实 Facebook 记录可用。
- [ ] 运行 RED；实现私信/评论 UI 新 namespace、授权/订阅/真实通知分别标识；旧 Instagram/旧 /inbox 不恢复。更新旧 source-assertion 测试为行为验证，不删除有意义的隔离测试。
- [ ] GREEN，提交 `feat(web): restore Facebook inbox and post comments`。

### Task 11：整体隔离、删除与浏览器验证

**Files:** Create `apps/api/tests/facebookManagementPublishingIsolation.integration.test.ts`, `apps/web/tests/fixtures/facebook-management-fixture.tsx`; Modify `apps/api/src/services/workspaceService.ts`（removeMember）、`apps/api/src/services/adminService.ts`（用户删除）、`apps/api/src/facebookManagement/access.ts`, `store.ts`；Create `docs/facebook-management-verification.md`。

**Interfaces:** 测试使用任务 3 store、任务 7 routes 和独立测试 DB；fixture 渲染真实组件，仅边界 API 返回固定测试数据，不连接真实 Meta。

- [ ] 写 `fullManagementLifecycleLeavesPublishingExactlyUnchanged`：授权、目录、消息/评论读回、订阅、失效、断开、90 天清理全过程前后，断言原 token 密文、scopes、expiresAt、SocialAccount、PostVariant、Schedule、PublishJob 数据未被本功能改写；旧发布 capability 快照一致。
- [ ] 写 `workspaceAndUserDeletionRemoveOnlyAuthorizedNewData`：工作区删除 cascade 新连接/正文/state/attempt；删除/移除授权用户后新连接不可访问或由管理员重授权，不静默给其他成员续用移除用户的凭据。适配现有删除语义，发布数据只遵守原删除流程，不因管理连接断开被删除。

断言：`await assert.rejects(() => resolvePageAccess(ctx, {write:false}), /unavailable|not found/i); assert.equal(await db.facebookManagementConnection.count({where:{workspaceId}}), 0);`。前者在移除授权人后验证，后者在删除工作区后验证；新模型名称与任务 3 完全一致。
- [ ] 在独立库先 RED 后实现必要删除集成，GREEN。运行 `node scripts/run-tests.cjs`，要求 0 failures、0 skipped；缺测试环境先修配置，禁止生产 fallback。执行 `npm run build` 和 `git diff --check`。
- [ ] 浏览器验证登录边界、BM 21+主页、多连接选择、手机宽度、私信切换、防双击、评论权限、断开说明；录屏/截图不得含 token 或客户真实正文。独立记录 API 与 Webhook 验收状态。
- [ ] 最终审查确认旧 worker.ts、发布 provider/store、原配置值无改动；只提交本任务明确文件和记录 `test: verify Facebook management preserves publishing isolation`。

### Task 12：真实验收与部署交接（需要另行授权）

**Files:** Update `docs/facebook-management-verification.md`；必要新增配置仅按单独批准范围处理，不调用现有全量 deploy-server.sh。

- [ ] 先呈交本地测试/构建/安全审查证据；没有授权就停止在交接，不推送部署、不改 Meta 配置、不发消息。
- [ ] 获准后只配置新增独立管理登录 ID/回调和用途 scope；保持原发布配置 ID、scope、env 既有值与 token 不变。如必须追加新 env 值，先说明是新增配置并取得授权；默认禁用时可交付代码但明确未启用。官方界面出现比预期更广的 BM 资产授权时停下说明范围，不自动确认。
- [ ] 真实测试前确认目标主页和测试文本，优先读取已有评论，不重复发表评论。分别记录 BM 目录、私信接收/读/回、评论读/回、签名真实通知；模拟测试单列，未到达标未解决。
- [ ] 部署前重读线上 commit/dirty 状态，保存受限配置/数据库备份和旧 API/Web 镜像，验证增量迁移在独立恢复库通过；只构建 API/Web、应用新增迁移并 `up -d --no-deps api web`。不重启 Worker、不修改原环境值，不新增资源。
- [ ] 部署后核对 API/Web 健康、配置摘要、发布凭据与排程摘要、Worker ID/启动时间。观察期间正常 Worker 更新排程状态不能误判为部署写入，结合实际调度记录核对。回滚仅旧镜像，不 drop 表、不覆盖生产数据。
- [ ] 记录已完成、外部阻塞、风险、回滚路径和用户可用范围；只有相应真实验收通过才声明该能力已可用。

## 自审与执行交接

- Spec 覆盖：目标/UI→任务9/10；独立凭据/授权→1/3/4；主动读取/回复→5/6；路由退役→7；通知/订阅/处理→8；数据保留/删除→8/11；回归与真实验收/部署→11/12。
- 五项 Review Focus 均有指定测试；DTO/工厂/HTTP 路径由本计划固定，旧共享发布授权不得装配入 runtime。
- 现有用户未提交的验证文档和 output 不纳入提交；计划本身不改变产品与线上配置。
- 建议 Native：由当前会话逐项执行，每任务 TDD 和小提交，最后独立全分支审查；接口依赖紧密，减少上下文交接。也可选逐任务子代理实现与审查，用户选择前不启动。
