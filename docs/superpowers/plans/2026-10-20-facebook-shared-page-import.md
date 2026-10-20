# 分享链接导入 Facebook 公共主页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 外部 Facebook 账号持有人只完成授权，邀请创建人在原工作区选择新增主页导入，已有主页全部跳过，不覆盖现有权限、凭据、历史关联或排程。

**Architecture:** 新建独立邀请模块和持久任务，不复用旧分享回调的 upsert。复用主页同步的 Graph 发现／校验并提取只新增写入内核，保留旧同步的会话与寿命边界；外部 OAuth 与内部确认通过邀请状态机连接。

**Tech Stack:** TypeScript、Express、Zod、Prisma/PostgreSQL、既有 Redis、Next.js/React、node:test、react-test-renderer。无新增依赖、环境密钥或付费服务。

**Spec:** `docs/superpowers/specs/2026-10-20-facebook-shared-page-import-design.md`（用户已确认，设计提交 `9b8541f`）。

**当前状态：仅编写计划。全部任务尚未执行；不得据此授权实施、生成真实邀请、发起 OAuth、迁移生产库或部署。**

## Global Constraints

- 仅 Facebook；只有邀请创建人且当前为目标工作区 owner/admin 才能查看候选或导入，不要求平台管理员身份；对方无需软件登录。
- 已有主页含已断开记录一律跳过，不更新 SocialAccount、OAuthCredential、postVariant、schedule、publishJob、管理连接／选择／订阅的已有记录。
- 链接 secret 至少 32 字节随机值，仅存 SHA-256 摘要；有效期固定 24 小时，不自动续期。
- 一邀请只接收一次成功授权；state 最长 10 分钟、一次性消费、绑定邀请版本及浏览器 flow；旧本人同步仍绑定原 session，候选仍为 15 分钟。
- 候选截止时间取授权成功后 24 小时与邀请创建后 48 小时较早值；最多 2,000 个主页、4 MiB、单次选择 50 个，默认不勾选。
- 成功／撤销／取消同步清除加密候选；到期立即不可访问，物理删除为 API 机会式有界清理；非敏感结果保留 30 天。
- 原应用、发布配置、scope、回调白名单、权限申请均不修改；评论和私信不向客户开放；不实际发帖／回复／创建或调整排程。
- 不新增 Worker 逻辑，不重启 API 或 Worker，不部署。后续部署和真实外部授权验证须单独批准，登录／同意由用户亲自完成。
- 测试只用独立本机测试库、受控 Graph 响应；禁止以生产 DATABASE_URL 执行 migrate dev、reset、db push、夹具或清理。

## Review Focus

1. 聊天软件预览、浏览器刷新和重复打开分享链接不应消耗邀请或自动授权——Task 4、7。
2. 同浏览器两个邀请、同邀请两个浏览器并行授权，cookie 覆盖也不能串接任务或替换成功候选——Task 4。
3. 创建人换会话、成员降级后再升级、授权返回时已被移除，不能读取别人的任务或复活已失效任务——Task 2、4、6。
4. 数据库已提交但浏览器超时、清理／撤销／去授权与导入并发，不能丢回执或覆盖凭据——Task 5、6。
5. 所有候选已存在、同名不同 Page ID、全选筛选结果超过 50 个及跨工作区迟到响应，界面不能误导入——Task 5、8。

## 执行前约定与文件地图

沿用已存在的隔离 worktree `source/.worktrees/tiktok-sandbox-metrics`；实施前用 `git rev-parse --git-dir`、`--git-common-dir`、`git status --short` 复核，不创建替代分支或清理用户脏文件。计划完成不推送、不部署。

新增 API 模块 `apps/api/src/facebookPageImportInvitations/`：`types.ts` 公共契约；`access.ts` 当前创建人资格；`repository.ts` 持久任务／版本／加密候选；`flows.ts` Redis 握手和 cookie；`oauth.ts` 公开授权交接；`service.ts` 私有列表／确认／撤销；`routes.ts` HTTP 安全；`maintenance.ts` 到期清理；`deletion.ts` 原应用删除联动；`runtime.ts` 依赖装配。

新增 `apps/api/src/facebookPageSync/insertNewPages.ts`，只负责已有事务中的主页锁和存在即跳过；修改 `facebookPageSync/service.ts` 调用它而不改变旧 API。Graph 发现仍在现有 `graph.ts`，增加结构化证明返回但不放宽原校验。

新增独立 Prisma 模型／迁移（Task 2），以及 `apps/api/tests/helpers/facebookPageImportInvitationsFixture.ts`。新增测试文件均放在现有 `apps/api/tests`／`apps/web/tests` 顶层，以便 `scripts/run-tests.cjs` 自动发现。

新增网页 `apps/web/app/facebook-page-import/page.tsx`、`components/social/FacebookPageImportPublic.tsx`、`FacebookPageImportInvitations.tsx`、`FacebookPageImportSelection.tsx`、`lib/facebookPageImportInvitations.ts`。仅对 `DashboardPageContent.tsx`、`SocialAccountManager.tsx` 做入口接线，不重写账号详情或互动后台。

固定测试命令：`node scripts/run-tests.cjs <完整测试相对路径...>`。集成测试由现有 runner 验证独立测试库；涉及 Redis 的 fixture 使用已有 `LOCAL_UPLOAD_TEST_REDIS_URL` 并显式调用测试环境校验，不直接使用生产 `REDIS_URL`。集成套件串行，禁止为通过测试自动创建云资源或重启 Docker。

每个代码任务必须按 RED → 最小实现 → GREEN → 范围审查 → 只暂存该任务文件提交；提交前 `git diff --cached --check`。以下命令均为未来执行指令，本轮不运行。提交使用现有已验证的本地 Git 身份，不改全局配置。

## Task 1：冻结普通客户授权兼容性门槛

**Files:** Create `docs/facebook-shared-page-import-compatibility.md`；Test/Modify `apps/api/tests/facebookPageSyncGraph.test.ts`；Read `apps/api/src/facebookPageSync/graph.ts`、`integrations/oauth/oauthProviders.ts`、设计 §8。

**Interfaces:** 输出兼容性记录 `{publishingConfigId, verifiedAt, tokenTypeEvidence, directoryStrategy, nonRoleUserEvidence, liveAuthorizationReady, blockers}`。策略只能为已证明的 USER→PAGE；SYSTEM_USER 或无法证明身份／目录时记录 blocker，不增加支持分支。

- [ ] Step 1：写 `rejects_system_user_as_user_and_never_discovers_unproven_assets` 测试，断言 SYSTEM_USER 调试结果不能通过现有 USER 检查，`me/accounts` 和任何业务账号写入均未发生。若现有测试已覆盖并已通过，作为现有 GREEN 基线，不伪造 RED。
- [ ] Step 2：运行 `node scripts/run-tests.cjs apps/api/tests/facebookPageSyncGraph.test.ts`，记录真实结果；仅发现缺失安全断言时补回归，代码修复前观察对应 RED。
- [ ] Step 3：查 Meta 官方当前文档，对照已知配置 `1748083276619458` 的系统用户口令与 `business_management` 状态；只读现有凭据的实际返回需额外确认可用来源，绝不新授权或打印 token。没有足够证据时将 `liveAuthorizationReady=false`，允许继续做离线实现但禁止真实接入／可用性成功声明；任何配置变更方案单独报批。
- [ ] Step 4：兼容性文件明确写出实际证据和缺口，不把应用已发布、管理员成功或 Graph mock 作为普通客户授权成功。提交 `docs: record shared Page import compatibility gate`（仅本任务文件）。

## Task 2：持久任务、期限和当前创建人访问控制

**Files:** Modify `apps/api/prisma/schema.prisma`；Create `apps/api/prisma/migrations/20261020000000_facebook_page_import_invitations/migration.sql`、模块 `types.ts/access.ts/repository.ts`、上述 fixture；Test `apps/api/tests/facebookPageImportInvitationStore.integration.test.ts`。

**Interfaces:** `InvitationContext = {userId:string; sessionId:string; workspaceId:string}`；`InvitationStatus = 'awaiting_authorization'|'authorized_pending_selection'|'importing'|'completed'|'revoked'|'expired'|'cancelled'`。

模型决定：独立 `FacebookPageImportInvitation`（UUID、workspaceId、createdById、note、secretHash unique、status、version、createdAt、expiresAt、authorizedAt、candidateExpiresAt、terminalAt、retentionExpiresAt、appId、authorizerSubjectHash、authorizationStartedAt、selectionHash、selectedPageIds JSON、result JSON、diagnosticId、revokedAt）；独立一对一 `FacebookPageImportCandidate`（invitationId、encryptedEnvelope）。均使用新表，不向旧表加列。索引覆盖创建人＋工作区＋创建时间＋ID、status＋期限、appId＋authorizerSubjectHash；不建立会触发旧表更新的逻辑。terminalAt／retentionExpiresAt 初始为空；进入 completed/revoked/expired/cancelled 时固定 terminalAt（自然过期使用实际期限，不使用清理时间），retentionExpiresAt=terminalAt+30 天，后续查看／重试不延长。

`CandidateEnvelope = {providerUserId:string; appId:string; authorizationStartedAt:string; pages:VerifiedPage[]; rejected:PageCandidate[]}`，复用现有类型并明确反序列化 Date。`InvitationResult = {createdPageIds:string[]; skippedPageIds:string[]}`。

`requireInvitationAccess(db, ctx, invitationId?): Promise<void>` 验证当前用户可登录、有效且未撤销 session、当前 owner/admin、邀请创建人与原工作区；旧会话退出后新会话可用。`createInvitation(ctx,note,now):Promise<{view:InvitationSummary;secret:string}>`；`readPrivate(ctx,id,now):Promise<InvitationRecord>`；`InvitationSummary` 仅 `{id,workspaceId,note,status,createdAt,expiresAt,candidateExpiresAt,retentionExpiresAt,result}`，不包含 hash／actor／凭据。

- [ ] Step 1：写 `invitation_has_fixed_lifetimes_and_hash_only_secret`、`creator_new_session_allowed_foreign_creator_denied`，核心断言 `expiresAt-createdAt===86400000`、数据库无明文 secret、重新登录可读、同工作区其他 admin／viewer／editor／跨工作区拒绝，旧记录逐字段快照不变。
- [ ] Step 2：运行 `node scripts/run-tests.cjs apps/api/tests/facebookPageImportInvitationStore.integration.test.ts`，观察缺模型／模块导致 RED；fixture 必须先验证测试库地址。
- [ ] Step 3：添加仅创建新表／索引的迁移和 repository；使用 `randomBytes(32).toString('base64url')`，仅保留 hash；写入候选的 deadline 为 `min(authorizedAt+86400000,createdAt+172800000)`。无候选／失效状态不能解密；备注最长 80 字，列表 keyset `(createdAt,id)` 每页 20 条且只列本人任务。
- [ ] Step 4：只针对 runner 验证的独立本机库运行 `node scripts/run-tests.cjs --migrate-local-upload-test-db`（检查新迁移名冲突，不修改已应用迁移），再运行上述测试与 `npm.cmd run db:generate -w apps/api`、`npm.cmd run build -w apps/api`。预期全部成功、迁移 SQL 无旧表 UPDATE/DELETE/DROP/ALTER。
- [ ] Step 5：只提交模型、新迁移、模块及 fixture／测试，提交 `feat: add isolated Facebook Page import invitations`。

## Task 3：提取不覆盖旧记录的最小写入内核

**Files:** Create `apps/api/src/facebookPageSync/insertNewPages.ts`；Modify `apps/api/src/facebookPageSync/service.ts`；Test `apps/api/tests/facebookPageInsertOnly.integration.test.ts`；Regression `facebookPageSyncImport.integration.test.ts`。

**Interfaces:** `insertNewFacebookPages(tx:Prisma.TransactionClient,input:{workspaceId:string;operationId:string;selectedPageIds:string[];verifiedPages:VerifiedPage[];encrypt:(s:string)=>string;assertCurrent:()=>Promise<void>}):Promise<InvitationResult>`。不自行开事务，不处理外部能力；调用者负责权限、期限、持久回执。旧同步的 operationId 保持原 syncId，capabilities 的 `pageSyncImportId` 保持原值，不改变旧重试识别。

- [ ] Step 1：写 `existing_inactive_and_active_pages_are_byte_for_byte_unchanged`、`two_imports_share_the_same_page_lock`。断言旧账号／凭据全字段相等；同名不同 ID 可分别新建；同 ID 两次最多一次 create；mock update/upsert 旧分支直接抛错。
- [ ] Step 2：运行 `node scripts/run-tests.cjs apps/api/tests/facebookPageInsertOnly.integration.test.ts`，观察新内核缺失的 RED。
- [ ] Step 3：内核按去重排序 Page ID 获取 `services/facebookSubscription.ts` 的 `lockFacebookPage`，锁后查询唯一键，存在即 skip；只有不存在且有有效已验证候选时 create 新账号及嵌套凭据。每次写前调用 `assertCurrent`；本人同步只替换原循环，不放宽 session／15 分钟／选中上限／结果存储规则。
- [ ] Step 4：运行新测试和 `facebookPageSyncImport.integration.test.ts`、`facebookPageSyncAccess.integration.test.ts`、`facebookPageSyncStore.integration.test.ts`，预期均通过；对比旧 API 响应形状不变。
- [ ] Step 5：提交 `refactor: share insert-only Facebook Page import kernel`，只含本任务改动。

## Task 4：外部官方授权、一次性交接与浏览器绑定

**Files:** Create 模块 `flows.ts/oauth.ts`；Modify `facebookPageSync/graph.ts`（增加已校验授权身份的返回字段，不放宽 token 类型）；Test `apps/api/tests/facebookPageImportOAuth.integration.test.ts`、`facebookPageImportFlows.integration.test.ts`。

**Interfaces:** Graph `discover(code):Promise<{providerUserId:string;pages:VerifiedPage[];rejected:PageCandidate[]}>` 保持既有签名并使用验证后的 providerUserId。`beginPublicFlow(secret:string,existingFlowCookie:string|undefined,now:Date):Promise<{authorizationUrl:string;cookie:{name:string;value:string;maxAge:number;path:string}}>`；`completePublicFlow({state,code?,error?,flowCookie},now):Promise<'received'|'unavailable'>`。固定 state 命名空间 `fbpi_`＋43 字符；任何以 `fbpi_` 开头的错误输入都由新回调消费／拒绝，不落旧分支。

flow 使用现有 Redis 独立 `facebook-page-import:v1:` 前缀、NX/CAS，state 600 秒；cookie 名 `__Secure-fbpi-flow`、Path `/api/v1/`、HttpOnly/Secure/SameSite=Lax、Max-Age 600，随机 32 字节引用；不设 Domain。一个浏览器已有其他有效邀请 flow 时返回 409，不覆盖 cookie；同邀请并行其他浏览器也 409，失效／取消后可重试。GET 不创建 flow、不改变邀请。

- [ ] Step 1：写 `external_callback_saves_candidates_but_creates_no_accounts`、`wrong_cookie_replay_and_competing_flows_fail_closed`，断言无软件登录可完成交接但看不到候选；旧业务表快照不变；错 cookie 不能消费合法 state；同 state 正确完成仅一次；已成功候选不能被另一 Facebook 账号替换。
- [ ] Step 2：写 `revocation_or_creator_removal_during_graph_wait_prevents_save`、`preview_and_expired_flow_do_not_burn_invitation`，用 barrier 控制网络等待，断言撤销先提交时 secret 无法再启动；取消／失败释放 flow，超期不延长邀请；成员降级拒绝并永久失效该任务，恢复成员资格不复活。
- [ ] Step 3：运行两份新集成测试观察 RED，再实现 flow/OAuth。Graph 读在事务外；保存候选前按 Task 6 的锁序重新验证当前资格、邀请 version／state、grant cutoff。成功后使 secret 不可再用，存候选加密 envelope，清理 flow，公开只返回通用状态。
- [ ] Step 4：运行两份新测试与 `facebookPageSyncGraph.test.ts`，预期全部通过；验证分页 20+、2,000 个／4 MiB、部分失败、无主页不绑定个人账号，USER/SYSTEM_USER 误配仍拒绝。
- [ ] Step 5：提交 `feat: receive shared Page authorization without binding accounts`。

## Task 5：创建人选择、持久幂等确认与撤销

**Files:** Create 模块 `service.ts`；Modify `repository.ts`；Test `apps/api/tests/facebookPageImportConfirm.integration.test.ts`、`facebookPageImportConcurrency.integration.test.ts`。

**Interfaces:** `createFacebookPageImportInvitationService(deps)` 返回 `create(ctx,{note?})`、`list(ctx,cursor?)`、`view(ctx,id)`、`confirm(ctx,id,pageIds:string[])`、`revoke(ctx,id)`、`completeEmpty(ctx,id)`。私有 view 为 `{...InvitationSummary,pages:PageCandidate[],selectedPageIds?:string[]}`，无 credential／scope／actor 字段；UI 的 existing 以当前 DB 计算，服务端事务再次复核。

confirm 选择排序去重，1～50 个，SHA-256(JSON.stringify(ids)) 固定摘要；empty 用独立 `POST /:inviteId/complete-empty`，只在所有候选均已存在或没有 eligible 新主页时成功，不能以空提交绕过尚未确认的新主页。

- [ ] Step 1：写 `confirm_only_selected_new_pages_and_store_result_atomically`，断言提交 `['old','new1']` 新增 new1、old skip，new2 未选不创建；旧全字段快照不变；相同选择返回同一回执，不同选择 409；不可伪造候选 ID；超过 50 拒绝。

  最小关键断言：`assert.deepEqual(result,{createdPageIds:['new1'],skippedPageIds:['old']}); assert.deepEqual(await snapshotExisting(),before); assert.equal(await countPage('new2'),0);`。快照辅助函数只比较预先存在记录，不把合法新增记录误当作旧记录改变。
- [ ] Step 2：写 `commit_ack_lost_retry_reuses_durable_result`、`revoke_races_with_confirm_and_empty_completion`，断言丢失响应后任务仍 completed、凭据不更新；两个邀请／本人同步并发同 ID 只有赢家 create；撤销先提交时零新建，导入先提交时 revoke 409 且不删账号；所有已有主页空操作成功且清除 envelope。
- [ ] Step 3：运行两份测试观察 RED，再实现：网络复验前短事务 claim 固定选择并置 importing；同选择请求可重入但最终提交串行。网络复验不持 DB 锁，失败留 importing 只准重试原选择。最终事务重新验证 grant／当前创建人／version／期限，调用 Task 3 内核，账号创建＋结果＋completed＋候选删除一并提交。confirm/revoke 均无平台写操作。
- [ ] Step 4：运行两份新测试和原 `facebookPageSyncImport.integration.test.ts`，断言超时不回退旧 upsert，DB 回滚新增／回执一起回滚，已存在失效主页不恢复。
- [ ] Step 5：提交 `feat: confirm only new shared Facebook Pages with durable receipts`。

## Task 6：去授权／删除联动、有界清理及锁序

**Files:** Create 模块 `deletion.ts/maintenance.ts`；Modify `apps/api/src/interactionInbox/deletion.ts`（`requestUserDeletion` 增加只处理新邀请的调用）、模块 `oauth.ts/service.ts/repository.ts`；Test `apps/api/tests/facebookPageImportLifecycle.integration.test.ts`。

**Interfaces:** `invalidatePageImportInvitations(tx,n:{platform:'facebook';appId:string},subjectHash:string,cutoff:Date):Promise<{invalidated:number}>`；`runInvitationMaintenance(db,now:Date,limit=50):Promise<{cleared:number;removed:number}>`。从已验证删除请求取得 namespace／真实主体，经现有 `createMetaGrantFence` 算同格式 hash，不接受浏览器原始 actor 指定删除。

统一锁序：已有 grant fence 主体锁 → 有效 session 行（仅私有确认）→ workspace member 行 → invite 行 → 排序 Page advisory locks。去授权拿主体锁后只锁匹配的新 invite，不反向等待 member；维护清理仅锁 invite，`FOR UPDATE SKIP LOCKED`，不继续获取主体或成员锁。不得在 DB 事务内做 Graph 网络请求；只新增内核不获取邀请锁。

- [ ] Step 1：写 `cutoff_rejects_late_callback_and_previously_authorized_confirm`、`subject_deletion_clears_only_matching_new_envelopes`，断言旧授权不能保存候选或导入；另 app／另主体不清除；原有发布、互动删除测试语义不变；新候选失效不调用 Graph revoke。
- [ ] Step 2：写 `expired_candidates_unreadable_before_cleanup_and_cleanup_is_bounded`，断言 fake now 到 deadline 时立即拒绝解密；一次至多处理 50；成功／撤销／取消同步清理；30 天结果到期清理；importing 到期可清，未到期处理中不能被机会清理误删。
- [ ] Step 3：运行新测试观察 RED，再实现并挂接生命周期；`requestUserDeletion` 在现有 cutoff 提交事务内清除匹配新候选／禁用邀请，不能借新功能扩大旧模型删除范围。GET 状态及生成／交换／确认前触发节流机会清理（每实例最多每 60 秒一次），错误不延长期限；Redis 只清理本模块键。
- [ ] Step 4：运行新测试与现有 Meta 删除／grant fence 测试（按 runner discovery 实际文件列表显式列出），并运行 Task 4/5 并发测试；预期无死锁、无被删除主体复活、受保护旧记录不变。
- [ ] Step 5：提交 `feat: fence shared Page candidates against revocation and expiry`。

## Task 7：HTTP 路由隔离、日志和公开页面安全

**Files:** Create 模块 `routes.ts/runtime.ts`、网页 `app/facebook-page-import/page.tsx`、`components/social/FacebookPageImportPublic.tsx`、`lib/facebookPageImportInvitations.ts`；Modify `apps/api/src/app.ts`、`utils/requestLog.ts`、`apps/web/next.config.mjs`；Test `apps/api/tests/facebookPageImportHttp.integration.test.ts`、`facebookPageImportRequestLog.test.ts`、`apps/web/tests/facebookPageImportPublic.test.tsx`。

**Interfaces:** 私有 base `/api/v1/workspaces/:workspaceId/facebook-page-import-invitations`：POST 创建，GET 分页，`GET /:inviteId`、`POST /:inviteId/confirm`、`POST /:inviteId/revoke`、`POST /:inviteId/complete-empty`。公开 `POST /api/v1/facebook-page-import-public/exchange` 仅收 `{secret}`；callback 沿用 `/api/v1/integrations/facebook/oauth/callback` 新 namespace，在旧 sync／ordinary callback 前分发。统一不敏感失败状态，私有 401/403/409/410 明确区分；公开无效、撤销、已使用统一“链接不可用”。

`PublicExchangeResponse={authorizationUrl:string}`；cookie 仅 HTTP header。回调返回 `/facebook-page-import?result=received|unavailable`，不附 inviteId、workspace、actor、code 或 token。网页 fragment 只解析一次，立即 history.replaceState 清除，secret 仅 React 内存；刷新无 secret 显示重新打开原链接，不写浏览器持久存储。

- [ ] Step 1：写 `public_holder_cannot_list_view_or_confirm_any_invitation`、`new_state_never_falls_into_ordinary_upsert`、`fragment_removed_before_any_request`，断言公开 holder 无后台权限、GET/预览无 POST、回调错 state 不触发旧 completeOAuth；URL／页面输出／日志无 token、code、state、secret。
- [ ] Step 2：写 `origin_cookie_and_rate_limit_enforced`，断言 missing/foreign Origin 403；公开交换 body 2 KiB 上限；固定 same-origin 授权 URL allowlist；每 IP 每 10 分钟 30 次、每 invitation hash 每 10 分钟 5 次尝试，Redis NX/TTL 限流故障失败关闭，配置 trust proxy 仅沿用已验证可信代理策略。cookie 属性与 Task 4 完全相同，不引入客户端读取。
- [ ] Step 3：运行新测试观察 RED，再实现路由、runtime 接线和第一方公开页。页面不渲染全局管理员数据／工作区，也不发送 analytics；CSP 针对该页禁第三方资源、frame-ancestors none，沿用 Next 必需的同源／nonce脚本策略，不全站关闭 CSP。响应 Cache-Control no-store、Referrer-Policy no-referrer。对 API safeRequestLogUrl 增加新路由脱敏，确认实际代理配置不记录 body 或 callback query；仅文档记录风险，不擅自改生产代理。
- [ ] Step 4：运行三份新测试与旧 `facebookPageSyncRoutes.test.ts`、`facebookPageSyncHttp.integration.test.ts`、`facebookPageSyncRequestLog.test.ts`，再运行 `npm.cmd run build -w apps/api` 和 `npm.cmd run build -w apps/web`，预期通过且旧分享／其他平台不变。
- [ ] Step 5：提交 `feat: isolate public shared Page authorization routes and page`。

## Task 8：后台创建／任务列表／勾选确认界面

**Files:** Create 网页 `components/social/FacebookPageImportInvitations.tsx`、`FacebookPageImportSelection.tsx`；Modify `lib/facebookPageImportInvitations.ts`、`components/social/SocialAccountManager.tsx`、`components/dashboard/DashboardPageContent.tsx`；Test `apps/web/tests/facebookPageImportInvitations.test.tsx`、`facebookPageImportSelection.test.tsx`、现有 `socialAccountManager.test.tsx`。

**Interfaces:** `FacebookPageImportInvitations({token,workspaceId,canManage,onImported:()=>Promise<void>})` 内聚本人任务、生成／复制／撤销、打开详情；`FacebookPageImportSelection({view,busy,onConfirm:(ids:string[])=>Promise<void>,onCompleteEmpty:()=>Promise<void>,onClose:()=>void})`。API client 显式接受 AbortSignal 和当前 token／workspace，所有响应验证 workspaceId；fetch no-store。

- [ ] Step 1：写 `creator_selects_only_new_pages_after_external_authorization`，断言默认不选、已有／断开／权限不足不可选；勾选＋二次确认前无 confirm POST；只提交选中 ID；0 新增有“完成”而不强行空 confirm。相同名称不同 ID 独立显示。
- [ ] Step 2：写 `filtered_select_all_caps_fifty_and_late_response_is_discarded`，断言筛选全选只选 eligible/new，达到 50 禁止新增勾选，隐藏选中数清楚；切换 workspace／token／退出时取消请求并清空 secret／候选，旧响应不能提交或显示到新上下文。刷新状态不自动导入。
- [ ] Step 3：运行新测试观察 RED，再实现入口和组件。Facebook 旧分享标注“普通绑定授权（可能更新已有绑定）”，新入口“分享链接导入主页”；其他平台文案不变。生成链接仅首次显示、内存保存，关闭后不自动持久化；刷新丢失链接提示“重新生成邀请”但不自动撤销旧邀请。支持 80 字内部备注、24 小时提示、task 20 条分页、手动刷新；不自动轮询、不创建通知服务。
- [ ] Step 4：运行新组件测试与原 `facebookPageSync.test.tsx`、`socialAccountManager.test.tsx`，再运行网页生产构建；预期键盘可操作、中文英文、复制失败／API 超时／回执查询／撤销冲突均有清楚提示。无虚假授权者姓名。
- [ ] Step 5：提交 `feat: let invitation creators select new Facebook Pages`。

## Task 9：全流程保护验收与交付，不部署

**Files:** Create `apps/api/tests/facebookPageImportEndToEnd.integration.test.ts`、`docs/facebook-shared-page-import-verification.md`；仅必要时修改上述测试夹具，产品代码缺陷回到所属任务修复。

**Interfaces:** 复用真实 Express app、独立 PostgreSQL／Redis、受控 Graph gateway。fixture 输出受保护记录逐字段快照，只以受控测试数据输出差异，生产不输出凭据。验收记录分为本地通过／真实 Meta 待验证／明确受阻，不合并为“全部完成”。

- [ ] Step 1：写端到端失败测试：creator 创建 → 外部 exchange/callback → creator 新 session 查看 → 勾选 new1＋old → 导入。断言 callback 后账号未变，确认后只 new1 新增，old 所有字段和原排程任务相等；持外部 secret 不能 confirm；旧普通分享仍按原测试语义。运行 `node scripts/run-tests.cjs apps/api/tests/facebookPageImportEndToEnd.integration.test.ts`；若链路已有 GREEN，记录基线并先为实际遗漏写 RED，不人为破坏实现。
- [ ] Step 2：补齐完整失败矩阵：取消／撤销／expiry／降级／删除cutoff／Graph 第二页失败／SYS token 误配／提交响应丢失／邀请跨账号替换／并发旧绑定。只在所属模块做最小修复并重跑该任务安全测试。
- [ ] Step 3：运行 `npm.cmd test`、`npm.cmd run build -w apps/api`、`npm.cmd run build -w apps/web`、`git diff --check`；预期全套通过、零失败／跳过，并保存实际日志，不沿用历史计数。数据库套件串行。测试期间禁止实际 Meta 发布、回复或排程操作。
- [ ] Step 4：按选定执行方式完成独立代码审查，重点检查 lock order、new callback fallback、创建人权限、secret 日志、旧账号 update、迁移及 Meta grant fence；所有 Important/Critical 问题修复后重跑受影响测试和最终完整验证。未获得用户选定执行方式前不调度子代理。
- [ ] Step 5：本机浏览器验证公开页／后台流程仅使用安全模拟数据，不操作生产真实链接。真实授权需要用户亲自授权，并受 Task 1 门槛及另行批准约束；本阶段可只交付离线验证结果，不把待验证写成通过。
- [ ] Step 6：填写验收文档，列出新增表／接口、旧记录快照比较结果、限流／清理／删除证明、兼容性 blocker 和后续部署前检查；只提交本任务文件，提交 `test: verify shared Facebook Page import preserves existing data`。
- [ ] Step 7：停止并交付本地实现与验证结果。任何腾讯云 migration／API/web 更新、远端推送、真实外部授权、用户发帖均需新指令；不启动部署脚本、不重启 Worker。

## 后续部署审批单（非本计划执行任务）

将来用户单独批准后才准备 API／网页镜像和仅新增表迁移。先审迁移无旧表数据修改，原环境摘要／发布数据快照与 Worker 容器、镜像、启动时间留证；只更新 API、网页，不更新 Worker／数据库／Redis／代理容器。现有所有临时互动开关不能被旧部署层误重新开启。线上验证不发布帖子、不改排程；先检查回调不带凭证的拒绝行为，再由用户决定是否做真实非应用角色授权。

回退只切换 API／网页镜像；保留新独立表，不自动删除已合法导入的账号或更改旧凭据。兼容性门槛未满足时不上线邀请入口，不静默更改 Login Config 或申请 `business_management`。

## 计划自查与批准点

- 设计 §1～3：Task 2、4、5、7、8；§4：Task 2、6；§5：Task 3、4、7；§6～7：Task 4～6；§8：Task 1；§9～10：Task 4～9；§11～12：Global Constraints 和交付／部署审批单。
- Review Focus 五项均有对应命名测试；接口名字、截止时间、limit、cookie、namespace 和选择摘要定义保持一致。
- 未安排生产写操作、权限申请、Meta 配置修改或 Worker 更新；没有将当前文档提交视为实施授权。
- 下一步先由用户审核计划并选执行方式；当前轮到此结束，不实施、不部署。
