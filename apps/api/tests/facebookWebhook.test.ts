import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import express from 'express';
import { createFacebookWebhookRouter } from '../src/routes/facebookWebhookRoutes';
import { parseFacebookWebhook } from '../src/services/facebookWebhookService';

test('signatureAndDurableAck',async()=>{
  let fail=false,received=0;
  const app=express();app.use('/webhook',createFacebookWebhookRouter({enabled:()=>true,appSecret:'test-secret',verifyToken:'verify',onEvents:async events=>{if(fail)throw new Error('db failed');received+=events.length;}}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address && typeof address!=='string');const url=`http://127.0.0.1:${address.port}/webhook`;
  try {
    assert.equal((await fetch(url+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
    assert.equal(await (await fetch(url+'?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123')).text(),'123');
    const body=JSON.stringify({object:'page',entry:[{id:'100',time:1791331200,messaging:[{sender:{id:'customer'},recipient:{id:'100'},timestamp:1791331200000,message:{mid:'m1',text:'hello'}}]}]});
    const signature='sha256='+createHmac('sha256','test-secret').update(body).digest('hex');
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body})).status,200);assert.equal(received,1);
    fail=true;assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature},body})).status,503);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('multiplePagesAndUnknownFieldsParseWithoutLosingKnownEvents',()=>{
  const parsed=parseFacebookWebhook({object:'page',entry:[
    {id:'100',time:1791331200,changes:[{field:'feed',value:{item:'comment',verb:'add',comment_id:'c1',post_id:'100_1',message:'hi',created_time:1791331200}},{field:'unknown',value:{}}]},
    {id:'200',messaging:[{sender:{id:'200'},recipient:{id:'customer'},timestamp:1791331200000,message:{mid:'echo',text:'reply',is_echo:true}}]}
  ]});
  assert.equal(parsed.events.length,2);assert.equal(parsed.ignored,1);assert.equal(parsed.events[1].isEcho,true);
  assert.equal(parseFacebookWebhook({object:'page',entry:[{id:'100',changes:[{field:'feed',value:{item:'comment',verb:'add'}}]}]}).invalid,1);
});
test('editedCommentsUseNotificationTimeNotOriginalCreationTime',()=>{
  const result=parseFacebookWebhook({object:'page',entry:[{id:'100',time:1791331300,changes:[{field:'feed',value:{item:'comment',verb:'edited',comment_id:'c1',post_id:'100_1',message:'edited',created_time:1791331200}}]}]});
  assert.equal(result.events[0].occurredAt,'2026-10-07T00:01:40.000Z');
});
test('mixedMalformedBatchPersistsValidEventsBeforeRequestingRetry',async()=>{
  let received=0;const app=express();app.use('/webhook',createFacebookWebhookRouter({enabled:()=>true,appSecret:'secret',verifyToken:'verify',onEvents:async events=>{received+=events.length;}}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address && typeof address!=='string');
  const body=JSON.stringify({object:'page',entry:[{id:'200',time:1791331200,changes:[{field:'feed',value:{item:'comment',verb:'add'}}]},{id:'100',time:1791331200,changes:[{field:'feed',value:{item:'comment',verb:'add',comment_id:'c1',post_id:'100_1'}}]}]});
  try{const result=await fetch(`http://127.0.0.1:${address.port}/webhook`,{method:'POST',body,headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256','secret').update(body).digest('hex')}});assert.equal(result.status,503);assert.equal(received,1);}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
