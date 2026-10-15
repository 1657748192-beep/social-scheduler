import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import jwt from 'jsonwebtoken';
import type {TestContext} from 'node:test';
import {validateLocalUploadTestEnvironment,createLocalUploadFixture} from './localUploadFixture';

export async function startLocalUploadHttp(t:TestContext,f:Awaited<ReturnType<typeof createLocalUploadFixture>>,options:{composer?:boolean}={}){
  const urls=validateLocalUploadTestEnvironment(process.env);
  const secret='local-upload-http-test-secret-only';
  const child=fork(path.resolve('apps/api/tests/fixtures/localUploadHttp.ts'),[],{cwd:path.dirname(f.root),execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,DATABASE_URL:urls.databaseUrl,REDIS_URL:urls.redisUrl,JWT_SECRET:secret,MEDIA_STORAGE:'local',LOCAL_UPLOAD_HTTP_ROOT:f.root,LOCAL_UPLOAD_HTTP_PREFIX:f.prefix,LOCAL_UPLOAD_HTTP_COMPOSER:options.composer?'1':'0'}});
  f.onDispose(async()=>{if(child.exitCode===null){if(child.connected)child.send('stop'); await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}});
  const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Isolated upload HTTP server did not start')),15000);child.once('message',(m:any)=>{clearTimeout(timer);resolve(m.port);});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Isolated server exited ${code}`));});});
  const sessionId=randomUUID(),tokenId=randomUUID();
  await f.db.userSession.create({data:{id:sessionId,userId:f.actor.userId,tokenId,expiresAt:new Date(Date.now()+3600000)}});
  const token=jwt.sign({sub:f.actor.userId,email:`${f.actor.userId}@example.test`,sid:sessionId,jti:tokenId},secret,{expiresIn:'1h'});
  const base=`http://127.0.0.1:${port}/api/v1/workspaces/${f.actor.workspaceId}/media`;
  return {base,token,request:(suffix:string,options:RequestInit={})=>fetch(base+suffix,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}})};
}
