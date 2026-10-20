# 分享链接导入公共主页：本地验证记录

日期：2026-10-20。实施范围：已批准设计及计划中的本地 API／网页功能；本轮不部署、不推送、不重启线上 API／Worker、不发帖／回复／创建排程、不生成生产分享链接。

## 已实现

- 独立邀请、24 小时分享链接、官方授权接收加密候选、创建人待确认列表、搜索／多选／最多 50 个、二次确认导入、撤销及结果回执。
- 对方无需软件账号，只能完成授权，不能查看工作区、候选或确认导入。
- 只为勾选的新 Page ID 创建发布账号和新凭据；已有主页（包括断开、同名及共同管理）跳过。普通绑定旧 upsert 与旧分享语义未修改。
- 一次性 state／浏览器 flow、邀请版本、创建人当前资格、Meta 删除 fence、过期清理、原应用去授权／删除联动；成员移除／降级会使未完成邀请失效。
- 仅新增两个数据库表及索引，迁移只应用到本机独立 `facebook_engagement_test`，未对生产库执行任何迁移。
- 公开页面 fragment 在浏览器加载后移除，不自动启动 OAuth；公开 JSON 解析错误在全局日志前脱敏，非法／重复新 state 不进入旧覆盖式回调。

## 已完成的分项证据

- 初始全量基线：948/948，零失败／跳过，474456 ms，`facebook-shared-baseline.log`。
- Task 1：5/5 Graph 安全回归；SYSTEM_USER 不冒充 USER。
- Task 2：2/2 邀请摘要／期限和新会话访问；API 构建通过。
- Task 3：9/9 新内核与原本人同步回归，包括断开旧记录、并发和失去会话。
- Task 4：9/9 浏览器 flow／外部 OAuth／Graph 回归；后续增加过期 flow 与实际 Redis 限流测试。
- Task 5：9/9 确认／并发／旧同步测试；数据库提交响应丢失后重试返回同一回执。
- Task 6：34/34 新生命周期与原 Meta 删除／grant fence 回归。
- Task 7：初轮 6/6 公开／私有 HTTP、日志、公开页面及原同步回归；后续新增畸形 JSON、重复 state 参数拒绝测试，RED→GREEN。
- Task 8：24/24 新组件和旧账号页／同步回归；未提供剪贴板 API 时 RED→GREEN 到手动复制提示。
- Task 9：真实 Express app、JWT、有效会话、Prisma/PostgreSQL、Redis 和受控 Graph 的 HTTP 全流程通过。外部授权后零账号写入；新创建人会话确认后仅新增所选主页；未选主页未创建。快照包含预先存在账号、凭据、PostVariant、Schedule／PublishJob 和独立管理连接，逐字段比较不变。
- API TypeScript 和 Next 网页生产构建均通过。构建保留既有多 lockfile 警告；测试保留 react-test-renderer 弃用警告，未通过更新依赖或关闭检查来掩盖。

## 本机页面验证

- `http://127.0.0.1:4329/facebook-page-import`：本机 Next 生产构建。只使用合成 fragment，打开后 URL 已清除 fragment；没有点击真实 Facebook 授权。实测 HTTP 头为 no-store、no-referrer，CSP 只允许第一方资源并禁止 iframe/object。
- 私有多选布局使用真实选择组件 SSR＋模拟主页，仅只读布局，不连接 Facebook、不执行导入。交互和后台链路分别由真实组件测试和上述 HTTP 集成测试验证，不能把布局图当成线上 OAuth 成功。
- 截图：`output/playwright/facebook-shared-import-public-local.png`、`output/playwright/facebook-shared-page-selection-local.png`，均不含真实凭据或客户数据。

## 最终验证／审查

当前：全量最终测试运行中（`facebook-shared-full.log`），独立整分支审查待进行。此处只记录已取得证据，最终数字及审查问题修复将在完成后补充；尚不宣称功能验收结束。

## 真实接入限制与上线前条件

`liveAuthorizationReady=false`，详见 `facebook-shared-page-import-compatibility.md`。现有发布配置要求的 business_management 普通客户资格、系统用户口令与 USER→PAGE 目录发现的兼容性尚未用真实非应用角色授权证明。没有修改 Meta 配置或放宽安全校验来绕过，不承诺现在能替普通客户完成真实授权。

代码中的 Caddy 配置未启用访问日志，Nginx 示例未定制脱敏日志；本轮没有更改生产代理。将来部署前必须复核实际代理没有记录 OAuth query／请求 body，以及在可信代理拓扑下的 IP 限流；不接受浏览器自报的 X-Forwarded-For 绕过限流。

未来若批准部署，需单独执行只新增表迁移和 API／网页更新，保留旧环境、凭据、排程及 Worker 容器／镜像／启动时间；未获真实授权兼容性证据前不开放入口。回退只切镜像，不删除账号或凭据。

## 实施裁定（供审查）

1. OAuth 保存候选立即使用已有 grant fence；后续生命周期任务只补清理联动，避免中间版本无 fence。错误成本：需要额外生命周期接线修正。
2. 兼容性明确为 false 时继续离线实现，不换发布配置、不宣称普通客户真实接入成功，符合设计门槛。错误成本：发布前仍需额外平台接入工作。
3. 成员降级／移除复用既有 authorizer retirement 入口，使新邀请永久失效；邀请锁先于独立管理连接锁，与原应用删除顺序一致。错误成本：成员／删除路径回归，已纳入测试及独立审查。
4. `createApp` 新增类型化可选 PageImportRuntime 注入，沿用管理模块的测试注入模式，不增加环境变量假提供方或生产绕过。错误成本：app 接线回归，已纳入真实 HTTP 和全量测试。

独立审查的修复和延期项将在最终验证结束后列出。
