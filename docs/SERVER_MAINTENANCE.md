# Server Maintenance

This server setup keeps application code in GitHub and production secrets in `/opt/social-scheduler/.env`.

## Normal Deploy

Run this on the Ubuntu server:

```bash
cd /opt/social-scheduler
bash scripts/deploy-server.sh
```

The script pulls `origin/main`, preserves `.env`, builds Docker images, restarts services, and checks:

```text
https://app.bufferhelp.com/api/v1/health
```

## First-Time Conversion

If `/opt/social-scheduler` is not a Git checkout yet, run:

```bash
cd /tmp
rm -rf social-scheduler-bootstrap
git clone --depth 1 https://github.com/1657748192-beep/social-scheduler.git social-scheduler-bootstrap
bash /tmp/social-scheduler-bootstrap/scripts/deploy-server.sh
```

The old `/opt/social-scheduler` folder is moved to `/opt/social-scheduler-releases/` and the existing `.env` is copied into the new Git-managed deployment.

## Environment File

Keep production secrets only on the server:

```text
/opt/social-scheduler/.env
```

Required values:

```env
POSTGRES_USER=app
POSTGRES_DB=social_scheduler
POSTGRES_PASSWORD=...
PUBLIC_API_URL=https://app.bufferhelp.com
PUBLIC_WEB_URL=https://app.bufferhelp.com
JWT_SECRET=...
JWT_EXPIRES_IN=7d
TOKEN_ENCRYPTION_KEY=...
FACEBOOK_CLIENT_ID=...
FACEBOOK_CLIENT_SECRET=...
```

Do not commit `.env` to GitHub.

## Database Backup

Manual backup:

```bash
cd /opt/social-scheduler
bash scripts/backup-db.sh
```

Backups are written to:

```text
/opt/social-scheduler/backups
```

## Useful Checks

```bash
cd /opt/social-scheduler
docker compose --env-file .env -f docker-compose.yml -f docker-compose.server.yml ps
curl -fsS https://app.bufferhelp.com/api/v1/health && echo
docker logs --tail=120 social_scheduler_api
```

## Multi-Computer Development

1. Clone the repository on any computer.
2. Make code changes.
3. Commit and push to GitHub.
4. SSH or open Tencent Cloud terminal.
5. Run `bash scripts/deploy-server.sh` on the server.

The server should not be used as the main development machine.
