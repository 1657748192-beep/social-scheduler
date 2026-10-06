# Instagram comment and message reception

## Purpose and boundaries
Make verified incoming Instagram comments and messages visible in the existing interaction page and inbox. Preserve existing publishing credentials, publishing jobs, manual reads, membership rules, and reply restrictions. Never manufacture historical messages when Meta returns an empty list. This change cannot bypass Meta access restrictions or guarantee delivery from an unpublished app.

## Evidence
The deployed API returns the same empty lists as direct Meta reads. Three media report 1, 3, and 1 comments but no comment objects or next pages. Both tester accounts have empty conversations. Meta callback configuration is blank, account subscriptions contain messages only, and the runtime webhook has no event consumer. The current webhookConfigured flag checks environment variables only. These are separate provider-read and event-delivery issues.

## Storage and ingestion
Add account-scoped comment, conversation, message, and reception-state records in PostgreSQL through an additive Prisma migration. Foreign keys associate records with the current SocialAccount, whose workspace determines ownership. Provider IDs remain strings. A conversation discovered only through a webhook uses a local opaque ID and an explicit source marker; it must not be presented as a Meta conversation ID.

Verify the raw request HMAC before parsing or writing. Normalize documented Instagram Login and supported changes/messaging envelopes. Store only identifiers, text, timestamps, participant IDs, and necessary attachment metadata; do not download media or retain raw payloads or tokens. Unknown accounts are ignored with redacted counters. Persist for each matching active authorized account independently; never associate events by display name.

Use database uniqueness for provider comment/message IDs within an account, with upsert handling duplicate delivery across processes and restarts. Commit data before acknowledging delivery. Database failures return a retryable server error; an in-memory seen entry must not suppress a failed event's retry. Unsupported events are acknowledged without being marked successfully imported. Account resolution, scopes, payload size, and field lengths are bounded.

## Reads and replies
Keep live API pagination separate from local cursor pagination. Explicit response metadata identifies live, received, or combined data, the last received time, and provider failures. Merge first-page comments by provider ID within the selected account and media; never erase locally received events because a live list is empty. Inbox combines provider conversations with received participant threads without duplicate participants; reconciliation attaches a provider conversation ID only after verifying account membership. Local-only threads remain readable when Meta conversation enumeration is empty.

Retain current authorization checks on every read and write. Local threads may reply only to their recorded counterparty after a valid inbound message within the existing 24-hour window; outbound echoes cannot open the window. Comment replies remain restricted to the selected account/media. Do not send any replies automatically. Save a successful user-triggered outbound response and deduplicate its subsequent webhook echo. Provider errors remain visible; local storage does not imply a successful provider request.

## UI and reception status
Display received data in existing screens, with a received-at/source label and explicit stale/error states. Poll lightweight local reception status while the inbox/interaction view is visible, then reload affected data when the revision changes; stop polling on unmount or hidden page. Keep manual refresh. Avoid claiming delivery is configured solely from server environment variables.

Distinguish server verifier ready, account subscription fields verified, last valid event received, and provider connectivity unknown/error. Callback saved and app published cannot be inferred from a successful server handshake. Show those as Meta setup requirements unless independently verified. An empty live list with nonzero comment count displays a provider visibility warning, not 'no comments'.

## Privacy and retention
No message text, attachment URLs, tokens, or raw payloads in logs. Cascade removal with account deletion and support the existing data-deletion flow. Propose a configurable 90-day rolling retention for received content, with a bounded daily cleanup job; this default must be approved with this specification before destructive cleanup is enabled. Retention cleanup excludes publishing records and media assets. Text storage adds database disk usage; attachment binaries are not stored and no unbounded in-memory cache is introduced.

## Verification and deployment
Test-first coverage: signatures; both envelope formats; malformed and unknown events; restart-safe deduplication; failed-write retries; cross-workspace/account isolation; live/local merge and cursor handling; local-thread reply ownership and inbound window; outbound echo deduplication; truthful status and empty-list warnings; retention boundaries. Run the entire repository test suite and build, plus migration validation. Use synthetic fixtures locally, never insert fake customer events into production.

Deploy additive migration and API/web changes after successful verification, preserve publishing containers/config, and verify health plus authenticated local reads. Meta callback/subscription changes require applicable confirmation; app publication or review submission is not implicit. Real acceptance requires a new authorized tester comment and inbound message delivered by Meta and visible in the software, followed by a user-approved reply test. If Meta still withholds data or delivery, report that external limitation instead of claiming end-to-end completion.

## Non-goals
No Facebook Login migration, automatic replies, full historical backfill, simulated review data, new media downloads, TikTok changes, or expansion of customer access without explicit authorization.
