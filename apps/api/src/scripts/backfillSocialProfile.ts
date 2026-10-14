import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { getOAuthProvider } from '../integrations/oauth/oauthProviders';
import { config } from '../config';
import { assertPinterestAccountEnvironment } from '../integrations/social/pinterestEnvironment';
import { decryptToken } from '../utils/tokenCrypto';
import { backfillSocialProfile } from '../services/backfillSocialProfile';

// Explicit one-time administration command. Default is read-only; credentials are never changed.
async function main() {
  const apply=process.argv.includes('--apply');
  const accounts=await prisma.socialAccount.findMany({where:{platform:{in:['instagram','pinterest']},status:'active'},take:501,include:{credential:true},orderBy:{id:'asc'}});
  if(accounts.length>500) throw new Error('Account batch exceeds the safety limit.');
  const counts:Record<string,number>={};
  for(const account of accounts) {
    const result=await backfillSocialProfile(account,{
      readProfile:async()=>{
        const credential=account.credential;
        const required=account.platform==='instagram'?'instagram_business_basic':'user_accounts:read';
        if(!credential || !credential.scopes.includes(required) || (credential.expiresAt && credential.expiresAt.getTime()<=Date.now())) throw new Error('Existing authorization is unavailable.');
        if(account.platform==='pinterest') assertPinterestAccountEnvironment(account.capabilities,config.PINTEREST_API_ENV);
        const provider=getOAuthProvider(account.platform);
        if(!provider.profileUrl) throw new Error('Profile endpoint is unavailable.');
        const response=await fetch(provider.profileUrl,{headers:{Authorization:`Bearer ${decryptToken(credential.accessTokenEncrypted)}`},redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('Provider profile is unavailable.');
        return response.json();
      },
      save:async metadata=>{
        const result=await prisma.socialAccount.updateMany({where:{id:account.id,status:'active',providerAccountId:account.providerAccountId,credential:{is:{accessTokenEncrypted:account.credential?.accessTokenEncrypted}},capabilities:{equals:account.capabilities===null?Prisma.JsonNull:account.capabilities}},data:{capabilities:metadata as Prisma.InputJsonObject}});
        return result.count===1;
      }
    },apply);
    const key=`${account.platform}:${result.status}`;
    counts[key]=(counts[key]??0)+1;
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',total:accounts.length,counts}));
}
main().catch(()=>{console.error('Profile backfill failed; no credentials were changed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
