#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
attempts=${META_INBOX_HEALTH_ATTEMPTS:-20}
[[ $attempts =~ ^([1-9]|1[0-9]|20)$ ]]
healthy=false
for ((i=0;i<attempts;i++)); do
 if curl -fsS --max-time 5 "$public_origin/api/v1/health" > "$release/health.json"; then healthy=true; break; fi
 sleep 2
done
[[ $healthy = true ]]
assert_protected
for service in api web; do
 [[ $(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$(dc ps -q "$service")") = "$target" ]]
done
docker exec -i "$(dc ps -q api)" node > "$release/runtime-check.txt" <<'NODE'
// META_INBOX_VERIFY_RUNTIME — server-only booleans and migration presence, no secrets.
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{for(const name of ['INSTAGRAM_MANAGEMENT_ENABLED','INSTAGRAM_MANAGEMENT_RECEPTION_ENABLED','META_INBOX_DELETION_ENABLED'])if(process.env[name]&&process.env[name]!=='false')throw Error();if(process.env.META_INBOX_LIVE_ASSETS_JSON&&process.env.META_INBOX_LIVE_ASSETS_JSON!=='[]')throw Error();const rows=await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;const names=new Set(rows.map(v=>v.migration_name));for(const name of ['20261017000300_meta_inbox_independent_instagram','20261018000400_meta_deletion_durable_locator','20261018000500_meta_app_deletion_receipt','20261018000600_meta_app_deletion_namespace_bounds','20261018000700_meta_grant_deletion_fence','20261019000800_facebook_management_consent_provenance','20261019000900_facebook_interaction_source_epoch','20261019001000_facebook_reply_target_digest'])if(!names.has(name))throw Error();const {requireInboxAccess}=require('./dist/interactionInbox/access'),{isPlatformAdmin}=require('./dist/utils/platformAdmin'),{LOGIN_SESSION_MAX_AGE_MS}=require('./dist/utils/sessionLifetime');const sessions=await db.userSession.findMany({where:{revokedAt:null,expiresAt:{gt:new Date()},createdAt:{gt:new Date(Date.now()-LOGIN_SESSION_MAX_AGE_MS)}},orderBy:{createdAt:'desc'},take:100});let checked=false;for(const s of sessions){const member=await db.workspaceMember.findFirst({where:{userId:s.userId,status:'active'},include:{user:{select:{email:true}}}});if(!member||isPlatformAdmin(member.user.email))continue;let denied=false;try{await requireInboxAccess(db,{userId:s.userId,sessionId:s.id,workspaceId:member.workspaceId});}catch(error){if(error.statusCode===403)denied=true;else throw error;}if(!denied)throw Error();checked=true;break;}console.log(checked?'ORDINARY_CUSTOMER_DENIAL_CONFIRMED':'ORDINARY_CUSTOMER_PROBE_UNAVAILABLE');console.log('GATES_CLOSED_AND_MIGRATIONS_PRESENT');})().catch(()=>{console.error('Runtime gate or schema check failed');process.exitCode=1;}).finally(()=>db.$disconnect());
NODE
grep -qx 'GATES_CLOSED_AND_MIGRATIONS_PRESENT' "$release/runtime-check.txt"
workspace=11111111-1111-4111-8111-111111111111
for endpoint in "interaction-inbox/accounts" "instagram-management/status?accountId=11111111-1111-4111-8111-111111111111"; do
 code=$(curl -sS --max-time 10 -o "$release/unauthenticated.json" -w '%{http_code}' "$public_origin/api/v1/workspaces/$workspace/$endpoint")
 [[ $code = 401 ]]
done
build_id=$(docker exec "$(dc ps -q web)" cat .next/BUILD_ID)
[[ $build_id =~ ^[a-zA-Z0-9_-]{1,100}$ ]]
docker exec "$(dc ps -q web)" cat ".next/static/$build_id/_buildManifest.js" > "$release/container-manifest.js"
curl -fsS --max-time 10 "$public_origin/_next/static/$build_id/_buildManifest.js" > "$release/public-manifest.js"
cmp "$release/container-manifest.js" "$release/public-manifest.js"
curl -fsS --max-time 10 "$public_origin/inbox" > "$release/inbox.html"
assert_protected
printf 'PUBLIC_BUILD_GATES_SCHEMA_AND_PROTECTED_STATE_VERIFIED\n'
