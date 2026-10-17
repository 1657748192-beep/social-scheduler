# 统一互动收件箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次完成五平台互动后台、客户资料／标签与独立接入框架，当前仅平台管理员可用，不改变发布授权或排程。

**Architecture:** 新建 interactionInbox 域，统一鉴权、能力、客户、工单、查询和发送协议；Facebook 包装现有独立管理服务，其余四平台显式禁用适配器。新索引按授权资产有界更新，Facebook 正文和发送幂等状态保留在原服务。前端新建三栏统一页面，旧收件箱入口兼容跳转，普通客户的前后端访问均拒绝。

**Tech Stack:** 现有 TypeScript、Express、Prisma/PostgreSQL、Redis、Next.js/React、Zod、node:test/tsx、react-test-renderer、Playwright；不新增依赖或收费服务。

**Spec:** `docs/superpowers/specs/2026-10-17-unified-interaction-inbox-design.md`（用户已批准；代码基线 `7fd3c12`）。

## Global Constraints

- 先仅平台管理员可见／可用，并且仍受工作区成员身份限制；复用 ADMIN_EMAILS，不扩大白名单。
- 保留现有发布权限、凭据、绑定和排程不变；不读发布 token 作为互动回退，不刷新发布凭据。
- 不申请权限、不提交审核、不改登录配置／回调／订阅、不进行真实补充授权、不发真实评论或私信；部署另行批准。
- 五个平台为 Facebook、Instagram、TikTok、YouTube、Pinterest；三类视图为评论、私信、@提及；不新增参考图中的其他平台。
- 每次最多选择 50 个账号，目录每页 50；互动每页 25、最大 50；筛选变化旧游标失效。
- 标签名 1–30 字符；每客户／互动最多 10 个；每工作区最多 200 个活跃标签；备注最多 2,000 字符、每客户最多 100 条有效备注。
- 搜索词 2–100 字符，300ms 防抖；每用户每工作区每分钟最多 30 次；消息正文搜索默认关闭。
- 每 30 秒可见页刷新；人工刷新每账号冷却至少 30 秒；隐藏页面停止。事件批次最多 50 项。
- 新原始事件最多 7 天、新归一化内容最多 90 天且取平台政策更短值；政策未经核对的平台不启用真实持久化。
- 中文默认、中英双语，360px 无横向溢出；未接入／无权限／失败／部分失败不冒充成功空数据。
- 不改发布 Worker、不启动退役 Instagram 接收、不自动全量历史迁移，不新增收费资源、AI、自动回复、导出或附件发送。
- 工作树已有未提交文件属于用户。仅提交本功能白名单；不使用 git add .、reset、清库、全栈 compose up/down 或通用部署脚本。

## Review Focus

1. 账号名和平台用户 ID 碰撞、同页多连接及中途换连接：不得合并客户或用旧连接正文越权；Task 3/4 测试。
2. 列表加载后管理员身份／资产权限失效、数据库锁等待期间会话到期：本地搜索、备注和发送仍须失败关闭；Task 3/5/7 测试。
3. 已解决会话收到重复、旧时间戳、同时间不同事件：不误重开、不漏新消息、不回退每人已读位置；Task 5/8 测试。
4. 跨账号分页期间一个平台失败、过滤变化、头像 URL 或游标注入：不能泄露另一上下文或展示错误总数；Task 6/10 测试。
5. 回复已送达但应答丢失、用户切换账号／标签页后重试：不能重复发送或把内部备注发成公开回复；Task 7/11 测试。

## 文件与接口总图

API 新目录 `apps/api/src/interactionInbox/`：types/limits（共享契约）、access（门禁）、capabilities/directory（账号能力）、adapters（平台包装）、projection/reception（元数据索引）、customers/labels/cases（本地处理）、reads/cursor（查询）、sends（发送分派）、retention（留存）、routes/runtime（装配）。每文件只负责上述单一职责；不在旧 FacebookInbox 中叠加五套分支。

前端新目录 `apps/web/components/inbox/unified/`：UnifiedInbox、InboxFilters、AccountPicker、InteractionList、InteractionDetail、ReplyComposer、ContactPanel、LabelEditor、CapabilityNotice、useInboxScope。请求／DTO 在 `apps/web/lib/interactionInbox.ts`，不从 API 目录导入服务器类型。

所有 API 测试直接放 `apps/api/tests/interactionInbox*.test.ts`，Web 测试放 `apps/web/tests/interactionInbox*.test.tsx`，确保现有非递归 runner 自动发现；帮助夹具放各自 tests/helpers。下列 ctx 均为服务器 `{userId,sessionId,workspaceId}`，不是浏览器提交的权限声明。

共享契约固定在 Task 1，后续不得自行重命名：

```ts
type Kind='comments'|'messages'|'mentions';
type Capability='comments.read'|'comments.reply'|'messages.read'|'messages.reply'|'mentions.read';
type Scope={userId:string;sessionId:string;workspaceId:string};
type Query={accountIds:string[];kind:Kind;status?:'pending'|'in_progress'|'resolved';unread?:boolean;tagIds?:string[];from?:string;to?:string;q?:string;searchMessages?:boolean;cursor?:string;limit?:number};
type SendOutcome={status:'sent';providerId:string}|{status:'failed';code:string;diagnosticId:string}|{status:'unknown';diagnosticId:string};
```

AccountRef 以 SocialAccount.id 作为浏览器筛选 ID，只在服务端映射 canonicalAssetKey＝platform＋appNamespace＋providerAssetId（结构化编码，不用可碰撞的字符串拼接）。ResolvedAsset 包含此键、sourceRef、connectionVersion 和服务器上下文，不能序列化凭据。AccountDto 只有安全显示资料、发布绑定状态、逐项 CapabilityDto。sourceRef 是受类型约束的 FB managedPageId／scheduleId／providerThreadId／providerCommentId 或非 FB source ID，不接受任意 URL／JSON。

统一 PageResult<T> 为 `{items:T[],nextCursor:string|null,accountsStatus:AccountStatus[],partial:boolean,observedAt:string,lastSuccessfulSyncAt:string|null}`；CaseDto 必含 id、kind、accountId、customerId|null、sourceLabel、status、version、lastInboundAt、unread；DetailDto 增加安全正文项、原帖／官方链接与 replyTarget。CustomerDto 只返回本次已授权资产范围的身份与历史。接口不返回 token、完整 scopes、密文或提供方原始错误。

## Task 1：契约、能力状态与边界常量

**Files:** Create `apps/api/src/interactionInbox/{types,limits,capabilities}.ts`；Test `apps/api/tests/interactionInboxCapabilities.test.ts`。

**Interfaces:** Produces 上述类型、`evaluateCapability(evidence:CapabilityEvidence):CapabilityDto`、`parseQuery(input:unknown):Query`。证据字段为 supported、integrated、productOpen、approval（unknown/pending/approved/rejected）、grant（missing/valid/expired）、roleAllowed、verifiedAt、providerRestriction；每项能力独立判断。unknown≠pending，read 可用不推出 reply 可用。

- [ ] 写失败测试 `unknownApprovalAndPublishingScopesNeverEnableInteractions`：`assert.equal(evaluateCapability(publishingOnly).available,false)`；未知审批原因必须 `approval_unverified`，不能 `review_pending`；Instagram／TikTok／Pinterest 不因显示头像而可读。`queryLimits` 断言 51 账号、101 字符词、limit51 拒绝，默认 limit25、50 账号接受，空 accountIds 不变成全选。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxCapabilities.test.ts`；Expected：缺模块／函数 FAIL，记录真实失败。
- [ ] 实现契约、Zod 严格 DTO 和全部 spec 限值；能力拒绝原因优先级固定为未接入→未开放→不支持→审批未知／未通过→缺失／失效授权→角色／实时限制→可用；禁止前端覆盖证据。
- [ ] 同命令；Expected：全部 PASS、0 skip；Commit `feat(inbox): define interaction contracts and capabilities`，只 stage 上述文件。

## Task 2：新增关系模型、增量迁移与隔离夹具

**Files:** Modify `apps/api/prisma/schema.prisma`（仅新模型、必要 back relations）；Create `apps/api/prisma/migrations/20261017000100_unified_interaction_inbox/migration.sql`、`apps/api/tests/helpers/interactionInboxFixture.ts`；Test `apps/api/tests/interactionInboxModels.integration.test.ts`。

**Interfaces:** Produces `withInboxFixture(run:(f:InboxFixture)=>Promise<void>):Promise<void>`，f 提供 db、adminCtx、viewerCtx、foreignCtx、accountIds、protectedSnapshot()、seedVerifiedCase()、cleanup()；只用 runner.environment(true,true) 验证的本地独立 DB／Redis，不读取云环境。测试连接复用既有命名容器，不自行重启 Docker 或修改线上。

模型字段决策（全部新表带 UUID id、workspaceId、createdAt；需要并发修改者带 updatedAt/version Int 默认1）：

| 模型 | 必须字段／约束 |
| --- | --- |
| InteractionConnection | platform、appNamespace、providerUserId、加密 token nullable、scopes、expiresAt、status、version；仅非 FB，工作区隔离；本阶段不创建 token |
| InteractionAsset | canonicalKey、platform、appNamespace、providerAssetId、connectionId nullable、facebookManagedPageId nullable、connectionVersion、active；工作区＋canonicalKey 唯一；FB 必须只 sourceRef，非 FB 只 connectionId |
| InteractionCustomer / InteractionIdentity | customer 版本与删除标记；identity 的 appNamespace、assetId、providerActorId、displayName/username/avatarUrl/profileUrl nullable、first/lastSeenAt；工作区＋platform＋appNamespace＋资产＋actor 唯一；匿名不创建 identity |
| InteractionCase | assetId、customerId nullable、kind、providerThreadOrEventId、sourceRef、lastInboundAt、lastInboundKey、status、assigneeId nullable、sentiment（positive/neutral/negative/null）、version；工作区＋assetId＋kind＋providerThreadOrEventId 唯一 |
| InteractionItem | caseId、assetId、providerEventId、parentId nullable、direction、occurredAt、receivedAt、sourceRef、text nullable、deleted；资产＋事件 ID 唯一；FB text 必须 null，只引用原正文 |
| InteractionTag / CustomerTag / CaseTag | kind（customer/case）、name、normalizedName、color、deletedAt、version；工作区＋kind＋normalizedName 活跃唯一；两种关联各自唯一，禁止错 kind |
| CustomerNote / ReadReceipt | note customerId、authorId、text、deletedAt；receipt caseId、userId、lastReadAt、lastReadKey、version，case＋user 唯一 |
| InteractionSyncState | assetId＋kind 唯一、cursor、revision、lastAttemptAt、lastSuccessAt、status、diagnosticId |
| InteractionSendAttempt / InteractionAudit | 非 FB attempt 资产＋requestKey 唯一、targetHash/payloadHash、status/providerId/diagnosticId；audit 只有 actor、action、target ID、结果，不存正文 |

新表均提供复合唯一键（workspaceId,id）供复合 FK 约束新表之间关系，InteractionAsset 的 FB 引用由服务实时复核不删除原 FB 行；旧表只允许新增兼容 back relation。状态／identity namespace 用 Zod 严格校验加 SQL CHECK，FB 正文 null 和连接互斥亦 CHECK。工作区删除新表级联但不得从新表反向删除发布／FB源表；客户主动删除仅新域清除。

- [ ] 写 `modelIsolationAndSourceOnlyFacebook`：跨工作区 tag／identity／case FK 失败，FB 插入正文或两种连接同时指定失败；`assert.deepEqual(await f.protectedSnapshot(),before)`；同规范资产重复受唯一键保护。测试代码 import fixture 并用 `await withInboxFixture(async f=>{...})`，夹具不在模块加载时写库。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxModels.integration.test.ts`；Expected：新模型缺失 FAIL（不是生产连接失败）。
- [ ] 实现模型、SQL 和夹具；仅对已校验隔离库运行 `node scripts/run-tests.cjs --migrate-local-upload-test-db`；Expected：迁移／client 生成退出0，不重置任何 DB。审阅 SQL 无 DROP/TRUNCATE/发布表 UPDATE；保留前后快照。
- [ ] 同测试命令并 `npm.cmd run build -w apps/api`；Expected：PASS／退出0；Commit `feat(inbox): add isolated interaction data models`。

## Task 3：管理员门禁、精确资产解析与安全目录

**Files:** Create `apps/api/src/interactionInbox/{access,directory}.ts`；Test `apps/api/tests/interactionInboxAccess.integration.test.ts`。

**Interfaces:** Consumes Scope、AccountDto；Produces `requireInboxAccess(db,ctx,mode:'read'|'write'|'manage'):Promise<Member>`、`resolveInboxAsset(ctx,accountId,capability):Promise<ResolvedAsset>`、`listInboxAccounts(ctx,{platform?,q?,cursor?,limit?}):Promise<PageResult<AccountDto>>`。从 Session/User 当前 email＋ADMIN_EMAILS 取管理员身份，不信 JWT 客户端 bool；角色 read任何有效成员、write非viewer、manage仅owner/admin。

- [ ] 写 `ordinaryOwnerAndNonmemberAdminAreDenied`、`samePageDifferentAppOrConnectionNeverFallsBack`：普通 owner403，管理员非成员403，跨区 account404，同名资产不匹配；旧连接版本读缓存404；目录 GET 前后 DB 快照相等、无 token／scopes、51st 账号可分页但选择仍50上限。`sessionExpiresWhileWaitingForLock` 用另一真实事务锁住成员，等待过期后断言本地写入为0（Review Focus 1/2）。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxAccess.integration.test.ts`；Expected：缺失门禁／解析实现 FAIL。
- [ ] 实现解析，复用 `facebookManagement/access.ts` 的精确选定连接、发布绑定及实时检查，不改其语义、不加载 OauthCredential。所有本地读写也通过同门禁，事务锁后及返回前重新检查时效。
- [ ] 同命令；Expected：PASS、快照不变；Commit `feat(inbox): enforce admin and asset isolation`。

## Task 4：平台适配器、Facebook 包装与元数据投影

**Files:** Create `apps/api/src/interactionInbox/adapters/{registry,disabled,facebook}.ts`、`projection.ts`；Test `apps/api/tests/interactionInboxAdapters.integration.test.ts`。

**Interfaces:** Produces `getInboxAdapter(platform):InboxAdapter`，异步方法 `capabilities(asset):Promise<CapabilityDto[]> / list(asset,kind,cursor,limit):Promise<AdapterPage> / detail(asset,sourceRef):Promise<AdapterDetail> / reply(asset,target,text,requestKey):Promise<SendOutcome> / normalizeVerifiedEvent(event,asset):Promise<VerifiedItem[]>`；Types 在 Task1 定义。AdapterPage＝安全来源items、nextCursor、coverage、warnings；AdapterDetail＝正文items、官方链接、明确replyTarget及能力；VerifiedItem＝规范资产／事件／父事件ID、时间、方向、参与者、typed sourceRef及删除标记。`projectVerifiedPage(ctx,asset,page):Promise<{revision:number;count:number}>` 仅在显式 refresh／验签处理调用，不是 GET 副作用。

- [ ] 写 `fourDisabledPlatformsNeverCallNetworkOrPublishingCredentials`：4 平台返回 not_integrated（非空成功），网络调用0；FB fake runtime 验证使用原 capabilities／conversations／messages／comments、reply 调用，selected connection 精确传递；`facebookProjectionContainsReferencesNotCopiedBodies` 断言 text=null、旧 Received* 未读、同页多连接不会串客户（Focus1）。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxAdapters.integration.test.ts`；Expected：FAIL。
- [ ] 包装现有 `facebookManagement/runtime.ts`、`engagement.ts` 的真实签名，不重实现 token/window/send；私信按已验证会话，评论仅已绑定账号的真实 published schedule＋providerPostId。refresh 每账号每次最多处理一页会话＋一页已验证发布帖子（各≤25），评论每帖一页，全球并发≤4、单次远端预算30秒；存继续游标，不无限抓历史。UI 回传 coverage=`verified_published_posts`／`received_and_read_threads`，不承诺主页全部历史帖子；扩大历史读取另行授权。源内容不确定／被删时不以旧索引覆盖成功 Graph 结果。
- [ ] 同命令；Expected：PASS；Commit `feat(inbox): adapt existing Facebook and disabled platforms`。

## Task 5：客户、标签、备注、处理状态与每人已读

**Files:** Create `apps/api/src/interactionInbox/{customers,labels,cases}.ts`；Test `apps/api/tests/interactionInboxCustomers.integration.test.ts`、`interactionInboxWorkflow.integration.test.ts`。

**Interfaces:** Produces `getCustomer(ctx,id,query):Promise<CustomerDto>`、`deleteCustomer(ctx,id,version):Promise<void>`、`saveNote(ctx,customerId,text):Promise<NoteDto>`、`deleteNote(ctx,customerId,noteId):Promise<void>`、`mutateTag(ctx,input):Promise<TagDto|null>`、`setTags(ctx,target:{kind:'customer'|'case';id:string},tagIds:string[],version:number)`、`updateCase(ctx,id,{status?,assigneeId?,sentiment?,version}):Promise<CaseDto>`、`markRead(ctx,id,{eventAt,eventKey,version})`、`batchCases(ctx,operations):Promise<BatchResult>`。tag input discriminated union create/rename/delete，版本必传；所有方法先解析当前可见身份／资产。

- [ ] 写 `sameNamesNeverMergeAndNotesNeverSend`：不同平台／资产相同 actor和name产生两个customer，匿名不造身份；notes provider调用0；200/201标签、10/11关联、30/31字符、2000/2001备注、100/101条边界；Unicode NFC＋trim＋小写规范唯一，空白拒绝；重命名保留关联，删tag不删case；旧版本409。
- [ ] 写 `unreadAndResolutionAreIndependent`：两管理员读进度独立，旧 read 游标不回退；发送不自动resolve；新入站重开，重复与旧事件不重开，同时间新事件用稳定providerEventId排序不丢（Focus3）；失效负责人不可新指派；viewer写403，锁等待到期回滚（Focus2）；删除客户仅清本地关联和索引，平台／发布调用0，审计无姓名正文。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxCustomers.integration.test.ts apps/api/tests/interactionInboxWorkflow.integration.test.ts`；Expected：缺失客户／处理服务 FAIL。
- [ ] 实现事务＋复合关系校验，批处理最多50逐项结果；tag与note数量限制在锁内检查；customer删除仅owner/admin，备注本人可删、owner/admin可删他人。
- [ ] 同命令；Expected：PASS、所有保护快照不变；Commit `feat(inbox): add customer labels notes and workflow`。

## Task 6：统一查询、正文搜索、安全分页和部分失败

**Files:** Create `apps/api/src/interactionInbox/{reads,cursor}.ts`；Test `apps/api/tests/interactionInboxReads.integration.test.ts`。

**Interfaces:** Produces `listCases(ctx,query):Promise<PageResult<CaseDto>>`、`getCase(ctx,id,query):Promise<DetailDto>`；`encodeInboxCursor(scope,payload):string`／`decodeInboxCursor(scope,value):CursorPayload`。scope＝workspace＋sessionId＋排序后accountIds＋kind＋筛选摘要，HMAC用现有服务器 JWT_SECRET、单独 inbox_cursor域、不新建密钥；cursor≤2048字符、TTL15分钟，坏签名／错筛选／过期400。

- [ ] 写 `partialAccountsNeverBecomeSuccessfulZero`：一个失败账号＋一个空成功账号得到partial=true，失败计数null；日期＋id稳定跨页无重复；cursor改工作区／筛选拒绝；撤权后客户名／标签计数／备注搜索不泄露；消息正文搜索默认关闭、LIKE通配符和SQL注入作普通参数、同名客户按asset区分（Focus4）。`listDoesNotRefreshOrCreateIndexes` 断言GET列表无远端调用／新行，GET详情只允许既有适配器只读来源请求、不建索引。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxReads.integration.test.ts`；Expected：缺失查询／游标实现 FAIL。
- [ ] 实现参数化受限查询、先解析授权资产再查询／拼接source正文。FB搜索只查经访问过滤的原来源记录，不复制正文；GET列表仅读已建立索引，详情可通过FB原只读服务读取Graph正文（有界分页、不写入新表）。仅Graph可见未在原接收表保留的正文不计入本地搜索覆盖，返回覆盖说明而不是伪造全量搜索。来源删除／失权不因残留customer可访问；限流Redis原子30次/60秒，失效 fail-closed、不同用户/工作区隔离。
- [ ] 同命令；Expected：PASS；Commit `feat(inbox): query scoped interactions with safe cursors`。

## Task 7：精确目标回复、发送不确定性与幂等

**Files:** Create `apps/api/src/interactionInbox/sends.ts`；Test `apps/api/tests/interactionInboxSends.integration.test.ts`。

**Interfaces:** Produces `replyToCase(ctx,caseId,{targetId:string;text:string;requestKey:string}):Promise<SendOutcome>`；case/target由存储解析，mentions仅可映射已核验 comment/message 否则拒绝。不提供批量／unknown“强制重发”接口。

- [ ] 写 `lostAcknowledgementNeverDuplicatesFacebookSend`：相同key/正文目标再试只调用一次原 executeFacebookSend，同key改正文／目标409；unknown保持unknown不自动重发；调用前撤权／会话到期／换连接／错page target拒绝；notes接口永远不进入此服务（Focus2/5）；Facebook消息2000、评论8000限制沿用原服务，其他平台禁用。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxSends.integration.test.ts`；Expected：缺失统一发送分派 FAIL。
- [ ] 实现重新鉴权后直接调用FB原replyMessage／replyComment及原SendAttempt，不另建FB重发状态；返回provider明确sent才显示成功。非FB保留独立attempt模型，但禁用适配器不写“成功”或触网。
- [ ] 同命令；Expected：PASS且原发送状态机测试仍PASS；Commit `feat(inbox): preserve safe targeted reply semantics`。

## Task 8：有界刷新、验签事件投影、留存和失权清除

**Files:** Create `apps/api/src/interactionInbox/{reception,retention}.ts`；Modify `apps/api/src/facebookManagement/receptionStore.ts`（仅完成已验签原事件处理后的可选投影钩子）；Test `apps/api/tests/interactionInboxReception.integration.test.ts`。

**Interfaces:** Produces `refreshInbox(ctx,{accountIds,kind,cursor?}):Promise<RefreshResult>`、`projectFacebookSourceBatch(sourceRefs:string[],now:Date):Promise<number>`、`pruneInbox(now:Date,limit:number):Promise<number>`。scope／namespace由服务加载不可从事件自报信任；不新增Webhook路由或订阅。FB投影失败不破坏原接收保存，下一次可见页refresh按source唯一键重试补索引。

- [ ] 写 `verifiedEventsOnlyAndReplayDoesNotReopenResolvedCase`：伪签名／unknown asset／旧连接投影0；合法重复事件item1；原事件先保存，后投影失败可恢复但不重复发送；每批≤50，旧时间／同时间新事件按Task5规则（Focus3）。`refreshIsSharedAcrossTabs` 验证30秒cooldown原子共享、4并发上限、30秒远端预算、冷却429 Retry-After；未启用平台调用0。
- [ ] 写 `pruningNeverExtendsSourceRetention`：raw7天、normalized90天或更短policy取最早；未经policy批准平台无真实写入；FB源已删则reference不可读并清理；删除身份请求同workspace连notes/tags关联清除，不删平台或发布表；断开停止投影且GET失权立即不可见。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxReception.integration.test.ts`；Expected：缺失投影／留存控制 FAIL。
- [ ] 实现新表批次≤50、租约／退避和投影去重，用已存在API接收周期的可选钩子有界调用，不改发布Worker或旧Instagram泵。新平台disabled且policyVerified=false默认，不用产品90天上限冒充平台政策批准。
- [ ] 同命令；Expected：PASS并原Facebook接收测试PASS；Commit `feat(inbox): add bounded projection refresh and retention`。

## Task 9：路由、运行时装配、旧接口门禁与日志

**Files:** Create `apps/api/src/interactionInbox/{routes,runtime}.ts`；Modify `apps/api/src/app.ts`、`apps/api/src/utils/requestLog.ts`；Test `apps/api/tests/interactionInboxHttp.integration.test.ts`、`interactionInboxRequestLog.test.ts`。

**Interfaces:** Produces `createInteractionInboxRouter(runtime,{authenticate?}):Router`、`createInteractionInboxRuntime(deps):InboxRuntime`；base=`/workspaces/:workspaceId/interaction-inbox`。使用工厂依赖注入测试，所有认证前后错误均no-store；请求日志抹除整个inbox路径参数／query，仅保留模板与状态。

- [ ] 写真实JWT＋隔离API子进程HTTP矩阵：匿名401、普通owner403、admin非成员403、跨区404、viewer各写403；覆盖capabilities/accounts/cases/detail/customers/notes/tags/refresh/replies/read/batch全部路由，非法字段400、冲突409、限流429、不确定发送JSON unknown；未登录错误不包含secret。旧 `/facebook-management` API管理员保护继续通过。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxHttp.integration.test.ts apps/api/tests/interactionInboxRequestLog.test.ts`；Expected：新路由404／日志断言 FAIL。
- [ ] 挂载spec全部路由，并增加 `DELETE /customers/:id`（strict `{version}`）落实spec本地客户删除；GET `/customers/:id/notes`及tags均带账号筛选范围、无全区绕权入口。禁用补充授权返回not_open，不新增OAuth路由；运行时开关只内置服务配置（默认admin框架可展示、发送仍服从既有FB开关），浏览器不能改。
- [ ] 同命令＋`npm.cmd run build -w apps/api`；Expected：PASS／0；Commit `feat(inbox): expose guarded unified interaction APIs`。

## Task 10：统一页面、平台账号选择与互动列表

**Files:** Create `apps/web/app/inbox/page.tsx`、`apps/web/lib/interactionInbox.ts`、`apps/web/components/inbox/unified/{UnifiedInbox,InboxFilters,AccountPicker,InteractionList,CapabilityNotice,useInboxScope}.tsx`；Modify `apps/web/app/globals.css`；Test `apps/web/tests/interactionInboxList.test.tsx`，fixtures `apps/web/tests/helpers/interactionInboxUI.tsx`。

**Interfaces:** `UnifiedInbox({token,workspaces,initialContext?})`、`useInboxScope(key)`（capture/abort世代检查）、`AccountPicker({accounts,selectedIds,onApply,onLoadMore})`；请求函数 `inboxRequest<T>(token,workspaceId,path,options)`，保留HTTP错误码／AbortSignal；安全DTO与Task1对照但不导入服务器。

- [ ] 写 `fivePlatformsThreeKindsAndExplicitSelectionLimits`：五平台三tab可见、51选拒绝、目录翻页／筛选结果全选不冒充全目录；无读权限文案明确、不返回假空；无账号选择不隐式查全部，初次可读账号≤50时明确显示所选。`staleResponseAndInjectedCursorNeverLeakPreviousScope` 验证切平台／工作区／token后旧响应不入新视图、错误清正文（Focus4）。
- [ ] Run `node scripts/run-tests.cjs apps/web/tests/interactionInboxList.test.tsx`；Expected：缺失页面／列表组件 FAIL。
- [ ] 实现300ms搜索防抖、30秒仅可见页刷新、隐藏／卸载停止、部分失败计数null、失败保留同上下文旧内容并标过时；不把姓名／搜索／正文放URL或localStorage。账号切换按spec确认草稿策略由Task11共同完成，不直接丢弃未发内容。
- [ ] 同命令；Expected：PASS；Commit `feat(web): build unified inbox filters and interaction list`。

## Task 11：详情回复、客户面板、标签备注与本地处理

**Files:** Create `apps/web/components/inbox/unified/{InteractionDetail,ReplyComposer,ContactPanel,LabelEditor}.tsx`；Modify `UnifiedInbox.tsx`；Test `apps/web/tests/interactionInboxDetail.test.tsx`、`interactionInboxCustomers.test.tsx`。

**Interfaces:** Detail使用Task6 DetailDto；`ReplyComposer({detail,onSend,onDirtyChange})` 每次尝试生成一次requestKey，重试保留原key；`ContactPanel({customer,permissions,onMutate})`；tag editor区分customer/case，note独立提交。统一transitionScope(next)仅在草稿确认通过后切换，取消保留原视图。

- [ ] 写 `replyAndInternalNoteCannotShareAction`：明确显示将以哪个账号公开回复/私信、note provider发送0；unknown禁用再次自动发送并提供安全官方链接；reply不自动resolved；换账号有草稿先确认、取消不切换，迟到sent不污染新case（Focus5）。客户同名不同来源不合并、标签版本409保留输入后重新读、删除需确认。
- [ ] Run `node scripts/run-tests.cjs apps/web/tests/interactionInboxDetail.test.tsx apps/web/tests/interactionInboxCustomers.test.tsx`；Expected：缺失详情／客户组件 FAIL。
- [ ] 实现右栏资料/备注/标签/历史互动、人工情绪、处理状态/负责人、批量处理≤50；读进度只本人，失效负责人提示；360px三级导航、纯文本输出、只允许官方HTTPS URL，外链noopener/noreferrer。无平台数据展示“未提供”而不是虚构联系方式；补充授权按钮禁用并显示spec固定文案。
- [ ] 同命令；Expected：PASS；Commit `feat(web): add interaction details and customer workflow`。

## Task 12：管理员导航与旧入口兼容

**Files:** Modify `apps/web/components/AppShell.tsx`、`apps/web/app/facebook-inbox/page.tsx`、`apps/web/app/inbox/page.tsx`；保留 `apps/web/components/inbox/FacebookInbox.tsx` 以便回退；Test `apps/web/tests/interactionInboxNavigation.test.tsx`、既有 `facebookManagementNavigation.test.tsx`。

**Interfaces:** 复用PlatformAdminOnly，侧栏原位置改 `/inbox` 及“互动收件箱”，BM项不变。旧链接参数 `workspaceId/managedPageId/connectionId` 作为不可信定位提示映射精确account，校验失败只提示重选不自动切工作区。已有帖子评论组件继续原功能，新增跳转可选但不删除原安全入口。

- [ ] 写 `ordinaryCustomersCannotMountOrFetchUnifiedInbox`：普通客户导航不显示、直达／旧入口不加载私密子组件；管理员非成员不能被URL导向他区；旧链接合法映射FB、错连接不回退到第一个账号；客户端伪造isPlatformAdmin不能越过HTTP403。
- [ ] Run `node scripts/run-tests.cjs apps/web/tests/interactionInboxNavigation.test.tsx apps/web/tests/facebookManagementNavigation.test.tsx`；Expected：旧入口／新导航行为 FAIL。
- [ ] 实现兼容跳转前auth/me＋workspace检查，新页仍重验；不修改ADMIN_EMAILS，不把BM管理员专属路由开放客户。
- [ ] 同命令＋`npm.cmd run build -w apps/web`；Expected：PASS／0；Commit `feat(web): gate unified inbox and preserve legacy links`。

## Task 13：完整验证、保护证据与交付（不部署）

**Files:** Create `docs/unified-interaction-inbox-verification.md`；本地 Playwright 合成夹具放 `output/playwright/`（不提交客户资料）。Test `apps/api/tests/interactionInboxProtection.integration.test.ts`。

**Interfaces:** 沿用fixture.protectedSnapshot，包含原SocialAccount全字段、OauthCredential密文及有效期、OAuth发布配置记录、Post/PostVariant/Schedule/PublishJob、原FB管理连接，按工作区和全表外溢检查；测试只独立DB，不取得线上凭据。

- [ ] 在测试中先创建两工作区发布记录／既有独立连接；写 `fullInboxLifecyclePreservesPublishingAndOtherWorkspace`：执行目录、refresh、标签/备注/处理、mock回复、客户删除和失权，`assert.deepEqual(after,before)`；证明新版disabled平台不触发旧Instagram路由、sandbox或发布刷新。先跑该测试；Expected：保护实现缺失时FAIL，若已正确直接PASS则不造无意义故障，记录补充保护证据。
- [ ] Run `node scripts/run-tests.cjs apps/api/tests/interactionInboxProtection.integration.test.ts`；Expected：PASS、0 skip；完成所有Task1–12具名测试并核对每个Expected。
- [ ] Run `npm.cmd test`、`npm.cmd run build -w apps/api`、`npm.cmd run build -w apps/web`、`git diff --check`；Expected：全部0、完整suite零失败零跳过。C盘TEMP不足只使用既有安全TEMP子进程包装，日志必须输出摘要，不能降低产品磁盘阈值、删用户文件或跳过测试。独立数据库变更仅Task2受控迁移，不对生产执行测试。
- [ ] 用Playwright本地生产构建，所有API合成、真实平台网络阻断：1440×1000与360×800，≥25账号/长中文名/三类型/部分失败/unknown发送/标签备注，Tab/Escape与手机返回；断言无横溢、操作按钮不裁切、普通客户无入口、失权清屏、切换草稿确认、没有额外发送请求。截图逐张检查并记录，不拿截图冒充真实授权。
- [ ] 依据Review Focus完成一次全分支审查；修复需先复现再回归。验证文档明确框架已完成／真实平台待验、实际迁移SQL、保留凭据快照、未申请权限／未部署／未重启Worker、潜在Facebook历史覆盖限制及回退条件。Commit `test(inbox): verify admin isolation and publishing preservation`，仅提交计划白名单及新增代码/测试/迁移。

## 未来部署与审核的单独门槛

本计划完成不授权推送共享分支、部署、线上migration、补充授权、提交审核或真人测试发送。用户另行确认后，准备精确commit白名单、旧镜像与环境/全工作区发布数据保护快照；只构建／重建API和网页，Worker/DB/Redis/代理容器身份与启动时间核对不变。新增迁移只CREATE新域表/索引，不倒退或删除发布数据；DB迁移前确认旧API兼容新schema。API Docker入口若自动执行migrate deploy也算线上迁移，不能借部署绕过审批。先确保无历史批量扫描钩子。

验收失败仅回旧API/Web镜像和新入口开关，保留新增表；不drop新表、不恢复覆盖用户数据、不撤平台权限。每个平台后续审核／授权／真实读取／真实回复必须逐项明确同意并记录证据，当前禁用适配器不会因“应用通过”而自动启用。

## 计划自审与执行方式

- Spec §§1–3→Task1/3/10/12；§§4–5→Task2/5/6/11；§§6–9→Task1/2/3/4/7；§§10–12→Task3/6/7/8/9/10；§§13–14→Task3/5/8/9/11；§15→Task13；§16官方边界保留为后续真实启用门槛，不冒充当前批准。
- 补足spec声明但API列表未列的本地客户删除端点；不触发平台删除。Facebook评论来源范围显式标注既有已核验发布帖子，未扩大为任意历史主页数据。
- 共享类型、账号ID映射、case详情、投影／读服务／发送服务与前端DTO依赖已串联；不在GET建索引、不双写FB正文／发送状态、不让禁用平台返回假空。
- 五项Review Focus均有归属测试；无待定占位、没有将审核／部署混入本轮实施。
- 建议 **Native（当前会话逐项直接实施）**：13项任务共享数据模型、鉴权与平台适配器接口，单一实现上下文更易保持边界，最终一次独立审查。用户也可选择逐项子代理＋逐项审查，隔离上下文和成本更高；本次未启动任何代理。
- 需用户审阅本计划并确认执行方式后，执行者先用 using-git-worktrees 检查现有隔离工作树，再用 TDD 和相应执行技能逐项推进。本轮仅编写计划，无代码、schema或线上变更。
