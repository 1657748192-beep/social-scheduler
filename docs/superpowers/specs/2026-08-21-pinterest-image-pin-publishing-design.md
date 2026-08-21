# Pinterest 图片 Pin 真实发布设计

**日期：** 2026-08-21  
**状态：** 已确认，待进入实现计划  
**范围：** Pinterest 图片 Pin 的立即发布与定时发布；不包含 Pinterest 视频 Pin。

## 目标

让已通过 OAuth 绑定的 Pinterest 账号能够从 Social Scheduler 发布图片 Pin。用户可为每个 Pinterest 账号选择目标画板、填写 Pin 标题，并使用平台版本文案和可选网站链接发布。发布结果应继续出现在现有日历和帖子管理页面。

## 已确认的产品规则

1. 第一版仅支持 Pinterest 图片 Pin，不支持视频 Pin。
2. 每个 Pinterest Pin 必须使用一张图片；不支持多图 Pin。
3. 每个选中的 Pinterest 账号独立选择画板并填写标题。
4. 平台版本中的 Pinterest 文案作为 Pin `description`。
5. Pinterest 的“网站链接”为 Pin 的真实点击跳转链接；不附加到描述末尾。该字段可为空。
6. 立即发布和定时发布均应走现有发布任务队列。
7. 对未来排程仍引用的原图，清理程序不得在发布前删除。
8. 原图在发布成功后继续遵循现有本地素材保留策略；已发布内容页保留缩略图并标注原素材清理状态。

## 方案比较

### 方案 A：原生 Pinterest 图片 Pin 发布（采用）

服务端读取用户 OAuth 凭证与画板，前端选择画板并提交专属设置，Worker 调用 Pinterest API 创建 Pin。

优点：安全、符合 OAuth 模型、可定时发布、可提供审核所需的真实端到端流程，且可复用现有队列、任务状态和帖子管理能力。

代价：需要增加画板读取接口、Pinterest 发布器、前端设置组件与覆盖测试。

### 方案 B：手工填写画板 ID

前端不读取画板，用户直接填 Pinterest Board ID。

优点：开发少。

缺点：用户容易填错，体验差，难以满足真实集成演示需求，不采用。

### 方案 C：浏览器直接调用 Pinterest API

浏览器直接向 Pinterest 发送发布请求。

缺点：会暴露或不当处理 OAuth 凭证，并受跨域限制；不安全且不符合现有服务端发布架构，不采用。

## 架构

```
内容编辑页
  ├─ PinterestPinSettings（按已选 Pinterest 账号）
  │    └─ 读取画板、选择画板、输入标题、使用可选跳转链接
  └─ Composer API
       └─ Post / PostVariant / PublishJob（现有模型）
            └─ Worker（现有队列）
                 └─ PinterestPublisher
                      └─ Pinterest API：读取画板 / 创建 Pin
```

不会新建数据库表。每个 Pinterest 账号的 `boardId`、`boardName`、`title` 和可选 `link` 存入已存在的 `PostVariant.platformPayload` JSON 字段。这样同一篇内容向多个 Pinterest 账号发布时可各自使用不同画板和标题。

## 后端组件

### 1. Pinterest 画板读取

新增受当前工作区成员权限保护的 API。前端只传工作区 ID 和已绑定的 Pinterest 社交账号 ID；服务端验证账号归属、解密 OAuth token 后调用 Pinterest 的画板读取 API。浏览器永远不接触 Pinterest access token 或 client secret。

返回最少字段：`id`、`name`、`description`、`privacy`。请求失败时返回可读的错误，例如“Pinterest 授权已失效，请重新连接账号”。

### 2. Composer 校验

对于 Pinterest 立即发布或定时发布，服务端必须验证：

- 账号处于当前工作区且为 active；
- `platformPayload.boardId`、`platformPayload.title` 存在且为非空字符串；
- 媒体总数恰好为 1；
- 媒体为 Pinterest 支持的图片 MIME 类型；
- `link` 若存在，必须是有效的 `http` 或 `https` URL；
- 不允许 Pinterest 视频或无素材直接发布。

保存草稿允许暂时未填写这些字段；在点击发布时才阻断并显示明确提示。

### 3. PinterestPublisher

新增 `PinterestPublisher`，实现现有 `SocialPublisher` 接口。Worker 通过既有 registry 将 `pinterest` 分派到该发布器。

发布器负责：

1. 验证工作区内 active Pinterest 账号并解密凭证；
2. 解析和校验 `platformPayload`；
3. 使用 Worker 已解析的可访问图片 URL 调用 Pinterest Create Pin API；
4. 返回 Pinterest Pin ID、可打开的 permalink 和经脱敏的原始响应；
5. 将 Pinterest 的授权、画板、图片 URL 或参数错误翻译为可操作的任务失败原因。

网络或 Pinterest 暂时性错误继续使用现有 BullMQ 重试策略；参数、权限和素材类型错误不应被无意义重复重试。

## 前端体验

### PinterestPinSettings

在内容编辑页选中一个或多个 Pinterest 账号后，每个账号显示一个独立设置卡：

- 账号名称；
- “选择画板”下拉框，加载中、空画板、重新连接失败等明确状态；
- “Pin 标题（必填）”输入框；
- “网站链接（可选）”输入框，沿用 Pinterest 平台版本链接值；
- 说明：帖子文案将作为 Pin 描述，链接为图片点击跳转地址；
- 说明：Pinterest 图片 Pin 仅支持一张图片。

用户切换工作区或取消选择账号时，画板与设置状态会按账号 ID 清理，避免把一个账号的画板错误提交到另一个账号。

提交 payload 时，Pinterest 账号保存独立 `platformPayload`。其他平台的 payload（尤其 TikTok 的发布选项）不改变。

### 发布按钮与预览

Pinterest 从“暂不支持真实发布”名单移除。只要选中账号和必填内容完整，现有“立即发布”和“定时发布”按钮可用。缺少图片、画板或标题时，发布校验显示具体缺失项。

发布摘要中的 Pinterest 卡片继续显示预览；预览文案使用 Pinterest 平台版本，链接显示为目标网址。日历和帖子管理继续通过既有 `providerPermalink` 显示“打开已发布内容”。

## 素材保留与清理

发布前，清理任务必须跳过仍被未来排程任务引用的原始素材，避免用户选择定时发布后 24 小时素材先被删除。发布器执行期间也不得清理该任务引用的素材。

发布成功后，原图按现有“已发布 24 小时”规则清理；失败或取消按现有“失败 72 小时”规则清理。缩略图沿用当前 180 天策略。复制旧帖子时，若原图已经清理，仍提示用户重新上传素材。

## 错误处理

| 场景 | 用户看到的提示 |
| --- | --- |
| Pinterest OAuth token 无效或已撤销 | Pinterest 授权已失效，请重新连接账号后再发布。 |
| 无画板或无法读取画板 | 无法读取 Pinterest 画板，请检查账号权限或重新连接。 |
| 未选画板 | 请为 Pinterest 账号选择一个画板。 |
| 未填标题 | 请填写 Pinterest Pin 标题。 |
| 无图、视频或多图 | Pinterest 图片 Pin 需要且仅允许上传一张图片。 |
| 原图已不可访问 | 发布素材已过期或已清理，请重新上传图片后再发布。 |
| Pinterest API 返回错误 | 保留平台返回的安全摘要，并在任务详情展示可操作的中文/英文提示。 |

## 安全和权限

- Pinterest client secret 和 access token 只保存在服务器环境变量或加密凭证列中。
- 画板列表 API 必须验证请求用户是该工作区的有效成员，且账号属于该工作区。
- 日志不得输出 token、client secret 或完整 Authorization header。
- OAuth scope 保持最小必要集合：读取账号/画板并创建 Pin。

## 测试与验收

### 自动化测试

1. Pinterest `platformPayload` 解析及校验：画板、标题、链接、单图限制。
2. Composer 服务：Pinterest 缺少必填项时拒绝真实发布，草稿仍可保存。
3. PinterestPublisher：成功返回 Pin ID/permalink，授权失败、无效画板、错误图片分别产生清晰错误。
4. 画板读取路由：未登录、非成员、账号不属工作区、成功读取和上游失败。
5. Composer 前端：选 Pinterest 账号后加载画板、保存 payload、提交显示缺失字段错误。
6. 清理逻辑：未来排程引用的素材不会提前删除。

### 手工验收

1. 绑定 Pinterest 账号，确认可读取至少一个画板。
2. 选择一张图片、一个画板，填写标题、描述和可选链接后立即发布。
3. 在 Pinterest 账号中确认 Pin 出现在所选画板，标题/描述/跳转链接正确。
4. 在 Social Scheduler 日历和帖子管理中打开已发布 Pin。
5. 创建超过 24 小时后的定时任务，确认素材在任务完成前没有被清理。
6. 选择视频、多图或缺少标题/画板时，确认不能发布且提示明确。

## 非目标

- Pinterest 视频 Pin；
- Pinterest Analytics、广告、评论和消息；
- 多图/Carousel Pin；
- 修改 Pinterest 已发布 Pin；
- 改变其他平台现有发布或素材清理规则，除了保护仍被未来排程引用的素材。
