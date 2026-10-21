# 页面语言首屏一致性修复

2026-10-21，用户确认修复选择英文后切页先中文再英文的问题，验证后仅部署网页，不重启API／Worker，不改权限、凭据、排程或新增收费资源。

## 根因与范围

LanguageProvider旧实现固定以zh-CN渲染，再在useEffect读取localStorage；另一个初始effect同时把默认中文写回存储。部分普通链接会整页加载，使中文SSR首屏和延迟切换更明显。

本次让根布局读取严格校验的非敏感语言偏好cookie，将同一初始locale传给服务端HTML与Provider。用户主动切换时同步写cookie和localStorage，再更新状态，导航前即可保存。旧版仅有localStorage的偏好由head内固定脚本在绘制前标记不匹配，匹配完成才显示body；已有正确cookie不使用这个迁移遮罩。存储和cookie受限时仍可使用页面及手动切换，无新增依赖／API／后台任务。

公开官网、隐私、条款采用URL指定语言，显式标注main的lang；不把后台偏好强加给其正文。隐私别名复用修正页面，数据删除中文正文也标注zh-CN。没有改公开页面的业务内容。

## 测试驱动与复核

- 两项原始回归先失败：英文SSR仍输出控制台；初始化记录了zh-CN写入。实现后通过。
- cookie访问受限测试先复现组件抛错，再以单独捕获修复，通过。覆盖HTTPS Secure属性、cookie优先于过期localStorage、手动切换持久化、旧偏好迁移及语言枚举校验。
- 独立只读复核唯一P2：后台英文偏好不能使中文公开内容继承错误语言标识。实际公开页渲染测试先失败，再为七个固定语言正文添加lang，通过。无其他阻塞项；未派发二轮复核。未评估的生产缓存已安排线上头验证，现有Caddy无缓存配置；无关脏文档和输出均保留。
- 最终聚焦6/6通过。React test renderer既有弃用警告保留；服务端与客户端测试分文件，避免混用渲染器产生上下文警告。
- 最终网页生产构建退出0，26页，cookie个性化页面按请求服务端渲染。现有Next多锁文件提示保留。日志`locale-flash-web-final-build-20261021.log`。

## 真实浏览器

Playwright命名本机会话locale-release，使用最终Next生产构建，只有127.0.0.1:4331网页及合成只读API响应，其他外部请求全部阻断；假登录字符串仅存在专用本机浏览器，不是生产会话。没有提交登录／OAuth／发布或排程请求。

英文cookie下登录与注册页原始HTML为Sign in／Create account，可见帧也只有对应英文。控制台→社交账号→控制台整页导航，原始HTML和采样帧只有Dashboard／Social accounts；侧栏实际Next链接切页也保持英文。旧版迁移测试故意阻塞JS但放行CSS：确认body在中文SSR时不可见，放行后英文显示且pending移除。已查看`output/playwright/locale-english-dashboard.png`，控制台显示英文；浏览器控制台0错误／0警告。

本机辅助脚本首次因PowerShell参数引号损失发生SyntaxError，改用Node进程参数调用官方CLI；一次迁移探针误阻塞CSS导致等待超时，改为仅阻塞JS后通过。这些均是测试工具问题，没有修改产品以迁就探针。找回密码页既有硬编码中文不属于先中文再英文的初始化问题，本次未扩展翻译范围。

## 发布门禁

完整npm test已通过：1065/1065，0失败／0取消／0跳过，1191409ms，退出0；尚未部署。日志`C:/Users/Administrator/AppData/Local/SocialSchedulerTools/locale-flash-full-tests-20261021.log`。完整运行启动后新增的公开语言回归已被随后整套网页测试覆盖：296/296通过，0失败／0跳过，129630ms，退出0，日志`locale-flash-all-web-tests-20261021.log`。这些是两个运行的证据，不相加声称1361个不同测试；产品修改均在完整回归进入网页测试前完成。

浏览器另验证切回中文后刷新，社交账号的原始语言及可见帧均为zh-CN／社交账号；最后切回英文。专用浏览器会话已关闭，精确核对命令和PID的本机预览进程41076已停止，未影响其他浏览器／API／Worker。

只读云预检inv-ha62ijgrgj成功（2026-10-21 01:28:07–11UTC）：API／网页仍de1541325184c6706c8aacf4a6eb753fe478b055；磁盘可用9856376KiB，MemAvailable2394328KiB，Redis仍maxmemory0/noeviction。API、Worker、Redis、数据库与代理仍为原容器；Worker自2026-10-13T06:01:58.401954871Z未重启。
