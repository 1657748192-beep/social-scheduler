#!/usr/bin/env bash
set -euo pipefail
umask 077
target=${TIMEZONE_TARGET:?Exact tested commit required}
[[ $target =~ ^[a-f0-9]{40}$ && ${TIMEZONE_DEPLOY_APPROVED:-} = yes ]]
[[ $(curl -fsS --max-time 3 http://metadata.tencentyun.com/latest/meta-data/instance-id) = ins-4jabsxgk ]]
cd /opt/social-scheduler
[[ -z $(git status --porcelain --untracked-files=no) ]]
[[ ! -L /opt/social-scheduler-releases ]]
release=/opt/social-scheduler-releases/timezone-$target
[[ ! -L "$release" ]]
dc(){ docker compose --env-file .env --env-file .env.sandbox.local -f docker-compose.yml -f docker-compose.server.yml "$@"; }
protected_containers(){
 for service in worker postgres redis reverse-proxy; do
  printf '%s:' "$service";docker inspect --format '{{.Id}}|{{.Image}}|{{.State.StartedAt}}' "$(dc ps -q "$service")"
 done
}
publishing_snapshot(){
 docker exec -i "$(dc ps -q api)" node <<'NODE'
const {PrismaClient}=require('@prisma/client'),{createHmac}=require('node:crypto'),db=new PrismaClient();
(async()=>{if(!process.env.TOKEN_ENCRYPTION_KEY)throw Error();const out=await db.$transaction(async tx=>{const result={};for(const name of ['user','workspace','workspaceMember','socialAccount','oauthCredential','tikTokSandboxCredential','post','postVariant','schedule','publishJob']){const rows=await tx[name].findMany({orderBy:{id:'asc'}});result[name]={count:rows.length,hmac:createHmac('sha256',process.env.TOKEN_ENCRYPTION_KEY).update(JSON.stringify(rows)).digest('hex')};}return result;},{isolationLevel:'RepeatableRead'});console.log(JSON.stringify(out));})().catch(()=>{console.error('Protected snapshot failed; no row data printed');process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
}
assert_infrastructure(){
 sha256sum -c "$release/env-before.sha256" >/dev/null
 protected_containers > "$release/containers-current"
 cmp "$release/containers-before" "$release/containers-current"
}
