# Production Deployment: Vercel + AWS

This is the production target for the MVP.

## Architecture

```txt
Browser
  -> app.yourdomain.com
  -> Vercel Next.js app
  -> api.yourdomain.com/api/v1
  -> API container on EC2 / ECS / App Runner
  -> RDS PostgreSQL
  -> ElastiCache Redis
  -> Worker container
  -> Social platform APIs
```

## Required MVP Services

- Vercel project for `apps/web`
- API runtime: EC2, ECS, App Runner, or another container host
- Worker runtime: same host or a separate container service
- Amazon RDS for PostgreSQL
- Amazon ElastiCache for Redis
- S3 or R2 for media in the next hardening pass

## DNS

```txt
app.yourdomain.com -> Vercel
api.yourdomain.com -> API load balancer or server public IP
```

OAuth callback URLs:

```txt
https://api.yourdomain.com/api/v1/integrations/twitter/oauth/callback
https://api.yourdomain.com/api/v1/integrations/facebook/oauth/callback
https://api.yourdomain.com/api/v1/integrations/instagram/oauth/callback
```

## Vercel Setup

Create a Vercel project with:

```txt
Root Directory: apps/web
Framework: Next.js
Production Environment Variable:
  NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

Vercel supports Production, Preview, and Local environments. Put only browser-safe values in variables prefixed with `NEXT_PUBLIC_`.

## API / Worker Setup

On the API host:

```bash
cp .env.production.api.example .env.production.api
# edit .env.production.api with real RDS, ElastiCache, domain, and OAuth values
docker compose -f docker-compose.aws.yml up --build -d
```

The API image runs:

```bash
npx prisma migrate deploy && node dist/server.js
```

The worker image runs:

```bash
node dist/worker.js
```

## Database

Use RDS PostgreSQL with:

```txt
Public access: disabled
Inbound security group: API/worker only
Automated backups: enabled
Deletion protection: enabled for production
SSL/TLS: required
```

Connection string format:

```txt
postgresql://USER:PASSWORD@HOST:5432/social_scheduler?schema=public&sslmode=require
```

## Redis

Use ElastiCache Redis with:

```txt
Public access: disabled
Inbound security group: API/worker only
In-transit encryption: required where possible
```

Connection string format:

```txt
rediss://HOST:6379
```

## Reverse Proxy

If using EC2 directly, put Nginx in front of the API. Example:

```txt
infra/nginx/api.social-scheduler.conf
```

Use AWS ALB + ACM when possible so TLS termination and certificate renewal are managed.

## Production Environment Variables

API:

```env
NODE_ENV=production
API_PUBLIC_URL=https://api.yourdomain.com
WEB_APP_URL=https://app.yourdomain.com
CORS_ORIGIN=https://app.yourdomain.com
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=...
TOKEN_ENCRYPTION_KEY=...
X_CLIENT_ID=...
X_CLIENT_SECRET=...
```

Web:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

## Security Checklist

- HTTPS everywhere.
- Do not expose RDS or Redis publicly.
- Restrict RDS and ElastiCache security groups to API/worker.
- Use `sslmode=require` for RDS PostgreSQL.
- Use `rediss://` for Redis when ElastiCache TLS is enabled.
- Rotate `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` before first production use.
- Store OAuth tokens encrypted only.
- Remove or restrict demo endpoint `/api/v1/schedules/demo`.
- Move uploads from local disk to S3/R2 before large beta.
- Enable RDS automated backups.
- Add application logs and alerts for failed publish jobs.

## Launch Gate

Before sending the product to real users:

1. Configure production domains.
2. Deploy RDS and ElastiCache in private networking.
3. Deploy API and worker with `.env.production.api`.
4. Deploy `apps/web` to Vercel.
5. Run migration with `prisma migrate deploy`.
6. Verify `/api/v1/health`.
7. Register a user.
8. Create a workspace.
9. Connect at least one real social provider.
10. Create a scheduled post and verify worker execution.
