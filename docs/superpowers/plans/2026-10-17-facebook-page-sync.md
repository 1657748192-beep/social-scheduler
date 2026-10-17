# “同步公共主页”实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development only if the user selects delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 官方授权取得候选主页后，仅导入用户勾选的新增主页，已有账号、权限、凭据和排程不变。

**Architecture:** 新建隔离的 `facebookPageSync` 模块，复用现有 Facebook 应用配置、回调地址、Redis、加密工具及主页数据库锁。两阶段流程为“临时授权候选 → 用户确认 → 数据库只创建”；不调用普通绑定的更新式回调。不需要数据库迁移或 Worker 更新。

**Tech Stack:** TypeScript、Express、Prisma/PostgreSQL、现有 ioredis、Next.js/React、node:test。

**Spec:** `docs/superpowers/specs/2026-10-17-facebook-page-sync-design.md`，用户已于 2026-10-17 确认。本文等待用户审核及选择执行方式，尚未进入实现。

## Global Constraints

- 只导入本次有效候选中勾选的新主页；已有记录（含断开、异常状态）全部跳过，不恢复、不更新。
- 不修改旧权限、凭据、账号资料、历史关联、schedule、publishJob、postVariant、独立 BM 连接或选择。
- 工作区 owner/admin 可操作，不要求平台管理员；保留 BM 和收件箱的平台管理员限制。
- 复用当前 Facebook 配置和 scope，不申请新权限、不变更 Meta 配置、不解绑、不自动订阅或发布。
- state 最长 10 分钟，候选敏感信息最长 15 分钟；有效登录会话、用户、工作区三重绑定，所有操作重新鉴权。
- 全目录最多 2,000 个主页，单次确认 1–50 个所选主页 ID；只有完整读取才允许展示可确认的候选。
- 不新增云资源、收费加速、环境密钥、数据库迁移；部署只更新 API 和网页，不重启 Worker、数据库、Redis、代理。
- 普通绑定本身保留显式重新授权更新语义。并发测试证明同步方不覆盖普通绑定已写入的记录；不能宣称阻止另一独立普通重授权请求主动更新凭据。此并发解释随本计划一并交用户审核。

## Review Focus

1. 候选取得后主页权限被撤销：确认前重新核验所选新主页，失效即不创建，不能复用过时“可发布”结果（任务 1、3）。
2. 在确认或取消开始后发生降级、退出、TTL 到期：数据库写入前再次校验；取消与导入只能有一个取得操作权（任务 2、3）。
3. HTTP/Redis 应答丢失与数据库实际提交：查询当前数据库后只创建缺失项，不覆盖；明确结果无法恢复时提示，不伪造“新增成功数量”（任务 2、3）。
4. 完整候选过大或含畸形资料：限制 JSON 总大小、ID、名称、头像协议和计数，拒绝超限而非静默截断；不让 token 或 Graph 错误串进入输出（任务 1、2、4）。
5. 回调在不同标签页、工作区或账号下返回：只有原发起用户／会话／工作区可打开候选，清理回调参数，不自动切换工作区或导入（任务 4、5）。

## 文件与接口地图

新模块：`apps/api/src/facebookPageSync/{types,graph,store,access,service,routes,runtime}.ts`。职责分别为契约、Meta 边界、临时状态、鉴权、事务只新增、HTTP、生产依赖组装。现有服务仅增加回调分流，不进行大范围重构。

共享类型放 `types.ts`：

- `SyncContext={userId:string;sessionId:string;workspaceId:string}`。
- `PageCandidate={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;existing:boolean;eligible:boolean;reason?:'permission_missing'|'authorization_invalid'}`，只含可公开资料。
- `VerifiedPage={pageId:string;name:string;avatarUrl:string|null;profileUrl:string;pageToken:string;scopes:string[];expiresAt:Date|null}`，仅限服务器内存；Redis 存储时整体加密。
- `SyncView={syncId:string;workspaceId:string;expiresAt:string;status:'ready'|'importing'|'completed';pages:PageCandidate[];result?:SyncResult}`。
- `SyncResult={createdPageIds:string[];skippedPageIds:string[]}`；前端按数组长度显示数量，不暴露内部账号或凭据字段。
- `StoredSync={context:SyncContext;syncId:string;expiresAt:number;status:'ready'|'importing'|'completed';pages:VerifiedPage[];rejected:PageCandidate[];selectionHash?:string;result?:SyncResult}`，仅服务器使用，不可直接序列化给客户端；completed 时 pages/rejected 清空。
- `createFacebookPageSyncService(deps)` 返回 `start(ctx):Promise<{authorizationUrl:string}>`、`callback({state,code?,error?}):Promise<{syncId:string;workspaceId:string}>`、`view(ctx,syncId):Promise<SyncView>`、`confirm(ctx,syncId,pageIds):Promise<SyncResult>`、`cancel(ctx,syncId):Promise<void>`。
- `POST /workspaces/:workspaceId/facebook-page-sync/start`；`GET /workspaces/:workspaceId/facebook-page-sync/:syncId`；`POST .../:syncId/confirm`，body 严格为 `{pageIds:string[]}`；`DELETE .../:syncId`。均使用 `requireAuth`，写请求不使用 GET。
- 原 `/integrations/facebook/oauth/callback` 识别严格 `fbps_` 加 32 字节 base64url 随机 state，并交给该服务；其他 state 完全沿用普通回调。识别专用 state 只是分流，不是鉴权，必须消费服务器登记的 state，查不到也不能回退普通绑定。

## Task 1：固定 Graph 边界与完整候选读取

**Files:** 新建 `types.ts`、`graph.ts`；测试 `apps/api/tests/facebookPageSyncGraph.test.ts`。读取现有 `integrations/oauth/oauthProviders.ts`、`integrations/social/facebookPageValidation.ts`，不改现有发布行为。

**Interfaces:** `createFacebookPageSyncGraph({provider,appSecret,fetchImpl})` 返回 `authorizationUrl(state):string`、`discover(code):Promise<{providerUserId:string;pages:VerifiedPage[];rejected:PageCandidate[]}>`、`revalidate(pages:VerifiedPage[]):Promise<VerifiedPage[]>`。只使用现有 provider 的官方 URL、client ID、回调、Login Config 和默认 scope；禁止 token 出现在异常信息。

- [ ] **1. 写失败测试：** 3 页共 25 个主页全部读取；2000 项可接受、2001 项拒绝；重复 ID 去重、循环 cursor 拒绝；恶意 next URL 不请求；第二页 429／超时返回失败且无部分成功；wrong app、身份不符、缺失发布权限或主页 token 不进入可导入列表；确认前撤销 token 会拒绝；返回值／异常不泄露 token。名称限 200 字符、ID 为 1–256 位数字、头像仅无凭据 HTTPS，聚合响应上限 4 MiB，超出均报明确错误。
- [ ] **2. RED：** `node scripts/run-tests.cjs apps/api/tests/facebookPageSyncGraph.test.ts`，确认因缺少新模块／行为失败，修正测试错误后再实现。
- [ ] **3. 实现：** 固定 Graph 主机和当前版本，cursor 驱动分页；每次请求 10 秒超时，总发现过程 60 秒，平台错误分类只返回安全错误码。候选中不具权限的主页标记不可选，不据请求 scope 伪造 actual grants；复用当前凭据校验条件，确保实际 page ID、app ID、有效期和发布权限正确。
- [ ] **4. GREEN：** 同一命令通过全部边界测试；手工检查受控 fetch 记录无非官方主机、无真实 Meta 调用。
- [ ] **5. 提交：** 仅本任务文件，`feat(api): validate paginated Facebook sync candidates`。

## Task 2：短期加密状态与可撤销会话访问

**Files:** 新建 `store.ts`、`access.ts`；测试 `apps/api/tests/facebookPageSyncStore.integration.test.ts`、`facebookPageSyncAccess.integration.test.ts`，使用现有独立本机数据库与 Redis 测试实例。

**Interfaces:** `createFacebookPageSyncStore({redis,encrypt,decrypt})` 提供 `createState(ctx,state):Promise<void>`、`consumeState(state):Promise<SyncContext|null>`、`saveCandidates(ctx,syncId,input:{pages:VerifiedPage[];rejected:PageCandidate[]}):Promise<void>`、`read(ctx,syncId):Promise<StoredSync|null>`、`claim(ctx,syncId,operation:'confirm'|'cancel',selectionHash?:string):Promise<{leaseId:string}>`、`finish(ctx,syncId,leaseId,result):Promise<void>`、`cancel(ctx,syncId,leaseId):Promise<void>`。`requirePageSyncAccess(db,ctx):Promise<void>` 校验既有 24 小时 session 上限、expiresAt/revokedAt 与当前 owner/admin 成员；禁止以工作区 ID 单独作为授权依据。

- [ ] **1. 写失败测试：** state 单次消费、600 秒失效，候选 900 秒失效且所有重试不延长；原文 token 不出现在 Redis；错误 user/session/workspace 全拒绝；viewer/editor、被移除／降级或 revoked/legacy 过期会话拒绝；Redis 故障失败关闭；确认与取消并发仅一个成功；旧 lease 不得完成新操作；取消后不能回放回调或确认；结果记录不含敏感候选。
- [ ] **2. RED：** `node scripts/run-tests.cjs apps/api/tests/facebookPageSyncStore.integration.test.ts apps/api/tests/facebookPageSyncAccess.integration.test.ts`，必须使用独立测试服务，不能降级到线上或跳过。
- [ ] **3. 实现：** 键前缀 `facebook-page-sync:v1:`，随机 opaque ID。原子消费和 claim/CAS 使用 Redis Lua；租约不超过原候选 TTL。取消成功立即清除密文；导入已占用时取消返回 409，不能显示“取消成功”。会话与成员校验独立于平台管理员白名单。为测试注入时钟／Redis，不在产品暴露测试控制。
- [ ] **4. GREEN：** 同一命令通过；检查断开 Redis、过期和并发不会触达数据库写入。
- [ ] **5. 提交：** `feat(api): isolate encrypted Facebook sync sessions`。

## Task 3：事务只新增与重试安全

**Files:** 新建 `service.ts`；测试 `apps/api/tests/facebookPageSyncImport.integration.test.ts`。复用 `services/facebookSubscription.ts` 的 `lockFacebookPage`、数据库唯一索引和 `utils/tokenCrypto.ts`，不调用订阅服务。

**Interfaces:** 消费任务 1、2；实现文件地图中的 service 五个方法。`confirm` 只接受 1–50 个去重后的合法候选 ID；事务返回实际 created/skipped ID，禁止更新式 upsert。`view` 动态查当前已有记录，不仅依赖授权时快照。

- [ ] **1. 写失败测试：** 旧主页 A 的所有字段、旧凭据和已有排程逐字段快照保持相等；勾选 B 不导入未勾选 C；断开 A 仍跳过；任一所选不在候选、未具权限或已过期则不写入；新建中途 DB 失败整批回滚；两个同步同时导入 B 仅创建一次；普通绑定先写 B 时同步不覆盖其 token；提交后 HTTP 应答丢失／Redis finish 故障，重试不覆盖、不重复创建；claim 后降级、候选过期或取消竞态不能越权写；不得新增发布任务或 BM 数据。
- [ ] **2. RED：** `node scripts/run-tests.cjs apps/api/tests/facebookPageSyncImport.integration.test.ts`，证实缺少只新增与并发保护会失败。
- [ ] **3. 实现：** 网络权限重验在数据库锁前完成；进入事务后锁当前 session、membership 并重检资格和截止时间，再按 page ID 排序获取既有主页锁、查当前记录，仅 create 新账号及 nested credential。只保存新主页实际 scope、有效期、头像及主页链接。DB 事务内不调用网络或 Redis。
- [ ] **4. 实现重试核对：** Redis 中以选择摘要固定一次确认范围，重试不同选择返回 409。敏感候选在成功后清理，仅留原 TTL 内无 token 的 result；提交结果不确定时先从数据库核对存在项，再由“只创建缺失项”保障安全，不声称 Redis 和 DB 为分布式事务。Redis 清理失败不回滚已提交的新账号，原 TTL 必须仍在；向客户端明确可安全查询／重试，不能误导为旧账号失败。
- [ ] **5. GREEN 与提交：** 上述命令全部通过，并比较 accounts/credentials/posts/variants/schedules/jobs/management 保护快照，`feat(api): import selected new Facebook Pages without overwrites`。

## Task 4：接入现有回调与真实 HTTP 防护

**Files:** 新建 `routes.ts`、`runtime.ts`；仅修改 `apps/api/src/app.ts`、`controllers/socialAccountController.ts` 的挂载／早期分流、`utils/requestLog.ts` 的敏感 URL 屏蔽（如现有规则未覆盖）。测试 `apps/api/tests/facebookPageSyncRoutes.test.ts`、`facebookPageSyncHttp.integration.test.ts`、`facebookPageSyncRequestLog.test.ts`。

**Interfaces:** `createFacebookPageSyncRouter(service,{authenticate?})` 挂载地图中的四个认证接口；`isPageSyncState(state):boolean` 只负责严格命名空间识别。生产 `facebookPageSyncRuntime` 明确注入现有 prisma、redis、加密、provider 和 Graph 客户端，不允许生产依赖缺省绕过鉴权。

- [ ] **1. 写失败测试：** 真实 JWT/session 的 owner/admin 可用，其他角色、跨用户／session／workspace 拒绝；伪造 `fbps_` state 不能进入普通 upsert；错误 platform 不兑换；取消授权也消费一次性 state；回调清理 code/state/error，不反射 provider 原文；启动／读取／确认／取消响应 no-store，回调 no-referrer；所有请求日志不含 state、syncId、code、token、候选详情；普通绑定回调与 BM 管理拒绝测试保持原行为。
- [ ] **2. RED：** `node scripts/run-tests.cjs apps/api/tests/facebookPageSyncRoutes.test.ts apps/api/tests/facebookPageSyncHttp.integration.test.ts apps/api/tests/facebookPageSyncRequestLog.test.ts`。
- [ ] **3. 实现：** 分流在普通 error 清理和 `completeOAuth` 之前，state 无效只报本流程失败。回调到固定 `/social-accounts?facebookPageSync=<opaque-id>`，错误只带通用状态。读取流程需调用者提供原工作区；不携带可单独使用的授权 token。所有操作通过 task 3 service，错误只输出稳定安全码与诊断 ID。
- [ ] **4. GREEN 与提交：** 同一命令以及既有 `facebookManagementRoutes.test.ts` 通过，`feat(api): expose authenticated additive Page sync endpoints`。

## Task 5：社交账号页选择与确认界面

**Files:** 新建 `apps/web/components/social/FacebookPageSyncDialog.tsx`、`apps/web/lib/facebookPageSync.ts`；修改 `SocialAccountManager.tsx`、`components/dashboard/DashboardPageContent.tsx`、`app/globals.css`，仅增加入口和工作区绑定，不重构页面。测试 `apps/web/tests/facebookPageSync.test.tsx`、既有 `socialAccountManager.test.tsx`。

**Interfaces:** `FacebookPageSyncDialog({token,workspaceId,canManage,onClose,onImported})`；`onImported():Promise<void>` 只重新读取当前工作区账号，不修改凭据。API helper 对应任务 4，返回前端 `SyncView/SyncResult` 安全类型，不接收 token 类型字段。管理器新增 `onSyncFacebookPages?:()=>void`，与普通 `onAdd` 分开。

- [ ] **1. 写失败测试：** 配置可用且 owner/admin 时显示“同步公共主页”；viewer/editor 不显示；点击先显示官方授权说明，不立即导入。授权回来后候选默认全未选、existing/不可用项禁用；勾选 B、C，确认仅提交其 ID，提示新增／跳过实际数量。无新增、取消、过期、限流、失败、重复点击均正确；待提交取消占用返回 409 不显示成功；标签页旧回调、切换 workspace/token 或关闭后的迟到响应不更新新页面；旧账号卡片及发布／排程入口仍在，中英文均可读。
- [ ] **2. RED：** `node scripts/run-tests.cjs apps/web/tests/facebookPageSync.test.tsx apps/web/tests/socialAccountManager.test.tsx`。
- [ ] **3. 实现：** 沿用可访问弹窗、键盘关闭／焦点管理，候选列表滚动、所选上限 50。callback 参数读取后 `history.replaceState` 清除；核对服务端原工作区再展示，不替用户自动切换。网络任务带 AbortController 和上下文序号；localStorage 不保存候选、state 或 token。导入前再次确认新增数量，期间禁重复提交，不自动测试发帖。
- [ ] **4. GREEN 与提交：** 同一命令通过；本地受控浏览器核对桌面／手机溢出、长主页名、空态、键盘焦点（浏览器不可用时记录未完成，不能称已验收），`feat(web): select newly authorized Facebook Pages for import`。

## Task 6：完整验证、腾讯云 API／网页部署与回退

**Files:** 新建 `docs/facebook-page-sync-verification.md`；部署脚本只放既有本机工具目录，不包含云密钥。保护现有未提交文档、预览夹具和其他工作树改动，提交只包含本功能。

**Interfaces:** 沿用现有本机 TAT CLI profile 与实例 `lhins-qkg26b57`、region `ap-singapore`；服务器 `/opt/social-scheduler`，compose 的 `.env` 后跟 `.env.sandbox.local`，保留两文件内容。

- [ ] **1. 验证：** 运行默认完整 `npm.cmd test`、`npm.cmd run build -w apps/api`、`npm.cmd run build -w apps/web`、`git diff --check`，必须退出 0 且测试无跳过；本机 TEMP 空间不足时仅用现有 D 盘测试 TEMP 子进程包装，不降低产品阈值、不删用户文件。检查没有 schema、Worker、scope、Login Config 或 env 修改，明确新增测试数及失效路径。
- [ ] **2. 发布前检查：** 审阅文件 allowlist、确认提交／推送版本、远端 tracked tree 干净可快进；只读核对磁盘、API/Worker/DB/Redis/代理容器、两份 env 摘要及旧账号/凭据/排程逐字段保护快照。无授权浏览器操作，不导入任何真实主页。
- [ ] **3. 备份与构建：** 既有 release 目录新建唯一 0700 子目录，记录目标 commit 与保护快照，保留旧 API/Web 镜像标签。仅 `docker compose --env-file .env --env-file .env.sandbox.local -f docker-compose.yml -f docker-compose.server.yml build api web`；构建未成功绝不切换。
- [ ] **4. 切换：** 再比对保护快照后，仅同一 compose `up -d --no-deps api web`。禁止 generic up/down、reset、deploy-server.sh、Worker 重启、手工 migration 或配置修改。
- [ ] **5. 线上验收：** 健康检查 HTTP 200 且 DB ok、Redis PONG；公网静态资源包含同步入口；未登录四个新 API 均拒绝，未授权 state 不触发普通绑定。核对 Worker/DB/Redis/代理容器 ID、镜像、启动时间和 env SHA 不变，旧账号、凭据、排程快照一致。API/Web 变化是预期。真实官方授权若需用户登录／确认，明确列为待用户配合，不伪造成功证据。
- [ ] **6. 回退与交付：** 任一验收失败先保留脱敏日志，恢复旧 API/Web 镜像并仅重建这两服务；不回滚或删除用户数据，不导入／删除真实主页来“修复”。再次核对保护对象，记录 commit、TAT invocation、测试输出、快照摘要、回退标签和真实授权待验项，说明 Worker 未重启。

## 计划自审与执行入口

- 已覆盖设计的两阶段选择、鉴权、短期密文、分页、只新增、并发／失败、前端上下文、完整回归和有限部署；五项 Review Focus 均有对应测试。
- 无需申请新 scope、增加 BM 权限、迁移数据库或修改 Worker。授权发现和候选选择是新模块，不把原始 upsert 改为假同步。
- 实施时先使用 using-git-worktrees 技能核对当前已是隔离工作树，再按 TDD 执行；不重新创建工作树覆盖现有内容。
- 推荐本会话由主代理逐项直接实施，依赖和测试数据库共享较多，便于保持安全边界；如用户另选子代理方式，再按相应技能分工。此计划未触发任何代理或产品修改，需用户确认计划与执行方式后开始。
