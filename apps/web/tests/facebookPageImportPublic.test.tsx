import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {act} from 'react-test-renderer';import {withFacebookUI,facebookButton,facebookText} from './helpers/facebookManagementUI';
test('public page removes the fragment before any request and requires an explicit click',async()=>{
 const mod=await import('../components/social/FacebookPageImportPublic').catch(()=>null);assert.ok(mod,'public invitation page must exist');
 await withFacebookUI(<mod.FacebookPageImportPublic/>,async({view,requests,storage}:any)=>{
  assert.equal(requests.length,0);assert.deepEqual(storage,[['social_scheduler_locale','zh-CN']]);assert.doesNotMatch(facebookText(view),/secretHash|pageToken/);
  assert.ok(facebookButton(view,'前往 Facebook 授权'));
 },undefined);
 const calls:string[]=[];const secret='s'.repeat(43),browser:any={location:{href:'https://app.example.test/facebook-page-import#'+secret},history:{state:null,replaceState:(_s:any,_t:any,url:string)=>calls.push(url)}};
 assert.equal(mod.takeInvitationSecret(browser),secret);assert.deepEqual(calls,['/facebook-page-import']);
});
