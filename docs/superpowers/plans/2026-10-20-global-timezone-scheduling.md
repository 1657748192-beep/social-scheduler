# 全球时区定时发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户选择国家／地区、代表城市及时区，输入当地时间，确认当地与北京双预览后创建准确的单次排程。

**Architecture:** 网页维护唯一确定的 UTC 时刻；API 验证并保存该时刻及 `Schedule.timezone`。共用解析器处理缺失／重复时刻，日历继续按北京分组，Worker 与历史排程不变。

**Tech Stack:** 现有 Next.js / React / TypeScript、Node API、Prisma、BullMQ；计划声明 Luxon 3.7.2 为网页直接依赖，本地版本化 IANA / CLDR 目录。

**Spec:** `docs/superpowers/specs/2026-10-20-global-timezone-scheduling-design.md`（用户已确认）。本文仅为实施计划，不授权实施或部署。

## Global Constraints

- 新建默认 `Asia/Shanghai`，不按电脑、IP、账号或收藏改变默认解释；收藏最多 8 个，按软件用户与工作区隔离。
- 国家不是时区；支持中文、英文、国家、代表城市及 IANA ID 搜索，UTC 单列，别名显式映射。
- `scheduledAt` 为确定的 UTC ISO Z 字符串；`timezone` 是展示上下文，不二次换算；一次多账号使用同一时刻。
- 新选择精确到分钟；旧记录的秒和毫秒必须保留；纯查看和切显示时区不写入。
- 不修改已有排程、权限、凭据、会员限制、平台 payload；不迁移、不回填、不重建旧队列。
- 不新增费用、云资源或第三方运行时服务；不修改或重启 Worker。本计划不部署。
- 每个任务先失败测试再实现；只提交任务拥有的文件，保留工作区无关修改。

## Review Focus

1. 有效时区 ID 不代表规则够新：过期运行时规则不能产生看似正确的预览；任务 1 验证政策变更探针。
2. 分钟输入不能截断旧秒／毫秒；任务 2、5 验证文本编辑和展示切换。
3. 日期线两侧“今天”不同；任务 2、3 验证目标地区最早日期及实际跨日差。
4. 用户／工作区切换期间异步返回可能污染收藏和表单；任务 3、4 验证隔离和迟到响应。
5. 修改输入或等待过久会使已选重复候选失效；任务 2、4 验证清除旧选择与提交前时钟检查。

---

## 文件与接口地图

所有路径相对仓库根目录；不改 `apps/api/prisma/schema.prisma`、`apps/api/src/worker.ts` 或全局 `chinaTime.ts` 语义。

| 文件 | 职责 |
| --- | --- |
| `apps/web/lib/timezoneCatalog.ts`、`apps/web/lib/timezones/catalog.json` | 地区、代表城市、中英文检索、规范 ID 与别名 |
| `apps/web/lib/timezones/sources.json`、`LICENSES.txt` | 数据版本、来源、许可、校验摘要 |
| `scripts/generate-timezone-catalog.cjs` | 仅开发阶段从固定版本生成静态目录 |
| `apps/web/lib/timeZoneCompatibility.ts` | 已知规则变更探针，明确兼容／不支持状态 |
| `apps/web/lib/scheduleTimeZone.ts` | 严格解析、候选、状态切换、提交与双时间格式化 |
| `apps/web/components/scheduling/{TimeZoneSelector,LocalDateTimeFields,ScheduledTimePreview}.tsx` | 选择器、通用当地输入、只读双预览 |
| `apps/web/components/scheduling/useTimeZoneFavorites.ts` | 用户＋工作区隔离的本地收藏 |
| `apps/web/components/composer/{SchedulePicker,ComposerForm}.tsx` | 共用编辑器与唯一提交值 |
| `apps/api/src/utils/scheduleTimeZone.ts` | API 时区输入约束 |
| `apps/api/src/services/{composerService,scheduleService}.ts` | 保存时区、兼容旧请求、返回已发布记录时区 |
| `apps/web/lib/api.ts` | `PublishedPost.timezone?: string` 等响应类型 |
| `apps/web/components/calendar/{ScheduleDetailPanel,CalendarToolbar}.tsx` | 详情查看／显式改期、北京日历标注 |
| `apps/web/components/posts/PublishedPostManager.tsx` | 区分计划双时间与实际发布完成时间 |
| `docs/global-timezone-scheduling-verification.md` | 最终验证证据、限制、后续部署门禁 |

## Task 1：目录、依赖与规则兼容性门禁

**Files:** 创建地图中的目录、生成脚本、兼容工具；修改 `apps/web/package.json`、根 `package-lock.json`；测试 `apps/web/tests/timezoneCatalog.test.ts`、`timeZoneCompatibility.test.ts`。

**Interfaces:** `TimeZoneEntry = { zoneId: string; countryCode: string; countryZh: string; countryEn: string; cityZh: string; cityEn: string }`；`searchTimeZones(query: string): TimeZoneEntry[]`；`canonicalTimeZone(id: string): string | null`；`checkTimeZoneRules(zoneId: string): {supported: boolean; reason?: string}`。所有浏览器运行时转换先检查后求解。

- [ ] 写失败测试：目录覆盖固定 IANA 地理目录和 UTC；纽约／洛杉矶分开；中文“纽约”、英文 New York 和 ID 均能查到；别名显式映射，不接受 CST 或 UTC+8。
- [ ] 添加政策探针测试，注入旧规则结果，断言不支持而非猜测。当前基线固定 IANA 2026e、CLDR JSON 48.2.3；Winnipeg `2026-11-06T01:00:00Z` 应为当地 `2026-11-05 20:00`、偏移 -300 分钟，不能是 19:00/-360。
- [ ] 运行 `node --import tsx --test apps/web/tests/timezoneCatalog.test.ts apps/web/tests/timeZoneCompatibility.test.ts`；预期因工具缺失失败，记录失败原因。
- [ ] 实现静态目录和明确探针；常用九区置顶，收藏另算。保存上游许可、版本和摘要；生成结果可重复，不在客户端联网。审查 Luxon 许可证、漏洞和打包增量后锁定直接依赖；不执行强制升级或无关依赖修复。
- [ ] 重跑上述测试应全部通过；记录实际 Node／浏览器规则结果。**已知本机 Node 24.18.0 / tz 2026b 不满足 Winnipeg 新规则。静态目录不会修复 Intl 规则。未解决前不可宣称全球规则已验收，也不可发布本功能；若需更换转换引擎或引入随包规则数据，先修订设计并取得用户确认，不擅自扩展。** 不支持地区必须提示，旧 UTC 记录继续可查看。
- [ ] 仅提交本任务地图文件、两项测试与依赖锁：`git commit -m "feat: add versioned timezone catalog and compatibility checks"`。

## Task 2：唯一时刻状态与严格换算

**Files:** 创建 `apps/web/lib/scheduleTimeZone.ts`、`apps/web/tests/globalScheduleTime.test.ts`。

**Interfaces:**

```ts
type TimeCandidate = { instant: string; offsetMinutes: number };
type TimeResolution = {kind: 'empty'} |
  {kind: 'invalid'; reason: 'date' | 'zone' | 'gap' | 'unsupported'} |
  {kind: 'ambiguous'; candidates: TimeCandidate[]} |
  {kind: 'resolved'; candidate: TimeCandidate};
type ScheduleTimeState = {zoneId: string; localValue: string; instant: string | null};
// 以下函数均导出；输入格式 YYYY-MM-DDTHH:mm。
// resolveLocalTime(localValue, zoneId): TimeResolution
// createScheduleTimeState(instant?: string, zoneId?: string): ScheduleTimeState
// editScheduleLocal(state, localValue): ScheduleTimeState
// selectScheduleOccurrence(state, instant): ScheduleTimeState
// switchScheduleZone(state, zoneId): ScheduleTimeState
// getScheduleSubmission(state, nowMs):
//   {kind:'draft'} | {kind:'scheduled'; scheduledAt:string; timezone:string} |
//   {kind:'error'; reason:string}
// formatScheduleTimes(instant, zoneId?, locale?):
//   {localLabel:string|null; beijingLabel:string; dayDelta:number; invalidZone:boolean}
// getLocalToday(zoneId, nowMs): string // YYYY-MM-DD
```

- [ ] 写参数化失败测试，固定时钟验证：北京 2026-10-20 20:00→12:00Z；纽约→次日00:00Z／北京08:00；Kathmandu→14:15Z／北京22:15。
- [ ] 加入纽约 2026-11-01 01:30 候选05:30Z／06:30Z且默认无 instant；纽约03-08 02:30和Lord Howe10-04 02:15为 gap；Apia2011-12-30为缺失整日；2月30日非法。候选超过两个或不能确认则拒绝。
- [ ] 加入精度、状态和时钟测试：旧值 `2099-01-01T12:00:27.123Z` 切区不变；新输入秒归零；编辑清除旧候选；两个候选一早一晚时只允许未来项；提交前再次检测过期。日期线两侧今天不同；未知旧时区只读降级北京。
- [ ] 运行 `node --import tsx --test apps/web/tests/globalScheduleTime.test.ts`，确认因接口缺失失败。
- [ ] 实现上述接口，使用 Luxon 回读逐字段比较和 `getPossibleOffsets()` 去重排序，禁止无偏移字符串交给 Date。已确定时刻切区保留 instant，未确定时刻保留原输入；展示只由 instant 派生。兼容性检查失败不产生可提交结果。
- [ ] 重跑测试全部通过，再以不同进程 `TZ` 验证相同输入同一 UTC；只提交工具和测试：`git commit -m "feat: resolve global schedule times without silent normalization"`。

## Task 3：可访问的时区编辑器与收藏

**Files:** 创建地图中的四个 scheduling 文件；修改 `SchedulePicker.tsx`；测试 `apps/web/tests/globalSchedulePicker.test.tsx`。

**Interfaces:** `SchedulePicker({value, onChange, token, workspaceId})` 中 value 为 `ScheduleTimeState`，onChange 接收同类型。`TimeZoneSelector({value,onChange,favorites,onToggleFavorite})` 仅操作 ID；`LocalDateTimeFields({value,onChange,minDate})` 仅操作当地字符串；`ScheduledTimePreview({instant,zoneId})` 无写请求。`useTimeZoneFavorites(token,workspaceId)` 返回 `{favorites:string[],toggle:(id:string)=>void,persistent:boolean}`。

- [ ] 使用 `withFacebookUI` 写失败组件测试：选择城市、小时分钟标签不再叫北京时间、候选默认不选、双预览跨日完整、空时间显示“未设置时间，将保存为草稿”。键盘上下／Enter／Escape、中文英文与窄屏无溢出均有断言。
- [ ] 测试收藏第九项被明确拒绝、坏 JSON／被禁 storage 不阻断编辑、新会话仍北京；用户和工作区切换后旧收藏不显示、不写入另一作用域。模拟迟到 `/auth/me` 返回，断言不能覆盖新身份。
- [ ] 运行 `node --import tsx --test apps/web/tests/globalSchedulePicker.test.tsx`，确认失败。
- [ ] 实现组件并复用任务 1、2；收藏 hook 通过现有 `/auth/me` 读取真实 user.id，取消／忽略旧请求后再读写 `schedule-timezones:v1:<userId>:<workspaceId>`。只存有效 ID；身份读取失败禁用持久化但保留换算；不把 token 写进键或内容。401沿用现有登录处理。
- [ ] 重跑组件测试通过；只提交本任务组件和测试：`git commit -m "feat: add timezone picker with isolated favorites and dual preview"`。

## Task 4：API 保存与 Composer 集成

**Files:** 修改地图中的 API 工具、两项 service、ComposerForm；创建 `apps/api/tests/globalSchedule.integration.test.ts`、`apps/api/tests/fixtures/globalScheduleHttp.ts`、`apps/web/tests/globalComposer.test.tsx`。

**Interfaces:** API 导出 `scheduleTimeZoneSchema`（Zod string，最多80字符，支持有效 IANA／明确 UTC，拒绝模糊缩写）。composer 增加可选 timezone；创建缺省北京，改期缺省保留旧值。`scheduledAt` 仍为原 ISO 字段，成功响应沿用现有结构；不改发布队列 payload。

- [ ] 先写真实 HTTP 失败测试：旧请求默认北京；显式纽约保存原 UTC 原样；批量两账号同一 instant＋zone；无效区、过去时间、无发布权限被拒绝且数据库／队列不变；改期省略区保留原区。已发布响应增加 timezone，旧客户端不受影响。
- [ ] 用独立 DB／Redis 环境和现有 `facebookManagementFixture` 的账号／权限模式启动真实 createApp 子进程，无 Worker。沿用 `environment(true,true)` 的本地隔离检查；只清理本次生成的记录和确切队列 ID，禁止 flushall／obliterate，禁止生产 URL 回退。
- [ ] 写 Composer 失败测试：预览 instant 等于 HTTP body；立即发布和显式草稿不发定时字段；定时全空保存草稿，非空非法／未选候选不请求；复制和打开草稿重置北京＋空时间；切换工作区无旧候选泄漏；等待跨过时刻后阻止提交。
- [ ] 通过现有测试运行器分别运行上述两文件，确认目标断言失败而非环境故障；集成测试使用2099年未来日期，数学边界用固定时钟，不关闭未来校验。
- [ ] 实现统一 schema，事务写入所选 timezone，UTC 不二次转换。Composer 持有任务 2 状态并复用任务 3，发布检查只认可确定未来 instant；不写时区到社媒 payload。检查 partial update schema 消费者，不引入未授权更新能力。
- [ ] 重跑两组测试通过，并断言既有账号、凭据、排程、jobs 的完整摘要未变；只提交本任务明确文件：`git commit -m "feat: persist selected schedule timezone with backward compatibility"`。

## Task 5：日历详情与已发布时间核对

**Files:** 修改 `ScheduleDetailPanel.tsx`、`CalendarToolbar.tsx`、`PublishedPostManager.tsx`、`apps/web/lib/api.ts`；创建 `apps/web/lib/scheduleEdit.ts`、`apps/web/tests/globalScheduleDetails.test.tsx`。

**Interfaces:** `buildScheduleEdit(original:{scheduledAt:string;timezone:string;text:string}, edited:{time:ScheduleTimeState;text:string}): null | {scheduledAt:string;timezone?:string;text:string}`。null 表示无写入；仅文本变化用原 exact instant 与原 timezone；实际改期用编辑状态。`PublishedPost.timezone?:string`，缺省不猜原地区。

- [ ] 写失败测试：打开／关闭／换语言／只切显示区和无变化保存均0 PATCH；文本修改保留 `2099-01-01T12:00:27.123Z` 及原时区；实际改期发送唯一新时刻。未知旧区降级展示不写；切任务／工作区不会复用上一任务编辑态。
- [ ] 测试日历仍按北京范围查询和拖拽，拖拽 body 不含 timezone；展示“日历显示时区：北京时间”。已发布计划双时间与实际 publishedAt 分开，旧响应缺区只标北京显示。状态／会员不可编辑限制仍成立。
- [ ] 运行 `node --import tsx --test apps/web/tests/globalScheduleDetails.test.tsx`，确认失败。
- [ ] 实现 payload helper 与双预览；不全局替换北京工具，不修改 ContentCalendar 拖拽语义。显式文本保存沿用既有 service 队列行为，不承诺其不重新入队；被动查看绝不调用该路径。
- [ ] 重跑测试通过；只提交本任务文件：`git commit -m "feat: show local and Beijing schedule times without passive writes"`。

## Task 6：整体验证与待批准发布交接

**Files:** 创建 `docs/global-timezone-scheduling-verification.md`；如需修复仅改此前任务拥有文件并增加对应回归。

- [ ] 添加端到端失败用例：地区选择→双预览→多账号创建→列表／详情读取 timezone→只切区不写→显式改期；新旧客户端兼容。对现有七类受保护发布数据记录完整内容摘要，禁止只比数量。
- [ ] 运行用例并确认目标失败，再补齐跨组件缺口；不得跳过权限、实际持久化或运行时规则门禁来使测试变绿。
- [ ] 执行完整 `npm test`、`npm run build -w apps/api`、`npm run build -w apps/web`，保存命令、退出码和测试总数。Windows 临时目录问题可用已存在的本地测试 wrapper，不能以部分测试代替完整测试。
- [ ] 在本地受控浏览器验证桌面和窄屏、键盘、中英文、重复／缺失时刻、无网收藏降级；记录浏览器版本及任务 1 探针结果。未解决的规则不兼容是发布阻断项，不把“按钮可点”当成全球可用。
- [ ] 执行独立代码复核并修复高风险项，核对无 schema／Worker／权限／凭据修改。记录打包体积、依赖审查和已知限制；只提交证据及对应修复：`git commit -m "test: verify global scheduling compatibility and safety"`。
- [ ] 向用户提供结果和部署申请；**未经后续明确批准不得推送部署**。批准后先兼容 API 后网页，核对 Worker 容器／镜像／启动时间、原环境及保护数据摘要未变；不创建真实发布测试。回退先网页后 API，不回滚用户合法新建数据。任何需重启 Worker、更新环境或新增费用的情况停止并说明。

## 自查与交接

- 设计覆盖：目录／收藏→任务1、3；状态／夏令时／精度→任务1、2；新建／草稿／多账号／API→任务4；日历／详情／已发布→任务5；保护与发布门禁→任务6。
- 本轮仅编写计划；未运行实施测试、未安装依赖、未修改产品、未部署。任务1的本地规则问题尚未解决，不将计划完成等同于功能完成。
- 建议在当前会话逐项实施（Native），接口耦合处可连续验证；实施前请用户审核本计划并选择执行方式。选择 subagent-driven 时再按对应技能启用分工，不在本轮自行启动。

资料：[IANA 时区规则](https://www.iana.org/time-zones)、[CLDR JSON 48.2.3](https://github.com/unicode-org/cldr-json/releases/tag/48.2.3)。目录版本与运行时规则版本须分别验证。
