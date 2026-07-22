# TODO

## P0：项目无法运行或严重安全问题

### P0-1 修复 Instagram OAuth redirect_uri / scope 环境变量不一致

- 任务内容：确认 Instagram 授权 URL 和 token exchange 使用完全相同的 `redirect_uri`，并修复 `INSTAGRAM_SCOPES` 为空但 `INSTAGRAM_OAUTH_SCOPES` 有值的问题。
- 涉及文件：`apps/api/src/integrations/oauth/`、`docker-compose.yml`、`docker-compose.server.yml`、`scripts/deploy-server.sh`、`.env.example`。
- 当前状态：阻塞中，线上仍可能报 `OAuth token exchange failed` 和 `redirect_uri is identical`。
- 完成标准：容器内两个 scope 变量均有值；Instagram 授权可完成并在 `social_accounts` 写入真实账号。
- 依赖条件：Meta Instagram API 后台回调 URL 正确，测试账号/管理员权限正确。

### P0-2 确认敏感信息没有提交到 Git

- 任务内容：扫描 `.env`、日志、脚本、文档，确认没有真实密码、Token、Secret、Cookie、私钥被提交。
- 涉及文件：全仓库，重点 `.env`、`README.md`、`PROJECT_HANDOFF.md`、`scripts/`、`docker-compose*.yml`。
- 当前状态：本次已创建 `.env.example` 占位模板，但仍需查看 Git 历史是否泄露。
- 完成标准：`git status` 不包含 `.env`；`git grep` 不出现真实 secret；如历史泄露则 rotate。
- 依赖条件：拥有第三方平台后台权限和服务器权限。

### P0-3 修复部署健康检查 502 偶发误报

- 任务内容：部署脚本等待 API ready 后再检查 health，加入重试和清晰日志。
- 涉及文件：`scripts/deploy-server.sh`、`docker-compose.server.yml`。
- 当前状态：部署后常先出现 `curl: (22) 502`，随后 health JSON 正常。
- 完成标准：部署脚本最终只在 API 真失败时返回失败；短暂 502 不造成误判。
- 依赖条件：反代和 API 启动顺序稳定。

## P1：核心发布功能

### P1-1 稳定 Facebook Page 发布

- 任务内容：确认文本、图片、视频发布均走真实 Facebook API，并准确展示错误。
- 涉及文件：`apps/api/src/services/*facebook*`、`apps/api/src/services/socialAccountService.ts`、`apps/api/src/workers/`、`apps/web/app/calendar*`。
- 当前状态：Page 文本发布可用；图片/视频和外部用户依赖 Meta 审核。
- 完成标准：测试 Page 能发布文字/图片/视频；失败时显示 Meta 返回的准确错误。
- 依赖条件：Meta 权限 `pages_show_list`、`pages_read_engagement`、`pages_manage_posts` 通过审核或测试账号完整授权。

### P1-2 稳定 YouTube 视频发布

- 任务内容：确认不再走模拟发布，上传视频后返回真实 YouTube video id/permalink。
- 涉及文件：`apps/api/src/services/*youtube*`、`apps/api/src/workers/`、`apps/web/app/calendar*`。
- 当前状态：真实发布逻辑已接入，但外部用户受 Google 验证限制。
- 完成标准：测试账号可上传短视频，YouTube Studio 可见，数据库记录真实 URL。
- 依赖条件：Google OAuth `youtube.upload` 和 `youtube.readonly` 审核状态。

### P1-3 完成 Instagram 发布链路

- 任务内容：完成 Instagram 账号绑定、图片/Reels/视频发布、错误展示。
- 涉及文件：`apps/api/src/integrations/oauth/`、`apps/api/src/services/*instagram*`、`apps/web/components/`。
- 当前状态：OAuth 未稳定，发布未验证。
- 完成标准：Instagram Business 账号可绑定，至少图片发布成功。
- 依赖条件：Meta Instagram API 权限、业务账号、回调 URL 正确。

### P1-4 排程日历支持编辑、删除、展开更多

- 任务内容：日历任务未开始前可修改文案/发布时间/素材/平台，也可删除；同一天任务较多时可展开更多。
- 涉及文件：`apps/web/app/calendar*`、`apps/web/components/*Calendar*`、`apps/api/src/routes/*schedule*`、`apps/api/src/services/*schedule*`。
- 当前状态：用户已提出需求，需要验证实现完整度。
- 完成标准：未开始任务可编辑/删除；已发布任务只读；`+更多` 可展开列表。
- 依赖条件：后端 API 支持状态校验和 worker job 更新/取消。

## P2：用户、套餐、支付和团队功能

### P2-1 完善管理员后台

- 任务内容：查看用户、工作区、绑定账号、登录有效期、发布统计；支持禁用用户和调整角色。
- 涉及文件：`apps/web/app/admin*`、`apps/api/src/routes/admin*`、`apps/api/src/services/admin*`。
- 当前状态：基础页面存在，但功能不完整。
- 完成标准：管理员可管理用户和工作区，且不显示明文密码。
- 依赖条件：`ADMIN_EMAILS` 配置正确。

### P2-2 套餐和订阅

- 任务内容：设计套餐、试用期、发布数量限制、账号绑定数量限制和支付入口。
- 涉及文件：`apps/api/prisma/schema.prisma`、`apps/api/src/services/billing*`、`apps/web/app/billing*`。
- 当前状态：未开发。
- 完成标准：至少支持免费/基础/团队套餐和用量限制。
- 依赖条件：支付服务商选择。

### P2-3 团队协作审批流

- 任务内容：编辑提交内容，管理员审批后才能排程发布。
- 涉及文件：`apps/api/prisma/schema.prisma`、`apps/api/src/services/posts*`、`apps/web/app/content*`。
- 当前状态：未开发。
- 完成标准：editor 创建，admin/owner 审批，viewer 只读。
- 依赖条件：角色权限模型稳定。

## P3：界面、体验和性能优化

### P3-1 统一中文文案和布局

- 任务内容：除 `Social Scheduler` 品牌名外，登录页、后台页、错误提示全部中文化。
- 涉及文件：`apps/web/app/`、`apps/web/components/`。
- 当前状态：多数已中文化，仍需全量检查。
- 完成标准：无不必要英文文案，错误提示可读。
- 依赖条件：无。

### P3-2 增强素材库体验

- 任务内容：素材搜索、标签、批量删除、上传进度、视频封面。
- 涉及文件：`apps/web/components/*Media*`、`apps/api/src/services/media*`。
- 当前状态：基础上传和预览已完成。
- 完成标准：客户能高效管理大量素材。
- 依赖条件：存储方案确定。

### P3-3 增加平台配置诊断页

- 任务内容：在后台显示每个平台缺哪些环境变量、回调 URL、审核状态、最近 OAuth 错误。
- 涉及文件：`apps/web/app/admin*`、`apps/api/src/routes/admin*`、`apps/api/src/integrations/oauth/`。
- 当前状态：未开发。
- 完成标准：管理员不用查服务器日志也能定位配置问题。
- 依赖条件：后端暴露安全的诊断 API，不能泄露 secret。
