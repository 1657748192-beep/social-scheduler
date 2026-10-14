import { socialAccountProfileUrl } from './socialAccountProfileUrl';

export type BackfillAccount = {id:string;platform:string;providerAccountId:string;status:string;capabilities:unknown};
export async function backfillSocialProfile(account:BackfillAccount, dependencies:{readProfile():Promise<unknown>;save(metadata:Record<string,unknown>):Promise<boolean>}, apply=false) {
  if(account.status!=='active' || !['instagram','pinterest'].includes(account.platform) || socialAccountProfileUrl(account)) return {status:'skipped'};
  try {
    const payload=await dependencies.readProfile();
    if(!payload || typeof payload!=='object' || Array.isArray(payload)) return {status:'unavailable'};
    const profile=payload as Record<string,unknown>;
    const providerId=account.platform==='instagram' ? (profile.user_id ?? profile.id) : profile.id;
    if(typeof providerId!=='string' || providerId!==account.providerAccountId || typeof profile.username!=='string') return {status:'unavailable'};
    const metadata=account.capabilities && typeof account.capabilities==='object' && !Array.isArray(account.capabilities) ? account.capabilities as Record<string,unknown> : {};
    const profileUrl=socialAccountProfileUrl({...account,capabilities:{profileUsername:profile.username}});
    if(!profileUrl) return {status:'unavailable'};
    if(!apply) return {status:'ready'};
    const updated=await dependencies.save({...metadata,profileUsername:profile.username,profileUrl});
    return {status:updated?'updated':'changed'};
  } catch { return {status:'unavailable'}; }
}
