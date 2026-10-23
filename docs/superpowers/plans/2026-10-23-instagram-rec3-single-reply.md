# Instagram REC3 Single-Reply Grant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为同一个个人测试账号的新 REC3 来信提供一个持久化、最多一次人工发送资格，同时保持旧 REC1、REC2 次数与防重记录不变。

**Architecture:** 新增来信级资格表，唯一身份不包含本地记录或连接版本。REC3 专用分支将资格占用和原始发送尝试创建置于同一事务；旧 targetHash、旧准入路径和旧回执格式保留。资格、回执展示与隐私清理共享同一绑定，并默认关闭未经验证的记录。

**Tech Stack:** TypeScript、Node、Prisma、PostgreSQL、现有 React/Next.js 收件箱、node:test 与现有本地隔离测试工具；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-23-instagram-rec3-single-reply-design.md`（用户已确认）。

## Global Constraints

- 旧 REC1、REC2 次数、发送尝试、回执、请求键和防重标识不变；不回填、不重写、不清除旧发送记录。
- REC3 最多触发一次应用层发送调用；重复点击、并发、新请求键、进程中断、重新同步或重新授权都不能增加次数。
- 失败、超时和结果未知均不自动重试、不释放已占用资格。不承诺远端恰好投递一次；软件保证不会为该资格主动再次发送。
- 保留授权、管理员、工作区、账号、独立连接、回复窗口、删除、保留期和限流检查；防重资格不替代这些检查。
- Webhook 保持关闭，不引入 Worker 任务、自动回复或后台发送队列，不新增收费资源或权限。
- 仅 `mooyamcosmetic`、指定管理员、指定 `SS-IG-DM-1023-REC3` 原始消息可用；不自动批准其他新来信。
- 固定回复：`Social Scheduler Instagram messaging reply test REC3. This reply is for app review demonstration only.`
- 当前批准只覆盖计划编写；下列所有复选框均未执行。代码实现、Meta 核验、受控同步、迁移、部署及发送分别受阶段授权约束。
- 工作目录为现有隔离 worktree `source/.worktrees/tiktok-sandbox-metrics`；保留已有未提交文件，只提交本任务文件，不执行广泛清理、重置或批量暂存。

## Review Focus

1. 相同 providerEventId 被重新同步成新本地记录或新连接版本，仍不能产生第二机会（Task 1、2）。
2. 旧请求键碰撞、两个 executor 并发、资格与回执写入部分失败，不能导致第二发送或误认成功（Task 3）。
3. 旧回执复制结果、迟到详情、较晚新来信与相同时间戳，不能串用 REC2/REC3 的已回复状态（Task 2、4）。
4. 原文/尝试匿名化、断开连接、资格清理及代码回退，不能让机会重新出现或阻塞隐私删除（Task 5、6）。
5. 重复标识、分页未完成、429、未知 POST 结果或外部渠道已回复，准备工具必须停止，而不是猜测未回复或选择任意候选（Task 6）。

## 文件和职责映射

| 文件 | 职责 |
| --- | --- |
| `apps/api/prisma/schema.prisma`、`apps/api/prisma/migrations/20261023040000_instagram_reply_recording_grant/migration.sql` | 加法资格表、唯一及状态约束，不改旧表数据 |
| `apps/api/src/instagramManagement/recordingGrantIdentity.ts` | 稳定 incomingKey、固定 REC3 文案/标识、资格 DTO 类型 |
| `apps/api/src/instagramManagement/recordingGrants.ts` | 来源及前驱校验、准备、行锁占用、终态写入、只读资格查询 |
| `apps/api/src/instagramManagement/replyRecording.ts` | 严格可选 messageRec3 配置和精确来源选择；旧选择不变 |
| `apps/api/src/instagramManagement/sendAttempts.ts`、`engagement.ts` | REC3 单次发送分支、重用现有鉴权与最终发送围栏 |
| `apps/api/src/instagramManagement/replyReceipts.ts`、`apps/api/src/interactionInbox/{cases,types,reads}.ts`、`apps/web/lib/interactionInbox.ts` | 资格绑定的原始回执、最新来信的已回复判断及 DTO 映射 |
| `apps/api/src/instagramManagement/recordingGrantLifecycle.ts`、`apps/api/src/interactionInbox/{retention,deletion}.ts` | 有界清理、关闭与最小防重标记；共享原预算 |
| `apps/web/components/inbox/unified/ReplyComposer.tsx` | REC3 一次机会提示，不开放重试/重置 |
| `scripts/ops/instagram-rec3/{read,prepare,verify}.cjs` | 显式运行的受控读取、指定同步/资格准备、无发送验证；不接入定时器 |
| 新测试文件及 `apps/api/tests/helpers/instagramReplyGrantFixture.ts` | 隔离数据库与模拟 Graph，证明边界，不访问 Meta |

## 执行与测试约定

任务按 1→6 顺序执行。每任务先写失败断言并观察目标行为 RED，再最小实现、观察 GREEN，再提交；不把 import 拼写、数据库未启动等环境错误当作有效 RED。

非数据库测试：`node scripts/run-tests.cjs <test files>`。数据库测试使用已有、先审阅过的本机隔离包装器：

`node C:/Users/Administrator/AppData/Local/SocialSchedulerTools/run-ig-isolated-local-tests.cjs <test files>`

包装器验证本机测试地址、创建独立测试库、部署本地迁移、运行 `scripts/run-tests.cjs`，最后移除自己创建的测试库；无生产 fallback。使用前确认其内容和目标仍与此描述一致。不得打印数据库凭据。生产迁移不属于本地测试。

Prisma 客户端生成：`npm.cmd run db:generate --workspace apps/api`，仅本地；失败不得改用生产库。长输出写任务专属 `output/ig-rec3-*` 文件并核对尾部统计与退出码。

### Task 1: 稳定资格身份与加法数据库模型

**Files:** 创建 identity 模块、迁移及 `apps/api/tests/instagramReplyGrantIdentity.test.ts`、`apps/api/tests/instagramReplyGrantModels.integration.test.ts`；修改 schema。

**Interfaces:**

- Consumes: 原始 provider 消息 ID 和现有 `withMetaInboxFixture`。
- Produces: `Rec3IncomingIdentity = {workspaceId:string;appId:string;providerAccountId:string;providerEventId:string}`；`instagramRecordingIncomingKey(value:Rec3IncomingIdentity):string`。
- Produces: 新 `InstagramReplyRecordingGrant` Prisma delegate。标识算法严格为 spec 第 4 节的规范 JSON + SHA256，不接受正文替代 ID。另导出 `REC3_MAX_AGE_MS=86400000`，这是应用自身仅针对 REC3 的保守上限，不是对 Meta 规则的声明，不改变旧记录或通用回复窗口。

- [ ] 写 identity 失败测试：`assert.equal(key(a), key({...a}))`；用相同稳定身份、不同本地 sourceRecordId/连接版本的输入提取 identity 后断言 key 相等；不同 workspace/app/providerAccount/providerEventId 分别断言不相等。使用固定向量对照 `createHash('sha256').update(JSON.stringify(['ig-recording-message-grant-v1', ...])).digest('hex')`。
- [ ] Run: `node scripts/run-tests.cjs apps/api/tests/instagramReplyGrantIdentity.test.ts`。Expected: key 算法缺失/不正确导致断言 FAIL。
- [ ] 实现上述纯函数、固定 marker/text 导出，验证输入非空且有长度上限，不打印输入。
- [ ] 写模型失败测试：创建资格后相同 incomingKey 插入 `assert.rejects(..., e=>e.code==='P2002')`；同一 attemptId 关联第二资格同样拒绝；非法状态、available 带 claimedAt/attemptId、claimed 缺任一占用字段均由数据库拒绝。记录并比较旧尝试与发布数据快照。
- [ ] 增加表与 SQL 约束：incomingKey unique，attemptId nullable unique，state 仅 available/claimed/sent/failed/unknown/closed；available 必须未占用，claimed/sent/failed/unknown 必须有 attemptId 和 claimedAt。closed 允许清理后的引用为空，但不允许重新置 available。incomingKey 不可更新；已绑定 attemptId 不可换成另一尝试；仅 closed 可清空引用用于隐私清理。不以对来源/尝试的 CASCADE 或 RESTRICT 外键影响旧清理。核心稳定命名空间保留，敏感来源字段可在 closed 时清空。新增不可延后的 `forgetAfter`，准备时固定为 max(原始 occurredAt+REC3_MAX_AGE_MS、expiresAt、原始内容保留截止)，用于 Task 5 最终清除最小标记。
- [ ] 迁移只 CREATE 新对象，不 UPDATE/DELETE 旧模型；本地生成客户端，隔离包装器运行模型测试。Expected: 新唯一/状态约束通过，旧行快照相同。
- [ ] 两个文件测试均 GREEN 后，仅提交本任务文件：`feat(api): add stable Instagram recording grant identity`。

### Task 2: REC3 配置、来源与前驱校验、幂等准备

**Files:** 创建 `recordingGrants.ts`、fixture helper、`apps/api/tests/instagramReplyGrantPreparation.integration.test.ts`；修改 `replyRecording.ts`；扩展原录屏配置测试。

**Interfaces:**

- Consumes: Task 1 key 与表，现有 `ResolvedAsset`、`SourceRef`、`LiveInboxPolicy`、`InboxDb`。
- Produces: 可选 `rule.messageRec3 = {sourceRecordId;providerEventId;actorId;conversationId;expiresAt}`，字段类型/严格校验沿用 messageRec2；不得覆盖旧字段。
- Produces: `Rec3GrantDeps = {db:PrismaClient;rule:InstagramReplyRecording;policy:LiveInboxPolicy;now:()=>Date;isDeleted:(tx:Prisma.TransactionClient,subject:InstagramSourceSubject)=>Promise<boolean>}`。
- Produces: `createInstagramRecordingGrants(deps:Rec3GrantDeps)` 返回 `prepare(asset:ResolvedAsset,source:SourceRef):Promise<InstagramReplyRecordingGrant>` 和 `read(asset:ResolvedAsset,source:SourceRef):Promise<InstagramReplyRecordingGrant|null>`。prepare 只供后续显式操作工具调用，普通读取只调用 read。
- Produces: test-only `seedRec3Fixture(f:MetaInboxFixture)`：返回 rule/asset/source/text/now、两条旧原始尝试、原始成功前驱、输入工厂 `input(patch?:Partial<InstagramSendInput>)` 和 `oldSnapshot()`；数据使用 synthetic provider ID，旧 REC2 确认时间为 now-60s，REC3 occurredAt 为 now-30s。正式 product 不引入测试开关。

- [ ] 写失败测试 `same sender receives one REC3 grant without rewriting REC1 or REC2`，准备两次后断言 `first.id===second.id`、资格 count 为 1、旧快照不变、未新增发送尝试；修改本地来源 ID/版本后再次准备必须拒绝或返回同一关闭资格，绝不能 count 为 2。
- [ ] 对错误身份/账号/管理员/来源、重复 marker、已删除、无配置、过期、等于/早于前驱确认、复制前驱、历史 pending/unknown/匿名化分别写 `assert.rejects(prepare(...))`，断言资格和旧尝试不变。时间相等明确拒绝。
- [ ] 隔离运行新测试。Expected: 缺少准备/校验行为导致 FAIL。
- [ ] 实现严格解析及 REC3 选择。新增资格服务复用现有授权、窗口、删除围栏；prepare 在连接锁内重新核验来源和前驱，再 insert；唯一冲突只能读回原资格并逐项匹配绑定，不修改其时间、载荷、状态。read 永不创建资格。已存在可用资格也需重验，有歧义关闭而不续期。
- [ ] 前驱验证必须证明唯一原始 sent/providerId、当前有效连接及原始发送证据，检查同目标未确认历史；缺失或清理后证据不足直接拒绝。固定截止取配置、原始来信窗口、保留策略及 occurredAt+REC3_MAX_AGE_MS 的最早值。任何 prepare/claim，包括最小标记已清除后的再次准备，都必须根据可信原始 occurredAt 拒绝 age>=REC3_MAX_AGE_MS，不能用 receivedAt 或新版本续命。
- [ ] Run 新测试与 `apps/api/tests/instagramReplyRecording.integration.test.ts`。Expected: 全部 PASS，REC1/REC2 原断言保留不削弱；只提交该任务文件：`feat(api): prepare strictly bound REC3 grants`。

### Task 3: 原子占用、一次发送与结果持久化

**Files:** 修改 `recordingGrants.ts`、`sendAttempts.ts`、`engagement.ts`；创建 `apps/api/tests/instagramReplyGrantSend.integration.test.ts`。

**Interfaces:**

- Consumes: Task 2 service/fixture；`InstagramSendInput` 为现有 sendAttempts 的 Input 更名导出，字段不变。
- Produces: grant service 方法 `claim(input:InstagramSendInput):Promise<{fresh:boolean;attempt:InstagramInteractionSendAttempt}>`、`finish(attemptId:string,result:SendOutcome):Promise<SendOutcome>`。二者内部开启事务，按 connection→grant 顺序加锁；claim 不发送，finish 不创建尝试。
- Produces: `createInstagramSendExecutor` 增加可选 `recordingGrants?:ReturnType<typeof createInstagramRecordingGrants>` 依赖，由 engagement 在 REC3 配置存在时传入；REC3 配置存在但 service 缺失必须拒绝，不能回退通用分支。旧调用未配置 REC3 时行为不变。

- [ ] 写失败测试，两个独立 executor 对同一 REC3 `Promise.all` 使用不同 UUID requestKey；断言模拟 provider `calls===1`、资格 attemptId 唯一、原始尝试增量为 1、旧快照相同。随后相同键/新键重复请求都不增加 calls，不创建复制 attempt。
- [ ] 写失败测试：旧 REC2 requestKey 与 REC3 冲突拒绝；不同 text/target/source/管理员拒绝；其他消息/评论不走新分支；旧未知状态存在则拒绝。
- [ ] 隔离运行新测试。Expected: 原有按发送者锁定导致合法 REC3 不可用，或新资格准入未实现，目标断言 FAIL。
- [ ] 实现 claim：事务内重查资格有效性与原始绑定、前驱、旧请求键、pending/unknown；available 时创建旧格式 targetHash/payloadHash 尝试并原子绑定 claimed，已占用时仅读真实关联尝试。重复处理排除该资格自身 pending，不排除其他未确认尝试。
- [ ] executor 仅 fresh 执行既有发送前围栏及一次 send 回调；原始执行栈外不暴露“继续已占用发送”方法。finish 条件更新 pending/claimed，两表终态一个事务提交。无效回执转 unknown；持久化失败维持已占用，返回 unknown，不能重派。
- [ ] 加入中断/失败测试：事务回滚前零发送；占用后重建 executor 不发送；远端 callback 抛错/返回 failed/unknown、权限改变、回执事务失败，均 count 不再增加；旧键/旧行不变。测试数据库故障注入只在 test helper，不加生产测试开关。验证真实 Graph 发送传输 `redirect:'error'` 且无 POST retry。
- [ ] Run 新测试与 `apps/api/tests/instagramManagementSend.integration.test.ts`、原录屏测试。Expected: PASS；提交：`feat(api): consume REC3 grants before one manual dispatch`。

### Task 4: 原始回执关联、列表/详情与录屏提示

**Files:** 修改 `replyReceipts.ts`、`engagement.ts`、`interactionInbox/{cases,types,reads}.ts`、`apps/web/lib/interactionInbox.ts`、`ReplyComposer.tsx`；创建 `apps/api/tests/instagramReplyGrantReceipts.integration.test.ts`、`apps/web/tests/instagramReplyGrantRecording.test.tsx`。

**Interfaces:**

- Consumes: 资格 attemptId 与固定文案、现有 InboxDetail/InboxSend、发送即时回显。
- Produces: `findInstagramRecordingGrantReceipt(db:InboxDb,binding:{asset:ResolvedAsset;source:SourceRef;after:Date;before:Date}):Promise<{providerId:string;payloadHash:string;createdAt:Date;updatedAt:Date}|null>`，只接受资格绑定的原始尝试并复核当前访问、时间、删除与原始发送证据。旧 `findInstagramReplyReceipt` 行为及旧 hash 算法不变。
- Produces: 可选 `recordingReply.mode?:'incoming_message_once'` 加入 API adapter detail、Web InboxDetail 和统一读取映射；仅 REC3 设置。原 state available/used/expired 兼容：claimed/sent/failed/unknown→used，closed→expired，pendingSend/原始 outcome 负责区分具体结果；无资格不能显示 available。

- [ ] 写 API 失败测试：REC2 原始成功仍不得使未发送 REC3 `replied=true`；复制 providerId、新文字或错误资格不得产生气泡；真正 REC3 原始回执可显示一次；晚于 REC3 的新 inbound 恢复待回复且没有资格。相等时间与乱序响应不误认。
- [ ] 写 UI 失败测试：仅 REC3 显示“此条新来信仅可人工回复一次”/“This incoming message allows one manual reply only.”；发送中禁用；成功立即右侧回显；刷新失败不改 unknown；claimed/unknown 无重试或重置按钮。使用真实组件与合成 fetch，不实际发送。
- [ ] Run 两个新测试。Expected: 缺少资格绑定读取/新提示导致 FAIL。
- [ ] 实现专用 receipt helper、映射及提示；同会话 sourceRef 指向已核验的新 inbound，列表 ID 复用不能替代来源选择。资格 receipt 必须满足 after 截止，不将旧 REC3 回答未来消息。保留权威空/删除优先、providerId 去重及账号/session 围栏，不添加“合成成功”路径。
- [ ] Run 新测试、`apps/web/tests/instagramMessageSendFeedback.test.tsx`、`instagramReplyRecording.test.tsx`、`interactionInboxMessageTimeline.test.tsx`、原 API 录屏测试。Expected: 全部 PASS；提交：`feat(inbox): bind REC3 feedback to its original receipt`。

### Task 5: 隐私关闭、清理及最小防重标记

**Files:** 创建 `recordingGrantLifecycle.ts`、`apps/api/tests/instagramReplyGrantLifecycle.integration.test.ts`；修改 `interactionInbox/retention.ts`、`deletion.ts`，必要时其现有生命周期测试；不新建维护定时器。

**Interfaces:**

- Consumes: 当前删除作用域 `MetaDeletionAsset`、资格原始 occurredAt/固定 expiresAt、现有生命周期共享预算。
- Produces: `closeInstagramRecordingGrants(tx:Prisma.TransactionClient,scope:MetaDeletionAsset,limit:number,now:Date):Promise<number>`；`expireInstagramRecordingGrants(tx:Prisma.TransactionClient,limit:number,now:Date):Promise<number>`；`purgeClosedInstagramRecordingGrants(tx:Prisma.TransactionClient,limit:number,now:Date):Promise<number>`。返回修改实体数并计入调用者同一预算，不跨 tenant/账号处理。

- [ ] 写失败测试：来源/账号/用户删除、撤权、断开、保留期结束或连接版本失效后不可发送/回显；清理来源和尝试引用后同 incomingKey 仍不可准备。清理不阻塞现有删除，不跨 scope，limit=1 最多处理一行。
- [ ] Run 新测试。Expected: 新资格未接生命周期时相应关闭/清理断言 FAIL。
- [ ] 实现关闭后清空可识别来源、前驱/attempt 引用，保留 closed、incomingKey、固定截止和最小防重信息；不得改写旧尝试。接入已有删除/过期阶段与共享预算，清理选择只考虑尚未关闭/尚未脱敏行，避免反复处理造成饥饿。
- [ ] 实现最终清除：仅 closed、敏感字段已清空且 now>forgetAfter 的资格可在剩余共享预算内物理删除。追加测试：正好 forgetAfter 不删除，超过后删除；旧原文即使重新同步为新 sourceRecordId、重新授权或当前策略允许更长窗口，也因 Task 2 的不可延长 REC3 应用上限被拒绝。旧原始 occurredAt 缺失/冲突时拒绝，而不是以新接收时间重建。此流程不依赖永久保留客户摘要，不新增定时任务。
- [ ] Run 新测试及 `metaInboxRetention.integration.test.ts`、`metaInboxRetentionPhases.integration.test.ts`、`metaInboxContentDeletion.integration.test.ts`、`metaInboxDeletionRace.integration.test.ts`。Expected: 全部 PASS，旧清理预算不增加；提交：`feat(api): close and scrub REC3 grants without reopening them`。

### Task 6: 受控准备工具、发布门禁与全量验证

**Files:** 创建 `scripts/ops/instagram-rec3/read.cjs`、`prepare.cjs`、`verify.cjs`、`apps/api/tests/instagramReplyGrantOps.integration.test.ts`、`docs/instagram-rec3-verification.md`；不调用工具访问线上。

**Interfaces:**

- Consumes: Task 2 prepare/read、现有受控 Graph GET、单条投影与服务端鉴权、Task 4 receipt 校验。
- Produces: 显式 CLI，均默认 dry-run；read 需 `--allow-provider-read` 才可请求，prepare 需 `--apply` 才可同步/创建，verify 仅数据库只读。真实账号/会话 ID 只从受权限保护的输入文件读取，不写仓库或 stdout。不开公共资格创建 HTTP 路由。

- [ ] 写失败测试，注入请求记录器和隔离数据库：默认零请求/零写入；只允许配置中核验账号的 identity/conversations/messages GET，最大总请求数 10（含分页），无自动重试；未遍历完候选搜索范围则标记不完整并停止，不能视为唯一候选。POST、其他主机、重定向、429、超时和重复 marker 均停止。
- [ ] Run: `node C:/Users/Administrator/AppData/Local/SocialSchedulerTools/run-ig-isolated-local-tests.cjs apps/api/tests/instagramReplyGrantOps.integration.test.ts`。Expected: 工具默认拒绝/路径限制未实现导致目标行为 FAIL。
- [ ] 实现工具参数与守卫。prepare 必须有人工核对的唯一原始 ID及本轮受控读取证据，重验前驱与是否有已知后续官方出站；证据不全或外部已回复/可能已回复时停止。原始同步只准指定消息及必要索引模型；不可“先全量同步再筛选”。没有读完完整范围不声称未回复。
- [ ] 工具执行前后输出计数及 HMAC，不输出正文/令牌；允许变更白名单仅指定 REC3 来源、必要索引和资格。旧发送尝试、凭据、权限、排程、Webhook、容器均须相同。verify 检查未发送时 attempts 增量为 0，不调用发送函数。
- [ ] 离线模拟运行 read→prepare→verify，检查同一来源二次运行无状态/截止变化、无发送、无旧行改写。写明未来发布顺序：新配置关闭→加法迁移→API/网页→受控核验→指定准备→只读验证；真实执行必须重新获得阶段授权。回退保留资格表，禁用 REC3 并在旧 API 启动前移除新配置字段。
- [ ] 对新增资格、发送、清理和工具代码执行一次新上下文只读代码复核；按实际执行模式使用相应技能。所有 Important/Critical finding 必须有 RED→GREEN 复现后解决，不能以 review 无结果代替测试。
- [ ] Run: `node C:/Users/Administrator/AppData/Local/SocialSchedulerTools/run-ig-isolated-local-tests.cjs`（无文件参数，覆盖发现的全部 API/Web 测试）。Expected: exit 0、fail 0、cancelled 0，核对实际总数；不能照抄此前 1228。任何失败逐项报告，不将既有失败隐藏。
- [ ] Run: `npm.cmd run build --workspace apps/api`，再 `npm.cmd run build --workspace apps/web`。Expected: 均 exit 0；另核对生产代码 diff 不含 Worker、权限/凭据/排程设置。构建不是线上验证。
- [ ] 将真实命令、RED/GREEN、全量总数、构建结果、复核结论及限制写入 verification 文档；只提交任务文件：`test(ops): verify controlled REC3 preparation and release gates`。本计划结束于本地验证，不能自行迁移、部署、读取 Meta、重启或发送。

## 自查与交接

覆盖映射：Spec 1–4→Task 1；Spec 5→Task 2/6；Spec 6–7→Task 3；Spec 8–9→Task 4；Spec 10→Task 5；Spec 11→Task 6；Spec 12 各项均分配到相应任务测试。签名统一使用 `createInstagramRecordingGrants`，发送路径保留旧 targetHash；新表和 API DTO 的修改分别由 Task 1、4 独立验收。

具体化的安全取舍：为同时实现最小标记最终删除和不可重新获得资格，REC3 增加应用自身 24 小时的不可延长上限；实际截止仍取现有策略和配置等更早值。这是比现有许可更严格的 REC3 局部限制，不是 Meta 规则变化。它不能成为延长平台窗口的依据，也不影响 REC1、REC2。

当前仅计划完成，全部任务未执行，未声称 REC3 已可录屏。待用户审阅计划并选择执行方式：推荐 Native（本会话逐项实现，最后一次独立复核），因为六个任务共享资格/尝试/回执接口；也可选择每任务独立实现与复核的 Subagent-driven。选择前不开始代码实现。
