# 腾讯云 COS 私有素材存储

## 目标架构

生产环境启用 `MEDIA_STORAGE=cos` 后，浏览器向 API 申请一个只能写入单个随机对象路径、最长 30 分钟有效的 COS 临时凭证，然后直接上传到 COS。API 不再接收媒体二进制文件，也不再把新文件写入 Docker 卷。

COS 保持私有。页面预览和社媒发布使用 API/worker 按需生成的短期签名下载链接，永久密钥只保留在服务器 `.env` 中，绝不能提交到 Git 或发送到聊天中。

## 腾讯云控制台配置

1. 创建标准存储桶，地域选择与 CVM 相同的地域。
2. 桶访问权限选择 **私有读写**。存储桶名称必须包含 AppId，例如 `social-scheduler-1250000000`。
3. 在“安全管理 → 跨域访问 CORS 设置”添加一条规则：
   - Origin：`https://app.bufferhelp.com`
   - Methods：`GET`、`HEAD`、`PUT`、`POST`、`DELETE`
   - Allowed-Headers：`*`
   - Expose-Headers：`ETag`
   - Max-Age：`600`
4. 创建只供本项目服务器使用的 CAM 子账号和访问密钥。该账号需要能签发 STS 临时凭证，并在这个桶的 `social-scheduler/*` 路径范围内执行对象上传、读取元数据、读取、删除操作。不要使用主账号密钥。
5. 在 COS 生命周期中启用“未完成分块上传清理”，建议 1 天。不要对整个前缀设置固定天数的对象删除规则；COS 不知道一个文件是否仍被草稿或未来排程引用，应用 Worker 会按发布状态安全删除对象。

## 服务器 `.env`

在 `/opt/social-scheduler/.env` 加入下列配置。真实 `COS_SECRET_ID` 和 `COS_SECRET_KEY` 只能在服务器上填写。

```dotenv
MEDIA_STORAGE=cos
COS_SECRET_ID=你的-CAM-SecretId
COS_SECRET_KEY=你的-CAM-SecretKey
COS_BUCKET=social-scheduler-1250000000
COS_REGION=ap-guangzhou
COS_PREFIX=social-scheduler

# 内存较小的服务器建议保留 1；YouTube 视频通过流式转发，不再整段载入内存。
WORKER_CONCURRENCY=1

# 自动清理：上传未使用 24 小时后删除；所有关联发布任务均已成功的素材 90 天后删除。
MEDIA_UNUSED_RETENTION_HOURS=24
MEDIA_PUBLISHED_RETENTION_DAYS=90
MEDIA_CLEANUP_INTERVAL_HOURS=24
```

部署：

```bash
cd /opt/social-scheduler
sudo bash scripts/deploy-server.sh
```

部署日志应显示 `Media storage: cos`。若显示 `local`，不要上传正式素材，先检查 `.env` 中 `MEDIA_STORAGE=cos` 是否拼写正确。

## 旧本地素材迁移

新上传文件在启用 COS 后立即直传 COS；旧文件仍会暂时通过 `/uploads/` 读取。确认 COS 上传测试成功后，在服务器运行一次迁移：

```bash
cd /opt/social-scheduler
docker exec social_scheduler_api node dist/scripts/migrateLocalMediaToCos.js
```

单次最多迁移 100 个。若日志显示仍有待迁移文件，可再次运行；大批量时可指定：

```bash
docker exec -e MEDIA_MIGRATION_BATCH_SIZE=500 social_scheduler_api node dist/scripts/migrateLocalMediaToCos.js
```

迁移成功的每个文件会先上传 COS、更新数据库记录，再删除 Docker 卷中的旧文件；任一步失败都会保留旧文件和原数据库记录。请在迁移结束后检查站内旧草稿和排程的缩略图，再考虑清理空的 Docker 卷。

## 自动清理规则

Worker 启动时执行一次清理，此后每 `MEDIA_CLEANUP_INTERVAL_HOURS` 小时运行一次：

- 未完成的直传记录：超过 `MEDIA_UNUSED_RETENTION_HOURS` 删除 COS 对象和记录。
- 未被任何帖子引用的已上传素材：超过该小时数删除。
- 已被引用且所有关联发布变体都已发布成功的素材：超过 `MEDIA_PUBLISHED_RETENTION_DAYS` 删除。
- 草稿、排期中、发布中、失败的素材不会自动删除，避免破坏用户内容。

查看清理和迁移日志：

```bash
docker logs --tail=200 social_scheduler_worker
docker logs --tail=200 social_scheduler_api
```
