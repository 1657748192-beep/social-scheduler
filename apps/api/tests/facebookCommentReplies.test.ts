import test from 'node:test';import assert from 'node:assert/strict';
import {createFacebookEngagementClient} from '../src/integrations/social/facebookEngagement';
import {createFacebookManagementEngagement} from '../src/facebookManagement/engagement';
test('reply reader retains verified parent identity and cursor without making a send',async()=>{
 const c=createFacebookEngagementClient({pageId:'100',accessToken:'synthetic',apiVersion:'v26.0',fetchImpl:(async(u,init)=>{const url=new URL(String(u));assert.equal(init?.method,'GET');assert.equal(url.pathname,'/v26.0/c1/comments');return Response.json({data:[{id:'r1',message:'Page reply',created_time:'2026-10-21T00:00:00Z',from:{id:'100',name:'Page'}}],paging:{next:'ignored',cursors:{after:'next'}}});}) as any});
 const page=await (c as any).listCommentReplies('c1','100_200');assert.equal(page.items[0].parentId,'c1');assert.equal(page.items[0].postId,'100_200');assert.equal(page.items[0].senderId,'100');assert.equal(page.nextCursor,'next');
});
test('comment replies verify owned published parent before reading children and reject unrelated targets',async()=>{
 let reads=0,infinite=false,n=0;const access:any={appId:'123',pageId:'100',managedPageId:'p',connectionId:'c',connectionVersion:1,publishingAccountId:'a',pageToken:'synthetic',scopes:['pages_read_engagement','pages_read_user_content'],tasks:['MODERATE'],role:'owner'};
 const service=createFacebookManagementEngagement({db:{schedule:{findFirst:async()=>({postVariant:{post:{workspaceId:'w'},platform:'facebook',socialAccountId:'a'},publishJobs:[{providerPostId:'100_200'}]})}} as any,resolvePageAccess:async()=>access,executeFacebookSend:async()=>{throw Error('No send');},createClient:()=>({listComments:async()=>infinite?{items:[],nextCursor:'cursor-'+(++n)}:({items:[{id:'c1',postId:'100_200',text:'Question',timestamp:new Date().toISOString()}],nextCursor:null}),listCommentReplies:async(parent:string,post:string)=>{reads++;assert.equal(parent,'c1');assert.equal(post,'100_200');return{items:[{id:'r1',parentId:parent,postId:post,senderId:'100',text:'Reply',timestamp:new Date().toISOString()}],nextCursor:null};}} as any)});
 const result=await (service as any).commentReplies({userId:'u',workspaceId:'w',managedPageId:'p'},'schedule','c1');assert.equal(result.parent.id,'c1');assert.equal(result.items[0].id,'r1');
 await assert.rejects((service as any).commentReplies({userId:'u',workspaceId:'w',managedPageId:'p'},'schedule','other'));assert.equal(reads,1);
 infinite=true;await assert.rejects((service as any).commentReplies({userId:'u',workspaceId:'w',managedPageId:'p'},'schedule','c1'),(e:any)=>e.statusCode===503);assert.equal(reads,1);
});
