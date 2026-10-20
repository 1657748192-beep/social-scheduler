# 内置时区规则与自动更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 在当前会话逐项实施；沿用用户此前选择的本机会话执行方式。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 默认跟随电脑时区，全部地区使用内置免费规则，并安全自动更新，不改变已确认排程。

**Architecture:** 新建纯数据／求解共享包，网页按会话锁定不可变规则快照。现有 API 定期获取受限上游数据并通过现有 Redis 原子缓存，只读接口提供已验证版本；Worker 和 UTC 执行契约不变。

**Tech Stack:** TypeScript、React、Node、Express、现有 Redis；moment-timezone 0.6.5、moment 2.31.0，MIT；完整 packed 数据基线 IANA 2026e。

**Spec:** `docs/superpowers/specs/2026-10-20-managed-timezone-rules-design.md`，用户已于本轮确认。原全球时区设计中不被本增补替换的约束继续生效。

## Global Constraints

- 本轮只编写计划；实施须再获用户对计划确认。验证后不推送、不部署，不重启 API 或 Worker。
- “电脑右下角时间”只表示默认时区，不把电脑时钟作为发布执行依据。
- 原有排程、平台发布权限、凭据、账号、会员限制和队列格式不变，不重启 Worker。
- 不购买服务、不增加云资源；复用现有 API、网页和存储。不能保证数据流量绝对零消耗；资源／额度不足就禁用更新，不开通收费资源。
- 每个解压后 JSON 包最多 4 MiB，active、previous、临时三个包总数据上限 12 MiB。Redis 命名空间为 `timezone-rules:v1:`；禁止清库。
- 现有表单锁定快照，更新仅在下次新会话启用。旧任务 UTC 不重解释、不回填、不重建队列。
- 所有下载仅数据 JSON，不远程执行脚本、不动态安装依赖。测试不连接生产或真实上游。
- 保留已有脏文档与其他任务输出，只暂存本功能明确文件。

## Review Focus

1. 午夜／时区变更恰逢客户端初始化：不得覆盖已输入状态，Task 4 测试固定。
2. 同版本号不同数据或上游降级：不得覆盖 active，Task 2 测试固定。
3. Redis 锁过期、旧实例迟到写回：旧持有者不得切换 active，Task 2 测试固定。
4. 表单中途更新且原时间处于重复小时：不得改变已选那一次，Task 4 测试固定。
5. 新规则增加浏览器 Intl 不认识的别名：API 应接受受控目录中的明确标识，不能放开任意文本，Task 3 测试固定。

## 前置核实和文件边界

当前分支 `codex/tiktok-sandbox-metrics`，既有独立 worktree，计划基于本地 `194f6bb` 后的设计，不另建工作区、不重做已完成全球时区功能。

已执行只读 npm 元数据核查：moment-timezone 0.6.5（MIT，依赖 moment ^2.29.4）；moment 2.31.0（MIT）。固定标签 `https://raw.githubusercontent.com/moment/moment-timezone/0.6.5/data/packed/latest.json` 返回 2026e、344 zones、253 links。实施时先重新核对固定版本完整性，再安装精确版本；禁止追随 latest 自动安装代码。

新增 `packages/timezone-rules/` workspace，运行时 CommonJS JS + `index.d.ts`，让 API CommonJS 编译和网页构建共用同一求解器，不从 API 导入网页源码。根 package.json 增加 packages/*；API／网页声明 `@social-scheduler/timezone-rules: "*"`，共享包锁定上述两个依赖。共享包运行时仅导入 `moment-timezone/moment-timezone` 无数据入口，数据由显式快照加载／解包；不得调用可变全局 `moment.tz.load`。使用 zone 解包、UTC 日历算术及自己的纯快照索引，不能依靠浏览器 Intl 偏移。

修改面限定：共享包与基线生成脚本、API timezoneRules 模块及生命周期／路由、网页调度时间适配层／会话 hook／相关调度组件和测试、工作区依赖及锁文件、验证文档。Dockerfile 只有在共享包打包检查证明必要时修改 API／网页构建上下文；绝不构建或重启 Worker。

## Task 1: 内置基线和独立求解引擎

**Files:** 创建 `packages/timezone-rules/{package.json,index.cjs,index.d.ts,baseline.json,sources.json,LICENSES.txt}`、`scripts/generate-timezone-rules.cjs`、`apps/web/tests/managedTimezoneEngine.test.ts`；修改根与 API／网页 package.json 及 package-lock.json。

**Interfaces:**
- `RuleBundle={schemaVersion:1,engineCompatibility:1,tzdbVersion:string,source:string,generatedAt:string,sha256:string,data:{version:string,zones:string[],links:string[]}}`；摘要覆盖 UTF-8 原始上游 data JSON，封装同时保留规范化前原始字节的 base64 `sourceBytes` 以便独立复核，不用序列化键顺序猜摘要。
- `validateBundle(input:unknown):RuleBundle`：失败抛 `InvalidRulesError`，4 MiB 按传输和解压后完整封装分别限制。
- `createRuleSnapshot(bundle:RuleBundle):RuleSnapshot`；快照只暴露 `version`、`digest`、`canonicalZone(id):string|null`、`offsetAt(id,epochMs):number`（东正西负分钟）、`localParts(id,epochMs):CalendarParts`、`resolve(id,localValue):TimeResolution`，类型对应现有 `scheduleTimeZone.ts`。
- `getBaseline():RuleSnapshot`；别名固定、无循环；范围明确为公历 1900-01-01 至 2499-12-31，未来范围末尾必须有充分转换表覆盖，不能使用表末永久延伸冒充已展开周期规则。不支持范围显式返回 invalid。

- [ ] 先写测试。断言 Winnipeg `2026-11-05T20:00` → `2026-11-06T01:00:00.000Z`；Edmonton／Inuvik 同输入 → `02:00Z`；Casablanca／El_Aaiun 同输入 → `20:00Z`。纽约 `2026-11-01T01:30` → 05:30Z／06:30Z；纽约春季缺失、Lord Howe 半小时缺失、Apia 跳日零候选，Kathmandu 20:00 → 14:15Z。Intl 指定地区格式化抛错时结果不变。坏摘要、别名循环、越界年份被拒绝；同一个表在两个并存快照中偏移不同而不互相污染。
- [ ] 运行 `node scripts/run-tests.cjs apps/web/tests/managedTimezoneEngine.test.ts`。Expected: FAIL，缺少共享包或函数；确认失败原因再实现。
- [ ] 只在本地安装精确依赖；生成脚本固定标签下载完整数据与 SHA256／许可证，`--check` 重现一致。解包库数据，枚举唯一偏移并按转换区间验证候选，严格公历回读；禁止默认顺延和自动选重复一次。盘点各区最后已展开转换：若不足 2499，显式缩小该区支持终点并测试，不能靠静态标称年份通过。
- [ ] 重新运行上述测试及 `node scripts/generate-timezone-rules.cjs --check`。Expected: 全部 PASS／字节一致。执行生产依赖审计，记录实际包体 gzip 与许可证；发现高风险漏洞停止该依赖方案，不能换方案不报告。
- [ ] 只暂存本任务文件，提交 `feat: add self-contained versioned timezone rule engine`。

## Task 2: 受限下载、验证与原子缓存

**Files:** 创建 `apps/api/src/timezoneRules/{source,store,updater}.ts`、`apps/api/tests/managedTimezoneUpdater.test.ts`。

**Interfaces:** 消费 Task 1 RuleBundle／validateBundle。
- `fetchCandidate({fetch,signal}):Promise<{ianaVersion:string,bundle:RuleBundle|null}>`。
- `RuleStore.readActive():Promise<RuleBundle|null>`、`tryLock(owner,ttlMs):Promise<boolean>`、`activate(owner,bundle):Promise<boolean>`、`release(owner):Promise<void>`、`status():Promise<RuleStatus>`。
- `checkRulesOnce({source,store,now,signal}):Promise<RuleStatus>`；状态包含 activeVersion、upstreamVersion、lastCheckedAt、`ok|pending-upstream|failed|baseline-only`、受控错误代码，不存用户数据。

- [ ] 测试断言：成功切换保留 previous；同摘要同版本无写入；同版本异摘要／降级拒绝；未知 schema、错误摘要、超大包、坏区间、缺区和循环别名拒绝；上游落后状态 pending；超时和断网保留 active；容量不足不写；旧锁持有者迟到 activate 返回 false；事务中断后旧 active 仍完整。所有来源／时钟依赖注入，真实测试 Redis 另在 Task 5 验证。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/managedTimezoneUpdater.test.ts`。Expected: FAIL，接口不存在。
- [ ] 实现。源只允许 IANA `https://data.iana.org/time-zones/tzdb/version` 与 GitHub 官方 `moment/moment-timezone`：从固定 GitHub tags API 获取合法 `0.x.y` tag，再读取该 tag 的 `data/packed/latest.json`；记录固定 commit 来源，拒绝重定向，不解压 tar、不执行代码。下载超时 10 秒，每次最多 4 个 HTTPS 请求，元数据 256 KiB、规则 4 MiB，流式计数；中止及时释放。首次与运行时相同结构校验；版本比较解析四位年和字母后缀，不按字符串随意比较。
- [ ] 来源完整性：固定 HTTPS 官方发布元数据／commit 和本地摘要提供传输一致性，不宣称有上游签名；规则 fixture 对 IANA 已知变更独立复核，更新数据不能改变既有历史锚点而无明确官方版本依据。新包保留旧基线地区覆盖，新增地区允许；metadata 最新与候选不一致时不启用。
- [ ] Redis 用唯一 owner、120 秒锁和比较 owner 的 Lua 原子激活／释放。容量门槛：maxmemory 非零时扣除 used_memory 后至少留 32 MiB；maxmemory 为零时 API 读取自身 cgroup 内存余量，至少 64 MiB 才启用缓存；无法测量 fail closed，只用基线。值与摘要原子更新，临时键 5 分钟 TTL，最多三个版本体；清理仅固定命名空间的明确键，不 scan/delete 其他数据。
- [ ] 重新运行测试。Expected: 全部 PASS。提交 `feat: validate and atomically cache timezone data updates`。

## Task 3: API 生命周期和只读分发

**Files:** 创建 `apps/api/src/timezoneRules/{runtime,routes}.ts`、`apps/api/tests/managedTimezoneRoutes.test.ts`；修改 `apps/api/src/{app,server}.ts`、`apps/api/src/utils/scheduleTimeZone.ts`。

**Interfaces:** 消费 Task 2；`createRulesRuntime(deps):{getBundle(version?):Promise<RuleBundle>,getStatus():Promise<RuleStatus>,start():void,stop():Promise<void>}`。GET `/api/v1/timezone-rules/manifest` 返回 `{version,digest,schemaVersion:1,engineCompatibility:1}`；GET `/api/v1/timezone-rules/data/:version` 返回该完整包；GET `/api/v1/timezone-rules/status` 仅现有平台管理员可读，使用原有管理员判定。

- [ ] 测试未登录 401、普通用户 status 403、合法读取 200／ETag 304、版本不在 active／previous／baseline 为 404、路径注入 400、61 次／分钟第 61 次 429；路由不能触发下载。创建 app 默认不开维护循环；start 非阻塞、24 小时正常检查，失败 5 分钟／30 分钟各重试一次，stop 中止在途和清定时器。Intl 不认识而基线／active 目录明确含有的规范 IANA ID 有效；CST、UTC+8、未知文本依旧无效。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/managedTimezoneRoutes.test.ts`。Expected: FAIL。
- [ ] 实现路由，复用现有认证、平台管理员判断和限流模式。只在 server.ts 主 API 生命周期调用 start／stop，worker.ts 与 createApp 的导入无维护副作用。API 时区 schema 受控长度／形状加基线与 active 合法标识集合，保留原有效历史 Intl 别名的向后兼容；不新增任意别名写入入口。
- [ ] 运行测试及 `npm run build -w apps/api`。Expected: PASS、构建 exit 0；确认 worker.ts 无 diff。提交 `feat: serve managed timezone rules through existing API`。

## Task 4: 网页会话快照与电脑默认时区

**Files:** 创建 `apps/web/lib/timezoneRulesClient.ts`、`apps/web/components/scheduling/useScheduleRuleSession.ts`、`apps/web/tests/managedTimezoneSession.test.tsx`；修改 `apps/web/lib/{scheduleTimeZone,scheduleEdit,timeZoneCompatibility}.ts`、`components/composer/{ComposerForm,SchedulePicker}.tsx`、`components/scheduling/{ScheduledTimePreview,TimeZoneSelector}.tsx`、`components/calendar/ScheduleDetailPanel.tsx`、`components/PublishedPostManager.tsx` 及已有全球时区测试。

**Interfaces:** `getRulesForNewSession({token,signal}):Promise<RuleSnapshot>`，离线使用基线；不持久化帖子／令牌。`useScheduleRuleSession({token,workspaceId,sessionKey,existingZone?}):{ready:boolean,rules:RuleSnapshot,defaultZone:string,updateAvailable:boolean}`。现有时间函数均增加显式 `rules:RuleSnapshot` 参数，禁止隐式全局 active：resolveLocalTime、createScheduleTimeState、editScheduleLocal、selectScheduleOccurrence、switchScheduleZone、getScheduleSubmission、getLocalToday、formatScheduleTimes；scheduleEdit 参数带 rules，同一编辑器的 picker／preview／submit 共用引用。

- [ ] 测试纽约电脑新建默认 New_York、上海电脑默认 Shanghai、识别抛错回退 Shanghai；SSR 不读服务器时区、ready 前不能提交。晚到规则请求不覆盖用户输入／地区；切用户／工作区旧响应无效；旧任务保留存储时区，秒毫秒不变。当前重复小时已选第二次，active 更新后同一会话仍提交 06:30Z、零 PATCH；下一新会话使用新版本。Storage 读写异常／断网仍能用基线计算。
- [ ] 运行 `node scripts/run-tests.cjs apps/web/tests/managedTimezoneSession.test.tsx`。Expected: FAIL。
- [ ] 接入新引擎并删除旧偏移探针作为提交门禁的使用，不删除浏览器识别默认区所需 Intl。Task 1 规范 ID／别名用于选择器映射，国家城市名称继续使用现有目录。规则请求最多等待 2 秒后锁定基线，迟到结果只供下一会话；不要让用户无限等待。规则更新提示用已确认文案，不向普通客户显示原技术详情。
- [ ] 单页最多每 24 小时重新检查 manifest；身份改变清理内存请求与缓存引用，离线不循环打请求。已有详情、历史预览和目标今天全部走快照；北京日历分组不变，API 当前时间仍最终校验未来时间。
- [ ] 重跑本任务测试和所有 `apps/web/tests/global*.test.*`（通过 PowerShell `Get-ChildItem` 枚举实际路径传给测试脚本，不把未展开 glob 交给 runner）。Expected: 全部 PASS。提交 `feat: use immutable timezone rule sessions in scheduling UI`。

## Task 5: 真实集成、完整回归和交付

**Files:** 新建 `apps/api/tests/managedTimezoneRules.integration.test.ts`；扩展 `apps/api/tests/{globalSchedule.integration.test.ts,fixtures/globalScheduleHttp.ts}`；更新 `docs/global-timezone-scheduling-verification.md` 并新增 `docs/managed-timezone-rules-verification.md`。

**Interfaces:** 复用已存在独立数据库 guard、`withFacebookManagementFixture`、真实 React→认证 HTTP→Prisma→BullMQ 验证路径；不得新增生产 fallback。

- [ ] 写真实 Redis 测试：以本轮唯一前缀注入测试 store；模拟 API 重启读取 active、两 owner 竞争、锁过期、容量拒绝、淘汰与旧包回退。前后比较所有受保护原 Redis 发布任务完整 Hash／状态及数据库账号／凭据／权限／旧排程完整内容，不能只比数量。
- [ ] 写端到端测试：选 Winnipeg 时间经真实 Composer 表单得到 2026e 对应 UTC，用受控未来时钟建立请求；真实 HTTP 保存 UTC／zone，队列实际 delay 一致；更新 active 后旧排程和当前表单均不动。文本编辑不覆盖 zone；复制／草稿默认电脑时区；立即发布／保存草稿不携带定时字段。用唯一测试 ID 清理自身对象，不实际调用平台发帖。
- [ ] 运行 `node scripts/run-tests.cjs apps/api/tests/managedTimezoneRules.integration.test.ts apps/api/tests/globalSchedule.integration.test.ts`。Expected: 首次缺少集成接线断言 FAIL；只修产品接线，不削弱受保护数据断言，再运行至 PASS。
- [ ] 执行 `npm test`、`npm run build -w apps/api`、`npm run lint -w apps/web`、`npm run build -w apps/web`、`npm audit --omit=dev`、两个生成脚本 `--check`。Expected: 所有测试通过、构建与检查 exit 0；任何既有失败也逐项报告，不隐瞒。保存日志尾和准确测试数；完整回归可能较慢，期间持续简短进度更新。
- [ ] 浏览器使用真实组件与本地合成账号：390px／桌面、键盘搜索、电脑默认时区、五地区、重复与缺失时刻、离线、规则更新提示。记录新旧网页 first-load JS 与规则数据 gzip 增量；不能把截图模拟接口当成真实集成证据。
- [ ] 按 executing-plans 做一次全范围独立代码复核，重点审查 Review Focus。重要问题一次修复 RED→GREEN，重新完整回归；小问题记录，不能无限扩范围。确认 git diff 中无 Worker、凭据、发布权限、云配置和旧队列迁移变更。
- [ ] 提交 `test: verify safe timezone updates without rescheduling existing jobs`，保留本地分支，交付验证文档。明确“未推送、未部署、未重启服务”；后续部署需另行批准。

## 计划自审与执行交接

依赖方向为 Task 1→2→3、Task 1／3→4、全部→5；共享类型由 Task 1 定义，生命周期只由 Task 3 启动。设计每节均有对应任务：默认值／会话 Task 4，规则／求解 Task 1，更新／缓存 Task 2，只读分发／鉴权 Task 3，旧数据保护／验证 Task 5。无数据库迁移，无新云资源，无 Worker 接入点。

实施前仍需在本地验证完整数据的实际覆盖、依赖安全与 Redis 可用容量；这些是明确的验收门槛而非上线承诺。出现不满足条件就保留已验证基线并报告，不能偷偷缩减地区或重新依赖浏览器偏移。用户确认本计划后，沿用当前会话逐项实施方式，验证后先不部署。
