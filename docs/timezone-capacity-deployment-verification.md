# 时区缓存余量检测修复与部署核验

2026-10-20，用户明确批准软件检测修正、必要的只读内存指标挂载，并在验证后只部署 API／网页。禁止 Redis 配置修改、Worker 重启、已有排程／权限／凭据变更及新增收费资源。

## 实现范围

- `maxmemory>0` 保留原有至少32MiB余量要求；`maxmemory=0` 只有取得已验证的主机和 Redis 容器证据才允许缓存。
- 现有服务器为 cgroup v2。只挂载主机 `/proc/meminfo`、Redis 叶级及所有父级的 `memory.max`／`memory.current` 文件、非敏感运行标识清单。全部只读，无 Docker socket、特权权限或额外云服务。
- 主机保留至少总内存10%且不低于256MiB，再加32MiB缓存预算；每个有限 cgroup 同时要求32MiB余量。每次加锁和激活重新读取，不将静态预检数字当成长期可用内存。
- Redis `run_id` 必须匹配部署时已核实的容器。Redis重启后旧挂载不再放行，需要下一次部署重新核实。信息缺失、异常、不足或不支持的系统仍保守停用外部缓存，保留内置时区规则。
- 不改变 UTC 排程执行合同，不修改 schema／迁移／Worker／Redis 设置。

## 部署保护

固定实例 `lhins-qkg26b57`，元数据 `ins-4jabsxgk`。继续使用既有 TAT／本机 CLI 身份，不输出任何密钥或环境变量内容。

`scripts/deploy/timezone/` 只构建 API／网页；镜像准备阶段不启动服务。激活和回滚都显式 `up -d --no-deps --no-build api web`。API命令直接执行 `node dist/server.js`，避免原 Dockerfile 默认命令顺带运行迁移。

部署前后比较环境文件校验值、API／网页完整运行环境、原有挂载、Worker／Postgres／Redis／代理容器ID和启动时间。数据库只读全内容HMAC包括用户、工作区、会员、账号、发布凭据、帖子、变体、排程、发布任务，不输出行内容。发现变化即停止或回滚 API／网页，不回滚数据库，不碰 Worker。

回滚使用当前正在运行的旧镜像，无需重新构建旧版本。私有运行配置保存在服务器 release 目录，0600权限；没有把凭据传回本机或聊天。公共网页构建清单与容器清单逐字比较，避免只依据HTTP200宣称新网页已生效。

## 已进行的本地验证

- 余量新回归先出现预期失败（原实现对 maxmemory=0 一律 false），修复后通过。
- 覆盖主机低可用、Redis叶级／父级限制、实时压力恢复、缺失／畸形指标、旧运行标识和显式 Redis 上限。
- 真实隔离 Redis 上先锁定、再模拟内存不足拒绝激活、恢复余量后成功；数据库保护快照及 Redis 配置前后相同。
- 实际 Docker Compose 渲染验证原环境与卷完整保留，Worker配置不变，回滚不携带新探针。
- 预检容器移除所有 capabilities、只读根文件系统、不启动服务，并以探针清单文件的实际部署用户UID运行，避免无 capabilities 的容器root错误依赖读取他人0600文件的特权。该命令边界已有先失败后通过的回归；真正的新镜像读探针仍需线上准备阶段验证。
- 独立只读复核指出 `$` 可能被 Compose 插值。新增带 `$NAME`、`${NAME}`、`$$` 的假凭据先复现失败，再修复转义。实际隔离 Alpine 容器的进程环境验证字面值原样保留；仅在本地运行 `printenv`，未启动发布器或 Worker。
- 第一次完整回归1055项：1054通过、1失败，为上述新增插值回归；该失败已修复，不能把这次运行称作全绿。最终完整回归独立重跑 **1056/1056通过、0失败、0跳过**，退出码0，658309ms；包括新增预检用户权限边界用例，未把分次数字拼成全量结果。
- API构建、网页类型检查和网页生产构建已通过；生产依赖审计0漏洞。原有Next多锁文件提示与React测试弃用提示未掩盖。

实现及部署版本：`0122a60d30449bd9144f8003e6b6d46f9a9ba6b4`，已推送既有分支 `codex/tiktok-sandbox-metrics` 并部署 API／网页。

最终完整日志：`C:/Users/Administrator/AppData/Local/SocialSchedulerTools/timezone-capacity-final-tests-20261020.log`。完整规则包生成器离线 `--check` 再次通过，2026e摘要及全部344地区／253别名保持不变。Worker和Prisma目录相对原线上API版本无差异。

只读复查 `inv-ia56rfgbsa`（UTC09:39:43–09:39:47）成功：MemAvailable2354204KiB，磁盘可用9968616KiB，Redis used_memory7946608字节、maxmemory0、noeviction。API／网页仍为原版本，Worker容器ID及2026-10-13启动时间未变，健康接口数据库及Redis正常。此处未构建镜像或改变运行服务。

## 腾讯云实际部署结果

- 镜像准备 `inv-ja57120pj2`，UTC09:47:49–09:51:33，成功退出0。新 API 镜像以非特权UID、只读文件系统和只读探针运行，实际返回 `VERIFIED_IMAGE_CAPACITY_OK`，随后确认API／网页镜像准备就绪，所有运行容器尚未切换。
- 激活 `inv-ha5757g2r3`，UTC09:52:16–09:52:26，成功退出0。只执行API／网页的 `up --no-deps --no-build`；没有运行默认镜像里的Prisma迁移命令。切换中的健康重试遇到一次短暂502，随后API／数据库／Redis健康恢复，非持续故障。
- 实际新API内 `capacity=true`，内置规则 `2026e`，自动检查 `state=ok`、`activeVersion=2026e`、`upstreamVersion=2026e`，不是仅凭静态预检放行。
- API和网页镜像revision均匹配完整目标SHA；公开网页构建清单与新容器文件逐字相同，定时编辑页HTTP200，未登录规则manifest返回401。
- API／网页完整运行环境、原挂载、环境文件校验值相同；Worker／Postgres／Redis／代理容器ID、镜像、启动时间完全相同。Worker保持 `3cbc3bed81805673ee7a949da9fcefefecc3619761d68e5eb25da50344f97e5e`，自2026-10-13T06:01:58.401954871Z未重启。
- 10类保护数据前后完整内容HMAC比较通过：用户、工作区、会员、社媒账号、OAuth发布凭据、TikTok沙盒凭据、帖子、变体、排程、发布任务。未创建测试帖子或排程，未调用真实发布接口。
- 未调整Redis配置或重启Redis，未申请权限或变更凭据，未创建实例／存储桶／付费加速。构建及JSON检查使用已有主机、磁盘和网络额度；没有新增收费资源，不将此表述为账单逐项审计。
- 最终只读复查 `inv-ga576hg7e8`（UTC09:53:39–09:53:43）再次成功。API／网页均为目标revision；Worker／Redis／Postgres／代理仍为原容器和启动时间。MemAvailable2372524KiB（约2.26GiB），磁盘可用9535664KiB（约9.09GiB）；Redis maxmemory仍0、noeviction，健康接口API／数据库／Redis正常。

服务器release：`/opt/social-scheduler-releases/timezone-0122a60d30449bd9144f8003e6b6d46f9a9ba6b4`。其中`images.yml`为当前完整私有运行覆盖配置，后续部署须继续保留必要的只读探针，不应直接使用旧base compose覆盖掉这些挂载；Redis重启后需重新核验运行标识和cgroup路径。`rollback.yml`保留原镜像与原环境且不挂载探针，任何必要回滚仍仅操作API／网页，不恢复数据库或重启Worker。没有删除旧镜像、release、日志或本机用户已有文件。
