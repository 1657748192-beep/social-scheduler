import test from 'node:test';import assert from 'node:assert/strict';
import {createInstagramManagementOAuth} from '../src/instagramManagement/oauth';
import {createLiveInboxPolicy} from '../src/interactionInbox/livePolicy';
import express from 'express';import {createInstagramManagementRouter} from '../src/instagramManagement/routes';

test('independentOAuthDefaultsToSessionReuseAndForcesLoginOnlyWhenExplicitlyRequested',async()=>{
 // Only state persistence is replaced; actual state generation, input parsing
 // and provider URL construction run here. Real DB authorization/state replay
 // and publishing-snapshot invariants run in the OAuth integration suite.
 const scopes=['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'];
 const oauth=createInstagramManagementOAuth({db:{} as any,config:{enabled:true,appId:'456',appSecret:'private-secret',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:scopes},policy:createLiveInboxPolicy([]),store:{createState:async()=>({})} as any,exchange:async()=>{throw Error('Must not exchange before consent');}});
 const ctx={workspaceId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333'};
 const states=new Set<string>();
 for(const mode of [undefined,false,true]){
 const url=new URL((await oauth.start(ctx,'44444444-4444-4444-8444-444444444444',mode)).authorizationUrl);
 assert.equal(url.origin,'https://www.instagram.com');assert.equal(url.pathname,'/oauth/authorize');assert.equal(url.searchParams.get('force_reauth'),mode===true?'true':'false');assert.equal(url.searchParams.has('force_authentication'),false);
 assert.equal(url.searchParams.get('redirect_uri'),'https://example.test/api/v1/integrations/instagram-management/oauth/callback');assert.equal(url.searchParams.get('scope'),'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages');
 assert.match(url.searchParams.get('state')??'',/^[A-Za-z0-9_-]{43}$/);assert.equal(url.searchParams.has('client_secret'),false);
 states.add(url.searchParams.get('state')!);
 }assert.equal(states.size,3);
});

test('start route accepts only a boolean login choice and forwards it without accepting provider identity overrides',async()=>{
 const accountId='44444444-4444-4444-8444-444444444444',workspaceId='11111111-1111-4111-8111-111111111111';let states=0;
 const oauth=createInstagramManagementOAuth({db:{} as any,config:{enabled:true,appId:'456',appSecret:'synthetic',graphVersion:'v25.0',callbackUrl:'https://example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:['instagram_business_basic','instagram_business_manage_messages']},policy:createLiveInboxPolicy([]),store:{createState:async()=>{states++;}} as any,exchange:async()=>{throw Error('No provider calls');}});
 const app=express();app.use(express.json());app.use('/api/v1',createInstagramManagementRouter({oauth,require:async()=>{}} as any,{webAppUrl:'https://example.test',authenticate:(req,_res,next)=>{req.user={id:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333'} as any;next();}}));app.use((_e:any,_req:any,res:any,_next:any)=>res.status(400).json({message:'invalid'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const send=(body:any)=>fetch(`http://127.0.0.1:${(server.address() as any).port}/api/v1/workspaces/${workspaceId}/instagram-management/oauth/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const mode of [undefined,false,true]){const response=await send({accountId,...(mode===undefined?{}:{forceReauth:mode})});assert.equal(response.status,200);assert.equal(new URL((await response.json()).authorizationUrl).searchParams.get('force_reauth'),mode===true?'true':'false');}
 for(const value of ['true','false',1,null,{}])assert.equal((await send({accountId,forceReauth:value})).status,400);
 assert.equal((await send({accountId,forceReauth:true,providerAccountId:'999'})).status,400);assert.equal(states,3);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
