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
