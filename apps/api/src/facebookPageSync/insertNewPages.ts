import type {Prisma} from '@prisma/client';
import {lockFacebookPage} from '../services/facebookSubscription';
import {HttpError} from '../utils/errors';
import type {VerifiedPage,SyncResult} from './types';
/** Caller owns admission and transaction. Existing records never enter a write branch. */
export async function insertNewFacebookPages(tx:Prisma.TransactionClient,input:{workspaceId:string;operationId:string;selectedPageIds:string[];verifiedPages:VerifiedPage[];encrypt:(s:string)=>string;assertCurrent:()=>Promise<void>}):Promise<SyncResult>{
 const result:SyncResult={createdPageIds:[],skippedPageIds:[]};
 for(const pageId of [...new Set(input.selectedPageIds)].sort()){
  await lockFacebookPage(tx,pageId);await input.assertCurrent();
  const old=await tx.socialAccount.findUnique({where:{workspaceId_platform_providerAccountId:{workspaceId:input.workspaceId,platform:'facebook',providerAccountId:pageId}},select:{capabilities:true}});
  if(old){if((old.capabilities as Record<string,unknown>)?.pageSyncImportId===input.operationId)result.createdPageIds.push(pageId);else result.skippedPageIds.push(pageId);continue;}
  const p=input.verifiedPages.find(p=>p.pageId===pageId);
  if(!p||p.expiresAt&&p.expiresAt.getTime()<=Date.now()||!['pages_manage_posts','pages_read_engagement'].every(s=>p.scopes.includes(s)))throw new HttpError(400,'Selected Page authorization is unavailable');
  await tx.socialAccount.create({data:{workspaceId:input.workspaceId,platform:'facebook',providerAccountId:p.pageId,displayName:p.name,avatarUrl:p.avatarUrl,accountType:'page',status:'active',capabilities:{oauth2:true,pagePublishing:true,scopes:p.scopes,profileUrl:p.profileUrl,pageSyncImportId:input.operationId},credential:{create:{accessTokenEncrypted:input.encrypt(p.pageToken),tokenType:'Bearer',scopes:p.scopes,expiresAt:p.expiresAt}}}});
  result.createdPageIds.push(pageId);
 }
 await input.assertCurrent();return result;
}
