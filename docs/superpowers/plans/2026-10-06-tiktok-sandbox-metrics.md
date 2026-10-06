# TikTok Sandbox Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅让指定用户通过 `andypeng97` 的独立测试授权读取真实账号统计和本软件已发布的公开视频数据。
**Architecture:** 独立 OAuth state、凭证表和服务；生产账号只用于身份及帖子归属核验。复用只读 TikTok API 和现有指标展示，不复用生产凭证写入路径。
**Tech Stack:** TypeScript、Express、Prisma/PostgreSQL、Next.js/React、node:test + tsx；沿用现有依赖。
**Spec:** `docs/superpowers/specs/2026-10-06-tiktok-sandbox-metrics-design.md`（用户已确认）。

## Global Constraints

- 测试账号仅 `andypeng97`；服务端限定单一用户 ID、工作区 ID、正式 TikTok 账号 ID，且用户须为有效 owner/admin。
- 请求 scopes 固定为 `user.info.basic,video.list,user.info.stats`；不申请发布权限。
- 独立服务器配置 `TIKTOK_SANDBOX_CLIENT_ID`、`TIKTOK_SANDBOX_CLIENT_SECRET`；不返回给前端或记录到日志。
- 独立回调路径 `/api/v1/integrations/tiktok-sandbox/oauth/callback`；不替换生产密钥或现有回调。
- 不拿 display_name 当用户名；不假定不同 client 的 open_id 相同；缺少 union_id 时拒绝。
- 不下载视频原件，不持续轮询，不定时同步；只保存授权所需少量记录。
- 模拟数据、空列表、仅测试通过或仅 Sandbox 后台保存成功都不算端到端完成。

## Review Focus

1. 授权期间撤销成员权限或关闭功能：回调及后续请求均拒绝（任务 1、2）。
2. 两个回调竞争或断开与续期竞争：state 只能消费一次，旧请求不能重建已断开的凭证（任务 2、3）。
3. 生产/Sandbox 的 union_id 不可比或缺失：明确阻塞，不能退化为昵称匹配（任务 2）。
4. 请求进行中切换工作区或退出：旧统计不能落入新页面（任务 4）。
5. 正式视频记录存在但 TikTok 不返回视频：显示不可用而非零值，不用假数据完成审核（任务 3、5）。

## 测试运行约定

在仓库根目录运行 `node --import tsx --test <测试文件>`。普通测试使用虚拟 DATABASE_URL、REDIS_URL、JWT_SECRET，不加载生产 secrets。
数据库隔离测试使用专用 `SANDBOX_TEST_DATABASE_URL`，测试程序必须检查数据库名以 `_test` 结尾且不等于生产连接；未配置时报错，不静默跳过。
集成测试仅清理本次创建的 UUID 记录，禁止 reset/drop 共享数据库。执行前阅读仓库 AGENTS.md、TDD 和工作树技能。

### Task 1: 配置、访问策略及独立数据模型

**Files:** 修改 `apps/api/src/config.ts`、`.env.example`、`apps/api/prisma/schema.prisma`；新增 `apps/api/prisma/migrations/20261006000100_tiktok_sandbox_metrics/migration.sql`、`apps/api/src/services/tiktokSandboxPolicy.ts`、`apps/api/tests/tiktokSandboxPolicy.test.ts`。
**Interfaces:** `assertTikTokSandboxAccess(input): void` 接收 enabled、配置的 userId/workspaceId/accountId、实际三项 ID、memberStatus、role，失败抛 403；成功无返回值。

- [ ] 先写测试并运行：默认关闭、缺配置、任一 ID 不同、disabled 成员、editor/viewer 均抛 403；仅全部匹配且 active owner/admin 通过。确认因缺实现失败。
- [ ] 新增配置 `TIKTOK_SANDBOX_ENABLED=false`、`TIKTOK_SANDBOX_ALLOWED_USER_ID`、`TIKTOK_SANDBOX_WORKSPACE_ID`、`TIKTOK_SANDBOX_SOCIAL_ACCOUNT_ID` 和两项独立密钥。禁用时空配置不影响生产启动；启用但配置不全时接口拒绝，不泄露字段值。
- [ ] 新增 `TikTokSandboxCredential`（user/workspace/socialAccount 外键、clientKey、openId、unionId、encrypted tokens、scopes、expiresAt、refreshTokenExpiresAt、revision UUID、timestamps，socialAccountId 唯一）。新增 `TikTokSandboxOAuthState`（stateHash 唯一、相同关联、clientKey、expectedUnionId、redirectUri、expiresAt、createdAt）。不向 SocialAccount/OauthCredential 添加 Sandbox 记录。
- [ ] 实现策略，运行测试、`npm run db:generate -w apps/api`、`npm run lint -w apps/api`；验证迁移只新增表、索引和关联，不删改生产数据。
- [ ] 提交该任务指定文件：`feat: isolate TikTok sandbox configuration and storage`。

### Task 2: 身份核验和一次性 OAuth

**Files:** 新增 `apps/api/src/integrations/oauth/tiktokSandboxOAuth.ts`、`apps/api/src/services/tiktokSandboxAuthorizationService.ts`、`apps/api/src/routes/tiktokSandboxRoutes.ts`、`apps/api/tests/tiktokSandboxAuthorization.test.ts`、`apps/api/tests/tiktokSandboxIsolation.integration.test.ts`；修改 `apps/api/src/app.ts`。
**Interfaces:** `startSandboxOAuth(userId, workspaceId): Promise<{authorizationUrl:string}>`；`completeSandboxOAuth({state,code?,error?}): Promise<void>`；`readTikTokIdentity(token): Promise<{openId:string,unionId:string}>`。使用依赖注入便于真实逻辑测试。

- [ ] 写失败测试：creator_username 非 andypeng97、空 union_id、生产 open_id 不符、Sandbox token/profile open_id 不符、union_id 不符、缺任一 scope、state 过期或重放、用户拒绝、途中角色失效，均不写测试凭证也不写正式凭证。运行确认失败。
- [ ] 身份读取调用固定 TikTok HTTPS API、10 秒超时；严格校验响应，不透传原始 token/error payload。生产 Creator Info 只读核验用户名，再获取 open_id/union_id；不得为了完成测试修改生产授权状态，若必须正常续期则单独记录该原因。
- [ ] state 使用 32 字节随机值，仅保存 SHA-256 hash，10 分钟有效；绑定允许身份及当前 clientKey。开始新授权时串行失效同账号旧 state。
- [ ] 回调原子删除并取得 state，错误也不能重放；重新检查开关、配置和成员资格，再交换 token/核验身份。最终在账号级数据库锁内再次鉴权并原子保存加密测试凭证。对绑定用户的登录会话失效需重新开始授权。
- [ ] 注册 `POST /workspaces/:workspaceId/tiktok-sandbox/oauth/start`（requireAuth）及专用 callback（不走 `:platform` 通用回调，注册顺序优先）。回调只重定向固定 WEB_APP_URL dashboard，结果为固定状态码，不含 token/code/state。
- [ ] API 访问日志对该 callback 隐去完整 query，防 code/state 被 morgan 记录；新增脱敏测试。后台按授权操作清理过期 Sandbox state，不新增定时扫描。
- [ ] 用专用 PostgreSQL 测试并发 callback：只有一个交换/保存；前后正式凭证及账号状态相等，生产 OAuth state 不受影响。运行单元和集成测试为绿后提交：`feat: add isolated TikTok sandbox OAuth`。

### Task 3: 只读查询、续期和断开

**Files:** 新增 `apps/api/src/services/tiktokSandboxMetricsService.ts`、`apps/api/src/integrations/social/tiktokSandboxCredentialService.ts`、`apps/api/tests/tiktokSandboxMetrics.test.ts`；扩展任务 2 的路由、隔离集成测试。必要时从 `tiktokPostMetricsService.ts` 提取不改变生产语义的纯帖子资格校验函数及回归测试。
**Interfaces:** `getSandboxAccessToken(userId,workspaceId): Promise<{accessToken:string,openId:string}>`；`getSandboxStats(userId,workspaceId): Promise<TikTokAccountStatsResult>`；`getSandboxPostMetrics(userId,workspaceId,scheduleId): Promise<TikTokMetricsResult>`；`disconnectSandbox(userId,workspaceId): Promise<void>`。

- [ ] 失败测试：跨工作区/账号、模拟或未成功帖子、私密视频、非数字视频 ID 均拒绝；缺权限、限流、超时、空结果不转换为零；Sandbox openId 用于账号统计，不用生产 openId。
- [ ] 实现 GET `.../tiktok-sandbox/status`（仅元数据）、`.../stats`、`.../posts`（每页最多 20 条、游标分页）、`.../posts/:scheduleId/metrics` 和 DELETE `.../connection`。所有路径以 `/workspaces/:workspaceId` 开头，鉴权且 no-store；未被允许者不获得账号信息。
- [ ] 仅显式测试路径使用测试 token；现有生产数据路由与发布任务不改选 token 规则。帖子选择和指标查询均独立核验真实发布记录及当前正式账号归属。
- [ ] 续期前核验 clientKey、绑定账号、当前权限；用独立账号级锁重新读取凭证，临近过期 60 秒时续期。使用 Sandbox client，轮换 access/refresh token、实际 scopes 和到期值；provider open_id 若返回必须匹配，缺必需权限拒绝。失败不改生产状态，明确要求重新测试授权。
- [ ] 断开在同一锁内删除 Sandbox 凭证及未完成 state；用 revision 防止在途刷新回写。失败重试不得重建断开连接。测试 client 变更、禁用后访问及并发续期只交换一次。
- [ ] 集成断言：续期和断开均不改变正式凭证/状态，测试连接不在正式渠道列表、不增加 publish jobs；运行全部相关测试后提交：`feat: read TikTok metrics through isolated sandbox credentials`。

### Task 4: 受限测试面板及说明

**Files:** 新增 `apps/web/components/channels/TikTokSandboxPanel.tsx`、`apps/web/tests/tiktokSandboxPanel.test.ts`；修改 `apps/web/app/dashboard/page.tsx`、必要的 `apps/web/lib/types.ts`、`README.md`；复用 `TikTokAccountStatsSummary`、`TikTokMetricsSummary`。
**Interfaces:** `<TikTokSandboxPanel token={token} workspaceId={workspaceId}/>`；使用任务 2、3 路由，仅后端确认 eligible 时展示。

- [ ] 先测试：eligible=false 不渲染入口；eligible=true 显示“TikTok Sandbox 数据测试 / TikTok Sandbox metrics test”、andypeng97、只读提示；错误非零值；再实现并验证。
- [ ] 面板提供连接/断开、账号刷新、已发布帖子选择与指标刷新；stats 不自动请求，无 polling；不展示 token、unionId、client secret。不将 Sandbox 加入发布选择器。
- [ ] 根据 workspaceId/token 重建组件，取消/忽略旧请求，断开立即清空数据。浏览器验证切换工作区、退出和重复点击；不能用 SSR 测试冒充交互验证。
- [ ] README 写明配置变量、独立 callback、密钥安全注入、权限未批准时生产账号行为不变；测试完成后的禁用方式和阻塞条件。运行 web 测试及 lint 后提交：`feat: expose restricted TikTok sandbox metrics panel`。

### Task 5: 全量验证、部署及真实账号验收

**Files:** 新增 `docs/tiktok-sandbox-verification.md`，记录脱敏结果、提交号、迁移/构建/验收状态，不记录密钥或真实 token。

- [ ] 运行 `node --import tsx --test apps/api/tests/*.test.ts apps/web/tests/*.test.ts`、专用数据库集成测试、`npm run lint`、`npm run build`、`git diff --check`。所有失败必须如实报告；按所选执行技能完成独立审查并修复。
- [ ] 检查服务器 tracked dirty 状态和当前提交；建立仅服务器可读、可验证的数据库备份；禁止输出备份内容。只快进更新，不执行含 reset --hard 或重写环境变量的旧部署脚本。
- [ ] 保存旧镜像回滚引用，先构建 api/worker/web，使用项目现有 compose 两文件运行 `api npx prisma migrate deploy`。测试开关保持关闭，再更新三项应用服务；检查公网 health、迁移状态及页面。
- [ ] 只读查得指定正式账号、允许用户和工作区 ID；若找不到明确匹配的 andypeng97 绑定则停止并请求用户连接。用受限服务器配置方式注入 Sandbox secret，保留全部生产 env；若涉及用户手动填密钥，交接而不要求聊天发送。
- [ ] 在 TikTok Sandbox 增加独立 callback URI 并保留原 URI；启用指定身份的测试入口，不修改 Target users 中其他账号或 Production。核对生产配置和凭证未被测试流程改写。
- [ ] 用户本人完成 andypeng97 授权。实测账号四项统计及至少一个该账号本软件已发布公开视频的四项指标，显示取得时间；与平台界面对照，允许平台指标延迟但不能伪造。
- [ ] 若身份不可比、无合格视频、TikTok 拒绝或缺登录配合，记录具体阻塞，保留生产配置并请求所缺操作，不宣称完成；不得自动公开发布视频。
- [ ] 验收通过后记录结果和录屏入口；测试完成需禁用时关闭开关，必要时回退旧镜像，新增表保留。提交文档：`docs: record TikTok sandbox deployment verification`。

## 执行方式已确认

用户已选择 Native：由当前助手顺序实现，最后独立审查。
基线已验证：现有 193 项 API/web 测试通过。工作区隔离方式待用户选择，产品代码尚未修改。
