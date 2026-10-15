# Local Chunk Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有服务器实现视频分块上传和失败补传，不新增云资源或收费服务，不改发布权限、凭据和排程。

**Architecture:** 在素材上传层新增独立会话与分块记录，文件保存在现有卷的私有目录。收齐后流式合并、校验并原子确认成现有 MediaAsset；发布器和 Worker 继续读取原格式。前端使用全局并发队列和内容指纹恢复，只重传未确认块。

**Tech Stack:** 现有 TypeScript、Node 22、Express 4、Prisma 6、PostgreSQL、Redis、Next 15、Web Crypto、XMLHttpRequest、node:test 与 tsx；不新增产品依赖。

**Spec:** `docs/superpowers/specs/2026-10-15-local-chunk-upload-design.md`（用户已确认；执行者须先完整阅读）。

## Global Constraints

- 不创建存储桶，不启用 COS、CDN、全球加速、付费带宽升级、自动扩容或其他新增收费服务。
- 不修改平台 OAuth 范围、客户端凭据、账号绑定、发布权限和已有排程，不重启排程 Worker。
- 首版只将不少于 8MiB 的视频切换为分块上传；图片和小文件沿用原接口，单文件上限仍为 250MiB。
- 每块 1MiB，最后一块按实际大小。浏览器所有上传任务合计最多同时发送两个分块。
- 单块最多自动重试三次；浏览器单块等待最多四分钟；单块与普通接口接收限制五分钟，请求头限制六十秒；原整文件 30/35 分钟例外保留。
- 每会话最多两个在途分块，服务端合计最多八个；每用户最多两个未完成会话、每工作区最多四个；总预留最多 2GiB，卷至少保留 2GiB 空闲。
- 未完成会话在最后有效活动后保留 24 小时；完成响应保留 72 小时；合并尝试租约十分钟；封面最多等待五秒且不阻塞视频，JPEG 最大 100KiB。
- 不静默降画质、不承诺提升线路带宽；不运行云端大流量压测。既有套餐余量不足或无法确认时报告，不购买或升级。
- 只用独立测试数据库与测试 Redis；测试缺配置就失败，不跳过或使用正式服务。保留工作树中无关的脏文档。

## Review Focus

1. 分块已落盘但确认响应丢失，应查询状态并复用块，不产生第二个素材（任务 4、5、7）。
2. 同名同大小但内容不同的文件，不得串用续传会话；切换用户也不可复用其他账号任务（任务 1、7）。
3. 页面刷新、浏览器存储不可写、缺少文件读取能力，应可理解地恢复或重新开始，不永久卡住（任务 7、8）。
4. 取消或清理恰逢分块/合并在途，旧请求不能写回残片或删除新尝试结果（任务 4、5、6）。
5. 已完成素材随后按原策略过期、或发布权限在上传中失效，应返回过期/无权限，不误报成功（任务 4、5、7）。

## 文件划分与公共契约

API 新功能集中于 `apps/api/src/uploads/local/`，不将业务继续塞入已有的大 composerService：`protocol.ts` 定义校验与类型，`sessions.ts` 管会话与容量，`disk.ts` 管文件，`leases.ts` 管 Redis 并发，`parts.ts` 管确认分块，`complete.ts` 管合并，`cleanup.ts` 管取消与过期，`routes.ts` 管 HTTP，`runtime.ts` 连接生产依赖与清理生命周期。修改 `app.ts` 注册路由及屏蔽私有目录，修改 `server.ts` 启停上传清理任务；不修改 Worker。

Web 新增 `lib/localUploadProtocol.ts`、`localUploadTransport.ts`、`localUploadQueue.ts`、`localChunkUpload.ts`、`mediaThumbnail.ts`；修改 `lib/api.ts` 复用结构化 HTTP 错误与 401 处理，修改 `components/composer/MediaUploader.tsx` 接入，不改变页面向编辑器交付 MediaAsset 的接口。

`protocol.ts` 导出以下约定；浏览器协议文件用相同 JSON 形状并做跨端契约测试，不让 Web 引入 API 的 Prisma 或 Node 运行时代码：

```ts
type UploadActor = { userId: string; workspaceId: string };
type Manifest = { clientKey: string; originalName: string; mimeType: string; sizeBytes: number; partHashes: string[]; fingerprint: string };
type UploadState = 'receiving' | 'assembling' | 'completed' | 'cancelled' | 'expired';
type UploadView = { id: string; state: UploadState; totalBytes: number; partSizeBytes: number; receivedParts: number[]; expiresAt: string; assetId: string | null };
type UploadCapabilities = { protocol: 'local-chunks-v1' | null; ownerUserId: string; partSizeBytes: number; thresholdBytes: number; maxFileBytes: number };
type ReadyMedia = MediaAsset & { originalAvailable: boolean };
type SessionDeps = { db: PrismaClient; now: () => Date; availableBytes: () => Promise<bigint> };
```

指纹算法固定为 SHA256(UTF8(JSON.stringify([sizeBytes, mimeType, partHashes])))，哈希为小写 hex；先逐块哈希，不含文件名。UUID、整数范围、MIME、块数、最后一块长度、哈希格式与指纹全部服务端复核。路径、客户端 key 和索引不可成为磁盘相对路径。

## 验证命令与安全测试环境

任务 1 创建 `scripts/run-tests.cjs`，添加根 `package.json` 的 `test` 脚本。执行 `node scripts/run-tests.cjs <测试文件...>` 运行指定测试，`npm.cmd test` 发现 API/Web 根测试文件并串行执行 `node --import tsx --test --test-concurrency=1`。命令成功标准均为零失败、零取消、零跳过、退出码 0。

只在本机验证和复用 `codex-instagram-reception-test` 测试库；密码从其 inspect 结果传给子进程，不打印。新集成测试使用 `LOCAL_UPLOAD_TEST_DATABASE_URL` 和 `LOCAL_UPLOAD_TEST_REDIS_URL`，分别强制本机地址、数据库名以 `_test` 结尾、与原 DATABASE_URL/REDIS_URL 不同。现有 Facebook/Instagram/Sandbox 测试变量也需提供，不省略原测试。纯函数测试不依赖数据库配置；集成测试缺配置直接失败。

真实 Redis 租约测试使用独立本机测试实例和随机键前缀，不使用正式 Redis，不 FLUSHDB。若本机没有可复用测试实例，可在确认端口空闲及已有官方镜像后，用 Docker 启动仅绑定 127.0.0.1 的测试容器；不创建云资源，不静默下载依赖或镜像。runner 另提供 `node scripts/run-tests.cjs --migrate-local-upload-test-db`：先校验独立 URL，再仅对子进程覆盖 DATABASE_URL，执行 `npm.cmd run db:deploy -w apps/api` 和 `npm.cmd run db:generate -w apps/api`；不得继承一个未检查的生产 URL 做迁移。

`apps/api/tests/helpers/localUploadFixture.ts` 统一创建随机测试用户/工作区、临时目录、独立 PrismaClient 和带随机前缀的 Redis，注册逐项资源清理；不删全库数据。HTTP 集成测试需要真实 requireAuth 时，由 helper 验证 URL 后启动独立 API 子进程，将其 DATABASE_URL 指向测试库，避免把全套其他测试的 DATABASE_URL 改成同一个测试 URL而破坏既有隔离断言。业务测试注入 SessionDeps，不 mock 数据库事务或磁盘写入。

## Task 1 协议校验和可重复测试入口

**Files:** Create `apps/api/src/uploads/local/protocol.ts`, `apps/web/lib/localUploadProtocol.ts`, `apps/api/tests/localUploadProtocol.test.ts`, `apps/web/tests/localUploadProtocol.test.ts`, `apps/api/tests/helpers/localUploadFixture.ts`, `scripts/run-tests.cjs`; Modify `package.json`。

**Interfaces:** Produces `parseManifest(value: unknown): Manifest`, `expectedPartBytes(sizeBytes: number, index: number): number`, `computeFingerprint(sizeBytes: number, mimeType: string, hashes: string[]): Promise<string>`、上文公共类型及常量；fixture 导出 `createLocalUploadFixture(t: TestContext): Promise<{ db: PrismaClient; redis: Redis; root: string; actor: UploadActor; now: () => Date; dispose: () => Promise<void> }>`，通过 test context 清理，dispose 幂等。

- [ ] 写失败测试 `manifest boundaries and content identity`：`assert.equal(expectedPartBytes(1048577, 1), 1)`；`assert.throws(() => parseManifest({...valid, sizeBytes:262144001}))`；大小 262144000 合法；缺块、越界索引、NaN、错误哈希数拒绝。用独立已知 SHA256 fixture 验证跨端指纹一致，修改同大小内容后 `assert.notEqual(fingerprintA, fingerprintB)`。
- [ ] 运行 `node --import tsx --test apps/api/tests/localUploadProtocol.test.ts apps/web/tests/localUploadProtocol.test.ts`，确认因缺少目标行为而失败；配置缺失、正式 URL 和非本机 URL 的 fixture 测试应拒绝，不连接网络。
- [ ] 实现上述纯函数和测试入口；阈值 8388608、块 1048576、最大 262144000 字节；不引入 Prisma 到 Web。fixture 的真实资源初始化供任务 2 起使用。
- [ ] 用指定测试命令验证通过，测试 runner 的子进程退出码透传和全套发现行为也须执行验证。
- [ ] 仅提交任务文件，提交信息 `test: establish local upload protocol and isolated test harness`。

## Task 2 持久会话和容量预留

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/services/workspaceService.ts`; Create `apps/api/prisma/migrations/20261015000100_local_upload_sessions/migration.sql`, `apps/api/src/uploads/local/sessions.ts`, `apps/api/tests/localUploadSessions.integration.test.ts`。

**Interfaces:** Consumes Task 1。Produces `initSession(deps: SessionDeps, actor: UploadActor, manifest: Manifest): Promise<UploadView>`, `getOwnedSession(deps: SessionDeps, actor: UploadActor, id: string): Promise<LocalUploadSession>`, `getUploadView(session: LocalUploadSession, receivedParts: number[]): UploadView`。为复用既有权限规则，给现有 getMembership、requireWorkspaceMembership、requireWorkspacePublishingAccess 增加可选末参数 `db: Pick<PrismaClient,'workspaceMember'|'user'> = prisma` 并向下透传；查询和判定不变，旧调用保持默认。上传服务传入 deps.db 后检查角色/有效期，HTTP 层仍复用既有登录中间件；不能只靠传入 actor 就免查权限。

- [ ] 写失败测试 `initialization is isolated, idempotent and capacity bounded`：相同用户/工作区/clientKey 两次初始化 `assert.equal(a.id,b.id)`；不同 manifest 复用 key 拒绝；其他用户/工作区访问返回 404；viewer/过期发布权限为 403。并发初始化后 `assert.ok(sumReserved <= 2147483648)`，用户第三个/工作区第五个会话拒绝，模拟空闲小于预留加 2147483648 返回 507，原有凭据和排程 fixture 保持相同。
- [ ] 执行指定集成测试确认失败，再添加仅增量迁移：Session 包含公共声明、state、reservedBytes、activityAt、expiresAt、mergeAttemptId/mergeLeaseUntil、cleanupToken/cleanupLeaseUntil、residueClearedAt、mediaAssetId；Part 包含 sessionId/index/sizeBytes/sha256/storageKey。唯一约束为 `(userId,workspaceId,clientKey)`、`(sessionId,index)`、可空 mediaAssetId，素材删除时关联 SetNull；增加活动/清理索引及必要反向关系，不改旧字段含义。
- [ ] 实现短事务行锁与全局容量 advisory transaction lock；预留 `2 * sizeBytes + 1048576`，首次过期为 now 加 24 小时，文件名最多 255 字符。重复幂等请求不重复占额度；清理未完成不释放 reservedBytes。
- [ ] 将迁移应用到独立测试库、生成 PrismaClient，再运行 `node scripts/run-tests.cjs apps/api/tests/localUploadSessions.integration.test.ts`，确认事务与真实唯一约束测试通过。
- [ ] 提交 `feat: persist isolated local upload sessions and reservations`。

## Task 3 私有分块存储和流式校验

**Files:** Create `apps/api/src/uploads/local/disk.ts`, `apps/api/tests/localUploadDisk.test.ts`; Modify `apps/api/src/app.ts`（只加私有路径防护）；Create `apps/api/tests/localUploadPrivatePath.test.ts`。

**Interfaces:** Produces `createLocalUploadDisk(root: string): LocalUploadDisk`；方法 `receive(sessionId: string, index: number, source: Readable, expectedBytes: number, sha256: string, signal: AbortSignal): Promise<StoredPart>`、`removeOwned(keys: string[]): Promise<void>`、`availableBytes(): Promise<bigint>`。`StoredPart={storageKey:string;sizeBytes:number;sha256:string}`，键不可变且每次接收唯一。合并方法在任务 5 增加。

- [ ] 写失败测试 `only verified private blocks survive`：实际流写入后 `assert.deepEqual(bytesOnDisk, original)`；超过声明长度、提前 EOF、哈希错误、中断和 ENOSPC 后 `assert.deepEqual(attemptFiles,[])`；路径 `../`、编码穿越、symlink 均拒绝。HTTP 测试对 `.upload-sessions` 原始及编码路径断言无文件内容返回，正常 `/uploads/<旧素材>` 仍可读。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/localUploadDisk.test.ts apps/api/tests/localUploadPrivatePath.test.ts`，确认失败。
- [ ] 用 Node fs/stream/crypto 流式计数及哈希，exclusive create 和随机服务端键，不将完整文件载入内存；只 unlink 本次拥有的临时文件。显式屏蔽私有目录后再注册现有 express.static，不提高 JSON 限制，不删除或重命名 uploads 根目录。
- [ ] 同命令验证通过；验证一个失败请求的清理不会删除另一个成功请求文件。
- [ ] 提交 `feat: receive and verify private local upload parts`。

## Task 4 有界租约与分块 HTTP 接口

**Files:** Create `apps/api/src/uploads/local/leases.ts`, `parts.ts`, `routes.ts`, `runtime.ts`, `apps/api/tests/localUploadLeases.integration.test.ts`, `localUploadRoutes.integration.test.ts`; Modify `apps/api/src/app.ts`。

**Interfaces:** Produces `createUploadLeases(redis: Redis, prefix: string): UploadLeaseManager`，`acquire(sessionId:string,index:number):Promise<LeaseOutcome>`，`release(lease:UploadLease):Promise<void>`，`active(sessionId:string):Promise<boolean>`；`UploadLease={sessionId:string;index:number;token:string;expiresAtMs:number}`，`LeaseOutcome={ok:true;lease:UploadLease}|{ok:false;reason:'part_busy'|'session_busy'|'server_busy'|'unavailable'}`。`ChunkDeps = SessionDeps & {disk:LocalUploadDisk;leases:UploadLeaseManager}`；`acceptPart(deps:ChunkDeps,actor:UploadActor,id:string,index:number,body:Readable,signal:AbortSignal):Promise<UploadView>`；`createLocalUploadRouter(deps:ChunkDeps):Router` 与生产 `localUploadRuntime`。

- [ ] 写失败测试 `route authorization and lease limits hold under concurrency`：真实登录对初始化、查询、每块、封面、complete、cancel 均不能跨用户/工作区；第 3 个会话内接收和第 9 个全局接收返回 429；同一块在途返回结构化 409 `part_busy`，已确认相同块重复返回成功且 `assert.equal(partRows.length,1)`，不同内容冲突。Redis 故障返回 503，不落盘；旧 token 释放不能清除新租约。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/localUploadLeases.integration.test.ts apps/api/tests/localUploadRoutes.integration.test.ts` 确认失败。
- [ ] 用原 Redis Lua 原子裁剪过期租约并检查块锁/会话两块/全局八块，租期 7 分钟，释放比较 token。认证、当前可写权限、owner、序号和容量检查必须先于读 body；接收完成后再短事务锁会话并确认 receiving 后提交不可变 Part；若会话被取消，丢弃本次文件。进程中 abort controller 仅作加速取消，数据库状态与租约才是跨重启依据。
- [ ] 注册 spec 的 capabilities、init、GET、part、thumbnail 路径；封面仅接收有效 JPEG 签名及实际最大 102400 字节，重复写不得删除他人结果。capabilities 返回 UploadCapabilities，ownerUserId 只来自已验证登录，local 模式返回协议及数值限制，不返回任何云配置；complete/cancel 在任务 5、6 接入前先校验权限和归属再返回明确未启用，网页尚不启用新协议。
- [ ] 测试同时验证 JSON 限制不变、单块接收五分钟及原整文件 30 分钟规则不变；响应丢失后 GET 仍包含已确认序号，失效权限停止后续写入。通过后提交 `feat: expose authenticated bounded local upload parts`。

## Task 5 幂等合并与完整素材确认

**Files:** Create `apps/api/src/uploads/local/complete.ts`, `apps/api/tests/localUploadComplete.integration.test.ts`; Modify `disk.ts`, `routes.ts`。

**Interfaces:** Produces `completeUpload(deps:ChunkDeps,actor:UploadActor,id:string):Promise<ReadyMedia>`；disk 增加 `assemble(sessionId:string,attemptId:string,parts:StoredPart[],signal:AbortSignal):Promise<{storageKey:string;sizeBytes:number}>`，校验有序块及总字节数，输出文件专属于该合并尝试。

- [ ] 写失败测试 `complete yields exactly one verified existing-format asset`：缺块不能完成；并发两个 complete 后 `assert.equal(mediaAssets.length,1)`；响应丢失后重复返回同一个 ID；合并后与原字节相等；素材到期或删除后返回 410。注入“rename 后 DB commit 前失败”、API 重启、十分钟租约到期与旧尝试迟到，断言旧尝试不能提交或删新结果，未完成会话始终无 ready 素材。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/localUploadComplete.integration.test.ts` 确认失败。
- [ ] 短事务锁会话，只有全块已确认才能领取十分钟 attempt 标识；长文件 I/O 不持有 DB 事务。流式合并，原子移动后在另一短事务重新核对 attempt/lease，创建现有格式 MediaAsset 并置 completed，expiresAt 更新为 72 小时；只在事务成功后清残片。冲突尝试清理仅限自有输出，不碰成功素材。
- [ ] 将 complete 路由接入；合并进行中返回 409 `assembling` 与 Retry-After，不能再开另一合并。恢复时验证上次输出归属/块内容再使用或重建；幂等完成重新校验素材 ready/存在和当前权限。
- [ ] 同命令验证全部崩溃窗口与竞态；提交 `feat: atomically finalize local uploads into media assets`。

## Task 6 取消与过期残片清理

**Files:** Create `apps/api/src/uploads/local/cleanup.ts`, `apps/api/tests/localUploadCleanup.integration.test.ts`; Modify `runtime.ts`, `routes.ts`, `apps/api/src/server.ts`。

**Interfaces:** Produces `cancelUpload(deps:ChunkDeps,actor:UploadActor,id:string):Promise<{state:UploadState;cleanupPending:boolean}>`、`cleanLocalUploads(deps:ChunkDeps,limit?:number):Promise<{scanned:number;cleaned:number;failed:number}>`、`startLocalUploadCleanup(deps:ChunkDeps):{stop:()=>Promise<void>}`；默认批次 50，启动与每小时运行，定时器 unref，停机等待已领取任务安全结束。

- [ ] 写失败测试 `cleanup cannot race writers or delete published media`：24 小时内有效会话保留，过期候选清理；取消后不能接收新块；在途分块和旧合并迟到不能重建文件。`assert.equal(await readFile(readyAssetPath), original)`；模拟 unlink 失败后 `assert.ok(reservedBytes>0)` 且下次可重试；72 小时完成回执过期不删素材。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/localUploadCleanup.integration.test.ts` 确认失败。
- [ ] 以会话锁标记取消/过期/cleanup claim，等待接收租约释放或过期再删除确切自有键；成功才释放容量。清理孤立私有 temp 需年龄超过 24 小时且无有效租约；删除目录前验证 realpath、UUID、非 symlink 和边界，绝不递归作用于 uploads 根。已生成且未提交的输出按 attempt 清单处理；发现已引用素材则保留并报错。
- [ ] 接入 DELETE；完成会话不能通过 cancel 删除最终素材。API 启停注册独立清理任务与取消在途请求，先停新清理/收尾再断开 Prisma/Redis；不修改 `worker.ts`。通过测试后提交 `feat: safely expire and cancel partial local uploads`。

## Task 7 浏览器协议与补传引擎

**Files:** Create `apps/web/lib/localUploadTransport.ts`, `localUploadQueue.ts`, `localChunkUpload.ts`, `apps/web/tests/localChunkUpload.test.ts`, `localUploadQueue.test.ts`; Modify `apps/web/lib/api.ts`，补测 `apiUploadTimeout.test.ts`。

**Interfaces:** Transport 导出 `UploadHttpError extends Error {status:number;code?:string;retryAfterMs?:number}` 与 `localUploadRequest<T>(path:string,token:string,options:{method:string;body?:unknown;bytes?:Blob;timeoutMs:number;signal:AbortSignal;onProgress?:(bytes:number)=>void}):Promise<T>`。Queue 导出全页面单例 `localUploadQueue.run<T>(task:()=>Promise<T>,signal:AbortSignal):Promise<T>`，总并发 2。引擎导出 `uploadLocalVideo(input:{file:File;workspaceId:string;userId:string;token:string;signal:AbortSignal;onProgress:(p:LocalUploadProgress)=>void;thumbnail?:Promise<Blob|null>}):Promise<MediaAsset>`；Progress 阶段 preparing/uploading/finalizing，含 confirmedBytes/totalBytes/speedBytesPerSecond/remainingSeconds，后两项可空。

- [ ] 写失败测试 `lost acknowledgements resume without resending accepted bytes`：本地 HTTP 测试服务器真实收块后断响应，下一次 GET 确认该块后 `assert.equal(acceptedPart0Writes,1)`；刷新用相同 file fingerprint 与保存 clientKey 只补缺块；同名同大小不同内容及切换账号不可串会话。记录多文件/组件同时上传 `assert.ok(maxInflight<=2)`。
- [ ] 补失败测试 `retry policy is bounded and permission-aware`：可重试失败最多四次发送（初次加三次）；401 走原登录过期处理，403/413/哈希冲突不重试，429 尊重 Retry-After；part_busy/assembling 先查询状态并有界退避，不反复 complete。存储访问抛错、损坏记录、410、用户取消都停止或明确重新开始，不无限等待。
- [ ] 运行 `node scripts/run-tests.cjs apps/web/tests/localChunkUpload.test.ts apps/web/tests/localUploadQueue.test.ts apps/web/tests/apiUploadTimeout.test.ts` 确认失败。
- [ ] 实现逐块 Web Crypto 指纹和按用户/工作区/指纹保存的待完成映射；客户端 key 必须先持久化再 init，无法写存储时本页仍可重试但提示刷新不能续传。后端是块确认来源。指数退避基准 1/2/4 秒加不超过 250ms 抖动；Retry-After 超过 60 秒时暂停自动重试并保留任务，显示可重试时间，手动点击也不得提前发送。单块 240000ms、元数据 30000ms、complete 120000ms；中止清理 XHR/监听器，恢复前查询缺块；确认字节不随重传重复累加。
- [ ] 同命令验证通过，XHR 只在浏览器边界替代，队列/状态/重试实际函数保持真实；提交 `feat: resume and retry local video chunks in the browser`。

## Task 8 上传界面与可选封面

**Files:** Create `apps/web/lib/mediaThumbnail.ts`, `apps/web/tests/localUploadUI.test.tsx`, `mediaThumbnail.test.ts`; Modify `apps/web/components/composer/MediaUploader.tsx`，仅在确有需要时改现有样式文件。

**Interfaces:** `createMediaThumbnail(file:File,type:'image'|'video',options:{timeoutMs:number;signal:AbortSignal}):Promise<Blob|null>`，不把 250MiB 视频读入内存；从组件迁出已有画布逻辑，组件接入任务 7 的 MediaAsset 与进度类型，onMediaChange 形状不变。

- [ ] 写失败测试 `large-video UI preserves old flows and honest progress`：不足 8MiB 或图片走旧流程，恰好 8MiB 视频走分块；capabilities 404 在 init 前回退，其他 401/503 不能掩盖成旧流程；已开始分块后不整文件回退。`assert.ok(!completedVisibleBeforeAssetResponse)`，失败可重试/取消，刷新需重新选文件，中文/英文文案正确。
- [ ] 补 `thumbnail timeout never blocks a video`：视频事件永不触发或同步触发均不挂起，五秒后 `assert.equal(thumbnail,null)`，视频发送不等待封面；中止撤销对象 URL 并解绑监听器。可选 JPEG 接收失败不取消主视频。
- [ ] 运行 `node scripts/run-tests.cjs apps/web/tests/localUploadUI.test.tsx apps/web/tests/mediaThumbnail.test.ts` 确认失败。
- [ ] capabilities 按当前 token/工作区加载，使用其 ownerUserId 作为引擎 userId 和存储命名空间，不自解码 JWT、不新增 ComposerForm 的 userId 传递链。切换 token/工作区时取消旧请求并使缓存失效。显示阶段、已确认量、真实确认平均速度与估算剩余时间，无有效样本时显示未知而不是 0 秒。完成前不误显示“上传成功”；逻辑进度包括已确认量与当前唯一在途块，不重复算重传字节，finalizing 单独标注。先启动视频上传再并行可选封面，complete 有界等待封面结果。
- [ ] 同命令通过，再 `npm.cmd run build`；提交 `feat: integrate resumable video upload progress and controls`。

## Task 9 全链路回归与受控部署

**Files:** Create `apps/api/tests/localUploadEndToEnd.integration.test.ts`, `docs/local-upload-verification.md`；只在验证记录中填写真实结果，不改平台配置或现有脏文档。

**Interfaces:** Consumes Tasks 1–8；输出测试证据、选定发布 SHA、回滚镜像标记和上线核验记录，不新增产品接口。

- [ ] 写并先运行失败的端到端场景 `interrupted video resumes into one schedulable asset`：真实 HTTP 上传 9MiB 合成视频字节，中途断连、重开客户端后复用确认块；最终文件 SHA/大小一致、只一条 ready 素材。创建本地测试草稿和排程验证素材可被既有流程读取，不调用真实社交平台发布；fixture 原有排程、授权 scopes、绑定保持不变。修正串接问题直到通过。
- [ ] 运行 `npm.cmd test`、`npm.cmd run build`、`git diff --check`，报告每个失败或环境限制，不以跳过代替隔离验证。以本地限速/断连对比旧流程和新流程的有效确认字节、重传字节与恢复耗时，不宣称尚未测出的网络提速；审查整分支后才提交最终发布记录。
- [ ] 用户审阅本计划并选择执行方式后，执行阶段按适用 review skill 做独立审查；修复严重/重要问题。只推送明确任务文件，保留无关工作树改动。
- [ ] 部署前只读确认腾讯云现有套餐/流量余量、磁盘至少满足预留及安全下限、当前 HEAD、容器身份和未完成上传。若无法确认费用风险或余量不足，停止云端上传测试并报告，不新建资源。已有上传需先通知排空，不静默中断用户文件。
- [ ] 在新的受保护发布目录备份当前配置/compose 校验、DB、API/Web 镜像；记录 Worker 容器 ID/启动时间，授权 scopes、凭据摘要、Sandbox 配置、排程摘要。备份不能输出密钥；不使用会重置环境或重启全栈的 `scripts/deploy-server.sh`。
- [ ] 云端 git fetch 后核对已批准 SHA，ff-only 更新；先构建 api/web 并确认退出 0。新增迁移必须先在独立库通过，再用已构建 API 镜像一次性执行 `npx prisma migrate deploy`，不 reset 数据库。随后仅 `docker compose --env-file .env --env-file .env.sandbox.local -f docker-compose.yml -f docker-compose.server.yml up -d --no-deps api web`，保留生产 MEDIA_STORAGE=local 与所有平台环境配置。
- [ ] 验证新镜像确在运行、健康接口、私有路径不可读、普通和旧上传限制不变，Worker ID/启动时间、scopes 和排程摘要一致；凭据若因正常刷新变化，按平台/更新时间核实。线上只做经批准的小文件验证；真实大视频测试由用户发起，不自动产生压测流量。记录实际结果和剩余限制，不能仅凭容器 Started 声称完成。
- [ ] 若失败，恢复先前 API/Web 镜像，不回退或删除数据库表，不还原旧令牌，不重启 Worker。保留并说明待恢复分块及私有残片清单；健康恢复后才结束。成功后提交 `docs: record verified local chunk upload release`。

## 计划自查与执行门槛

协议、鉴权、配额、私有存储、并发租约、完整素材确认、取消清理、前端恢复、封面、兼容、费用边界和回滚分别由任务 1–9 负责。Review Focus 五项均已分配行为测试；生产现有权限与排程不变由任务 2、4、9 验证。类型名、块大小、状态、超时和路径以本计划公共契约为准；实现时若需要改变设计，不自行替换方案。

任务依次执行，各自先红后绿并单独提交；本文未勾选任何实现或部署步骤。请用户审阅计划并选择：本会话由主代理逐项实现后统一独立审查，或按任务使用子代理及逐项审查。建议本会话执行，因为各任务共享上传状态与磁盘一致性契约，减少交接歧义；无论选择哪种，都不跳过完整回归和部署保护。
