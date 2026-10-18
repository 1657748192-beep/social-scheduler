import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {pendingInboxSend} from '../src/interactionInbox/sends';

test('settlingFirstPendingKeyCannotHideAnotherMergedUnknownKey',async()=>{
 const first=randomUUID(),second=randomUUID(),ctx={workspaceId:randomUUID(),userId:randomUUID(),sessionId:randomUUID()},source={platform:'instagram',connectionId:randomUUID(),connectionVersion:1,instagramAccountId:randomUUID()},asset={platform:'instagram',appNamespace:'456',connectionVersion:1};let queries=0;
 const db={$queryRaw:async()=>[{result:++queries===1?first:second,createdAt:new Date()}],interactionAudit:{findFirst:async()=>null}},registry={getInboxAdapter:()=>({pendingSend:async(_a:any,_s:any,key:string)=>({requestKey:key,status:key===first?'sent':'unknown',diagnosticId:null,createdAt:new Date().toISOString()})})};
 assert.equal((await pendingInboxSend(db as any,ctx,randomUUID(),source as any,asset as any,registry as any))?.requestKey,second);assert.equal(queries,2);
});
