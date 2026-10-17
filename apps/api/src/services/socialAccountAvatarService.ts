import type {Prisma, PrismaClient, SocialAccount} from '@prisma/client';
import {config} from '../config';
import {prisma} from '../prisma';
import {decryptToken} from '../utils/tokenCrypto';
import {HttpError} from '../utils/errors';
import {requireWorkspaceManager} from './workspaceService';
import {socialAccountProfileUrl} from './socialAccountProfileUrl';
import {pinterestProfileUrl} from '../integrations/social/pinterestEnvironment';

type Mode='auto'|'manual';
type Dependencies={db:PrismaClient;fetch:typeof fetch;now:()=>Date;decrypt:(value:string)=>string};
const day=86_400_000;
function object(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};}
function text(value:unknown):string|undefined{return typeof value==='string'&&value.trim()&&value.length<=512?value.trim():undefined;}
function avatar(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>8192)return;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local'))return;
    if([...url.searchParams.keys()].some(key=>/^(access_token|refresh_token|token|client_secret)$/i.test(key)))return;
    return url.href;
  }catch{return;}
}
function dto(account:SocialAccount,status:'updated'|'skipped'){
  const sync=object(object(account.capabilities).profileSync);
  return {status,id:account.id,displayName:account.displayName,avatarUrl:account.avatarUrl,profileUrl:socialAccountProfileUrl(account),
    profileSync:{lastAttemptAt:typeof sync.lastAttemptAt==='string'?sync.lastAttemptAt:null,lastSuccessAt:typeof sync.lastSuccessAt==='string'?sync.lastSuccessAt:null}};
}

// Never accepts a caller-supplied endpoint, token or provider ID. Never renews credentials.
async function readProfile(account:SocialAccount,token:string,request:typeof fetch){
  const metadata=object(account.capabilities),id=account.providerAccountId;
  let url:URL;
  switch(account.platform){
    case 'facebook':
      if(!/^\d+$/.test(id))throw new HttpError(409,'Account identifier is unavailable.');
      url=new URL(`https://graph.facebook.com/${config.FACEBOOK_GRAPH_API_VERSION}/${id}`);url.searchParams.set('fields','id,name,picture.type(large)');break;
    case 'instagram':
      url=new URL(`https://graph.instagram.com/${config.INSTAGRAM_GRAPH_API_VERSION}/me`);url.searchParams.set('fields','id,user_id,name,username,profile_picture_url');break;
    case 'youtube':
      if(!/^UC[\w-]{22}$/.test(id))throw new HttpError(409,'Channel identifier is unavailable.');
      url=new URL('https://www.googleapis.com/youtube/v3/channels');url.searchParams.set('part','snippet');url.searchParams.set('id',id);break;
    case 'tiktok':
      url=new URL('https://open.tiktokapis.com/v2/user/info/');url.searchParams.set('fields','open_id,display_name,avatar_url');break;
    case 'pinterest':
      url=new URL(pinterestProfileUrl(metadata.pinterestApiEnvironment==='sandbox'?'sandbox':metadata.pinterestApiEnvironment==='production'?'production':config.PINTEREST_API_ENV));break;
    default:throw new HttpError(409,'Profile synchronization is not supported for this platform.');
  }
  let payload:any;
  try{
    const response=await request(url.href,{method:'GET',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(12_000)});
    if(!response.ok)throw Error('Provider unavailable');
    payload=await response.json();
    if(!payload||payload.error&&(account.platform!=='tiktok'||payload.error.code!=='ok'))throw Error('Provider error');
  }catch{throw new HttpError(502,'Unable to refresh account profile. Previous details have been retained.');}
  let actualId:unknown,name:unknown,image:unknown,username:unknown;
  switch(account.platform){
    case 'facebook':actualId=payload.id;name=payload.name;image=payload.picture?.data?.url;break;
    case 'instagram':actualId=payload.user_id||payload.id;name=payload.name||payload.username;image=payload.profile_picture_url;username=payload.username;break;
    case 'youtube':{
      const channel=Array.isArray(payload.items)?payload.items.find((item:any)=>item?.id===id):null;
      actualId=channel?.id;name=channel?.snippet?.title;image=channel?.snippet?.thumbnails?.medium?.url||channel?.snippet?.thumbnails?.default?.url;break;
    }
    case 'tiktok':actualId=payload.data?.user?.open_id;name=payload.data?.user?.display_name;image=payload.data?.user?.avatar_url;break;
    case 'pinterest':actualId=payload.id;name=payload.business_name||payload.profile_name||payload.username;image=payload.profile_image;username=payload.username;break;
  }
  const displayName=text(name),avatarUrl=avatar(image);
  if(typeof actualId!=='string'||actualId!==id||!displayName||!avatarUrl)throw new HttpError(502,'Platform returned incomplete or mismatched account details. Previous details have been retained.');
  const profileUsername=typeof username==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(username)?username:undefined;
  return {displayName,avatarUrl,profileUsername};
}

export function createSocialAccountProfileService(dependencies:Partial<Dependencies>={}){
  const {db,fetch:request,now,decrypt}:Dependencies={db:prisma,fetch:globalThis.fetch,now:()=>new Date(),decrypt:decryptToken,...dependencies};
  return {async refresh(userId:string,workspaceId:string,socialAccountId:string,mode:Mode){
    await requireWorkspaceManager(userId,workspaceId,db);
    const account=await db.socialAccount.findFirst({where:{id:socialAccountId,workspaceId},include:{credential:true}});
    if(!account)throw new HttpError(404,'Social account not found.');
    const credential=account.credential,attemptAt=now();
    if(account.status!=='active'||!credential||credential.expiresAt&&credential.expiresAt<=attemptAt)throw new HttpError(409,'Account authorization is unavailable or expired. Previous details have been retained.');
    if(!['instagram','facebook','youtube','tiktok','pinterest'].includes(account.platform))throw new HttpError(409,'Profile synchronization is not supported for this platform.');
    const metadata=object(account.capabilities),previousSync=object(metadata.profileSync),last=Date.parse(previousSync.lastAttemptAt);
    if(Number.isFinite(last)&&attemptAt.getTime()-last<(mode==='auto'?day:60_000))return dto(account,'skipped');
    const profileSync={...previousSync,lastAttemptAt:attemptAt.toISOString()};
    const claimed={...metadata,profileSync} as Prisma.InputJsonObject;
    const where={id:account.id,workspaceId,platform:account.platform,providerAccountId:account.providerAccountId,status:account.status,
      displayName:account.displayName,avatarUrl:account.avatarUrl,credential:{is:{updatedAt:credential.updatedAt,accessTokenEncrypted:credential.accessTokenEncrypted}}};
    // JSON compare-and-swap makes the cooldown survive multiple tabs and API processes.
    const claim=await db.socialAccount.updateMany({where:{...where,capabilities:{equals:account.capabilities as Prisma.InputJsonValue}},data:{capabilities:claimed}});
    if(!claim.count){
      const latest=await db.socialAccount.findFirst({where:{id:account.id,workspaceId}});
      if(!latest)throw new HttpError(409,'Account changed during refresh.');
      return dto(latest,'skipped');
    }
    let profile:Awaited<ReturnType<typeof readProfile>>;
    try{profile=await readProfile(account,decrypt(credential.accessTokenEncrypted),request);}
    catch(error){if(error instanceof HttpError)throw error;throw new HttpError(502,'Unable to refresh account profile. Previous details have been retained.');}
    await requireWorkspaceManager(userId,workspaceId,db);
    const capabilities={...claimed,profileSync:{...profileSync,lastSuccessAt:now().toISOString()},
      ...(profile.profileUsername?{profileUsername:profile.profileUsername,profileUrl:null}:{})} as Prisma.InputJsonObject;
    const updated=await db.socialAccount.updateMany({where:{...where,capabilities:{equals:claimed}},data:{displayName:profile.displayName,avatarUrl:profile.avatarUrl,capabilities}});
    if(!updated.count)throw new HttpError(409,'Account changed during refresh. Previous details have been retained.');
    return dto({...account,...profile,capabilities:capabilities as Prisma.JsonObject},'updated');
  }};
}
export async function refreshSocialAccountProfile(userId:string,workspaceId:string,socialAccountId:string,mode:Mode){
  return createSocialAccountProfileService().refresh(userId,workspaceId,socialAccountId,mode);
}
