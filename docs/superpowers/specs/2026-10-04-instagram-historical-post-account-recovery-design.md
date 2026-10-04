# Instagram Historical Post Account Recovery Design

## Goal

Fix the dead Instagram reauthorization action shown on published posts after the original social-account row has been removed. Restore interaction access only when the current Instagram professional account is proven to be the account that owns the published media. Keep Instagram publishing behavior and credentials independent from engagement access.

## User-approved constraints

- Do not alter the existing publish flow or its credential lifecycle.
- An account match must be exact and scoped to the same workspace; never match by display name or username.
- The UI must not render an action that silently does nothing.
- If the system cannot prove that a connected account owns the historical media, do not attach it automatically.
- Treat missing Meta permissions and missing webhooks as separate conditions from a removed account.

## Current behavior and cause

`PostVariant.socialAccountId` is nullable and uses `onDelete: SetNull`. `PublishedPostManager` renders the reauthorization button for a workspace owner/admin whenever interaction scopes are missing, but its click handler returns immediately if `post.socialAccount.id` is absent. The resulting button is visible but inert. The API's engagement endpoints also resolve the account through the current PostVariant relation, so an orphaned historical post cannot use a newly connected account.

## Design

### Identity snapshot for new and still-linked posts

Add a nullable `instagramProviderAccountId` snapshot to the post variant, set from the selected SocialAccount's immutable `providerAccountId` when the Instagram post variant is created. Backfill it for existing variants whose SocialAccount relation is still present. The snapshot survives account deletion and is not used as a credential.

When producing published-post interaction capabilities or handling interaction requests, resolve the active Instagram account by `(workspaceId, platform=instagram, providerAccountId=instagramProviderAccountId)`. This lets a reconnect of the same professional account restore access without transferring the post's publishing relation or changing its historical record. Scopes and token validity are still checked on the currently connected account.

### Recovery of already-orphaned posts

Rows already orphaned before the snapshot migration have no stored provider account identity. They cannot be safely auto-matched. For an owner/admin, show an explicit “Verify a connected Instagram account” recovery action with accounts from the same workspace. On selection, the API must:

1. Verify workspace-manager authority and that the selected account is an active Instagram account in that workspace.
2. Use that account's current token and an API-supported ownership check (for example, checking the account's own media edge for the exact `providerPostId`) to prove the media belongs to that account. Mere visibility or a successful generic lookup is not sufficient. Treat unsupported ownership verification, missing permissions, and provider lookup failures as failed verification; do not write a match.
3. Only after successful verification, atomically fill the missing provider-account snapshot, guarded by `platform=instagram` and snapshot-is-null. Never overwrite an existing snapshot or use a username/display-name comparison.
4. Return the normal permission state; interaction access remains unavailable until required scopes are granted. Publishing is unaffected.

If the connected account cannot verify the post (including because required read permissions are not granted), explain that verification failed and preserve the post without association. Do not expose a force-link override.

### UI states

- **Same account reconnected and verified:** enable refresh/comments/metrics according to that account's scopes.
- **Original account missing, identity snapshot exists:** show “Reconnect the original Instagram account” and link to account management. Do not show the current inert incremental-authorization button.
- **Legacy orphan, identity snapshot absent:** show the explicit verified recovery action for managers; viewers see a read-only explanation.
- **Account linked but interaction scopes missing:** show incremental reauthorization only when a current active account ID exists and the actor is authorized. If the app permission itself is not approved, show a non-actionable “Meta permission not approved” status instead of an endless reauthorization loop.
- **Webhook unconfigured:** keep the existing independent notice that manual refresh works.

### API and security

- Engagement lookup must remain workspace-scoped and resolve an active Instagram SocialAccount before loading credentials.
- Recovery accepts only a published Instagram schedule and a provider post ID already attached to that schedule; clients cannot submit an arbitrary post ID or provider account ID.
- Recovery is idempotent for a previously empty snapshot and rejects conflicting or concurrent matches.
- Only the selected active account's credential is used; tokens are never copied between accounts.
- The original publishing relationship (`PostVariant.socialAccountId`) is not restored as a side effect. The engagement identity snapshot is separate and preserves history.

## Migration and compatibility

- Add one nullable provider-account identity snapshot column to `PostVariant` with a database migration.
- Backfill rows that still have a linked Instagram SocialAccount; leave already orphaned rows null for verified recovery.
- Existing published posts, account records, OAuth credentials, and non-Instagram platforms remain unchanged.
- No new Meta permission is silently requested by this change. Existing incremental OAuth scope behavior remains, subject to Meta app configuration and approval.

## Verification

Tests must cover:

1. Snapshot is populated for Instagram variants and backfilled when a relation exists.
2. Deleting a SocialAccount leaves the snapshot and published post intact.
3. Reconnecting the exact same provider account in the same workspace resolves the post; another account, workspace, platform, or changed display name does not.
4. Legacy recovery succeeds only after provider media verification and manager authorization.
5. Provider lookup failure, missing permission, wrong workspace, non-Instagram post, and conflicting snapshot leave the record unchanged.
6. UI does not render an inert reauthorization button when the account is absent, while existing post publishing and unrelated platform behavior remain unchanged.
7. Full API and Web test suites, Prisma validation/generation, lint, and production build pass.

## Rollout

Deploy the additive migration and application code together using the existing backup-first deployment procedure. The migration does not delete or rewrite post content, credentials, provider post IDs, or schedule state. After deployment, validate one still-linked account, one reconnect of the same provider account, and one legacy orphan's verified recovery before enabling engagement operations for normal users.
