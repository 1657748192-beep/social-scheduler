# 账号详情：中文授权功能展示

## 范围与真实性

- 仅改网页展示，使用现有账号 DTO 和 Facebook 独立管理只读接口；没有新增 API、权限申请、凭据续期、数据库结构或 Worker 变更。
- 宽版弹窗顶部展示真实账号资料、连接状态、绑定时间。绑定记录时间不冒充平台审核通过或最近授权时间。
- 以每个账号自己的 `credential.scopes` 解释中文功能，不使用应用配置的默认权限，也不把 `capabilities.scopes` 或“已连接”当作已授权依据。没有记录显示“待核实”；有记录但不含对应范围显示“未记录授权”。
- 明确失效 / 过期状态显示“授权已失效”；断开、权限异常、访问凭据过期或缺记录显示“待核实”，此页面不为核实而续期凭据。有效访问凭据不因续期凭据过期就被误报为当前授权已失效。
- 功能范围分平台展示：TikTok 基础资料、直接发布、统计、公开视频、主页资料和草稿上传；Instagram 资料、发布、评论、私信；YouTube 频道资料、上传发布和视频读取；Pinterest 资料、Pin 读写、画板读写；Facebook 发布、主页资料和主页列表。
- Instagram 评论和私信卡片明确说明当前软件未开放入口。展示已记录的授权不承诺所有平台功能均已在软件提供，也不保证平台实时可用。
- 英文权限名、平台账号 ID、凭据到期及更新时间折叠至“技术详情”；访问密钥从未提供给本组件，不显示或记录密钥。保留原查看主页、刷新资料、统计展开和解绑流程。

## Facebook 独立管理

- 仅在打开有效 Facebook 公共主页详情时依次 GET `/facebook-management/status`、现有分页 `/pages`、精确匹配的 `/pages/:managedPageId/capabilities`。不调用目录刷新、选择连接、授权、通知启用、回复等写接口。
- 同时验证 `publishingAccountId`、`pageId`、`selectedManagedPageId`；不能通过相同名称、相似编号或未选连接借用其他主页权限。
- 发布授权卡片与独立管理的评论 / 私信读取、回复卡片分开。独立管理使用“已核实可用”“权限或角色受限”“待核实”“授权已失效”，不把角色限制等同于用户缺少某个 scope。
- 核验失败、缺配置、无匹配连接及未知返回不会显示绿色成功，也不修改发布授权；明确提示状态不证明真实 Webhook 投递，私信受 Meta 回复窗口等规则约束。
- 详情组件按 token、工作区、账号、平台编号、状态隔离；卸载时终止请求并忽略迟到结果。刷新权限状态只重复 GET，不重连或替换凭据。

## 测试与界面核对

- 修改前现有账号管理与同步相关 15 项测试通过。
- 新增功能用例先在旧实现中因缺少中文功能卡片等失败，再实现；初次相关回归 23/23，通过默认完整 `npm test` 581/581、0 失败 / 跳过，184266.2199ms。
- 追加只读用户键盘可访问性测试，先复现 Tab 被旧焦点循环困在关闭按钮，再把原生 `summary` 纳入焦点循环。追加后相关测试 24/24 通过。
- 新增九项用例覆盖各平台范围、缺记录 / 过期状态、Facebook 精确关联与纯 GET、同名 / 未选连接拒绝、独立授权失败不影响发布记录、迟到结果隔离、查看者无写控件和键盘可达。
- Playwright 使用本地生产网页和合成 API 响应，明确标注“演示”“非真实授权”；没有访问生产社交账号、Meta 或 TikTok，也不把模拟权限状态作为线上证据。
- 已核对 1440px 桌面和 390px 手机布局。手机弹窗宽 366px，内部 `scrollWidth=clientWidth=364`，页面无横向溢出；技术详情默认折叠，Escape 关闭并恢复详情按钮焦点。
- 截图：`output/playwright/account-details-tiktok-desktop.png`、`account-details-tiktok-mobile.png`、`account-details-facebook-desktop.png`。
- 最终键盘修复版默认完整 `npm test` **582/582 通过，0 失败 / 跳过**，148999.2809ms；本机日志 `SocialSchedulerTools/account-details-final-tests.log`。最终网页生产构建退出码 0，日志 `account-details-final-build.log`。
- 最终生产构建的真实浏览器验收：查看者打开无主页链接的 Instagram 演示账号后，Tab 从关闭按钮到达原生“技术详情” summary，Enter 可展开，且无解绑控件。原桌面、手机和 Facebook 分区布局已查看截图核对。截图与浏览器数据均为本地合成，不是线上账号状态。
- 此功能尚未部署，未推送或修改腾讯云服务，API / Worker 均未重启，现有权限、凭据、排程保持不变；后续上线仅需更新网页。未创建收费资源。

## 权限含义参考

- TikTok: https://developers.tiktok.com/docs/en/tiktok-api-scopes/
- YouTube: https://developers.google.com/youtube/v3/docs/videos/insert
- Pinterest: https://developer.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- Meta 范围沿用仓库现有 Instagram OAuth 配置和 Facebook Page 发布校验；互动可用性以已有独立管理后端核验结果为准，不在前端另造规则。
