# Instagram 评论、私密回复与收件箱设计

## 目标

在 Social Scheduler 中为已连接的 Instagram 专业账号提供已发布帖子互动数据、评论管理、人工私密回复和私信收件箱，同时维持现有发布能力。

## 当前 Meta 权限背景

- 用户提供的 Meta 审核截图显示：`instagram_business_basic` 处于新申请/未获批状态；`pages_manage_posts`、`pages_show_list`、`pages_read_engagement` 已获批，`public_profile` 已更新。
- Facebook Page 权限的获批状态不代表 Instagram 新权限已获批。实施时保留现有 Instagram Login 和线上发布所需权限，不更改 Facebook 权限配置；以 Meta App Dashboard 中实际权限状态和线上 OAuth scope 为准。
- 本功能新增申请 Instagram 评论管理和消息管理所需权限：`instagram_business_manage_comments`、`instagram_business_manage_messages`。启用 Instagram Login 会话仍需要账号基础访问；原有发帖权限必须继续保留。
- 普通用户使用新功能须等相应 Meta 权限/高级访问获批并授权。审核期间仅 Meta 应用角色或测试账号可用于验证。

## 范围

- 帖子互动仅支持 Social Scheduler 已成功发布并保存 Instagram 媒体 ID 的帖子。
- 帖子数据显示点赞数和评论数；评论列表支持分页、手动刷新、公开回复和评论私密回复。
- 新增 Instagram 私信收件箱，按需读取当前已连接 Instagram 专业账号可访问的对话和消息；用户可在对话内手动回复。
- 所有发送均由用户逐条撰写并点击发送；不自动生成或发送消息。
- 消息和评论正文按需从 Meta 读取，不长期存入 Social Scheduler 数据库或日志。
- 评论私密回复的防重复状态只保存账号 ID、媒体 ID、评论 ID、发送状态、Meta 消息 ID 和时间，不保存私密回复正文；记录只服务于防止对同一评论重复发送及结果查询。
- 首版不包含 Facebook 评论/消息、自动回复、群发、陌生人主动私信、Instagram 原生或其他工具发布的旧帖、评论隐藏/删除、媒体消息、搜索/标签、营销自动化或 Insights 触达/曝光报表。

## 用户体验

- 帖子管理中的 Instagram 帖子增加互动展开区，显示点赞数、评论数和评论列表。
- 每条评论提供公开回复和“私密回复”两个独立操作；私密回复显式说明它会发送到对方 Instagram 收件箱，且发送后不能对同一评论再发第二条。
- 新增 Instagram 收件箱入口，展示对话列表、消息时间线和手动回复框；支持刷新对话及当前会话。
- 加载、无数据、发送中、发送成功、权限不足、授权过期、Webhook 未配置、超出平台时间窗口和 Meta 临时故障均提供中英文状态。
- 评论/消息功能在账号完成新增权限授权后启用。用户拒绝或取消授权时保留现有发布凭证和功能。
- 评论读取与私信读取遵循工作区成员访问控制；发送公开回复、私密回复和普通私信都只允许 owner/admin/editor，viewer 只读。

## 权限与平台规则

- Instagram 使用项目当前的 Instagram Login（`graph.instagram.com`）路径；不为此功能迁移到 Facebook Login。
- 评论读取、公开回复和点赞/评论数依赖已获批的 Instagram 基础访问及 `instagram_business_manage_comments`。
- 评论私密回复使用 Meta Instagram Messaging 能力，并要求评论管理/消息管理权限按 Meta 当前权限检查器要求同时获批；不得仅凭存在评论 ID 就绕过 Meta 的 Webhook 与消息权限要求。
- 私信收件箱及普通消息发送使用 `instagram_business_manage_messages`。普通私信只能回复先向该专业账号发送消息的用户，且遵守 Meta 的消息回复时间窗口；首版不请求 Human Agent 扩展。
- 私密回复仅针对该评论发送一条消息；评论发布后 7 天内有效，Instagram Live 评论只能在直播期间处理。过期/已发送的评论禁用私密回复按钮。
- 只申请上述功能真实需要的 Instagram 权限；Insights 触达/曝光权限不在本次申请中。

## 后端与数据流

- 扩展已发布帖子响应，返回 `PublishJob.providerPostId`，仅在工作区确认帖子属于当前用户、平台为 Instagram 后供前端引用。
- 提供工作区作用域的帖子互动 API：获取指标与分页评论，提交公开回复及私密回复。
- 提供工作区作用域的 Instagram 收件箱 API：列出对话、读取消息、手动发送消息。对话内容通过 Meta API 按需获取，不缓存到本地数据库。
- 新增 Meta Webhook HTTPS 路由，支持验证握手、签名校验、Instagram `comments` 和 `messages` 事件。沿用现有 Caddy 443/API 入口，不开放容器内部端口。
- Webhook 事件用于更新/验证评论及消息状态、识别私密回复所需的评论上下文；回调必须快速返回、处理重复投递，并避免记录完整正文和 access token。
- 为评论私密回复增加唯一键/原子状态记录，确保同一 Instagram 账号的同一评论最多发起一次私密回复；发送失败时按 Meta 返回结果保留可解释状态，禁止无条件自动重试造成重复消息。
- 所有接口校验登录身份、工作区成员、账号所有权、平台和所需 scope。缺少评论权限/消息权限只关闭对应功能，不把账号标为整体授权失效，也不阻断发帖。
- 区分权限不足、授权失效、窗口已过、重复发送、Meta 限流和网络错误；不在请求日志中记录凭证、消息/评论全文。
- 允许新增最小必要的私密回复状态数据库表及 migration；不持久化对话/消息正文、评论正文或指标。

## OAuth 与账号兼容

- 新功能单独显示“启用评论与私信”授权入口；OAuth 增量授权申请 `instagram_business_manage_comments` 和 `instagram_business_manage_messages`，同时保留当前账号所需基础访问及内容发布 scope。
- OAuth 返回/用户拒绝/回调失败时不得覆盖当前可用凭证、删除已保存的发布权限或改变账号身份；成功时更新同一 Instagram SocialAccount 的凭证与 scope。
- 现有未升级账号可继续创建、排程和发布内容；审核通过前其评论/消息功能显示待审核或权限未开通。
- `scripts/deploy-server.sh` 当前会管理 OAuth scope 配置；实现时同步调整配置/检查逻辑，使部署保留现有 scope 并包含新功能 scope，不覆盖 Meta 现有生产配置。

## 验收标准

1. 已发布 Instagram 帖子展示点赞数、评论数和分页评论；非 Instagram 帖子不出现该区域。
2. 用户可公开回复评论，回复成功后界面更新；错误时保留输入并显示具体状态。
3. 符合 Meta 条件且未过期/发送过的评论可发一次私密回复；重复、过期、直播外的 Live 评论请求被拒绝且不再调用发送接口。
4. Instagram 收件箱能列出可访问对话、读取消息；用户可回复已由对方发起且在可回复窗口内的会话。
5. Webhook 验证握手、签名校验、评论/消息事件解析及重复事件处理均有测试；伪签名请求不触发业务处理。
6. Viewer 无法发送三类回复；跨工作区、伪造 SocialAccount ID 或媒体 ID 的读取/写入被拒绝。
7. 用户未授权新 scope、取消增量授权、token 失效、Webhook 未配置或 Meta API 暂时失败时，原 Instagram 发布仍可用。
8. 同一评论并发/重复私密回复请求最多产生一次外部发送；数据库状态不包含正文、token 或多余个人信息。
9. 前后端中英文、加载/空/权限/窗口/失败状态有测试覆盖；功能能以 Meta 测试账号录制审核流程。

## 不在本次交付

- 代表用户提交 Meta App Review、操作 Meta 开发者后台或部署生产环境。
- Facebook 评论/私信、自动回复/关键词触发、群发、媒体消息、Human Agent 扩展。
- Instagram 账号未关联至本软件发布记录的帖子互动管理。
- 对话与消息历史长期存储、评论与指标长期缓存、情绪分析或数据导出。
