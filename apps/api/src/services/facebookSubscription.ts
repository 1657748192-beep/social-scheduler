import type { Prisma,PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { config } from '../config';
import { encryptToken,decryptToken } from '../utils/tokenCrypto';
import { HttpError } from '../utils/errors';
import { createFacebookEngagementClient } from '../integrations/social/facebookEngagement';
import { createFacebookSubscriptionService,type FacebookSubscriptionContext } from './facebookSubscriptionService';

export async function lockFacebookPage(tx:Prisma.TransactionClient,pageId:string){
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'facebook-page:'+pageId},0))::text`;
}
const client=(pageId:string,accessToken:string)=>createFacebookEngagementClient({pageId,accessToken,apiVersion:config.FACEBOOK_GRAPH_API_VERSION,appId:config.FACEBOOK_CLIENT_ID,appSecret:config.FACEBOOK_CLIENT_SECRET});
export function createFacebookSubscriptionCoordinator(db:PrismaClient,encrypt:(value:string)=>string,decrypt:(value:string)=>string,createClient=client){
  async function withAccount<T>(accountId:string,run:(ctx:FacebookSubscriptionContext)=>Promise<T>,unlink=false){
    const before=await db.socialAccount.findUnique({where:{id:accountId},select:{providerAccountId:true,platform:true}});
    if(!before || before.platform!=='facebook')throw new HttpError(404,'Connected Facebook Page not found.');
    return db.$transaction(async tx=>{
      await lockFacebookPage(tx,before.providerAccountId);
      const account=await tx.socialAccount.findUnique({where:{id:accountId},include:{credential:true}});
      if(!account || account.providerAccountId!==before.providerAccountId || account.accountType!=='page')throw new HttpError(404,'Connected Facebook Page not found.');
      const pageId=account.providerAccountId,state=await tx.facebookPageSubscriptionState.findUnique({where:{pageId}});
      const otherBindings=await tx.socialAccount.count({where:{platform:'facebook',accountType:'page',providerAccountId:pageId,status:'active',id:{not:accountId}}});
      const context:FacebookSubscriptionContext={pageId,accessToken:account.credential?decrypt(account.credential.accessTokenEncrypted):'',otherBindings,ownedFields:state?.ownedFields??[],
        saveOwnedFields:async ownedFields=>{await tx.facebookPageSubscriptionState.upsert({where:{pageId},create:{pageId,ownedFields},update:{ownedFields}});},
        savePendingRelease:async()=>{if(!account.credential)return;await tx.facebookPageSubscriptionState.upsert({where:{pageId},
          create:{pageId,ownedFields:state?.ownedFields??[],pendingRelease:true,releaseTokenEncrypted:encrypt(decrypt(account.credential.accessTokenEncrypted)),releaseExpiresAt:new Date(Date.now()+86400000)},
          update:{pendingRelease:true,releaseTokenEncrypted:encrypt(decrypt(account.credential.accessTokenEncrypted)),releaseExpiresAt:new Date(Date.now()+86400000),attempts:0,nextAttemptAt:new Date()}});},
        clearPendingRelease:async()=>{await tx.facebookPageSubscriptionState.updateMany({where:{pageId},data:{ownedFields:[],pendingRelease:false,releaseTokenEncrypted:null,releaseExpiresAt:null,attempts:0}});}};
      const result=await run(context);
      const removed=unlink?await tx.socialAccount.delete({where:{id:accountId},select:{id:true,platform:true,displayName:true,status:true}}):null;
      return {result,removed};
    },{timeout:60000,maxWait:10000});
  }
  const service=createFacebookSubscriptionService({withAccount:async(id,run)=>(await withAccount(id,run)).result,createClient});
  return {
    ensure:service.ensure,release:service.release,
    async disconnect(accountId:string){
      let removed:Awaited<ReturnType<typeof withAccount>>['removed']=null;
      const scoped=createFacebookSubscriptionService({withAccount:async(id,run)=>{const outcome=await withAccount(id,run,true);removed=outcome.removed;return outcome.result;},createClient});
      await scoped.release(accountId);return removed!;
    },
    async retryPending(){
      const now=new Date();
      // Temporary encrypted Page token only: no message body, 5 retries / 24-hour maximum.
      await db.facebookPageSubscriptionState.updateMany({where:{pendingRelease:true,OR:[{attempts:{gte:5}},{releaseExpiresAt:{lte:now}}]},data:{pendingRelease:false,releaseTokenEncrypted:null,releaseExpiresAt:null}});
      for(const candidate of await db.facebookPageSubscriptionState.findMany({where:{pendingRelease:true,nextAttemptAt:{lte:now}},take:25})){
        await db.$transaction(async tx=>{
          await lockFacebookPage(tx,candidate.pageId);
          const state=await tx.facebookPageSubscriptionState.findUnique({where:{pageId:candidate.pageId}});
          if(!state?.pendingRelease || !state.releaseTokenEncrypted || !state.releaseExpiresAt || state.releaseExpiresAt<=new Date() || state.attempts>=5)return;
          const bound=await tx.socialAccount.count({where:{platform:'facebook',accountType:'page',providerAccountId:state.pageId,status:'active'}});
          if(bound){await tx.facebookPageSubscriptionState.update({where:{pageId:state.pageId},data:{pendingRelease:false,releaseTokenEncrypted:null,releaseExpiresAt:null}});return;}
          try{
            const api=createClient(state.pageId,decrypt(state.releaseTokenEncrypted)),fields=await api.getSubscribedFields(),remaining=fields.filter(field=>!state.ownedFields.includes(field));
            if(remaining.length)await api.subscribe(remaining);else await api.unsubscribe();
            await tx.facebookPageSubscriptionState.update({where:{pageId:state.pageId},data:{ownedFields:[],pendingRelease:false,releaseTokenEncrypted:null,releaseExpiresAt:null}});
          }catch{await tx.facebookPageSubscriptionState.update({where:{pageId:state.pageId},data:{attempts:{increment:1},nextAttemptAt:new Date(Date.now()+Math.min(60000,1000*2**state.attempts))}});}
        },{timeout:40000,maxWait:10000});
      }
    }
  };
}
export const facebookSubscriptionCoordinator=createFacebookSubscriptionCoordinator(prisma,encryptToken,decryptToken);
export const ensureFacebookPageSubscription=(accountId:string)=>facebookSubscriptionCoordinator.ensure(accountId);
export const releaseFacebookPageSubscription=(accountId:string)=>facebookSubscriptionCoordinator.release(accountId);
