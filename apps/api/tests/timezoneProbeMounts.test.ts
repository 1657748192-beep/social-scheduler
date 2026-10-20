import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('deployment probe mounts only fresh read-only memory metrics including every Redis ancestor',async()=>{
 const root=await mkdtemp(join(tmpdir(),'timezone-mounts-'));
 const cg=join(root,'cgroup'),host=join(root,'meminfo'),binding=join(root,'binding.json');
 const script=resolve('scripts/deploy/timezone/prepare_probe.py');
 const run=(path='/system.slice/docker-test.scope')=>spawnSync(process.platform==='win32'?'python':'python3',['-c',
  'import runpy,json,sys; m=runpy.run_path(sys.argv[1]); print(json.dumps(m["build_probe"](*json.loads(sys.argv[2]))))',script,
  JSON.stringify([path,cg,host,'a'.repeat(40),binding])],{encoding:'utf8'});
 try{
  for(const level of ['','system.slice','system.slice/docker-test.scope'])await mkdir(join(cg,level),{recursive:true});
  await writeFile(host,'MemTotal: 3813268 kB\nMemAvailable: 2348972 kB\n');
  for(const level of ['system.slice','system.slice/docker-test.scope']){
   await writeFile(join(cg,level,'memory.max'),'max\n');await writeFile(join(cg,level,'memory.current'),'8005048\n');
  }
  const result=run();assert.equal(result.status,0,result.stderr);
  const {manifest,mounts}=JSON.parse(result.stdout);
  assert.deepEqual(manifest,{schemaVersion:1,redisRunId:'a'.repeat(40),levels:2});
  assert.equal(mounts.length,6);
  for(const mount of mounts){assert.equal(mount.type,'bind');assert.equal(mount.read_only,true);assert.equal(mount.bind.create_host_path,false);assert.ok(mount.target.startsWith('/run/social-scheduler/timezone-capacity/'));}
  assert.ok(mounts.some((m:any)=>m.source===join(cg,'system.slice/memory.current')));
  assert.ok(mounts.some((m:any)=>m.source===join(cg,'system.slice/docker-test.scope/memory.max')));
  assert.equal(run('/../../outside').status,1);
  await rm(join(cg,'system.slice/memory.max'));assert.equal(run().status,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('image capacity preflight is nonprivileged, read-only and runs as the probe file owner',async()=>{
 const root=await mkdtemp(join(tmpdir(),'timezone-image-check-'));
 const script=resolve('scripts/deploy/timezone/check_image_capacity.py');
 try{
  await writeFile(join(root,'api-before.private.json'),JSON.stringify([{Config:{Env:['REDIS_URL=redis://test-cache:6379']},NetworkSettings:{Networks:{'existing-network':{}}}}]));
  await writeFile(join(root,'probe.json'),JSON.stringify({mounts:[{source:join(root,'binding.json'),target:'/run/social-scheduler/timezone-capacity/binding.json',read_only:true}]}));
  const code='import runpy,sys,json; from unittest.mock import patch; script=sys.argv[1]; sys.argv=[script,sys.argv[2],sys.argv[3]]\nwith patch("os.getuid",return_value=1000,create=True),patch("os.getgid",return_value=1000,create=True),patch("subprocess.run") as run:\n runpy.run_path(script,run_name="__main__"); print(json.dumps(run.call_args.args[0]))';
  const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',code,script,root,'a'.repeat(40)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const command=JSON.parse(result.stdout);
  assert.equal(command[command.indexOf('--user')+1],'1000:1000');
  assert.ok(command.includes('--read-only'));assert.ok(command.includes('--cap-drop=ALL'));
  assert.equal(command[command.indexOf('--network')+1],'existing-network');
  assert.ok(command.some((a:string)=>a.startsWith('type=bind,')&&a.endsWith(',readonly')));
  assert.equal(command.includes('redis://test-cache:6379'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('real Compose rendering preserves exact environments and mounts while excluding migrations and isolating rollback',async()=>{
 const root=await mkdtemp(join(tmpdir(),'timezone-runtime-')),target='a'.repeat(40);
 const script=resolve('scripts/deploy/timezone/runtime_config.py');
 const python=(extra:string[]=[])=>spawnSync(process.platform==='win32'?'python':'python3',[script,root,target,...extra],{encoding:'utf8'});
 const probeTarget='/run/social-scheduler/timezone-capacity/meminfo';
 const compose=(name:string)=>spawnSync('docker',['compose','-p','timezone-test','-f',join(root,'base.json'),'-f',join(root,name),'config','--format','json'],{encoding:'utf8'});
 try{
  const apiEnv=['NODE_ENV=production','SECRET_TEST_ONLY=test-$missing${UNSET_FOR_TEST:-fallback}$$literal','EXISTING_FLAG=true','EMPTY_VALUE='];
  const webEnv=['NODE_ENV=production','NEXT_PUBLIC_API_URL=https://example.invalid/api/v1'];
  await writeFile(join(root,'api-before.private.json'),JSON.stringify([{Config:{Env:apiEnv,Cmd:['sh','-c','do-not-execute-migrate']},Mounts:[{Type:'volume',Name:'existing-upload-volume',Destination:'/app/apps/api/uploads',RW:true}]}]));
  await writeFile(join(root,'web-before.private.json'),JSON.stringify([{Config:{Env:webEnv,Cmd:['npm','run','start']},Mounts:[]}]));
  await writeFile(join(root,'probe.json'),JSON.stringify({mounts:[{type:'bind',source:join(root,'host-meminfo'),target:probeTarget,read_only:true,bind:{create_host_path:false}}]}));
  await writeFile(join(root,'base.json'),JSON.stringify({services:{api:{image:'old-api',environment:{NEW_DEFAULT_MUST_NOT_LEAK:'unsafe'},volumes:[]},web:{image:'old-web',environment:{NEW_DEFAULT_MUST_NOT_LEAK:'unsafe'}},worker:{image:'unchanged-worker'}},volumes:{}}));
  const generated=python();assert.equal(generated.status,0,generated.stderr);
  const rendered=compose('images.yml');assert.equal(rendered.status,0,rendered.stderr);
  const config=JSON.parse(rendered.stdout);
  // Config serialization re-escapes dollars for round-tripping; a real isolated
  // container below checks the literal process environment rather than assuming it.
  assert.deepEqual(config.services.api.environment,{NODE_ENV:'production',SECRET_TEST_ONLY:'test-$$missing$${UNSET_FOR_TEST:-fallback}$$$$literal',EXISTING_FLAG:'true',EMPTY_VALUE:''});
  assert.deepEqual(config.services.api.command,['node','dist/server.js']);
  assert.equal(config.services.worker.image,'unchanged-worker');
  assert.equal(config.services.api.volumes[0].source,'existing-upload-volume');
  assert.equal(config.volumes['existing-upload-volume'].external,true);
  const mounted=config.services.api.volumes.find((m:any)=>m.target===probeTarget);assert.equal(mounted.read_only,true);assert.equal(mounted.bind.create_host_path,false);
  await writeFile(join(root,'rendered.private.json'),rendered.stdout);assert.equal(python(['--verify-rendered']).status,0);
  config.services.api.environment.EXISTING_FLAG='false';await writeFile(join(root,'rendered.private.json'),JSON.stringify(config));assert.equal(python(['--verify-rendered']).status,1);
  const rollback=compose('rollback.yml');assert.equal(rollback.status,0,rollback.stderr);const prior=JSON.parse(rollback.stdout);
  assert.equal(prior.services.api.image,'social-timezone-prior-api:'+target);
  assert.equal(prior.services.api.volumes.length,1);assert.deepEqual(prior.services.api.environment,JSON.parse(rendered.stdout).services.api.environment);
  await writeFile(join(root,'run.yml'),'services:\n  api:\n    image: alpine:3.20\n    volumes: !reset []\n    network_mode: none\n');
  const actual=spawnSync('docker',['compose','-p','timezone-test','-f',join(root,'base.json'),'-f',join(root,'images.yml'),'-f',join(root,'run.yml'),'run','--rm','--no-deps','--pull','never','--entrypoint','printenv','api','SECRET_TEST_ONLY'],{encoding:'utf8'});
  assert.equal(actual.status,0,actual.stderr);assert.equal(actual.stdout.trim(),'test-$missing${UNSET_FOR_TEST:-fallback}$$literal');
 }finally{await rm(root,{recursive:true,force:true});}
});
