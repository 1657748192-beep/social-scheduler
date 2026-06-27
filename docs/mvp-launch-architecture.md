# MVP Launch Architecture

## Must-Have Features

- Auth: register, login, logout, JWT session revocation.
- Workspace: multiple workspaces, members, roles.
- Roles: owner, admin, editor, viewer.
- Social accounts: OAuth 2.0 binding architecture for Twitter/X, Facebook, Instagram.
- Composer: multi-platform copy, image upload, preview, scheduled time.
- Calendar: month/week view, detail panel, drag-to-reschedule.
- Scheduling: Redis + BullMQ delayed jobs, worker execution, retry, recovery scan.
- Storage: PostgreSQL as source of truth.

## Deferred Features

- Billing and subscription.
- AI content generation.
- Analytics dashboard.
- Approval workflow.
- Real email delivery for invites.
- S3/R2 media storage migration.
- TikTok/YouTube.
- Desktop app packaging.
- Enterprise SSO.

## Minimum Production Architecture

```txt
app.yourdomain.com
  Vercel
  Next.js web app

api.yourdomain.com
  AWS EC2/ECS/App Runner
  Node.js API container

worker
  AWS EC2/ECS/App Runner
  BullMQ worker container

data
  Amazon RDS PostgreSQL
  Amazon ElastiCache Redis

media
  local volume for internal MVP
  S3/R2 before public beta
```

## Domain Map

```txt
app.yourdomain.com -> Vercel
api.yourdomain.com -> API host / ALB
```

## Environment Map

Web:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

API and worker:

```env
NODE_ENV=production
API_PUBLIC_URL=https://api.yourdomain.com
WEB_APP_URL=https://app.yourdomain.com
CORS_ORIGIN=https://app.yourdomain.com
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
```

## Practical Launch Scope

Launch with one real publishing adapter first. Twitter/X is the best first candidate because the code already has the OAuth provider path and publisher abstraction. Keep Facebook and Instagram visible as "connected architecture ready" until permissions and publishing flows are fully approved.

## Not Ready For Public Launch Yet

The current code still uses a simulated publisher. Before giving this to external users, implement one real publisher adapter and remove or lock down demo endpoints.
