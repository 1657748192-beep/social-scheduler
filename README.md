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
# TikTok 帖子与账号数据（可选）

已发布页面的 TikTok 帖子提供“查看数据”，按需读取播放、点赞、评论、分享计数。
渠道管理的 TikTok 账号下提供“查看账号数据”：粉丝数、关注数、累计获赞数和公开视频数。账号数据覆盖该账号全部视频，不限于本软件发布记录；使用 `user.info.stats`，不需要 `user.info.profile`。
只查询当前工作区内本软件成功发布且具有真实视频 ID 的公开帖子。接口未返回完整数据时显示原因，不补零。
没有后台轮询、视频下载或新增数据库表。评论正文、回复和私信不在本功能范围内。

启用步骤：

1. 在原 TikTok 开发者应用中申请 Display API、`video.list` 和 `user.info.stats`，保留 Content Posting API 及原有发布权限。
2. 获批后才在现有 `TIKTOK_OAUTH_SCOPES` 后追加 `video.list,user.info.stats`（通常为 `user.info.basic,video.publish,video.list,user.info.stats`；如原来使用 `video.upload` 等权限，继续保留），按现有流程重新部署配置。不要更换应用密钥或回调地址。
3. 需要查看数据的用户从“连接渠道”为同一 TikTok 账号补充授权；原账号无需为继续发布而重新授权。回调会校验实际授予权限，拒绝用缺少既有发布权限的凭证覆盖旧连接。
4. 对本软件发布的公开视频展开“查看数据”，核对四项计数；刷新后读取时间应更新。只有发布任务 ID 的历史记录暂不可查询。
5. 验证原有立即发布、定时发布和令牌刷新，之后再扩大使用范围。应用审核需演示真实授权及数据展示，不能用模拟数据冒充平台返回数据。

接口：`GET /api/v1/workspaces/:workspaceId/tiktok/posts/:scheduleId/metrics`，要求登录及工作区成员权限。
账号接口：`GET /api/v1/workspaces/:workspaceId/social-accounts/:accountId/tiktok-stats`，同样要求登录及工作区成员权限。
两个面板独立检查各自权限。缺少 `video.list`、`user.info.stats` 或读取 API 报错只影响相应数据面板，不将整个发布账号标记为缺少权限。仅手动读取，不保存计数历史，不显示增长趋势。
本地测试不等于生产验收；真实计数仍需已批准权限、用户授权和可查询的公开视频。
