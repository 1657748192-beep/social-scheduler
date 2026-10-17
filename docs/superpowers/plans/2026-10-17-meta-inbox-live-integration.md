# Facebook / Instagram Live Inbox Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Recommended execution here: Native, sequential in the current session; shared source/access contracts make concurrent implementers costly.

**Goal:** 在新版管理员收件箱接通 Factory Wholesale 与 mooyamcosmetic 的真实评论、私信及人工回复，形成可用于后续录屏的可核验证据，不影响发布系统。

**Architecture:** 复用 Facebook 独立管理连接；新建 Instagram 独立互动连接、接收器和适配器。先改统一来源/策略/发送结果契约，再分别接平台；读取与发送按平台资产独立门禁控制，真实启用不能用模拟测试替代。

**Tech Stack:** Existing TypeScript / Express / Prisma / PostgreSQL / Redis / Next.js / React, node:test + tsx, existing Playwright CLI, existing Tencent TAT. No new runtime dependencies or paid infrastructure by default.

**Spec:** `docs/superpowers/specs/2026-10-17-meta-inbox-live-integration-design.md` (user approved 2026-10-17).

## Global Constraints

- 测试 Facebook 公共主页为 **Factory Wholesale**，Instagram 专业账号为 **mooyamcosmetic**；后续必须读取并确认工作区、Meta 应用编号、平台资产编号和账号类型，不能凭同名自动授权或发送。
- 前后端仍仅平台管理员且有效工作区成员可访问。
- 现有发布权限、密文凭据、绑定、历史帖子的账号关联、排程和任务不变。
- 不重启发布 Worker，不创建收费资源，不申请权限审核、不提交审核、不发布 Meta 应用、不向真实客户试发。
- 留存不超过现有产品上限（原始事件7天、归一化内容90天），平台规则更严取更短；这两个数值不是已核验合规声明。证据不足保持真实持久化关闭。
- 不包含从评论主动私信、群发、附件、自动回复、点赞或删评。提及未实现仍返回 `not_integrated`。
- 未来上线单独确认；当前计划批准/实施不自动授权生产部署、Meta 配置更改、OAuth 同意、订阅写入或真实发送。
- Current linked worktree: `source/.worktrees/tiktok-sandbox-metrics`, branch `codex/tiktok-sandbox-metrics`. Preserve unrelated dirty docs and ignored QA output; no reset/clean. Read spec + plan before implementation.

## Review Focus

1. 同名/改名、同平台 ID 跨 app 或工作区：显示名不选资产，连接和来源不可串用（Tasks 1, 3, 4）。
2. 首次授权拒绝、取消或中途失权；callback 抵达时原会话已过期：consume state，但不存 token、不回退发布凭据（Tasks 3, 9）。
3. 窗口内收到私信后撤销连接，发送前异步核验才返回：拒绝发送，保留 unknown 保护，不把旧结果填到新账号（Tasks 6, 8, 9）。
4. 删除、到期与迟到 Graph/Webhook 并发：删除不被后到旧事件复活，正文和派生身份/备注不因索引分离而遗留（Tasks 5, 7）。
5. 两平台数据同步部分失败、重复分页且有未发送备注：不报全成功/零消息，不丢草稿、不重复发信（Tasks 4, 8, 9, 10）。

## File Structure and Interfaces

All paths below are repository-relative; links in the execution handoff should use absolute paths.

| Area | New/modified files and responsibility |
| --- | --- |
| Unified policy/source | New `apps/api/src/interactionInbox/livePolicy.ts`, `source.ts`, `connectionAccess.ts`; modify `types.ts`, `access.ts`, `runtime.ts`, `projection.ts`, `sourceLifetime.ts`, `directory.ts` for platform-tagged provenance and gates |
| Instagram connections | New `apps/api/src/instagramManagement/{config,types,store,oauthGateway,oauth,access,routes,runtime}.ts`: independent token lifecycle, role checks and callbacks |
| Instagram data | New `apps/api/src/instagramManagement/{graph,engagement,receptionStore,webhook,receptionPump,sendAttempts}.ts` and `interactionInbox/adapters/instagram.ts` |
| Shared lifecycle | New `interactionInbox/deletion.ts`, `metaDeletionRoutes.ts`; modify `retention.ts`, `reception.ts`, `reads.ts`, `sends.ts`, registry/FB adapter for provenance, cleanup, pending results |
| Model | `apps/api/prisma/schema.prisma`; new migration `20261017000300_meta_inbox_independent_instagram/migration.sql`, additive interaction-domain only |
| HTTP startup | `apps/api/src/app.ts`, `server.ts`, `utils/requestLog.ts`; keep retired middleware and existing publishing/Worker entrypoints unchanged |
| UI | New `apps/web/components/inbox/unified/InteractionConnectionPanel.tsx`; update `UnifiedInbox.tsx`, `CapabilityNotice.tsx`, `ReplyComposer.tsx`, `apps/web/lib/interactionInbox.ts`; only scoped CSS if needed |
| Evidence | New `docs/meta-inbox-live-verification.md`; local QA artifacts under ignored `output/playwright/`; future deploy scripts under `scripts/deploy/meta-inbox/` |

Keep modules independent of the publishing config singleton. Constructor injection uses existing Prisma/Redis/token crypto interfaces. Existing global `policyVerified` is removed only after per-asset policy checks cover all previous reject paths; absent configuration still rejects.

### Common new contracts (defined by owning tasks)

- `MetaPlatform = 'facebook'|'instagram'`; `LiveAssetKey = {workspaceId:string;platform:MetaPlatform;appId:string;providerAssetId:string}`.
- `LivePolicyEvidence = {product:string;graphVersion:string;checkedAt:string;sources:string[];rawRetentionDays:number;contentRetentionDays:number;replyWindowMs:number;reviewed:boolean}`; runtime validates, does not infer official compliance from `reviewed=true` alone. Operations must have a recorded, human-reviewed evidence document before production configuration is approved.
- `LiveAssetRule = LiveAssetKey & {readEnabled:boolean;sendEnabled:boolean;policy:LivePolicyEvidence}`. Parse strict server JSON `META_INBOX_LIVE_ASSETS_JSON`, absent -> empty rules, malformed nonempty -> startup error without echoing its value. Never add this setting to Worker environment.
- `createLiveInboxPolicy(rules:LiveAssetRule[],now?:()=>Date)` returns `{requireAsset(key:LiveAssetKey,mode:'read'|'send'):LivePolicyEvidence}`. Missing/unreviewed rule -> HttpError409; inactive read/send -> HttpError409; no provider or persistence call before this check.
- `MetaInboxSource` is a discriminated union: Facebook `{platform:'facebook',managedPageId,connectionId,connectionVersion,...existing optional source IDs}`; Instagram `{platform:'instagram',instagramAccountId,connectionId,connectionVersion,mediaId?,conversationId?,commentId?,participantId?,sourceRecordId?}`. All connection/record IDs UUID; provider IDs <=256, connectionVersion positive integer. Reject mixed source fields; `parseInboxSource(value:unknown,platform:MetaPlatform):MetaInboxSource` allows old untagged Facebook only when caller explicitly supplies Facebook and validates existing fields.
- `InboxConnectionAccess.resolve(ctx:Scope,accountId:string,capability?:Capability):Promise<ResolvedAsset>` and `.assertCurrent(tx:InboxDb,asset:ResolvedAsset):Promise<void>` own platform token/access validation. Existing `InboxAccess` retains session/membership/write methods and delegates resolution. `ResolvedAsset.sourceRef` becomes `MetaInboxSource|null`.
- Existing `InboxAdapter` extends with `pendingSend(asset:ResolvedAsset,requestKey:string):Promise<PendingSend|null>`; `PendingSend={requestKey:string;status:string;diagnosticId:string|null;createdAt:string}`. Facebook delegates existing attempt store; Instagram uses Task 6. Disabled adapter denies, not success/null by default.
- `createMetaInboxDeletion({db,policy})` returns `record(request:VerifiedMetaDeletion):Promise<{confirmationCode:string}>`, `runBatch(now:Date,limit:number):Promise<number>`; `VerifiedMetaDeletion={platform:MetaPlatform;appId:string;reason:'provider_delete'|'deauthorization'|'disconnect'} & ({providerSubjectId:string;subjectKind:'actor'|'asset'|'app_user'}|{subjectKind:'item';providerAssetId:string;providerEventId:string})`. Item deletion requires the exact asset+event and must not delete the entire actor/customer. Signature validation is outside this internal trusted type; no public JSON endpoint accepts it directly.

## Development/Test Conventions

- Every coding task: write named failing test → run and observe the intended assertion failure → minimal implementation → same tests pass → explicit-path commit. Import/fixture errors alone are not an adequate RED when the behavior can be exercised.
- Focused command format: `node scripts/run-tests.cjs apps/api/tests/<name>.test.ts`; integration names end `.integration.test.ts`. Existing runner validates local-only test URLs and serializes tests. Never use production `.env`, mint production sessions, or silently skip missing DB.
- Existing local Docker fixture `codex-instagram-reception-test` and Redis `127.0.0.1:55437` are read-only inspected before reuse; do not restart Docker Desktop or cloud services without separate authority. If unavailable, report what is blocked while continuing pure tests.
- Migration of the isolated test DB: `node scripts/run-tests.cjs --migrate-local-upload-test-db`; test runner validates it is not production. Schema generation/build command may update only generated artifacts, not dependency locks.
- Each commit stages only task paths. Use repository's configured identity; if missing, existing local task identity `git -c user.name="社媒" -c user.email="1657748192-beep@users.noreply.github.com" commit ...`. No force push.

### Task 1: Per-asset policy and platform-tagged source contracts

**Files:** Create `interactionInbox/livePolicy.ts`, `source.ts`; modify `types.ts`, `access.ts`, `runtime.ts`, `projection.ts`, `sourceLifetime.ts`, FB adapter; tests `apps/api/tests/metaInboxPolicy.test.ts`, `metaInboxSource.test.ts`, existing `interactionInbox*.test.ts`.

**Interfaces:** Produces common policy/source contracts above. Existing constructors gain injectable policy/connection dependencies, default deny. Preserve current Facebook fixture behavior by explicitly injecting synthetic reviewed rules, not changing production defaults.

- [ ] Step 1 — Tests `missingPolicyMakesNoProviderOrDbWrite`, `sendGateIndependentOfRead`, `sameNameDifferentAppDenied`, `legacyFacebookSourceRequiresFacebookContext`, `instagramCannotParseFacebookFields`: assert default409 before write/fetch counters increase, read rule cannot send, foreign workspace/app does not match, mixed fields throw. Policy rejects non-HTTPS/nonofficial evidence URLs, invalid date/version, retention outside1..7/1..90, and nonpositive reply window; evidence URLs only allow `developers.facebook.com` or Meta-owned Postman workspace path.
- [ ] Step 2 — Run `node scripts/run-tests.cjs apps/api/tests/metaInboxPolicy.test.ts apps/api/tests/metaInboxSource.test.ts`; record intentional RED.
- [ ] Step 3 — Implement exact common signatures; thread platform source discriminator through all existing callsites without activating Instagram. Runtime passes empty rules unless explicit server configuration; policy check covers reception and projection independently. Existing local fixture injects synthetic policy, identified as such in evidence.
- [ ] Step 4 — Same command GREEN; run all existing `interactionInbox` tests via runner explicit filenames, no integration concurrency; Facebook-only legacy sources still pass, unsupported platforms still deny.
- [ ] Step 5 — Commit only source/policy/type/callsite/tests: `refactor(inbox): isolate platform sources and live asset policy`.

### Task 2: Add independent Instagram models and protection fixture

**Files:** Modify Prisma schema; create migration named above, `instagramManagement/types.ts`, tests `metaInboxModels.integration.test.ts`, `helpers/metaInboxFixture.ts`.

**Interfaces:** `withMetaInboxFixture(run:(f:MetaInboxFixture)=>Promise<void>):Promise<void>` extends existing `withInboxFixture`, seeds only synthetic app/asset IDs in two workspaces; exposes `instagramAccountIds`, `instagramConnectionIds`, `publishingSnapshot():Promise<unknown>`. Models use Prisma names `InstagramManagementConnection`, `InstagramManagementOAuthState`, `InstagramInteractionEvent`, `InstagramInteractionMessage`, `InstagramInteractionComment`, `InstagramInteractionSendAttempt`, `MetaInboxDeletionRequest`, `MetaInboxDeletionMarker`.

- [ ] Step 1 — Tests `migrationPreservesPublishingSnapshot`, `crossWorkspaceForeignKeysRejected`, `connectionAppAssetNamespaceUnique`, `sameProviderEventDifferentAppIsDistinct`. Assert accounts+credential, schedules/jobs/posts/variants/OAuth links remain byte-for-byte equal after interaction-domain operations. Seed both platforms with identical provider IDs to test namespacing.
- [ ] Step 2 — Run focused test against existing isolated schema and capture missing-model/constraint failure; never run DDL against server while implementing.
- [ ] Step 3 — Add independent encrypted access token, actual scopes, expiresAt, status/version, app identity, connecting user and account link; OAuth state stores hash,10-minute expiry, expected identity and original session. Events have raw payload, dedup key, lease state/token/expiry and timestamps; messages/comments bind connection+version+provider ID with inbound/actor/media/delete fields. Attempt has requestKey,payloadHash,targetHash,version,status,providerId,diagnosticId. Deletion request stores bounded app/subject namespace, state and random confirmation; marker prevents reimport of deleted actor/asset sources. Composite workspace/connection FKs and DB check constraints enforce boundaries. Only add optional Instagram connection FK to InteractionAsset; no rewrite of existing Facebook rows or publishing schema.
- [ ] Step 4 — Apply to isolated DB using runner migration command, generate Prisma, rerun focused tests GREEN; inspect migration SQL and verify every ALTER targets interaction-domain/new tables, no original account/credential DML.
- [ ] Step 5 — Commit model/migration/fixture/tests: `feat(inbox): add isolated Instagram interaction storage`.

### Task 3: Independent Instagram OAuth, config and access

**Files:** Create `instagramManagement/{config,store,oauthGateway,oauth,access,routes,runtime}.ts`; tests `instagramManagementOAuth.integration.test.ts`, `instagramManagementConfig.test.ts`, `instagramManagementAccess.integration.test.ts`; modify `app.ts`, `utils/requestLog.ts` for new routes/redaction only.

**Interfaces:** `getInstagramManagementConfig(env:NodeJS.ProcessEnv):InstagramManagementConfig` returns disabled by default; enabled mode requires existing Instagram app identity/secret and HTTPS same-origin callback `/api/v1/integrations/instagram-management/oauth/callback`, does not alter publishing config. `createInstagramManagementOAuth(deps)` returns `.start(ctx:Scope,accountId:string):Promise<{authorizationUrl:string}>`, `.callback(input:{state:string;code?:string;error?:string}):Promise<{connectionId:string}>`. `createInstagramManagementAccess(deps).resolve(ctx,accountId,capability?)` returns Task1 ResolvedAsset after identity/grant checks; server-only decrypted token is a separate internal return used by Graph client, never part of DTO.

- [ ] Step 1 — Tests `wrongAccountNoGrantSaved`, `cancelConsumesState`, `callbackAfterSessionRevokedDenied`, `concurrentReplayOneWinner`, `actualGrantsNotRequestedScopes`, `independentConsentPreservesPublishingSnapshot`. Assert no `OauthCredential`/publishing scope write; ordinary customers cannot start/status/disconnect; callbacks fail safely without disclosing codes/tokens. Disabled config must not require a secret or enable a URL.
- [ ] Step 2 — Run these three focused files and capture RED.
- [ ] Step 3 — Implement strict configuration, hashed random state and atomic consume. Routes: POST `/workspaces/:workspaceId/instagram-management/oauth/start` body `{accountId}`, GET same base `/status?accountId=...`, DELETE same base `/connections/:id` (managed owner/admin only), public OAuth callback path above; callback redirects only to fixed `/inbox` with enumerated success/failure marker, no tokens/IDs in URL. Exchange on fixed official host, no redirect following, verify account against expected provider ID and app. Minimum actual scopes are determined from recorded official product evidence; missing/unverified dependencies keep live start disabled. Disconnect is local first, delegates data purge to Task7 and never revokes shared publishing permissions via Graph.
- [ ] Step 4 — Rerun GREEN; add protected snapshot assertion around both successful and failed callbacks; test database errors/expiry never trigger publishing-token fallback or include secrets in response/log URL.
- [ ] Step 5 — Commit explicit Instagram connection files/routes/tests: `feat(inbox): add independent Instagram interaction authorization`.

### Task 4: Facebook live asset resolution and safe projection

**Files:** Create `interactionInbox/connectionAccess.ts`; modify `access.ts`, `projection.ts`, `sourceLifetime.ts`, `adapters/facebook.ts`, `registry.ts`, `runtime.ts`, `directory.ts`; tests `metaInboxFacebook.integration.test.ts`, existing access/projection/reception tests.

**Interfaces:** Produces `InboxConnectionAccess` above; `createInboxRegistry(facebook:InboxAdapter,instagram?:InboxAdapter)` still uses disabled adapter when absent. Task1 source parser used at every case/item boundary. No new Facebook grant/selection API.

- [ ] Step 1 — Tests `factoryRuleDoesNotEnableOtherPages`, `projectionChecksCurrentSelectionInsideTransaction`, `connectionChangesAfterProviderReadRejectsProjection`, `graphPaginationDuplicatesDoNotDuplicateCustomers`, `commentsCoverageIsVerifiedPublishedPostsOnly`. All assertions use synthetic verified IDs, not name comparison. Missing rule leaves raw/provider call counts0; absent grant yields structured unavailable, not empty successful result.
- [ ] Step 2 — Run `node scripts/run-tests.cjs apps/api/tests/metaInboxFacebook.integration.test.ts` plus existing inbox access tests, observe intended RED.
- [ ] Step 3 — Reuse current Facebook management Page access and capability checks. ConnectionAccess maps current active app/selected Page to canonical asset; assertCurrent performs transactional selection/version/member checks. Projection switches by platform, checks deleted-source markers, writes metadata only for Facebook (no second正文 copy), preserves previous access and no-overwrite semantics. Policy gating changes only new inbox; do not modify BM directory grants or select new Pages.
- [ ] Step 4 — Rerun GREEN; compare publishing and management connection/selection snapshots before/after every read/projection; current Page selection and credential cannot change as a side effect of refresh.
- [ ] Step 5 — Commit: `feat(inbox): connect guarded Facebook live reads`.

### Task 5: Instagram signed reception and API-owned pump

**Files:** Create `instagramManagement/{receptionStore,webhook,receptionPump}.ts`; modify `runtime.ts`, `app.ts`, `server.ts`, `utils/requestLog.ts`; tests `instagramManagementReception.integration.test.ts`, `instagramManagementWebhook.test.ts`.

**Interfaces:** `createInstagramManagementReceptionStore(deps)` exposes `.enqueue(events:VerifiedInstagramEvent[]):Promise<void>`, `.claimBatch(now:Date,limit:number):Promise<InstagramEventClaim[]>`, `.processClaim(claim,now):Promise<void>`, `.finishClaim(id,claimToken)`, `.failClaim(id,claimToken)`, `.prune(now)`. Event/claim types in `instagramManagement/types.ts`; normalize only internally verified webhook input. `startInstagramManagementPump(deps):{stop():Promise<void>}` matches existing FB pump lifecycle. `createInstagramManagementWebhook(deps):Router` mounts `/api/v1/webhooks/instagram` before retired middleware only when explicitly enabled.

- [ ] Step 1 — Tests `tamperedRawBytesRejected`, `wrongAppRecipientHasNoWrites`, `duplicateDeliveryExactlyOnce`, `sameAssetAcrossWorkspacesNotBroadcast`, `policyOffStoresNothing`, `disconnectDuringLeaseDoesNotRecreateData`, `oldDeletedEventCannotResurrect`. Verify DB failure does not return successful durable-receipt acknowledgement. Disabled webhook leaves existing410 behavior; old Instagram engagement routes remain410 even when new webhook enabled.
- [ ] Step 2 — Run both files, observe RED.
- [ ] Step 3 — Raw parser1MB before JSON middleware, HMAC constant-time verification, strict bounded event shape. Resolve explicit enabled independent connection and app+asset ownership; ambiguous mapping is rejected/quarantined without customer payload retention. Upsert raw dedup batch<=50, reliable commit before acknowledgement. Pump max50/tick with lease token/version fencing, interval2s, no overlapping ticks, bounded failure retry; never performs manual replies. Emit no raw body/signature/customer data to logs. Server shutdown awaits pump stop; worker.ts untouched.
- [ ] Step 4 — Rerun GREEN; test stop during in-flight transaction and lease recovery, byte-level signature fail before store; policy-off and unsupported fixture yields zero writes even if signed correctly. Task7 supplies final persisted deletion-marker checks, then rerun these tests.
- [ ] Step 5 — Commit: `feat(inbox): receive signed Instagram events independently`.

### Task 6: Instagram Graph reads and idempotent text replies

**Files:** Create `instagramManagement/{graph,engagement,sendAttempts}.ts`, `interactionInbox/adapters/instagram.ts`; modify `instagramManagement/types.ts`; tests `instagramManagementGraph.test.ts`, `instagramManagementSend.integration.test.ts`, `metaInboxInstagramAdapter.integration.test.ts`.

**Interfaces:** `createInstagramManagementGraph({appId,graphVersion,accessToken,fetchImpl?})` methods `identity()`, `media(after?)`, `comments(mediaId,after?)`, `conversations(after?)`, `messages(conversationId,after?)`, `replyComment(commentId,text)`, `sendMessage(participantId,text)`, `subscriptions()`, `subscribe(fields)`; return strictly parsed DTOs declared in same module, list `{items,nextCursor}`. `createInstagramManagementEngagement(deps)` exposes capability/list/detail/reply and pendingSend operations consumed by `createInstagramInboxAdapter({db,access,engagement,policy}):InboxAdapter`; sent/failed/unknown matches existing SendOutcome. `createInstagramSendExecutor({db}).execute(input,send):Promise<SendOutcome>` input contains asset, version, target, payload and UUID requestKey; send is one provider operation.

- [ ] Step 1 — Tests `foreignConversationCannotBeRepliedTo`, `providerCursorCannotChangeHost`, `scopeMissingNeverFetches`, `replyWindowCheckedAtSendNotLoad`, `revokedBetweenLookupAndSendDenied`, `concurrentSameKeyOneProviderCall`, `differentPayloadSameKey409`, `timeoutBecomesUnknownAndNoRetry`, `explicitFailureIsNotSent`. Fake transport records exact host/path/body; test claims1..50 and validates no following of Graph next URL.
- [ ] Step 2 — Run three focused files, observe behavior RED; reuse existing pure Instagram parser only where current tests establish equivalent rules.
- [ ] Step 3 — Implement fixed official-host requests,15s timeout, at most1MB response, no redirects, list max25; internal cursors re-encoded with app/account/version/kind context. Verify each media belongs to selected account, each thread/recipient is owned/mapped, and participant differs from business account. Reply only in policy-verified window from true incoming event, no HUMAN_AGENT or private-comment shortcut. Enforce2,000 message chars and effective comment limit=min(8,000, verified platform limit); reject blank. Unknown transport/invalid success response after dispatch is unknown, not retryable failure. Atomic attempt key includes connection version+target hash+payload hash; late success can finalize same attempt only, cannot overwrite current connection state. Store body once in independent source store; return source references to adapter. Mentions unavailable.
- [ ] Step 4 — Rerun GREEN with two apps using same actor/thread IDs; no cross-app retrieval, source metadata remains correct for read/pending/sent/unknown; protected publishing snapshot identical.
- [ ] Step 5 — Commit: `feat(inbox): add verified Instagram reads and guarded replies`.

### Task 7: Provenance-aware retention, deletion and revocation

**Files:** Create `interactionInbox/deletion.ts`, `metaDeletionRoutes.ts`; modify `sourceLifetime.ts`, `retention.ts`, `projection.ts`, FB/IG reception stores as narrowly needed, `app.ts`, `server.ts`; tests `metaInboxDeletion.integration.test.ts`, `metaInboxDeletionRoutes.test.ts`, `metaInboxRetention.integration.test.ts`.

**Interfaces:** Produces common deletion contract. `createMetaDeletionRouter({verifySignedRequest,deletion,statusStore}):Router` registers explicit app-specific deauthorization/data-deletion callbacks; helper `verifyMetaSignedRequest(value:string,secret:string):{userId:string;issuedAt:number}` verifies signed raw payload and HMAC-SHA256, not frontend claims. Routes receive app namespace from server-configured route binding, never trust body appId. Data-deletion status uses opaque random confirmation code and reports only pending/completed, no subjects or counts.

- [ ] Step 1 — Tests `deleteSameIdOnlyMatchingApp`, `deleteSingleCommentPreservesOtherThreadsAndCustomerNotes`, `deleteActorCleansNotesTagsAndIdentity`, `disconnectImmediatelyBlocksCachedReads`, `expiredRawAndBodyPurgedInBoundedBatches`, `delayedReadCannotUndoDelete`, `forgedDeletionCannotPurge`, `deletionForAppUserPurgesOnlyItsVerifiedConnections`, `rawSevenDaysContentNinetyDaysAreCapsNotEntitlements`. Include <boundary, =boundary, >boundary and task-specific shorter policy values; assert old publishing records unaffected.
- [ ] Step 2 — Run three files, observe RED.
- [ ] Step 3 — Transactional delete markers + request claims, immediate access revocation before asynchronous purge. DB lookup maps verified subject within app/platform; ambiguous/unmapped actor request cannot expand scope. Purge body/raw, cases/items, related read receipts/sync cursors, scoped identity caches and covered customer notes/tag links; retain safe nonpersonal audit and unlinked workspace tag definitions only. Window/retention from reviewed rules capped7/90days; permanent markers contain minimum namespace needed to prevent reimport and follow verified deletion policy, not raw identity dumps. Maintenance<=50 entities/tick API-owned, no unbounded customer sweep on GET, no Worker change. Status callback public opaque code, Cache-Control:no-store, no user IDs in logs.
- [ ] Step 4 — Rerun GREEN then Tasks4/5/6 tests; race real transactions (source read in flight against deletion/renewal) and prove no resurrection. Isolated schema migration plus protected snapshot equal before/after purge. Do not toggle production policy until actual official rules are recorded.
- [ ] Step 5 — Commit: `feat(inbox): enforce Meta data deletion and source lifetime`.

### Task 8: Register both adapters and unify pending-send/read contracts

**Files:** Modify `interactionInbox/{runtime,access,reads,sends,reception,projection,sourceLifetime,directory}.ts`, `adapters/{registry,facebook,instagram,disabled}.ts`, `routes.ts` only for DTO propagation; tests `metaInboxUnified.integration.test.ts`, `interactionInboxSends.integration.test.ts`.

**Interfaces:** Consumers of Tasks1–7. `pendingInboxSend` switches from direct Facebook DB access to adapter.pendingSend; same client DTO and30s pending acknowledgement floor retained. Backend receives injectable IG runtime but defaults disabled; existing createApp test injection retained.

- [ ] Step 1 — Tests `facebookAndInstagramSameCustomerNameRemainDistinct`, `igUnknownBlocksSecondKey`, `fbUnknownUsesExistingAttemptStore`, `onePlatformFailureReturnsPartial`, `viewerCannotRefreshOrReply`, `fiftyAccountCursorScopeStillBounded`, `reauthInvalidatesOldDetailAndContinuation`. Assert FB adapter no double attempts and unsupported platforms still explicit unavailable.
- [ ] Step 2 — Run focused unified test and existing send tests; capture RED for platform pending resolution, not only type mismatch.
- [ ] Step 3 — Register IG adapter only with independent runtime; access and projection use connectionAccess/assertCurrent for both platforms, no spoofed session for background work. Pump owns raw ingestion only; authorized visible refresh normalizes already verified source refs and bounded Graph data. New notes/tags retain exact accountIds authorization. Do not silently map comments to messages or infer mentions. Directory distinguishes integrated-but-gated from not_integrated without token/scopes leak.
- [ ] Step 4 — GREEN; run all API inbox tests and protection snapshot. Check no public route bypasses administrator guard and no scope change writes a publishing credential/management selection.
- [ ] Step 5 — Commit: `feat(inbox): unify live Meta adapter and send state routing`.

### Task 9: Administrator UI for independent connections and truthful status

**Files:** Create `apps/web/components/inbox/unified/InteractionConnectionPanel.tsx`; modify `UnifiedInbox.tsx`, `CapabilityNotice.tsx`, `ReplyComposer.tsx`, `apps/web/lib/interactionInbox.ts`, scoped `globals.css` if needed; tests `apps/web/tests/metaInboxConnections.test.tsx`, `metaInboxLiveFlows.test.tsx`.

**Interfaces:** `InteractionConnectionPanel({token,workspaceId,account,onChanged}:{token:string;workspaceId:string;account:InboxAccount;onChanged:()=>void})`. Web helper `instagramManagementRequest<T>(token,workspaceId,path,options)` uses existing apiRequest with fixed `/workspaces/:workspaceId/instagram-management` prefix. Status DTO includes only connected/status/providerAccountId/displayName/expiresAt and capability booleans/safe reason; no tokens/raw grants. Facebook links to existing administrator BM connection management, not a new rebind flow.

- [ ] Step 1 — Tests `newConnectionNotPublishingRebind`, `cancelOAuthKeepsPublishingAndDraft`, `readAllowedSendDisabledExplained`, `unverifiedWindowBlocksReply`, `lateStatusFromPreviousAccountIgnored`, `topThreeTabsRemain`, `internalNoteNeverHitsProvider`, `partialRefreshKeepsDraftAndWarns`. Exact visible distinction: “独立互动授权”“发布授权保持不变”“等待接入核验”“回复暂不可用”; unavailable mentions not shown as zero successful messages.
- [ ] Step 2 — Run two web files with existing real React test helpers; observe RED.
- [ ] Step 3 — Add compact per-selected-account connection panel without changing approved three-column structure. State scoped by token/workspace/account/platform with AbortController+generation guard; OAuth navigation requires explicit click and dirty-draft confirmation; callback only enumerated markers. No storing drafts/tokens in URLs/localStorage. Public reply identity and internal note distinction retained. Disconnect asks confirmation, calls independent endpoint only; status refresh never subscribes or authorizes by itself.
- [ ] Step 4 — GREEN and existing detail/list/customer/navigation tests; Playwright real UI on local production build using synthetic fixtures verifies FB/IG switches, cancel callback, missing grant/expired connection, desktop/mobile, keyboard focus, no overflow and ordinary-user denial. Record synthetic evidence separately.
- [ ] Step 5 — Commit explicit UI/tests: `feat(inbox): expose independent Meta connection status for admins`.

### Task 10: Complete regression and prepare gated deployment/real acceptance

**Files:** Create `docs/meta-inbox-live-verification.md`; `scripts/deploy/meta-inbox/{preflight.sh,prepare.sh,activate.sh,verify.sh}` (do not run on production in this task); tests `apps/api/tests/metaInboxDeploymentSafety.test.ts`. QA scripts/screenshots remain ignored `output/playwright/`.

**Interfaces:** Scripts require explicit target commit, server allowlist and release directory; no embedded secrets. Preflight read-only; prepare builds API/web and stores protected snapshots; activate updates only explicitly named API/web services; verify checks health, migrations, ordinary-user denial/401, public bundle identity, raw gates off and Worker invariance. All production operations gated by fresh user deployment approval.

- [ ] Step 1 — Test deployment policy with actual parsed script text and a stubbed command recorder: `onlyApiWebCanBeRecreated`, `workerAndEnvRemainProtected`, `missingApprovalOrTargetAborts`, `hostNodeNotRequired`. Assert no unqualified compose up/down, no worker build/restart, no secret/env dumps or database restore. Compare stubbed protected snapshots and require mismatch abort, never overwrite user data.
- [ ] Step 2 — Run safety test RED before scripts exist; implement bounded scripts using container Node (host Node was absent on prior release). Old API/web rollback tags saved before activation; trap rolls images back only, never drops additive schema.
- [ ] Step 3 — Fresh `node scripts/run-tests.cjs` with local validated DB, `npm.cmd run build -w apps/api`, `npm.cmd run build -w apps/web`, `git -c core.safecrlf=false diff --check`; all commands exit0, no skipped integration tests. If tests unavailable/fail, record exact blocker; do not claim ready. Compare protected publishing snapshots and inspect every migration SQL. Commit safety scripts, tests, evidence.
- [ ] Step 4 — Final read-only independent code review of whole branch per requesting-code-review skill; reviewer covers source/policy/state lifecycle, access, data deletion, send unknown, protected publishing paths. Resolve findings by failing regression test then fix, rerun affected checks; do not add unrelated refactors. Production credentials/real customer content are never passed to reviewer.
- [ ] Step 5 — Present local results and exact target revision; ask for API/web deployment authorization. Approval does not include provider configuration or sends. Following approval, execute preflight/prepare/activate/verify via existing TAT channel, record invocation IDs, HMAC counts/hashes, unchanged env and Worker ID/start, health and default closed gates. If legitimate publishing activity causes snapshot drift, investigate read-only and explain; never stop Worker or restore old DB to force equality.

### Task 11: Separately authorized platform verification and recording readiness

**Files:** Update only `docs/meta-inbox-live-verification.md`; official policy evidence section within it plus scoped redacted operational logs outside repository. Real data/permissions are not unit-test fixtures.

**Interfaces:** Operational checklist consumes approved scripts/code, no new feature scope. One platform at a time: Facebook first, Instagram second. Each external-write step needs its stated authority; no repetition after unknown result.

- [ ] Step 1 — Read official docs/control-panel guidance for actual configured product/version, minimal scopes, test roles, reply window, retention, deauthorization/data-deletion rules; record readable source/date and human-reviewed policy. Earlier429/framework-only fetch is not sufficient. If blocked, keep production live gates off and continue offline work only; do not invent dependency lists or reference third-party claims as official approval.
- [ ] Step 2 — With separate read-only production approval, resolve Factory Wholesale and mooyamcosmetic to workspace/app/provider IDs and account type, available independent connection/scopes/tasks/expiry and existing subscriptions; return only redacted evidence. Ask user to confirm exact assets and designated test participant. Record existing publishing snapshots before any authorized configuration. Missing FB test post -> ask for an existing eligible post or separate publish approval.
- [ ] Step 3 — Ask authorization for specific callback whitelist/independent OAuth/subscription changes; user personally completes login/consent. Preserve existing subscribed fields and do not revoke publishing permissions. Enable read only for confirmed assets after policy/deletion checks pass. User creates known incoming test comments/DMs; verify actual Graph IDs, signed webhook receipt and software account-scoped display. Signed official samples only count as sample transport. Partial/empty data is diagnosed, not treated as true delivery success.
- [ ] Step 4 — Show one exact test recipient/post and reply text per capability, get sending approval, enable send for that selected test context and send once. Verify official Page/Instagram inbox/comment receipt; unknown -> inspect official result before any new request. Record four capability outcomes per platform (comment read/reply, DM read/reply), with separate webhook status. No real customer testing, auto replies or review submission.
- [ ] Step 5 — If all required chains pass, provide authorization-first recording script, reachable restricted reviewer test account proposal and permissions/use-case materials for later review. Do not expand administrator whitelist without explicit approval. If any chain fails, identify exact gap and keep its unavailable status; do not state both platforms are recording-ready based on only Facebook or simulated acceptance.

## Self-review / Completion Ledger

- Spec §§1–3: scope/named assets/independent architecture -> Global constraints and Tasks1–4.
- §§4–7: gates, FB reuse, independent IG, discriminated provenance and additive schema -> Tasks1–6,8.
- §8: signed events, bounded pump, deletion/retention/revocation -> Tasks5,7,10–11.
- §9: text-only sends, window/unknown, approved UI, admin-only -> Tasks6,8–9.
- §§10–11: serial isolated tests, no publishing mutation, approved API/web-only rollout, official evidence and real recording acceptance -> Tasks10–11.
- All five Review Focus conditions have explicit owning tests. Common contracts are defined once; no task creates a new type without its defining file/interface. New optional settings stay API-owned; publishing config and Worker are not deployment dependencies.
- Local implementation completion, production deployment completion, policy verification, real OAuth, webhook delivery and real send acceptance are separate statuses. This plan alone completes none of those operational stages.
