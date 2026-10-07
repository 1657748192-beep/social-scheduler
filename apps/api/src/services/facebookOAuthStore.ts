import type { PrismaClient } from '@prisma/client';
import { facebookTokenFingerprint, type FacebookOAuthStore } from './facebookEngagementOAuth';

export function createFacebookOAuthStore(db:PrismaClient,encrypt:(value:string)=>string):FacebookOAuthStore {
  return {
    async account(workspaceId,socialAccountId) {
      const account=await db.socialAccount.findFirst({where:{id:socialAccountId,workspaceId,platform:'facebook',accountType:'page',status:'active'},include:{credential:true}});
      return account?.credential ? {id:account.id,providerAccountId:account.providerAccountId,scopes:account.credential.scopes,accessTokenEncrypted:account.credential.accessTokenEncrypted} : null;
    },
    async create(state) {
      await db.oauthState.create({data:{state:state.state,userId:state.userId,workspaceId:state.workspaceId,platform:'facebook',facebookEngagementSocialAccountId:state.socialAccountId,
        facebookExpectedPageId:state.pageId,facebookExpectedTokenHash:state.expectedTokenHash,redirectUri:state.redirectUri,scopes:state.scopes,expiresAt:state.expiresAt}});
    },
    async consume(state) {
      return db.$transaction(async tx=>{
        const row=await tx.oauthState.findUnique({where:{state}});
        if(!row || row.platform!=='facebook' || !row.facebookEngagementSocialAccountId || !row.facebookExpectedPageId || !row.facebookExpectedTokenHash)return null;
        const consumed=await tx.oauthState.deleteMany({where:{id:row.id}});
        if(consumed.count!==1)return null;
        return {state:row.state,userId:row.userId,workspaceId:row.workspaceId,socialAccountId:row.facebookEngagementSocialAccountId,pageId:row.facebookExpectedPageId,
          expectedTokenHash:row.facebookExpectedTokenHash,redirectUri:row.redirectUri,scopes:row.scopes,expiresAt:row.expiresAt};
      });
    },
    async save(input) {
      return db.$transaction(async tx=>{
        const membership=await tx.workspaceMember.findFirst({where:{userId:input.userId,workspaceId:input.workspaceId,status:'active',role:{in:['owner','admin']}}});
        if(!membership)return false;
        const account=await tx.socialAccount.findFirst({where:{id:input.socialAccountId,workspaceId:input.workspaceId,platform:'facebook',accountType:'page',status:'active',providerAccountId:input.pageId},include:{credential:true}});
        if(!account?.credential || facebookTokenFingerprint(account.credential.accessTokenEncrypted)!==input.expectedTokenHash)return false;
        const changed=await tx.oauthCredential.updateMany({where:{id:account.credential.id,accessTokenEncrypted:account.credential.accessTokenEncrypted},
          data:{accessTokenEncrypted:encrypt(input.grant.pageToken),scopes:input.grant.scopes,expiresAt:input.grant.expiresAt,tokenType:'Bearer'}});
        return changed.count===1;
      });
    }
  };
}
