import {withFacebookManagementFixture} from './facebookManagementFixture';
import {encryptToken,decryptToken} from '../../src/utils/tokenCrypto';
export const importTestPage=(id:string)=>({pageId:id,name:'Page '+id,avatarUrl:null,profileUrl:'https://www.facebook.com/'+id,pageToken:'synthetic-page-'+id,scopes:['pages_manage_posts','pages_read_engagement'],expiresAt:null});
export async function withPageImportFixture(run:(f:any)=>Promise<void>){
 await withFacebookManagementFixture(async f=>{
  const ctx=f.contexts[0];
  const oldIds=f.accounts.map((a:any)=>a.id);
  const snapshot=async()=>({
   accounts:await f.db.socialAccount.findMany({where:{id:{in:oldIds}},include:{credential:true},orderBy:{id:'asc'}}),
   posts:await f.db.postVariant.findMany({where:{post:{workspaceId:{in:f.workspaceIds}}},orderBy:{id:'asc'}}),
   schedules:await f.db.schedule.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{publishJobs:true},orderBy:{id:'asc'}}),
   management:await f.db.facebookManagementConnection.findMany({where:{workspaceId:{in:f.workspaceIds}},include:{pages:true},orderBy:{id:'asc'}})
  });
  try{await run({...f,ctx,snapshot,encrypt:encryptToken,decrypt:decryptToken});}
  finally{await f.db.facebookPageImportInvitation.deleteMany({where:{createdById:f.userId}});}
 });
}
