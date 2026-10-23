import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
test('REC3 identity is stable across local remapping but isolates real provider messages and tenants',async()=>{
 const m=await import('../src/instagramManagement/recordingGrantIdentity').catch(()=>null);
 assert.ok(m?.instagramRecordingIncomingKey,'stable REC3 identity implementation required');
 const a={workspaceId:'11111111-1111-4111-8111-111111111111',appId:'456',providerAccountId:'100',providerEventId:'incoming-rec3'};
 const key=m.instagramRecordingIncomingKey;assert.equal(key(a),createHash('sha256').update(JSON.stringify(['ig-recording-message-grant-v1',a.workspaceId,'456','100','incoming-rec3'])).digest('hex'));
 assert.equal(key({...a,sourceRecordId:'new',connectionVersion:9} as any),key(a));
 for(const field of ['workspaceId','appId','providerAccountId','providerEventId'] as const)assert.notEqual(key({...a,[field]:field==='workspaceId'?'22222222-2222-4222-8222-222222222222':'999'}),key(a));
 for(const bad of ['', 'a'.repeat(257),'secret?token=x'])assert.throws(()=>key({...a,providerEventId:bad}));
});
