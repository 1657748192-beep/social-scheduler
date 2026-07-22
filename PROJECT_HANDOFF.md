# Social Scheduler 项目交接文档

整理时间：2026-07-22  
项目根目录：`D:\社媒`  
生产部署目录：`/opt/social-scheduler`  
线上域名：`https://app.bufferhelp.com`

## 1. 项目名称和最终目标

项目名称：Social Scheduler

最终目标：做一个原创 UI 的社交媒体内容排程 SaaS，支持多个用户、多个工作区、多个社媒平台账号绑定、图片/视频素材上传、内容编辑、定时发布、发布日历、失败重试、后台管理、团队协作和后续套餐/支付能力。产品定位类似 Buffer / SocialEcho，但 UI、交互和代码实现必须保持原创。

## 2. 当前技术栈

- 前端：Next.js、React、TypeScript、CSS Modules/全局样式，运行端口默认 `3000`。
- 后端：Node.js、TypeScript API 服务，运行端口默认 `4000`。
- 数据库：PostgreSQL，Prisma 管理 schema 和 migrations。
- 队列：Redis + BullMQ，用于定时发布、失败重试和后台 worker。
- 部署：Docker / Docker Compose，生产服务器使用 `docker-compose.yml` + `docker-compose.server.yml`。
- 反向代理：Caddy/Nginx 容器，线上通过 HTTPS 访问 `app.bufferhelp.com`。
- 第三方接口：Meta/Facebook/Instagram OAuth，Google/YouTube OAuth，LinkedIn/TikTok/Pinterest/X 架构预留。
- 邮件：Gmail SMTP，用于找回密码邮件。

## 3. 前端、后端、数据库和管理后台结构

### 前端

前端位于 `apps/web`。主要能力包括：

- 登录、注册、找回密码、重置密码页面。
- 主应用布局：左侧导航、连接通道、内容编辑、排程日历、管理员入口。
- 内容编辑器：先按具体社媒账号多选，再编辑基础/平台版本文案、上传图片/视频素材；支持立即发布、北京时间 24 小时制定时发布和保存草稿。
- 连接通道页面：按平台展示账号绑定状态、添加账号、分享授权、解绑/删除记录。
- 排程日历：月视图展示任务，已支持查看详情，计划增强编辑/删除和更多任务展开。
- 管理后台：查看注册用户、工作区、绑定渠道等，需要 `ADMIN_EMAILS` 环境变量授权。
- 法务页面：`/privacy`、`/terms`、`/data-deletion`，用于 Google/Meta 审核。

### 后端

后端位于 `apps/api`。主要能力包括：

- 用户注册、登录、登出、JWT session、找回密码、重置密码。
- Workspace、成员、邀请、角色权限。
- OAuth state 生成、回调校验、token 存储和加密。
- 社媒账号绑定、多账号记录、解绑和状态展示。
- 内容、按具体账号拆分的平台变体、素材、排程任务、发布任务。
- BullMQ 队列入队、worker 发布、失败重试、错误记录。
- 管理后台 API。

### 数据库

数据库使用 PostgreSQL + Prisma。已知核心表：

- `_prisma_migrations`
- `users`
- `user_sessions`
- `workspaces`
- `workspace_members`
- `workspace_invitations`
- `social_accounts`
- `oauth_credentials`
- `oauth_states`
- `posts`
- `post_variants`
- `post_variant_media`
- `media_assets`
- `schedules`
- `publish_jobs`
- `audit_logs`

### 管理后台

管理后台路径在前端应用内，访问需要：

- 当前登录用户邮箱包含在生产环境 `ADMIN_EMAILS`。
- 如果未配置，会显示“无法访问管理员界面”。
- 管理后台不应展示用户明文密码，只能展示用户邮箱、注册时间、工作区、登录有效期、账号状态、绑定渠道、发布统计等。

## 4. 项目目录说明

常见目录结构如下，具体以当前仓库为准：

```text
D:\社媒
├─ apps/
│  ├─ api/                  # Node.js/TypeScript 后端 API
│  │  ├─ prisma/             # Prisma schema 和 migrations
│  │  └─ src/                # API routes/services/workers/integrations
│  └─ web/                  # Next.js 前端应用
│     ├─ app/                # 页面路由
│     ├─ components/         # UI 组件
│     └─ public/             # 静态资源
├─ infra/                   # Caddy/Nginx/部署相关配置
├─ scripts/                 # 生产部署脚本
├─ docker-compose.yml       # 本地/通用 compose
├─ docker-compose.server.yml# 生产服务器 compose overlay
├─ package.json             # Monorepo npm scripts
├─ package-lock.json        # 依赖锁定
├─ README.md
├─ PROJECT_HANDOFF.md
├─ TODO.md
├─ CHANGELOG.md
└─ .env.example
```

## 5. 已完成的功能

- MVP 项目结构：Next.js 前端、Node.js API、PostgreSQL、Redis、Docker Compose。
- 用户注册、登录、登出、JWT session。
- 找回密码和重置密码，Gmail SMTP 已能发送测试邮件。
- Workspace 创建、成员、邀请、角色权限基础结构。
- 中文后台界面，保留产品名 `Social Scheduler`。
- 左侧连接通道展示：Instagram、Facebook、Twitter/X、更多通道。
- 连接通道页展示所有平台：Instagram、LinkedIn、Facebook、YouTube、TikTok、Pinterest、Twitter/X。
- 平台多账号绑定架构，支持同平台多个账号记录。
- 分享授权链接，24 小时有效。
- Facebook Page OAuth 授权、绑定、解绑、重新授权。
- YouTube OAuth 授权和真实视频发布能力已经接入过；早期 `simulated: true` 已被识别为问题。
- 内容编辑器：可勾选同一平台下的多个具体账号；每个已选账号生成独立变体/发布任务，支持基础文案、平台版本编辑、图片/视频素材和发布摘要。
- 发布方式：支持立即发布、北京时间 UTC+8 的 24 小时制定时发布和保存草稿，BullMQ worker 按账号执行。
- 发布日历：月视图展示排程/已发布任务，详情侧栏展示任务状态、错误和发布链接。
- 失败重试：发布失败后记录尝试次数和错误信息。
- 法务和审核页面：`/privacy`、`/terms`、`/data-deletion`。
- 管理员页面基础实现，需要 `ADMIN_EMAILS` 配置。
- 生产部署脚本：`scripts/deploy-server.sh`。

## 6. 部分完成的功能

- Instagram 绑定：Meta 后台配置和服务器环境变量已多次调整，但 OAuth 仍不稳定。
- Facebook 对外用户发布：开发/测试用户可用，开放给所有用户需要 Meta App Review 和 Business Verification。
- YouTube 对外用户发布：管理员/测试用户可用，开放给所有用户需要 Google OAuth 数据访问验证通过。
- 排程日历编辑/删除：用户提出需求，需确认当前代码是否已完整实现。
- 管理后台：基础入口存在，但权限、套餐、审计和用户有效期管理还需要完善。
- 图片/视频发布：YouTube 视频发布应走真实 API；Facebook 图片/视频和 Instagram 媒体发布仍需继续验证。
- UI 调整：已经做过多轮中文化和布局调整，但仍有细节需要统一。

## 7. 尚未开发或未完成的功能

- 套餐、订阅、支付、用量限制。
- 团队级审批流、内容审核、品牌资产库。
- 多租户数据隔离的系统化审计。
- 平台连接失败诊断页。
- 更完整的素材库：批量上传、标签、搜索、云存储/CDN。
- 发布结果回填：每个平台真实 post id、permalink、失败类型分类。
- Instagram 完整发布链路。
- LinkedIn、TikTok、Pinterest、X 的真实 API 发布。
- 自动化测试、端到端测试、OAuth mock 测试。
- 管理员操作日志和安全审计。

## 8. 当前已知问题和报错

### Instagram

当前最大问题是 Instagram OAuth 回调/token exchange：

- `OAuth token exchange failed`
- `Invalid redirect_uri`
- `Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request`
- `Insufficient Developer Role`

历史排查发现：

- Meta 后台已填写 `https://app.bufferhelp.com/api/v1/integrations/instagram/oauth/callback`。
- 当前代码只读取 `INSTAGRAM_OAUTH_SCOPES`；`INSTAGRAM_SCOPES` 是旧变量，不应再配置。部署脚本会输出 API/worker 容器的实际 scope、回调 URL 和凭证是否已配置（不会输出 Secret）。
- 授权 URL 生成时将 `redirect_uri` 写入 OAuth state，token exchange 复用 state 中保存的同一字符串，因此同一次授权的回调 URL 保持字节级一致。

### Facebook

- 如果 App 未通过审核，非管理员/开发者/测试人员会报权限或基础模式问题。
- 发布 Page 需要：`pages_show_list`、`pages_read_engagement`、`pages_manage_posts`。
- 测试人员还必须接受邀请，并且是目标 Page 管理员。
- 绑定后若没有选择 Page，会出现 `Facebook Page was not returned`。

### YouTube

- Google OAuth 如果未完成数据访问验证，会出现 `Google hasn't verified this app`。
- 如果 Google 账号没有 YouTube Channel，会出现 `YouTube channel profile was not found`。
- 当前 Google Auth Platform 品牌已验证，但敏感范围 `youtube.readonly`、`youtube.upload` 的数据访问验证仍需确认审核状态。

### 生产健康检查

部署脚本中 `curl` 偶尔先返回 502，但随后 `/api/v1/health` 返回：

```json
{"ok":true,"service":"social-scheduler-api","database":"ok","redis":"PONG"}
```

这通常是 API/反代刚重启时的短暂 502，需要脚本增加等待重试。

## 9. 最近修改过或重点相关文件

以下文件/目录是最近开发和排查中最可能被改动的地方，新对话框应优先查看 Git 日志确认：

- `apps/api/src/integrations/oauth/`
- `apps/api/src/services/socialAccountService.ts`
- `apps/api/src/services/publish*`
- `apps/api/src/services/*youtube*`
- `apps/api/src/services/*facebook*`
- `apps/api/src/services/*instagram*`
- `apps/api/src/workers/`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`
- `apps/web/app/`
- `apps/web/components/`
- `apps/web/app/privacy*`
- `apps/web/app/terms*`
- `apps/web/app/data-deletion*`
- `docker-compose.yml`
- `docker-compose.server.yml`
- `scripts/deploy-server.sh`
- `.env.example`

## 10. 当前正在开发到哪一步

当前阶段优先处理 Instagram OAuth 一键授权绑定。代码和部署已统一使用 `INSTAGRAM_OAUTH_SCOPES`，并在部署后验证运行中容器的实际回调 URL 与 scope；下一步是上线后进行一次全新的真实授权。

## 11. 下一步最应该做什么

新 Codex 第一优先级：不要继续盲目改 Meta 后台。先在代码里完整追踪 Instagram OAuth：

1. 将最新代码推送到 GitHub，并在服务器执行部署脚本。
2. 确认部署输出中的 Instagram callback URL 为 `https://app.bufferhelp.com/api/v1/integrations/instagram/oauth/callback`，scope 为 `instagram_business_basic,instagram_business_content_publish`，凭证状态为 `configured`。
3. 再从软件“添加账号”按钮发起一次全新的授权，不能复用旧的授权链接或 callback URL。
4. 如仍失败，保存新的 Meta 错误信息和时间点，再检查 Meta 后台的测试人员角色及回调 URL。

## 12. 功能开发优先级

- P0：安全、配置、运行稳定、OAuth 关键阻塞。
- P1：Facebook/YouTube/Instagram 发布链路稳定，排程任务可靠。
- P2：用户、套餐、团队、权限、支付。
- P3：UI、体验、性能、可观测性。

## 13. 不能随意修改的业务逻辑

- OAuth `state` 生成、存储、过期和校验逻辑。
- OAuth callback 路径：`/api/v1/integrations/{platform}/oauth/callback`。
- `TOKEN_ENCRYPTION_KEY` 加密 token 的逻辑，不能换 key 后直接读旧 token。
- 发布任务状态流转：draft/scheduled/queued/publishing/succeeded/failed。
- BullMQ job idempotency，避免同一任务重复发布。
- Workspace 数据隔离和成员角色权限。
- 生产域名 `https://app.bufferhelp.com` 相关审核链接。
- 法务页面路径：`/privacy`、`/terms`、`/data-deletion`。
- 数据库 migrations 不要手工删除或改历史文件。

## 14. 不能删除的重要文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`
- `docker-compose.yml`
- `docker-compose.server.yml`
- `scripts/deploy-server.sh`
- `package-lock.json`
- `apps/api/src/integrations/oauth/`
- `apps/api/src/workers/`
- `apps/web/app/privacy*`
- `apps/web/app/terms*`
- `apps/web/app/data-deletion*`
- 生产服务器 `/opt/social-scheduler/.env`，但绝不能提交到 Git。

## 15. 第三方社媒平台接入情况

### Facebook

状态：部分可用。

- 用于 Facebook Page 发布，不是个人主页发布。
- 需要 Meta App Review 权限：`pages_show_list`、`pages_read_engagement`、`pages_manage_posts`。
- 对外开放需要 Business Verification / App Review。
- 测试用户需要：App Tester + 接受邀请 + Page 管理员 + 重新授权。

### Instagram

状态：未完成，当前阻塞。

- 当前目标是 Instagram Business Login / Instagram API。
- 需要 scope：`instagram_business_basic`、`instagram_business_content_publish`。
- 当前报错集中在 redirect_uri/token exchange 和 developer role。
- 需要修复 env 变量注入和 provider 配置一致性。

### YouTube

状态：部分可用。

- 已配置 Google OAuth Client。
- 真实 API 发布已开发过，不能回退到模拟发布。
- 外部用户需要 Google 数据访问验证通过。
- 用户账号必须有 YouTube Channel。

### LinkedIn / TikTok / Pinterest / X

状态：界面和架构预留，真实发布 API 未完整打通。

## 16. OAuth 授权和 API 配置情况

通用回调格式：

```text
https://app.bufferhelp.com/api/v1/integrations/{platform}/oauth/callback
```

已知生产环境变量类别：

- `PUBLIC_API_URL` / `API_PUBLIC_URL`
- `PUBLIC_WEB_URL` / `WEB_APP_URL`
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` / `FACEBOOK_LOGIN_CONFIG_ID` / `FACEBOOK_OAUTH_SCOPES`
- `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` / `INSTAGRAM_OAUTH_SCOPES`
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_OAUTH_SCOPES`
- 其他平台 client id/secret 预留

注意：`.env.example` 只能保留占位值，真实 `.env` 不得提交。

## 17. 定时发布、任务队列、失败重试和日志

- Redis + BullMQ worker 负责立即和未来时间的发布任务；同一内容的多个账号各有独立任务、状态和重试记录。
- 用户选择北京时间 UTC+8，前端使用 24 小时制。
- API 创建内容和发布任务，worker 到点执行。
- 失败时记录 `last_error`、尝试次数、raw response。
- 发布日历从数据库任务表读取状态。
- 需要继续完善：失败分类、手动重试、取消任务、编辑任务、删除任务、worker 监控。

## 18. 用户、套餐、权限、工作区和团队

已完成：

- 用户注册/登录/登出。
- JWT session。
- 找回密码。
- Workspace。
- Workspace 成员和角色：owner/admin/editor/viewer。
- 邀请机制基础。
- 管理员页面基础。

未完成：

- 套餐、订阅、支付。
- 用户有效期管理。
- 团队协作审批流。
- 管理员重置用户密码/禁用用户。
- 更细粒度权限。

## 19. 图片视频上传及素材库

已完成：

- 内容编辑器中图片/视频上传入口。
- 上传后预览缩略图。
- 内容预览中展示图片/视频。
- 发布任务可关联素材。

待完善：

- 云存储/CDN。
- 文件大小和格式校验。
- 视频转码。
- Instagram/Facebook 媒体发布稳定性。
- 素材库搜索、分类、批量删除。

## 20. 部署服务器、域名、数据库和环境变量

生产服务器：腾讯云 Ubuntu，当前生产目录 `/opt/social-scheduler`。  
域名：`app.bufferhelp.com`。  
数据库：Docker 容器内 PostgreSQL。  
Redis：Docker 容器内 Redis。  
反向代理：Caddy/Nginx 容器处理 HTTPS。

生产环境变量在服务器 `/opt/social-scheduler/.env`，不要提交。`.env.example` 已整理为安全占位模板。

生产部署命令：

```bash
cd /opt/social-scheduler
sudo bash scripts/deploy-server.sh
```

部署后检查：

```bash
curl -fsS https://app.bufferhelp.com/api/v1/health

docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml ps

docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml logs --tail=200 api

docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml logs --tail=200 worker
```

## 21. 本地运行命令

```bash
npm install
cp .env.example .env
# 按需填写本地 PostgreSQL/Redis/OAuth/SMTP 配置

docker compose up -d postgres redis
npm run dev --workspace @social-scheduler/api
npm run dev --workspace @social-scheduler/web
```

如果根目录提供统一 dev script，也可使用：

```bash
npm run dev
```

## 22. 测试方法

建议新 Codex 按这个顺序验证：

1. `npm install` 是否成功。
2. `npm run build --workspaces --if-present` 是否成功。
3. API 启动后访问 `/api/v1/health`。
4. 注册用户、登录、登出。
5. 找回密码：确认 SMTP 发送日志和邮件到达。
6. 管理员页面：确认 `ADMIN_EMAILS` 生效。
7. 连接 Facebook：绑定 Page，发一条测试文字。
8. 连接 YouTube：确认账号有 Channel，上传短视频。
9. 连接 Instagram：优先 debug OAuth URL 和 token exchange，不要直接反复点击旧链接。
10. 创建 2 分钟后的排程任务，观察 worker 是否执行。
11. 发布失败时检查 `publish_jobs.last_error` 和 worker logs。

## 23. 已知安全风险

- 历史聊天中曾出现真实第三方 App Secret、服务器密码、邮箱授权码等。不要把这些写入仓库。
- 生产 `.env` 可能包含真实密钥，必须确认 `.gitignore` 排除。
- 当前 token 存储依赖 `TOKEN_ENCRYPTION_KEY`，更换 key 会影响旧 token 解密。
- 管理员后台不能显示用户明文密码。
- OAuth callback 和分享授权链接要防止开放重定向。
- 上传文件需要更严格的大小、类型和恶意内容校验。
- 对外用户使用 Facebook/YouTube/Instagram 前必须完成平台审核，避免违规使用开发模式。

## 24. 需要新的 Codex 优先检查的内容

1. 部署输出是否确认 API/worker 的 `INSTAGRAM_OAUTH_SCOPES`、callback URL、凭证状态均正确。
2. Instagram 授权 URL 和 token exchange 是否均复用 OAuth state 中保存的 `redirect_uri`。
3. `.env` 是否重复定义变量，后定义是否覆盖前定义。
4. Facebook/YouTube 是否仍有模拟发布分支残留。
5. 排程日历编辑/删除是否已实现并可用。
6. 管理后台是否只允许 `ADMIN_EMAILS`，并且不会泄露密码。
7. `.env.example` 是否跟代码实际读取的环境变量保持一致。
8. Git 是否误提交过 `.env` 或真实 secret，如有需要立即 rotate。

## 25. 交接备注

本次交接不新增功能，不更换技术栈，不删除文件。目标是让新的 Codex 只读取仓库文件，就能理解当前状态，并从 Instagram OAuth/环境变量一致性开始继续排查。
