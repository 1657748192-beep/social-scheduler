#!/usr/bin/env bash
set -euo pipefail
umask 077
target=${META_INBOX_TARGET:?Explicit target commit required}
rescue=${META_INBOX_RESCUE_TARGET:?Explicit compatible rescue commit required}
[[ $target =~ ^[0-9a-f]{40}$ && $rescue =~ ^[0-9a-f]{40}$ ]]
[[ $rescue = 79420f69d5da9cb93a150bb74e6d16b0643a0ab5 ]]
[[ ${META_INBOX_INSTANCE:-} = lhins-qkg26b57 ]]
[[ ${META_INBOX_DEPLOY_APPROVED:-} = yes ]]
instance=$(curl -fsS --max-time 3 http://metadata.tencentyun.com/latest/meta-data/instance-id)
# The allowlisted Lighthouse instance maps to this independently verified metadata ID.
[[ $instance = ins-4jabsxgk ]]
repo=$(realpath "${META_INBOX_REPO_ROOT:-/opt/social-scheduler}")
release_root=$(realpath -m "${META_INBOX_RELEASE_ROOT:-/opt/social-scheduler-releases}")
[[ $(basename "$repo") = social-scheduler && $(basename "$release_root") = social-scheduler-releases ]]
[[ ! -L "$release_root" ]]
release="$release_root/meta-inbox-$target"
[[ ! -L "$release" ]]
public_origin=${META_INBOX_PUBLIC_ORIGIN:?Explicit public origin required}
[[ $public_origin = https://app.bufferhelp.com ]]
cd "$repo"
[[ $(git rev-parse --verify "$target^{commit}") = "$target" ]]
git cat-file -e "$rescue^{commit}"
dc() { docker compose --env-file .env --env-file .env.sandbox.local -f docker-compose.yml -f docker-compose.server.yml "$@"; }
protected_containers() {
 for service in worker postgres redis reverse-proxy; do
  printf '%s:' "$service"
  docker inspect --format '{{.Id}}|{{.Image}}|{{.State.StartedAt}}' "$(dc ps -q "$service")"
 done
}
publishing_snapshot() {
 docker exec -i "$(dc ps -q api)" node <<'NODE'
const {PrismaClient}=require('@prisma/client'),{createHmac}=require('node:crypto');const db=new PrismaClient();
(async()=>{if(!process.env.TOKEN_ENCRYPTION_KEY)throw Error('Snapshot key unavailable');const models=['socialAccount','oauthCredential','tikTokSandboxCredential','post','postVariant','schedule','publishJob'];const result=await db.$transaction(async tx=>{const out={};for(const name of models){const rows=await tx[name].findMany({orderBy:{id:'asc'}});out[name]={count:rows.length,hmac:createHmac('sha256',process.env.TOKEN_ENCRYPTION_KEY).update(JSON.stringify(rows)).digest('hex')};}return out;},{isolationLevel:'RepeatableRead'});console.log(JSON.stringify(result));})().catch(()=>{console.error('Protected snapshot unavailable');process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
}
schema_preconditions() {
 docker exec -i "$(dc ps -q api)" node <<'NODE'
// META_INBOX_SCHEMA_PRECONDITIONS — reject legacy IG placeholders, never guess a mapping.
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{const rows=await db.$queryRaw`SELECT count(*)::int AS count FROM "InteractionAsset" WHERE platform='instagram' AND "connectionId" IS NOT NULL`;if(rows[0].count!==0)throw Error();console.log('SCHEMA_PRECONDITIONS_CLEAR');})().catch(()=>{console.error('Schema preconditions require read-only investigation');process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
}
assert_protected() {
 sha256sum -c "$release/env-before.sha256" >/dev/null
 protected_containers > "$release/containers-current"
 cmp "$release/containers-before" "$release/containers-current"
 publishing_snapshot > "$release/publishing-current.json"
 cmp "$release/publishing-before.json" "$release/publishing-current.json"
}
