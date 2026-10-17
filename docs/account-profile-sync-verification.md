# 账号头像与名称同步

## 行为与边界

- 社交账号页进入后，对当前工作区的有效连接执行后台同步：上次尝试超过 24 小时或从未尝试才请求平台；最多同时读取两个账号。
- 所有者/管理员可在账号详情点击“刷新账号资料”；服务端对手动重复操作限制为一分钟一次。
- 同步 Facebook 公共主页、YouTube 频道、Instagram、TikTok、Pinterest 官方返回的头像与名称。Pinterest 优先使用 `business_name`，保留旧字段兼容和用户名回退；Instagram/Pinterest 用户名变化时同时更新可靠主页链接。
- 固定按平台账号 ID 校验，绝不新建绑定或重写账号 ID。获取失败、授权不可用、响应账号不一致、图片地址无效时保留旧资料和账号状态。
- 平台本身的默认字母头像仍然是真实头像，不替换为虚构图片；软件无法取得头像时显示统一人物占位图。成功同步后即使图片 URL 未变，也重新尝试加载先前失败的图片，不修改 CDN 签名参数。
- 自动失败后下次自动尝试间隔为 24 小时，避免循环重试；可一分钟后手动重试。授权到期时不自动续期凭据，不新增权限。

## 隔离与实现

- POST `/api/v1/workspaces/:workspaceId/social-accounts/:socialAccountId/refresh-profile`，请求体 `{mode:"auto"|"manual"}`，需要登录且为当前工作区管理员/所有者。拒绝调用者注入的 endpoint/token 等额外字段。
- 使用现有正式凭据，只向固定官方资料接口发送读取请求；12 秒超时，拒绝重定向，不输出平台原始错误/令牌。
- 同步时间保存在既有 `capabilities.profileSync`。JSON compare-and-swap 防止多个页面/API 进程重复同步，并在保存前校验凭据版本、账号状态及原资料未被其他操作改变。保留其他 capabilities。
- 普通账号列表 GET 不调用平台、不触发续期。没有数据库迁移、Worker 修改、依赖更新、新资源或收费服务。
- 自动同步只在账号管理页触发；控制台、发布、排程不加入资料同步逻辑。切换工作区后停止旧页面的排队工作，忽略迟到结果。

## 验证记录（本地）

- 新增 API 独立数据库集成测试 6 项：五平台解析/固定账号匹配、HTTP 登录及角色/额外参数校验、跨工作区和到期授权拒绝、自动与手动限频、失败保留、并发与凭据变更保护。使用真实排程/任务/历史关联并比较前后状态，凭据记录保持完全一致。
- 网页相关测试 15 项：原筛选/授权/解绑保留，手动名称/头像替换、忙碌与失败状态、两路自动队列与失败不重试、查看者只读、卸载停止排队、迟到响应隔离、真实平台图片与占位回退、同 URL 图片恢复。
- 独立审查发现 Pinterest 官方字段映射错误，测试先复现 `new_pin != New Pinterest`，再修正为优先 `business_name`。同 URL 图片恢复也完成失败到通过验证。
- API 构建通过；Web 构建通过（已有多 lockfile 提醒、react-test-renderer 弃用提醒未改动）。
- 首轮基线 557/558：与新集成测试同时访问相同本地夹具时，旧 `workspaceAndUserDeletionRemoveOnlyAuthorizedNewData` 失败；该旧文件单独重跑 4/4 通过。随后禁止数据库测试组重叠运行，完整串行回归 570/570 通过。最终版本完整串行回归 **571/571 通过**，0 失败/跳过（277790.1086ms）；API/Web 构建通过。
- 本地浏览器只读模拟页面核对了新按钮、同步时间说明和中性头像占位；模拟账号状态不是线上账号状态。没有在浏览器访问或修改真实平台账号资料。

## 腾讯云部署与验收（2026-10-17 14:53 北京时间）

- 使用本机独立 `social-scheduler-tat` CLI 登录配置，通过 TAT 在现有实例 `lhins-qkg26b57` 执行；云凭据未上传服务器、未写入仓库或输出到聊天。未创建收费资源或启用 COS 日志上传。
- 发布版本 `938ae29`，仅构建、更新 API 和 Web。数据库备份、旧镜像、配置摘要与验收日志保存在服务器 `/opt/social-scheduler-releases/profile-sync-20261017-938ae29`（权限 0700）。数据库结构检查显示已是最新，无新迁移。
- API 健康接口返回数据库 `ok`、Redis `PONG`；社交账号页面 HTTP 200；未登录资料刷新请求返回 401。
- Worker 容器仍为 `3cbc3bed81805673ee7a949da9fcefefecc3619761d68e5eb25da50344f97e5e`，启动时间仍为 `2026-10-13T06:01:58.401954871Z`；PostgreSQL、Redis、反向代理也未重建。两份环境文件 SHA256 均与发布前一致。
- 切换后、资料刷新前，账号、凭据、排程、发布任务、历史关联、独立管理连接的原有快照一致。刷新后，排除预期资料字段后，账号标识、状态、凭据及其余 capabilities、排程、任务、历史关联、独立管理连接摘要依然一致。
- 实际资料刷新 6/8 成功：Facebook `Factory Wholesale`，Instagram `Andy Peng`、`MOOYAM-factory`，YouTube `Andy peng`、`mooyam`，Pinterest `mooyamcosmetic`。均有平台返回头像。
- 两个 TikTok 账号保留旧资料。后续只读诊断确认官方响应 HTTP 200、账号 ID 匹配、姓名与 HTTPS 头像均存在；头像 CDN 链接包含名为 `token` 的参数，被当前通用安全校验拒绝。不是已证实的授权失败，不能要求用户重新授权来解决。尚未修改校验规则，需单独验证 TikTok 签名 CDN 链接兼容性；未记录头像签名值或 OAuth 令牌。
- TAT 投递：预检 `inv-ga138u0tj9`，备份/构建准备 `inv-ga139hgbt9`，容器切换及保护核对 `inv-ia13aw086p`，真实资料刷新及摘要核对 `inv-ga13b5gaci`，TikTok 只读诊断 `inv-ia13bg0aue`，均成功退出。

## 剩余限制

已部署并完成上述服务及数据验收；两个 TikTok 账号的签名 CDN 头像链接兼容性尚未解决。未通过登录浏览器完成线上视觉验收。
Meta 文档访问受限，接口沿用项目已有官方字段与配置版本；Pinterest 官方 OpenAPI、TikTok user-info、YouTube channels.list 已查证。真实平台/CDN可用性需部署后只读验收，不可把本地模拟结果称为线上成功。

本次只更新 API 和网页；Worker、权限、凭据、历史关联、排程保持不变。回滚镜像已保留并完成受保护数据核对。

## TikTok 签名头像后续修复（2026-10-17，验证中）

- 只读复核发现，两个账号的头像主机分别为 `p19-common-sign.tiktokcdn-us.com`、`p16-common-sign.tiktokcdn-us.com`，路径属于 `tos-useast5-avt-0068-tx`，带有数字 `x-expires`、非空 `x-signature` 与图片用途的 `refresh_token` 参数。之前只匹配参数名的通用拦截导致同步失败；账号 ID 和授权响应正常。
- 最小修复仅对 TikTok、`tiktokcdn.com` / `tiktokcdn-us.com` 子域、`tos-…avt…/` 头像路径及上述签名结构放行 `refresh_token`。保留原始签名 URL，不删除参数；其他平台及 OAuth `access_token` / `client_secret` / 通用 `token` 仍拒绝。HTTP、URL 用户密码、自定义端口和伪造域名均不允许。
- 新增两个集成测试：三个合成签名头像 URL 可成功保存且凭据完全不变；十八个不安全 URL / 跨平台组合必须拒绝并保留原资料，不泄漏参数值。先在旧实现观察到 7/8 通过、TikTok 签名头像用例因 502 失败，修复后 8/8 通过。
- 首次本机测试环境未启动，启动既有独立 PostgreSQL / Redis 测试容器后，数据库短暂恢复启动中；等待 `pg_isready` 确认接受连接后重跑，才取得上述代码层 RED/GREEN 结果。未使用线上数据库作为测试库。
- 本修复无 Worker、权限、凭据、排程、数据库结构、依赖或配置变更；完整回归、生产构建、云端部署及实际图片读取验收仍在进行。
- API/Web 生产构建通过（沿用已有 Next 多 lockfile 提醒）。首次完整回归 569/573，4 项失败均为本机上传测试：`interrupted video resumes into one schedulable asset without changing old bindings, scopes or schedules`、`real login protects every route; duplicate verified parts remain one row and status survives lost acknowledgement`、`oversize streaming thumbnail returns 413 before destroying the upload socket`、`HTTP part busy and capacity responses enforce the same atomic Redis limits`。前三个初始化失败中的 507 / 后续 404 来源于 C 盘可用约 1.8 GiB，小于既有 `MIN_FREE_BYTES=2147483648`。未降低阈值或删除文件，仅把本机测试子进程 TEMP/TMP 指向空间充足的 D 盘临时目录；这两个上传测试文件复核 10/10 通过。正在同一测试环境重新运行默认完整 `npm test`，不省略测试。
- 完整重跑完成：默认 `npm test` **573/573 通过，0 失败/跳过**，169661.8556ms。日志为本机 `SocialSchedulerTools/tiktok-avatar-full-tests-d.log`；生产构建进程退出码 0，日志 `tiktok-avatar-build.log`。下一步为经过备份、保护快照比对后的 API/Web 部署与真实头像读取验收。
