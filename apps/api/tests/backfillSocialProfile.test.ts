import assert from 'node:assert/strict';
import test from 'node:test';
import {backfillSocialProfile} from '../src/services/backfillSocialProfile';

const account={id:'account',platform:'instagram',providerAccountId:'1781',status:'active',capabilities:{oauth2:true,scopes:['instagram_business_basic'],custom:'keep'}};
test('verified old accounts get profile metadata without losing existing capabilities',async()=>{
  let saved:unknown;
  const result=await backfillSocialProfile(account,{readProfile:async()=>({id:'scoped-id',user_id:'1781',username:'mooyamcosmetic'}),save:async metadata=>{saved=metadata;return true;}},true);
  assert.equal(result.status,'updated');
  assert.deepEqual(saved,{oauth2:true,scopes:['instagram_business_basic'],custom:'keep',profileUsername:'mooyamcosmetic',profileUrl:'https://www.instagram.com/mooyamcosmetic/'});
});
test('dry runs do not save and mismatched, missing or failed provider results cannot modify accounts',async()=>{
  let writes=0;
  const save=async()=>{writes++;return true;};
  assert.equal((await backfillSocialProfile(account,{readProfile:async()=>({user_id:'1781',username:'andy'}),save})).status,'ready');
  for(const payload of [{user_id:'wrong',username:'andy'},{user_id:'1781',name:'Andy'},{user_id:'1781',username:'../evil'},{user_id:'wrong',id:'1781',username:'andy'}]) {
    assert.equal((await backfillSocialProfile(account,{readProfile:async()=>payload,save},true)).status,'unavailable');
  }
  assert.equal((await backfillSocialProfile(account,{readProfile:async()=>{throw Error('secret-token');},save},true)).status,'unavailable');
  assert.equal(writes,0);
});
test('Pinterest verifies its own ID and concurrent edits or disconnected accounts are never overwritten',async()=>{
  const p={...account,platform:'pinterest',providerAccountId:'123'};
  assert.equal((await backfillSocialProfile(p,{readProfile:async()=>({id:'123',username:'mooyam'}),save:async()=>false},true)).status,'changed');
  let reads=0;
  for(const a of [{...p,status:'disconnected'},{...account,capabilities:{profileUsername:'existing'}}]) {
    assert.equal((await backfillSocialProfile(a,{readProfile:async()=>{reads++;return {};},save:async()=>true},true)).status,'skipped');
  }
  assert.equal(reads,0);
});
