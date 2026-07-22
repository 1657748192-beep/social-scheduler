# Social Scheduler

Social Scheduler 是一个社交媒体内容排程 SaaS，支持工作区、团队成员、社媒账号绑定、图片/视频素材、内容编辑、定时发布、发布日历和管理员后台。

> 品牌名保留英文 `Social Scheduler`，其余产品界面优先中文。

## 技术栈

- Frontend: Next.js + React + TypeScript
- Backend: Node.js + TypeScript
- Database: PostgreSQL + Prisma
- Queue: Redis + BullMQ
- Deploy: Docker Compose
- Proxy: Caddy/Nginx

## 快速开始

```bash
npm install
cp .env.example .env

docker compose up -d postgres redis
npm run dev --workspace @social-scheduler/api
npm run dev --workspace @social-scheduler/web
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/api/v1/health`

## 生产部署

生产服务器目录：`/opt/social-scheduler`

```bash
cd /opt/social-scheduler
sudo bash scripts/deploy-server.sh
```

部署后检查：

```bash
curl -fsS https://app.bufferhelp.com/api/v1/health

docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml ps
```

## 环境变量

复制 `.env.example` 为 `.env`，再填入真实配置。不要提交 `.env`。

重点变量：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_EMAILS`
- `SMTP_*`
- `FACEBOOK_*`
- `INSTAGRAM_*`
- `YOUTUBE_*`

## 交接文档

新 Codex 对话框请优先读取：

1. `PROJECT_HANDOFF.md`
2. `TODO.md`
3. `CHANGELOG.md`
4. `.env.example`
5. `apps/api/src/integrations/oauth/`
6. `docker-compose.yml`
7. `docker-compose.server.yml`
8. `scripts/deploy-server.sh`

## 当前重点问题

Instagram OAuth 仍未稳定，主要报错是 token exchange 时 redirect URI 不一致。请先检查代码读取的环境变量和授权 URL/token exchange 的 redirect_uri 是否完全一致。

## 安全注意

- 不要提交 `.env`。
- 不要在文档、代码或日志里写真实 App Secret、SMTP 密码、数据库密码、SSH 密码、Token、Cookie、私钥。
- 如果发现历史提交泄露密钥，立即更换相关密钥。
