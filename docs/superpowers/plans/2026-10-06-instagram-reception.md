# Instagram Reception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegation. Steps use checkbox syntax for tracking.

**Goal:** Show verified incoming comments and messages in the existing application without changing publishing.

**Architecture:** PostgreSQL stores minimal account-scoped received content. Existing read services combine live results with received records and explicit source metadata. Webhook delivery is acknowledged only after durable storage; visible pages poll reception revisions.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Next.js, node:test/tsx.

**Spec:** `docs/superpowers/specs/2026-10-06-instagram-reception-design.md`

## Global Constraints

- Provider IDs remain strings; authorize every read/write by workspace and account.
- No automatic replies, attachment downloads, raw payload/token logging, or publishing changes.
- Received content has a configurable 90-day rolling retention; bounded daily cleanup excludes publishing/media records.
- Meta empty results never imply historical import success or delete received content.
- Preserve current private-reply and 24-hour inbound reply restrictions.
- Commit only scoped files; current unrelated TikTok documents remain untouched. Do not invent a Git author if identity remains unconfigured; report failed commits.

## Review Focus

- Same provider account in multiple workspaces must not mix tenants (Task 2).
- Duplicate delivery after a failed write must remain retryable (Task 2).
- Outbound echoes and stale timestamps must never reopen reply windows (Task 4).
- Live empty/error responses must retain received data without implying provider success (Task 3).
- Hidden/unmounted views must stop polling; account changes must discard stale responses (Task 5).

### Task 1: Durable store and migration

**Files:** Modify `apps/api/prisma/schema.prisma`; create `apps/api/prisma/migrations/20261006000000_instagram_reception/migration.sql`, `apps/api/src/services/instagramReceptionStore.ts`, `apps/api/tests/instagramReceptionStore.test.ts`.

**Interfaces:** Define `ReceivedComment`, `ReceivedMessage`, `ReceivedThread`, and `ReceptionState` types. Export `createInstagramReceptionStore(db)` and production `instagramReceptionStore` with `recordComment(accountId,event)`, `recordMessage(accountId,event)`, `listComments(accountId,mediaId,cursor?,limit?)`, `listThreads(accountId,cursor?,limit?)`, `listMessages(accountId,threadId,cursor?,limit?)`, `getThread(accountId,threadId)`, `getStatus(accountId)`, `cleanup(before:Date,batchSize:number)` methods. Lists return `{items,nextCursor}`. Store timestamp, participant IDs, text, bounded attachment metadata, receivedAt, revision and optional verified providerConversationId; unique account/provider IDs. Thread uniqueness is account/counterparty. Local thread IDs use `local:` prefix plus opaque database ID.

- [ ] Write tests asserting duplicate messages produce one row, same IDs in different accounts remain separate, cursor pages do not repeat, and cleanup excludes timestamps equal to cutoff.
- [ ] Run `npx tsx --test apps/api/tests/instagramReceptionStore.test.ts`; observe missing-store failure.
- [ ] Implement additive schema, migration and store, using database upsert/transactions and bounded cleanup batches.
- [ ] Run store tests, `npm run db:generate -w apps/api`, and Prisma schema validation; verify all pass.
- [ ] Commit scoped Task 1 files if repository author identity is configured.

### Task 2: Safe webhook ingestion

**Files:** Modify `apps/api/src/services/instagramWebhookService.ts`, `apps/api/src/controllers/instagramWebhookController.ts`, `apps/api/src/app.ts`, `apps/api/tests/instagramWebhook.test.ts`; create `apps/api/src/services/instagramReceptionService.ts`, `apps/api/tests/instagramReceptionService.test.ts`.

**Interfaces:** Expand normalized `InstagramWebhookEvent` with text, bounded attachment metadata, and inbound/echo markers. Export `createInstagramReceptionService({findAccounts,store})` with `receive(event):Promise<void>`. `findAccounts(providerId)` selects active Instagram accounts and granted scopes; handler uses store from Task 1.

- [ ] Add tests for direct entry field/value comments, changes comments, messaging payloads, invalid signature, unknown account, duplicate delivery, failed-write retry and multiple-workspace account resolution. Assert an initial storage rejection followed by identical delivery stores exactly once.
- [ ] Run webhook/reception tests; verify expected failures.
- [ ] Normalize both documented envelopes, wire durable handler, and mark dedupe only after successful writes (database uniqueness is authoritative). Validate lengths and payload bounds. Unknown/unsupported events do not create content. Storage failure returns HTTP 503 rather than success or malformed-payload 400.
- [ ] Run both test files; verify no sensitive content in diagnostic logs.
- [ ] Commit scoped Task 2 files if identity permits.

### Task 3: Merge reads and honest reception status

**Files:** Modify `apps/api/src/services/instagramEngagementService.ts`, `apps/api/src/integrations/social/instagramEngagement.ts`, `apps/api/src/services/socialAccountService.ts`, `apps/api/src/services/scheduleService.ts`, `apps/api/src/controllers/instagramEngagementController.ts`, `apps/api/src/routes/instagramEngagementRoutes.ts`; tests `apps/api/tests/instagramEngagement.test.ts`, `apps/api/tests/instagramEngagementRoutes.test.ts`.

**Interfaces:** Inject Task 1 store. Existing list methods add `{source,providerReadStatus,lastReceivedAt}` metadata. Export scoped `getReceptionStatus(userId,workspaceId,accountId)` and route `GET /workspaces/:workspaceId/social-accounts/:socialAccountId/instagram/reception`. Status fields: serverReady, subscriptionStatus (verified/unknown/error), subscribedFields, lastReceivedAt, revision. Subscription check uses authenticated read-only `GET /<IG_ID>/subscribed_apps`; it never implies publication or callback configuration. Cache only redacted status briefly, not content. `webhookConfigured` no longer claims Meta connectivity from env vars.

- [ ] Test first-page merge by comment ID, received-only inbox, live errors with labelled local data, independent local/live cursors, cross-workspace denial, revoked account/scopes, and cursor-after without paging.next yielding null.
- [ ] Run engagement/routes tests and observe failures.
- [ ] Implement merges and local thread reconciliation by verified participants; live pagination and local pagination remain distinct. No silent swallowed error when no local data exists. Correct adapter nextCursor to require paging.next.
- [ ] Run targeted tests; assert provider empty results do not erase stored records and status reports unknown callback/publication.
- [ ] Commit scoped Task 3 files if identity permits.

### Task 4: User-triggered replies for received threads

**Files:** Modify `apps/api/src/services/instagramEngagementService.ts`; create `apps/api/tests/instagramReceivedReplies.test.ts`.

**Interfaces:** Existing `replyToConversation` accepts local thread IDs only after account-scoped `getThread`; sends to recorded counterparty, never a client-supplied recipient. Save successful providerMessageId to Task 1 store. Comment reply lookup may use verified received account/media ownership when live detail is unavailable; provider permission/errors remain authoritative.

- [ ] Test other-account local ID denial, viewer denial, latest inbound at window boundary, outbound-only history denial, future timestamp denial, stale inbound denial, and echo deduplication. Assert no send for every denial.
- [ ] Run received-reply tests and observe failures.
- [ ] Implement scoped local reply path preserving live reply path and private reply limits; save successful sends without automatic retry that could duplicate messages.
- [ ] Run received-reply and existing private-reply tests; verify pass.
- [ ] Commit scoped Task 4 files if identity permits.

### Task 5: Visible received data and bounded refresh

**Files:** Modify `apps/web/components/inbox/InstagramInbox.tsx` and existing post interaction component located via `rg -n '暂无评论' apps/web`; create `apps/web/lib/instagramReception.ts`; modify `apps/web/tests/instagramInbox.test.ts`, `apps/web/tests/instagramEngagementUI.test.ts`; create `apps/web/tests/instagramReception.test.ts`.

**Interfaces:** Typed read metadata/status matches Task 3. Helper `createReceptionPoller({readStatus,onRevision,intervalMs,isVisible})` returns `stop()`. Use 15-second visible-page polling, no overlap; account/view change stops previous poller and ignores stale responses.

- [ ] Add behavioural helper tests asserting stop/hidden state causes no reads, changed revision reloads once, and stale account responses are ignored; UI tests assert Chinese/English source, provider visibility warning and unknown Meta setup labels.
- [ ] Run web test files, observe failures.
- [ ] Display received content and honest status. Show nonzero-comment-total/empty-list warning. Wire polling to component lifecycle and preserve manual refresh, viewer controls and reply errors.
- [ ] Run web tests and web build; verify pass.
- [ ] Commit scoped Task 5 files if identity permits.

### Task 6: Retention, verification and deployment

**Files:** Modify `apps/api/src/config.ts`, `apps/api/src/worker.ts`, `.env.example`; create `apps/api/tests/instagramReceptionRetention.test.ts`, `docs/instagram-reception-verification.md`.

**Interfaces:** `INSTAGRAM_RECEPTION_RETENTION_DAYS` defaults to 90; daily cleanup calls Task 1 `cleanup(cutoff,500)` with bounded batch count and no message text logs. Reception metadata remains sufficient for truthful last-received status, but expired content must not be exposed or used to open reply windows.

- [ ] Write retention tests for 90-day cutoff, custom positive days, invalid config rejection and bounded work; run to verify failures.
- [ ] Implement cleanup/config and run retention tests to pass.
- [ ] Run complete suite `npx tsx --test apps/api/tests/*.test.ts apps/web/tests/*.test.ts`, `npm run build`, Prisma validation and `git diff --check`. Report any failure by name.
- [ ] Review whole diff against spec, with special attention to tenant isolation, event retries, echo/reply restrictions and privacy. No production synthetic customer events.
- [ ] Document migration/application rollback: additive tables remain intact if code is rolled back; do not drop received data. Resolve Git identity with user if necessary before commit/push.
- [ ] Deploy additive migration and API/web/worker after verification; verify health and authorized scoped reads, and confirm existing publishing configuration unchanged.
- [ ] For Meta callback/subscription changes, explain exact configuration and request any required permission confirmation. Do not publish app or submit review implicitly.
- [ ] Real acceptance: ask user to send one fresh tester comment and inbound message after Meta delivery is enabled, observe signed delivery and software display, then request explicit reply-test authorization. If blocked by Meta, record it as incomplete external acceptance, not successful repair.
