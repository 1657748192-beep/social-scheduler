# Dependency security verification — 2026-10-07

Scope: local dependency remediation before Facebook deployment. No production deployment, Meta configuration change, or real customer message/reply was performed.

## Changes

- Next.js 15.5.27 (same major), Nodemailer 10.0.15 (Node 20+; production images use Node 22).
- Root overrides: deepmerge-ts 8.0.2, shell-quote 1.11.0, qs 6.16.0, Next's postcss 8.5.29 and sharp 0.35.5, COS browser SDK's xmldom 0.8.15.
- Lockfile refresh includes patched proxy-addr and other compatible transitive updates. Prisma remains 6.19.3.
- npm 11.16 did not refresh several workspace overrides. An ephemeral npm 11.18.0 targeted update resolved the actual dependency tree; no global npm change was made.
- Both Docker dependency stages now use pinned npm 11.18.0 and `npm ci` to consume the checked-in lockfile, rather than resolving fresh versions with the image's unpinned npm.

## Verified locally

- `npm audit`: 0 vulnerabilities, down from 18 (4 moderate, 11 high, 3 critical). This is the current advisory result, not a guarantee of absence of all security defects.
- Three actual-consumer security regressions passed after failing against the original dependencies: mapped IPv6 proxy trust, recursive Prisma configuration merge, and shell command quoting after a comment.
- SMTP characterization passed against an unauthenticated plaintext localhost-only server through the real password-reset service; no external email sent. External SMTP authentication and implicit TLS are not verified by this test.
- Full API/web test suite with independent PostgreSQL test database: 336 passed, 0 failed, 0 skipped.
- Prisma client generation succeeded. Sharp produced a 92-byte PNG from an in-memory fixture.
- API TypeScript and Next.js production builds succeeded. The existing multiple-lockfile workspace-root warning remains.
- `npm ci --dry-run --ignore-scripts --no-fund` succeeded; this does not establish a clean production Docker build.

## Deployment gate

Production remains unchanged. A clean Linux container build and production verification remain necessary before release. Back up the database before the additive Facebook migrations and service restarts. Keep Facebook engagement disabled until real Page authorization/webhook and read/reply checks are performed with approved test data.
