# 分享链接主页导入：授权兼容性门槛

检查日期：2026-10-20。publishingConfigId：1748083276619458。

`liveAuthorizationReady=false`。本地实现和模拟验证可以继续，真实普通客户接入不能据此宣称成功。

- tokenTypeEvidence：本次实施前已只读看到 Meta 控制台将发布配置标注“系统用户访问口令”；未在本轮发起新的真实授权，也没有证明当前兑换结果为 USER。
- directoryStrategy：现有代码只接受经 debug_token 验证的同 app USER 身份，经 me/accounts 取得并验证 PAGE 凭据；不将 SYSTEM_USER 当 USER，不改为未经证明的资产目录。
- nonRoleUserEvidence：无非应用角色账号完成该配置授权的证据。此前控制台显示 business_management 为准备测试，其余主页列表／读取／发帖权限可发布。应用发布成功不能替代此验证。
- 官方参考：[Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/)、[访问级别](https://developers.facebook.com/docs/graph-api/overview/access-levels/)。本轮官方页面读取返回 429，未从第三方摘要补作官方结论；后续真实兼容性验证仍需核对当前文档和实际受控响应。
- 安全测试：新增 SYSTEM_USER 拒绝用例，检查其不能进入 me/accounts 发现；这是对现有安全行为的回归基线，不是新功能的 RED→GREEN。

blockers：口令类型与当前发现策略未证明兼容；business_management 普通用户权限未证明可用。解决需要单独方案／批准，不静默换 Login Config、放宽类型校验、申请新 scope 或更新发布凭据。

本轮不生成真实邀请、不发帖、不部署、不重启线上服务。

## 后续已批准的独立配置（2026-10-20）

用户明确批准后，在原应用 `1013567811268870` 内创建 `Social Scheduler Page Import`，配置编号 `1659564855841697`。Meta 显示创建成功，返回列表后确认与原三个配置共存。向导选择常规登录、用户访问口令；仅选择 `pages_manage_posts`、`pages_read_engagement`、`pages_show_list`（后者由依赖自动加入），未选 business_management、评论或私信权限。成功凭证保存在 `output/playwright/facebook-page-import-config-created.png`。

原发布配置 `1748083276619458` 未编辑或替换；无新权限审核申请，无真实账号授权、生产凭据更新、排程操作、部署或服务重启。`liveAuthorizationReady=false` 继续保留：后续须独立接线及真实非应用角色授权验证，不能将配置创建成功当作普通客户接入成功。

### 专用配置接线（本地代码）

按用户后续确认，新增 `FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID`，仅独立分享导入 runtime 读取；空值／非数字格式返回 503，绝不回退 `FACEBOOK_LOGIN_CONFIG_ID` 或普通 scope 方式。现有普通同步、绑定、发布和互动配置不修改；沿用原 app／secret 和原回调，不新增权限。配置编号不写成代码默认值，示例配置保持空值并注明需要显式设置 `1659564855841697`。

新增真实 Prisma／Redis runtime 隔离测试，已观察到修改前读取原发布配置和缺配置不拒绝的失败，再最小修改到通过；针对性 10/10。测试会话使用专用编号，旧同步 URL 仍为 `1748083276619458`，旧账号／凭据／排程快照不变。仅生成 URL，不向 Meta 发请求。

最终完整 `npm.cmd test`：984/984，失败／取消／跳过均为 0，510644 ms，退出码 0，日志 `C:/Users/Administrator/AppData/Local/SocialSchedulerTools/facebook-page-import-config-full.log`。完整 API＋网页 `npm.cmd run build` 退出码 0，日志 `facebook-page-import-config-build.log`；`git diff --check` 通过。既有多 lockfile、react-test-renderer 弃用和 CRLF 提示仍保留，无依赖更新或检查豁免。

当前工作区没有 `.env` 或 `apps/api/.env`，本轮不凭空创建含凭据的环境文件、不修改腾讯云环境；真实运行环境仍待单独批准后显式配置并部署。代码隔离完成不代表线上已启用或真实非应用角色授权已验证。

### 腾讯云部署前只读预检（2026-10-20 03:39 UTC）

既有 TAT 通道可用，唯一目标 `lhins-qkg26b57`，metadata 实例身份符合 allowlist。只读命令 `inv-ga4u7xg16b` 成功退出 0，无迁移、推送、环境写入、镜像切换或服务重启。线上 API revision 为 `b10eff5d8d507cc75f3a1090fbc9ae09b6c84cc1`，网页为 `5408d1011c910cb1ceef548871482a7d92f7170b`；Worker 启动时间仍为 `2026-10-13T06:01:58.401954871Z`，数据库／Redis 容器保持运行；公共 health 返回 database ok、Redis PONG。旧发布配置仍为 `1748083276619458`，专用导入配置尚未传入，两个新表均不存在。受保护发布数据仅在服务端生成 HMAC 摘要，未输出凭据或帖子正文。

预检发现部署前缺项：`docker-compose.server.yml` 尚未给 API 传入新专用配置，需要仅补 API 环境映射；不能使用会重启 Worker、重写旧环境的一键部署脚本。当前分享邀请入口面向工作区管理员，而真实非应用角色授权尚未验证。为满足未验证前不向普通客户开放的发布门槛，建议先另行确认平台管理员专用试运行限制，再部署 API／网页和仅新增表迁移。此限制尚未实施，本轮线上仅做只读预检，未宣称部署完成。

### 后续获批的管理员试运行

用户确认受限试运行及部署后，提交 `5332ca69e8842e8a104a647cda2b75434904187c`：前端三个分享导入入口以 `isPlatformAdmin===true` 隐藏／显示；后端所有私有操作读取数据库当前用户邮箱并校验原有平台管理员名单，同时保留工作区管理身份和会话校验。外部授权仅检查邀请创建人仍符合管理员资格，不要求授权人登录本软件。仅 API 的 Compose 环境新增专用配置映射，Worker 不传入此项。

新用例先复现普通工作区所有者可创建／读取邀请、失去平台资格仍可查看／确认，以及环境项未传入 API，再最小修改到通过。真实 HTTP 对普通所有者六个私有端点均验证 403，包含 JWT 中错误携带管理员邮箱也不能越权；管理员完整受控授权流程正常，旧发布快照不变。针对性 31/31；最终完整 npm test 为 989/989、失败／取消／跳过均为 0、478562 ms、退出码 0（`facebook-page-import-trial-full.log`），API／网页构建退出码 0（`facebook-page-import-trial-build.log`）。既有工具弃用／lockfile／CRLF 提示未掩盖。已推送该提交，TAT 准备命令 `inv-ja4wwtgtb6` 已发出；此处尚未把部署准备等同于服务切换成功。

线上管理员名单预检确认为仅既有账号（只输出单一预期管理员布尔值，不新增名单）；部署保留原 API 容器的完整环境，仅追加专用配置到私有 release override，不重写原 `.env`／`.env.sandbox.local`。只读预检的凭据摘要在正常续期间会变化，故构建期间不恢复任何旧数据；在短时迁移和切换前重取保护快照比较。回退仅恢复旧 API／网页镜像和原环境，保留新增表，不重启 Worker，不逆向恢复凭据或排程。

### 管理员试运行部署结果（2026-10-20）

- 准备命令 `inv-ja4wwtgtb6` 于 05:14:23 UTC 成功退出 0：API／网页镜像构建完成，只允许新增表迁移待执行，实际迁移完成，原发布记录 HMAC 快照和保护容器校验通过。
- 激活命令 `inv-ja4x12020c` 于 05:14:55 UTC 成功退出 0。API／网页均核对 revision `5332ca69e8842e8a104a647cda2b75434904187c`；只重建这两个容器。切换时一次短暂 502 后 health 恢复，所有后续验证通过，无回退。
- `API_ENVIRONMENT_ONLY_DEDICATED_CONFIG_ADDED`：实际 API 环境与原容器逐项比较，仅新增 `FACEBOOK_PAGE_IMPORT_LOGIN_CONFIG_ID=1659564855841697`。原发布配置、密钥、互动开关及两个环境文件保持不变。
- `ORDINARY_MANAGER_IMPORT_ACCESS_DENIED`：使用线上真实普通工作区管理员会话信息调用服务端访问校验，确认拒绝；不生成客户登录凭据。私有接口匿名 401、公开 exchange 缺少有效 Origin 时 403；公开页面 no-store／no-referrer／CSP 响应头及新网页 manifest 与容器一致。
- 新 migration 存在且完成，runtime 构造成功。切换前后 SocialAccount、OauthCredential、TikTokSandboxCredential、Post、PostVariant、Schedule、PublishJob 的完整 HMAC 快照相同。该比较针对部署短窗口，不冻结之后的正常后台续期或既有自动资料同步。
- Worker 容器 `3cbc3bed81805673ee7a949da9fcefefecc3619761d68e5eb25da50344f97e5e`、镜像和 `2026-10-13T06:01:58.401954871Z` 启动时间未变；Postgres、Redis、reverse-proxy 的 ID／镜像／启动时间也均未变。
- 浏览器软件会话过期后，使用浏览器已自动填入的信息完成一次普通登录（未读取／保存密码）；管理员社交账号页显示分享导入按钮与空任务列表，没有读取错误。仅打开说明弹窗，未点“确认生成链接”，未创建真实邀请、进行 Meta 授权、导入主页、发帖或排程。截图 `output/playwright/facebook-page-import-trial-deployed.png`，内置浏览器 tab 11 保留供后续操作。

服务端留证及回退目录：`/opt/social-scheduler-releases/meta-inbox-5332ca69e8842e8a104a647cda2b75434904187c`。`images.yml`、`rollback.yml`、`api-environment-before.json` 包含同机已有环境，只保留在服务器权限受限目录，不复制到聊天或仓库。后续部署／回退应使用该目录的既有 override，不能运行一键部署或重写旧环境。真实 Facebook 外部账号授权及新增主页导入仍待用户亲自验证；`liveAuthorizationReady=false` 未改，普通客户入口保持关闭，不能将本次部署成功等同于真实非应用角色授权通过。
