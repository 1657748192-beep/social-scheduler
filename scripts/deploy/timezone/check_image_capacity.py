"""Run only the pure capacity reader, not server/maintenance/Worker startup."""
import json
import os
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
target = sys.argv[2]
old = json.loads((root / 'api-before.private.json').read_text())[0]
env = dict(v.split('=', 1) for v in old['Config']['Env'])
networks = list(old['NetworkSettings']['Networks'])
if len(networks) != 1:
    raise ValueError('Expected a single existing API network')
# The binding is 0600 and owned by the deployment user. With capabilities
# dropped, uid 0 cannot read another user's 0600 bind mount; use its real owner.
args = ['docker', 'run', '--rm', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--user', f'{os.getuid()}:{os.getgid()}', '--network', networks[0], '-e', 'REDIS_URL']
for mount in json.loads((root / 'probe.json').read_text())['mounts']:
    if ',' in mount['source']:
        raise ValueError('Unsupported mount path')
    args += ['--mount', 'type=bind,source=' + mount['source'] + ',target=' + mount['target'] + ',readonly']
code = "const Redis=require('ioredis'),{cacheHeadroom}=require('./dist/timezoneRules/capacity');const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,connectTimeout:1000,commandTimeout:1000,retryStrategy:()=>null});r.on('error',()=>{});cacheHeadroom(r).then(ok=>{if(!ok)throw Error('Capacity unavailable');console.log('VERIFIED_IMAGE_CAPACITY_OK');}).catch(()=>{console.error('Capacity check denied');process.exitCode=1;}).finally(()=>r.disconnect());"
args += ['social-timezone-api:' + target, 'node', '-e', code]
subprocess.run(args, env={**os.environ, 'REDIS_URL': env['REDIS_URL']}, check=True, timeout=30)
