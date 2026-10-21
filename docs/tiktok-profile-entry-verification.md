# TikTok profile entry — 2026-10-21

## Approved scope

Repair only andypeng97's independent sandbox account mapping; add the profile-link entry next to its account, only for the existing designated user/workspace/account. Deploy API + web, API restart permitted, Worker unchanged. Preserve publishing permissions, credentials and schedules; do not submit review or authorize on behalf of the user.

## Implementation

- Existing strict sandbox status now returns the designated social-account UUID only after its user/workspace/member/account guard passes. Ineligible callers receive the original closed response without the UUID.
- Shared profile link component opts into an inline sandbox entry for eligible active/token-expired TikTok rows only, including dashboard, account cards/list and account details. Exact account ID, not display name, binds the entry.
- Status is read only. The user explicitly chooses independent OAuth if needed, or manual profile lookup after grant. No auto OAuth, background profile request, publish action or production credential write.
- Parent pages opt into the private row entry only for platform administrators; server-side designated-user/workspace/account guards remain authoritative. Other customers do not acquire extra row-level status probes. Deployment preflight must also verify the configured tester is a platform administrator.
- Official OAuth destination and returned username/profile URL are validated; responses from old workspace/account/session contexts cannot render after remount. Repeated clicks are fenced. Failed reads clear prior results.
- No schema or publishing implementation changes.

## Evidence

- RED captured for inline control absence and missing status account ID before implementation. Initial focused GREEN 18/18; six UI flow tests passed after adding stale-context, duplicate-click, valid OAuth and success-then-error coverage (test provider setup corrected).
- API TypeScript build and production web build passed.
- Real browser with local fixtures: dashboard authorization row, social-account profile result, mobile layout, other-account/customer hiding; one explicit profile read, zero external writes. Existing automatic avatar-refresh POSTs were blocked by the fixture rather than forwarded. Images are test evidence, not actual platform authorization.
- Independent read-only review found no blocker. Requested additional asynchronous and successful-redirect/error-clearing tests were added and passed.
- Production read-only identity probe `inv-ia6bi30x59` succeeded: TikTok creator username and publishing-token account identity matched andypeng97's current binding; old configured binding was absent; current independent sandbox credential absent. No token refresh, database write or restart.
- Full regression: 1089/1090 passed; the remaining Facebook HTTP fixture timed out during startup. Its isolated retry passed all 5 tests. Final focused UI/manager tests passed 27/27. API and final production web builds passed.
- Final browser fixture repeated successfully: one manual profile read, designated row only, zero external writes. Deployment pending.

## User action required

Because the old independent sandbox credential no longer exists, the user must personally authorize andypeng97 through TikTok after deployment. A mocked browser response is not provider-read proof. Pending authorization must never be reported as a successfully retrieved live profile.
