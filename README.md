# Social Scheduler MVP

MVP monorepo for a social media scheduling SaaS.

## Stack

- Web: Next.js + React + TypeScript
- API: Node.js + Express + TypeScript
- Auth: JWT
- Database: PostgreSQL + Prisma migrations
- Queue: Redis + BullMQ
- Runtime: Docker Compose

## Run with Docker

```bash
docker compose up --build
```

Open:

- Web: http://localhost:3000
- API health: http://localhost:4000/api/v1/health

The API container runs `prisma migrate deploy` before starting.

## Local development

```bash
npm install
docker compose up -d postgres redis
copy .env.example apps\api\.env
npm run db:migrate
npm run dev
```

Use `apps/web/.env.local` if you want to override the browser API URL:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Test flow

1. Open http://localhost:3000/register
2. Create an account
3. Go to the dashboard
4. Create a demo scheduled publish job
5. Check the API logs and worker logs in Docker
