import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
export async function withFacebookManagementFixture(run:(fixture:any)=>Promise<void>){
  const url=process.env.FACEBOOK_TEST_DATABASE_URL;assert.ok(url,'Independent test database required');assert.match(new URL(url).pathname,/_test$/);assert.notEqual(url,process.env.DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url}}}),userId=randomUUID(),sessionId=randomUUID(),workspaceIds=[randomUUID(),randomUUID()];
  const scopes=['business_management','pages_show_list','pages_manage_metadata','pages_read_engagement','pages_read_user_content','pages_manage_engagement','pages_messaging'];
  try{
    await db.user.create({data:{id:userId,email:`${userId}@example.test`,name:'Management reception test',passwordHash:'not-real'}});
    await db.userSession.create({data:{id:sessionId,userId,tokenId:randomUUID(),expiresAt:new Date(Date.now()+86400000)}});
    const contexts=[],pages=[],connections=[],accounts=[];
    for(const workspaceId of workspaceIds){
      await db.workspace.create({data:{id:workspaceId,ownerId:userId,name:'Reception',slug:workspaceId}});
      await db.workspaceMember.create({data:{userId,workspaceId,role:'owner',status:'active'}});
      const connection=await db.facebookManagementConnection.create({data:{appId:'123',userId,workspaceId,providerUserId:'200',userTokenEncrypted:'sealed:user',scopes}});
      const page=await db.facebookManagedPage.create({data:{connectionId:connection.id,pageId:'100',name:'Page',pageTokenEncrypted:'sealed:page',tasks:['MANAGE','MESSAGING','MODERATE'],scopes,notificationsEnabled:true}});
      const account=await db.socialAccount.create({data:{workspaceId,platform:'facebook',providerAccountId:'100',accountType:'page',displayName:'Original',credential:{create:{accessTokenEncrypted:'original-do-not-touch',scopes:['pages_manage_posts']}}}});
      await db.facebookManagementPageSelection.create({data:{workspaceId,pageId:'100',managedPageId:page.id}});
      contexts.push({userId,workspaceId,sessionId,managedPageId:page.id});pages.push(page);connections.push(connection);accounts.push(account);
    }
    const legacy=await db.facebookReceivedEvent.create({data:{socialAccountId:accounts[0].id,eventKey:randomUUID(),payload:{legacy:true}}});
    const snapshot=async()=>db.socialAccount.findMany({where:{workspaceId:{in:workspaceIds}},include:{credential:true},orderBy:{id:'asc'}});
    const databaseNow=async()=>{const [row]=await db.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;return new Date(row.now.getTime()+1);};
    await run({db,userId,sessionId,workspaceIds,contexts,pages,connections,accounts,scopes,legacy,snapshot,databaseNow});
  }finally{await db.workspace.deleteMany({where:{id:{in:workspaceIds},ownerId:userId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
}
