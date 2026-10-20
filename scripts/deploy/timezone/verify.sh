#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
healthy=false
for attempt in $(seq 1 20); do
 if curl -fsS --max-time 5 https://app.bufferhelp.com/api/v1/health > "$release/health.json";then healthy=true;break;fi
 sleep 2
done
[[ $healthy = true ]]
python3 - "$release/health.json" <<'PY'
import json,sys
health=json.load(open(sys.argv[1]));assert health.get('ok') is True
PY
for service in api web; do
 [[ $(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(dc ps -q "$service")") = "$target" ]]
 docker inspect "$(dc ps -q "$service")" > "$release/$service-after.private.json"
done
python3 - "$release" <<'PY'
import json,pathlib,sys
r=pathlib.Path(sys.argv[1])
for s in ['api','web']:
 before=json.loads((r/(s+'-before.private.json')).read_text())[0]
 after=json.loads((r/(s+'-after.private.json')).read_text())[0]
 assert sorted(before['Config']['Env'])==sorted(after['Config']['Env']), 'Runtime environment changed'
 def mounts(c):return sorted((m['Type'],m.get('Name','') if m['Type']=='volume' else m['Source'],m['Destination'],m['RW']) for m in c['Mounts'] if not m['Destination'].startswith('/run/social-scheduler/timezone-capacity/'))
 assert mounts(before)==mounts(after), 'Existing runtime mount changed'
 for m in after['Mounts']:
  if m['Destination'].startswith('/run/social-scheduler/timezone-capacity/'):assert not m['RW']
 assert after['HostConfig'].get('Privileged')==before['HostConfig'].get('Privileged')==False
 assert not any(m['Destination']=='/var/run/docker.sock' for m in after['Mounts'])
PY
assert_infrastructure
publishing_snapshot > "$release/publishing-after.json"
cmp "$release/publishing-before.json" "$release/publishing-after.json"
[[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://app.bufferhelp.com/api/v1/timezone-rules/manifest) = 401 ]]
[[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://app.bufferhelp.com/composer) = 200 ]]
build_id=$(docker exec "$(dc ps -q web)" cat .next/BUILD_ID)
[[ $build_id =~ ^[a-zA-Z0-9_-]{1,100}$ ]]
docker exec "$(dc ps -q web)" cat ".next/static/$build_id/_buildManifest.js" > "$release/container-manifest.js"
curl -fsS --max-time 10 "https://app.bufferhelp.com/_next/static/$build_id/_buildManifest.js" > "$release/public-manifest.js"
cmp "$release/container-manifest.js" "$release/public-manifest.js"
docker exec -i "$(dc ps -q api)" node <<'NODE'
const Redis=require('ioredis'),{cacheHeadroom}=require('./dist/timezoneRules/capacity'),{baselineBundle,createRuleSnapshot}=require('@social-scheduler/timezone-rules');
const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,connectTimeout:1000,commandTimeout:1000,retryStrategy:()=>null});r.on('error',()=>{});
(async()=>{if(!await cacheHeadroom(r))throw Error('Capacity denied');const rules=createRuleSnapshot(baselineBundle);if(rules.offsetAt('Asia/Shanghai',Date.parse('2026-10-20T00:00:00Z'))!==480)throw Error('Invalid baseline');const status=await r.get('timezone-rules:v1:status');console.log(JSON.stringify({capacity:true,baseline:baselineBundle.tzdbVersion,updateStatus:status?JSON.parse(status):null}));})().catch(()=>{console.error('Timezone verification failed');process.exitCode=1;}).finally(()=>r.disconnect());
NODE
printf 'VERIFIED_HEALTH_ENVIRONMENT_PROTECTED_DATA_READONLY_PROBES\n'
