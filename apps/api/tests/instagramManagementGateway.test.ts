import test from 'node:test';import assert from 'node:assert/strict';
import {createInstagramManagementGateway} from '../src/instagramManagement/oauthGateway';
const config={enabled:true,appId:'456',appSecret:'private-app-secret',graphVersion:'v25.0',callbackUrl:'https://app.example.test/api/v1/integrations/instagram-management/oauth/callback',requiredScopes:['instagram_business_basic','instagram_business_manage_comments']};

test('gatewayReportsOnlyFixedFailureStageAndHttpStatusNeverProviderSecrets',async()=>{
 const original=console.warn,lines:string[]=[];console.warn=(...values)=>{lines.push(values.join(' '));};
 try{
  await assert.rejects(createInstagramManagementGateway({config,fetchImpl:(async()=>Response.json({access_token:'short-private',user_id:9007199254740992,permissions:config.requiredScopes,private:'private-app-secret one-use-code'})) as any}).exchange('one-use-code',config.callbackUrl));
  assert.deepEqual(lines,['IG_MANAGEMENT_EXCHANGE_FAILURE short_owner_precision 200']);
  lines.length=0;
  await assert.rejects(createInstagramManagementGateway({config,fetchImpl:(async()=>Response.json({error:{message:'private-app-secret one-use-code short-private'}},{status:400})) as any}).exchange('one-use-code',config.callbackUrl));
  assert.deepEqual(lines,['IG_MANAGEMENT_EXCHANGE_FAILURE short_request 400']);
 }finally{console.warn=original;}
});
test('gatewayUsesFixedHostsActualGrantsAndOwnerIdentity',async()=>{
 const seen:string[]=[];const fetchImpl:any=async(url:URL,init:any)=>{
  seen.push(url.origin+url.pathname);assert.equal(init.redirect,'error');assert.ok(init.signal);
  if(url.hostname==='api.instagram.com'){assert.equal(init.method,'POST');const form=new URLSearchParams(init.body);assert.equal(form.get('client_id'),'456');assert.equal(form.get('redirect_uri'),config.callbackUrl);return Response.json({access_token:'short-private',user_id:'100',permissions:config.requiredScopes});}
  if(url.pathname==='/access_token'){assert.equal(url.searchParams.get('access_token'),'short-private');return Response.json({access_token:'long-private',expires_in:5184000});}
  assert.equal(init.headers.Authorization,'Bearer long-private');return Response.json({id:'100',user_id:'100',username:'synthetic',account_type:'BUSINESS'});
 };
 const grant=await createInstagramManagementGateway({config,fetchImpl}).exchange('one-use-code',config.callbackUrl);
 assert.deepEqual(seen,['https://api.instagram.com/oauth/access_token','https://graph.instagram.com/access_token','https://graph.instagram.com/v25.0/me']);assert.equal(grant.providerAccountId,'100');assert.deepEqual(grant.scopes,config.requiredScopes);assert.equal(grant.accessToken,'long-private');
});
test('missingActualScopesNeverFallbackToRequestedScopes',async()=>{
 let calls=0;const gateway=createInstagramManagementGateway({config,fetchImpl:(async()=>{calls++;return Response.json({access_token:'short-private',user_id:'100'});}) as any});
 await assert.rejects(gateway.exchange('one-use-code',config.callbackUrl),e=>!String(e).includes('short-private'));assert.equal(calls,1);
});
test('gatewayRejectsAmbiguousOrUnsafeOwnerResponsesAndRedirects',async()=>{
 for(const payload of [{access_token:'short-private',user_id:9007199254740992,permissions:config.requiredScopes},{data:[{access_token:'short-private',user_id:'100',permissions:config.requiredScopes},{access_token:'other',user_id:'101'}]}])await assert.rejects(createInstagramManagementGateway({config,fetchImpl:(async()=>Response.json(payload)) as any}).exchange('code',config.callbackUrl));
 await assert.rejects(createInstagramManagementGateway({config,fetchImpl:(async()=>new Response('',{status:302,headers:{location:'https://evil.test'}})) as any}).exchange('code',config.callbackUrl));
});
test('gatewayBoundsBodyAndSanitizesTransportErrors',async()=>{
 for(const fetchImpl of [(async()=>new Response('x'.repeat(1048577))) as any,(async()=>{throw Error('private-app-secret one-use-code short-private');}) as any])await assert.rejects(createInstagramManagementGateway({config,fetchImpl}).exchange('one-use-code',config.callbackUrl),e=>!String(e).includes('private-app-secret')&&!String(e).includes('one-use-code')&&!String(e).includes('short-private'));
 let calls=0;await assert.rejects(createInstagramManagementGateway({config,fetchImpl:(async()=>{calls++;throw Error();}) as any}).exchange('code','https://evil.test'));assert.equal(calls,0);
});
