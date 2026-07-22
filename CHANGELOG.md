# CHANGELOG

## Unreleased

### Added

- Added project handoff documentation for continuing development in a new Codex session.
- Added sanitized `.env.example` with placeholder-only configuration.
- Added structured `TODO.md` grouped by P0/P1/P2/P3 priorities.

### Documented

- Current MVP architecture: Next.js web, Node.js API, PostgreSQL, Redis/BullMQ, Docker Compose deployment.
- Current production deployment flow on `/opt/social-scheduler`.
- Current third-party integration status for Facebook, Instagram, YouTube, LinkedIn, TikTok, Pinterest, and X.
- Known blocking issue: Instagram OAuth redirect URI / scope configuration mismatch.
- Known review requirements for Meta App Review and Google OAuth data access verification.

### Security

- Documented that real `.env`, App Secrets, SMTP passwords, database passwords, SSH credentials, tokens, cookies, and private keys must never be committed.

## 2026-07-22

### Handoff

- Prepared repository-level handoff files for the next Codex session.
