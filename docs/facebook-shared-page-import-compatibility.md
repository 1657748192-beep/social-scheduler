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
