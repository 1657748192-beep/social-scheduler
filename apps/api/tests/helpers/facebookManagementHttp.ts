import {fork} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function startFacebookManagementHttp(){
  // Reuse the repository's named-container checks and local-only validators.
  // The application runs only in a disposable child, never against parent env.
  const env=require('../../../../scripts/run-tests.cjs').environment(true,true);
  const child=fork(path.resolve('apps/api/tests/fixtures/facebookManagementHttp.ts'),[],{execArgv:['--import',pathToFileURL(require.resolve('tsx')).href],stdio:['ignore','ignore','ignore','ipc'],env:{...env,DATABASE_URL:env.FACEBOOK_TEST_DATABASE_URL,REDIS_URL:env.LOCAL_UPLOAD_TEST_REDIS_URL,FACEBOOK_MANAGEMENT_ENABLED:'false',JWT_SECRET:'facebook-management-http-test-only'}});
  const stop=async()=>{if(child.exitCode!==null)return;if(child.connected)child.send('stop');await new Promise<void>(r=>{const timer=setTimeout(()=>{child.kill();r();},3000);child.once('exit',()=>{clearTimeout(timer);r();});});};
  try{
    const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Isolated Facebook HTTP fixture did not start')),15000);child.once('message',(message:any)=>{clearTimeout(timer);if(typeof message?.port!=='number')reject(Error('Invalid fixture port'));else resolve(message.port);});child.once('exit',()=>{clearTimeout(timer);reject(Error('Isolated Facebook HTTP fixture exited'));});});
    return{origin:`http://127.0.0.1:${port}`,stop};
  }catch(error){await stop();throw error;}
}
