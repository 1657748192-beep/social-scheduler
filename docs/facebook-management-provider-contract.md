# Facebook 管理／互动接口契约核对

核对日期：2026-10-16；新增功能候选版本：Graph v26.0，必须在新配置中显式设置。未修改线上版本、权限、配置或授权。仅本地实现记录，不代表本应用已获高级访问或真实投递通过。

## 官方来源与边界

以下正文已在登录的内置浏览器读取；普通 web 抓取多次返回 429，不以失败抓取作为文档内容。

| 用途 | 官方来源 | 已核对的契约 |
| --- | --- | --- |
| BM 列表 | https://developers.facebook.com/docs/graph-api/reference/user/businesses/ | GET `/{user-id}/businesses`，v26.0，data 为 Business 列表，支持 paging；`permitted_roles` 描述用户在 BM 的角色，不是 Page 操作权限。 |
| BM 自有主页 | https://developers.facebook.com/docs/marketing-api/reference/business/owned_pages/ | GET `/{business-id}/owned_pages` 返回 Page 列表和 paging；目录只 GET，不调用认领主页 POST。 |
| BM 客户主页 | https://developers.facebook.com/docs/marketing-api/reference/business/client_pages/ | GET `/{business-id}/client_pages` 返回被授予访问的客户主页；`permitted_tasks` 是可分配任务，不能证明当前用户已有任务。 |
| 当前用户主页及 token | https://developers.facebook.com/documentation/pages-api/getting-started | 用户 token 查询 `/{user-id}/accounts`；示例包含 Page ID/name/access_token/tasks。以该规范 ID 与已绑定发布账号关联，不按名称或浏览器 profile ID。 |
| 权限用途与依赖 | https://developers.facebook.com/docs/permissions/ | business_management 用于 BM 资产访问，依赖 pages_read_engagement/pages_show_list；pages_show_list 用于主页列表；pages_read_user_content 用于用户评论等内容；pages_manage_engagement 用于评论管理；pages_messaging 用于主页 Messenger；pages_manage_metadata 用于订阅。权限授予不等于拥有主页任务或高级访问。 |
| 评论 | https://developers.facebook.com/documentation/pages-api/comments-mentions | Page token；GET `/{page-post-id}/comments`，示例字段 id/message/from/created_time；公开评论／回复走 comments edge，不使用个人身份，不执行指南里额外提及、私密回复等非本期用途。任务要求涉及 MODERATE/CREATE_CONTENT，需按实际能力失败关闭。 |
| 主页 Webhook | https://developers.facebook.com/documentation/pages-api/webhooks-for-pages | 应用级 Page 对象订阅 + Page 级 subscribed_apps 都需要；feed 与 messages 独立；Page token 与 pages_manage_metadata/pages_show_list，messages 另需 pages_messaging。GET 检查，明确用户操作才 POST，且保留已有订阅字段。 |
| 会话与消息 | https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations | Page token、MESSAGING 或 MODERATE；pages_manage_metadata/pages_read_engagement/pages_messaging；GET `/{page-id}/conversations?platform=messenger`，会话 messages 字段、单消息详情字段 id/created_time/from/to/message；非角色用户数据需要高级访问。 |
| 人工发送 | https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages | POST `/{page-id}/messages`，recipient.id 为 PSID、messaging_type=RESPONSE、message.text；成功包含 message_id/recipient_id。不能把 Facebook 登录的 app-scoped user ID 当收件人。 |

## 实现决策和剩余核对点

- 只采用权限参考中的真实名称 `pages_read_user_content`；中文 AI 翻译的部分指南显示 `pages_read_user_engagement` 或 `pages_manage_read_engagement`，不能据此申请不存在或未确认的权限。
- 第一版继续使用已批准设计的保守 24 小时、用户真实入站消息、人工文字回复规则。不因较新指南存在其他窗口开启方式/广告 7 天例外而扩大本期发送资格。
- 会话指南显示部分场景存在消息详情读取限制，UI 不承诺完整历史；API 的实际结果与权限错误优先，不编造缺失正文。接收时间、读取时间、上游可见范围分别呈现。
- Page 参考已核对 id/name/link/picture：https://developers.facebook.com/docs/graph-api/reference/page/ 。目录只保留安全的 HTTPS 主页和头像链接，不把 BM 可分配任务当作用户授权。
- debug_token 参考已核对 app_id/is_valid/profile_id/scopes/granular_scopes/expires_at：https://developers.facebook.com/docs/graph-api/reference/debug_token/ 。使用显式注入的新应用认证检查，并用 Page token 的 /me 身份核对目标主页；不依赖未列出的 type 字段。任务 6 若复用旧 adapter 的扩展 fields，仍须先核对 Conversation/Message/Comment 参考。
- 主页 token 始终来源于新用户授权；不从原 OauthCredential 拷贝。新登录配置与原发布、旧互动配置 ID 必须不同。
- 同一个 Meta app 下 grants 可能共享；不调用全应用权限删除，不保证上游授权完全物理隔离。任何外部配置/实际同意流程须单独确认范围。
- 读取错误 190/200/限流等按安全分类返回，不能用空列表掩盖。所有 Graph 外部请求固定 host、Bearer header、10 秒超时，禁重定向、不跟随 paging.next 里的任意 URL。

## 验证记录

- Docker 恢复后的原始基线：476/476、0 skipped。
- 新配置真实断言 RED：4 个失败；实现 GREEN：4/4。补充容器 API_PUBLIC_URL 用例 RED→GREEN，最终 5/5。
- 加配置后的完整回归：481/481、0 skipped；API TypeScript 构建通过。
- 目录适配器：真实断言 RED 7 项，GREEN 7/7；完整回归 488/488、0 skipped，API TypeScript 构建通过。覆盖 21 个主页分页、恶意链接、游标循环、限流、并发限制及 token 身份检查。
- 本文件未进行真实 Meta 读取／发送、配置变更、权限审核或云端部署。

## 互动字段复用核对（任务 6）

- 官方 Conversation 参考列出 id/participants/updated_time/messages；Message 参考列出 id/from/to/message/created_time。已读取 https://developers.facebook.com/docs/graph-api/reference/conversation/ 与 https://developers.facebook.com/docs/graph-api/reference/message/ 的 v26.0 正文。
- https://developers.facebook.com/docs/graph-api/reference/object/comments/ 明确支持 filter=stream（各层评论含回复）、游标分页，读取评论编号和公开回复要求 MODERATE；回复需要 pages_manage_engagement。新评论能力不会把 CREATE_CONTENT 单独当作 MODERATE。
- https://developers.facebook.com/docs/graph-api/reference/comment/ 当前字段列表未列 object；新服务不调用旧 getComment 的 object{id} 请求，而通过已核验原帖的 comments edge 查找目标评论，无法核对则拒绝回复。
- 新服务不复用旧 inspectCapabilities 对 debug_token.type 的假设；使用新 token 身份检查及真实 scopes/tasks，再由实际 API 错误决定可用性。
