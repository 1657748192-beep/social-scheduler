import assert from 'node:assert/strict';
import {withInboxFixture,type InboxFixture} from './interactionInboxFixture';
export type MetaInboxFixture=InboxFixture&{instagramAccountIds:string[];instagramConnectionIds:string[];publishingSnapshot():Promise<unknown>};
export async function withMetaInboxFixture(run:(f:MetaInboxFixture)=>Promise<void>){
 return withInboxFixture(async f=>{
  const db=f.db as any;assert.ok(db.instagramManagementConnection,'independent Instagram model required');
  const instagramAccountIds:string[]=[],instagramConnectionIds:string[]=[];
  for(const workspaceId of f.workspaceIds){
   const account=await db.socialAccount.create({data:{workspaceId,platform:'instagram',providerAccountId:'100',displayName:'Same Synthetic Name',accountType:'business',credential:{create:{accessTokenEncrypted:'publishing-original-do-not-touch',scopes:['instagram_business_content_publish']}}}});
   const connection=await db.instagramManagementConnection.create({data:{workspaceId,platform:'instagram',appId:'456',providerAccountId:'100',providerUserId:'200',userId:f.userId,tokenEncrypted:'sealed:independent',scopes:['instagram_business_basic','instagram_business_manage_comments','instagram_business_manage_messages'],status:'active'}});
   instagramAccountIds.push(account.id);instagramConnectionIds.push(connection.id);
  }
  await run({...f,instagramAccountIds,instagramConnectionIds,publishingSnapshot:f.protectedSnapshot});
 });
}
