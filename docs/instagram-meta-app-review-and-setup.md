# Instagram 评论、私信与 Meta 审核清单

本文对应 Social Scheduler 的 Instagram Login 集成，仅用于配置、测试账号验证和准备 Meta App Review。不要把 Meta access token、App Secret、测试账号密码或客户消息正文提交到 Git、录屏、工单或公开聊天中。

## 审核前核对

在 Meta App Dashboard 的 Instagram API with Instagram Login / Business Login 配置中核对：

- Instagram App ID 和 App Secret 与生产环境当前配置一致。
- OAuth redirect URI 为 `https://<API域名>/api/v1/integrations/instagram/oauth/callback`，域名需替换为实际 API 公网 HTTPS 域名。
- Webhook callback 为 `https://<API域名>/api/v1/webhooks/instagram`，Verify Token 必须与服务器 `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` 完全一致；订阅 `comments` 与 `messages`。签名使用同一 Instagram App Secret 校验。
- 沿用现有 HTTPS 反向代理入口，不开放 API 容器的新公网端口。
- `INSTAGRAM_OAUTH_SCOPES` 仍保留现有发布权限。增量授权只在用户主动启用互动功能时请求额外权限；部署脚本不得覆盖服务器已有 scope 设置。

Instagram Login 需要的权限按功能拆分：

| 权限 | 用途 | 审核说明 |
|---|---|---|
| `instagram_business_basic` | 读取已连接专业账号和本软件发布帖子的基础信息 | 用户此前截图中此权限曾被拒。若 Meta Dashboard 仍显示未获批，普通用户不能据此测试生产权限；需针对真实的帖子/评论读取流程重新说明并申请。 |
| `instagram_business_content_publish` | 保留现有发帖功能 | 已有连接/发布所需 scope；本次不移除、不改为自动额外请求。 |
| `instagram_business_manage_comments` | 读取本软件发布帖的评论并公开回复 | 仅用于当前工作区、本软件保存了发布记录和 Instagram media ID 的帖子。 |
| `instagram_business_manage_messages` | 读取 Instagram 收件箱、发送评论私密回复及回复用户先发起的私信 | 普通私信不能主动发起；仅在用户先联系账号后、平台允许的消息时间窗口内人工回复。 |

本功能不申请 Insights、广告、商品标记、Facebook 评论/消息或自动化权限。Instagram Login 不要求 Facebook Page 关联；测试账号须为 Instagram 专业账号（Business 或 Creator），且对应用有 Meta 测试角色/权限。权限可用范围以 Meta Dashboard 的实际审核状态为准；请求 scope 不等同于审核已通过。

## 审核测试账号准备

1. 使用专门的 Instagram Business/Creator 测试账号，不要把个人主账号作为审核账号。
2. 将测试 Instagram 账号加入 Meta App 的可用测试角色，并按 Meta 后台要求接受邀请、允许所需权限。
3. 准备第二个 Instagram 测试用户，用它给专业账号发布一条评论，并先向专业账号发送一条私信，以便录制回复用例。
4. 在 Social Scheduler 建立独立工作区、连接测试专业账号，并让该账号通过 Social Scheduler 成功发布一条测试帖子。互动入口只对这类发布记录开放。
5. 录制前将 Social Scheduler 界面切换到 English，使用干净的测试数据。不要把真实客户姓名、评论、私信或凭证录进去。

审核员登录 Social Scheduler 所需的测试用户账号，应通过 Meta Review 表单指定的安全字段提交；Instagram 测试账号同样通过其安全测试账号流程提供。不要将用户名/密码写在本仓库或公开演示视频中。

## 建议录屏步骤

请使用未剪辑或连续、清楚可读的录屏；保持浏览器地址栏可见，以便审核员确认实际产品域名。录制时解释操作目的和每个权限如何服务于用户功能。

1. 从 Social Scheduler 登录页开始，登录审核用测试用户并打开含已连接 Instagram 专业账号的工作区。
2. 展示 Instagram 账号连接/增量授权。说明新功能只在用户主动授权后启用；原有发帖权限保留。不要使用真实账号密码或让视频显示 token。
3. 打开「Post manager」，找到刚由 Social Scheduler 成功发布的 Instagram 帖子。展开「View activity」，展示 like/comment counts、评论正文和手动刷新/分页。
4. 点击一条评论的「Public reply」，输入一条简短回复并明确点击发送；切换到第二个测试账号，展示公开回复确实出现在原帖子下。
5. 对另一条新评论选择「Private reply」，展示发送前的一次性提示，确认后发送；切换到评论者测试账号，展示消息到达 Instagram 收件箱。不要重复发送同一评论的私密回复。
6. 使用第二个测试账号先给专业账号发送普通私信。回到 Social Scheduler 的 Instagram Inbox，刷新会话、打开消息，然后由用户手动输入并点击 Reply/Send；切回测试账号展示回复。说明系统不能主动给陌生用户发起私信，并遵守 24 小时窗口。
7. 展示限制：Viewer 角色可以阅读但不能发送；非 Instagram 帖子没有互动面板；其他工具发布、Instagram 原生发布且没有本软件发布记录的帖子不会出现在本功能中。
8. 如审核员要求，演示取消授权或缺少权限时的提示。取消/不完整增量授权不会覆盖已有发布凭证；仍能继续使用原有发布功能。Webhook 未配置时页面提示实时通知不可用，但可手动刷新。

评论私密回复仅允许在评论后 7 天内尝试一次；Instagram Live 评论（如未来支持）只能直播期间处理。普通私信回复要求用户先发消息且在 24 小时窗口内。录屏应使用当前产品真实提供的流程，不要模拟审核未批准的普通用户权限。

## 数据处理及边界说明

- 评论、会话、消息和帖子互动指标按需从 Instagram API 读取，不写入 Social Scheduler 的长期数据库或分析日志。
- 评论私密回复防重复表仅保留 Social Account ID、媒体 ID、评论 ID、发送状态、Meta Message ID 和时间，不存回复正文或 access token。
- 用户明确逐条点击发送；没有自动回复、关键词触发、群发或自动重试。
- 每个请求都按 workspace、成员角色、账号和发布记录进行校验。Viewer 只读，owner/admin/editor 可发送。
- 缺少互动 scope、scope 未获批或用户取消授权只关闭对应互动操作，不把 Instagram 账号标记为整体过期，也不阻断已有发帖功能。
- Webhook 事件会校验 HTTPS callback 的订阅握手和 HMAC 签名、识别重复投递，不记录事件正文；当前收件箱仍可手动刷新。

## 代码验证（开发环境）

本分支相关测试可使用 `npx tsx --test apps/api/tests/instagramPrivateReplyState.test.ts apps/api/tests/instagramEngagement.test.ts apps/api/tests/instagramWebhook.test.ts apps/api/tests/instagramEngagementOAuth.test.ts apps/api/tests/instagramEngagementRoutes.test.ts` 和 `npx tsx --test apps/web/tests/instagramEngagementUI.test.ts apps/web/tests/instagramInbox.test.ts` 运行。生产部署和 Meta App Review 提交都需要由应用所有者另行执行。

## Meta 官方参考

- [Instagram API with Instagram Login — Meta 官方 Postman 文档](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
- [Instagram Login 的评论、消息权限与 Send API — Meta 官方 Postman 文档](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-b9dac9f7-5415-4659-bcfd-795298a07e91)
- [Business Login for Instagram — Meta 官方开发文档入口](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
