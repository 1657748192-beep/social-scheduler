import type {SocialAccount} from './api';

export type PermissionState='granted'|'unrecorded'|'expired'|'unknown'|'verified'|'restricted';
export type PermissionFeature={id:string;label:[string,string];description:[string,string];grants:string[][];icon:'profile'|'publish'|'video'|'chart'|'comment'|'message'|'board'};
const feature=(id:string,label:PermissionFeature['label'],description:PermissionFeature['description'],grants:string[][],icon:PermissionFeature['icon']):PermissionFeature=>({id,label,description,grants,icon});
const youtube='https://www.googleapis.com/auth/youtube';
const youtubeRead=[[youtube+'.readonly'],[youtube],[youtube+'.force-ssl']];
const definitions:Partial<Record<SocialAccount['platform'],PermissionFeature[]>>={
 tiktok:[
  feature('profile',['读取头像和昵称','Read photo and name'],['读取此账号的基本身份资料。','Read this account’s basic identity.'],[['user.info.basic']],'profile'),
  feature('publish',['直接发布视频','Publish videos directly'],['将视频直接发布到此 TikTok 账号。','Publish videos directly to this TikTok account.'],[['video.publish']],'publish'),
  feature('stats',['读取账号统计','Read account statistics'],['读取粉丝数、关注数、获赞数和视频数。','Read follower, following, like and video totals.'],[['user.info.stats']],'chart'),
  feature('videos',['读取公开视频','Read public videos'],['读取此账号已公开的视频列表。','Read this account’s public video list.'],[['video.list']],'video'),
  feature('profile-link',['读取主页资料','Read profile details'],['读取主页链接、简介等资料。','Read the profile link, bio and related details.'],[['user.info.profile']],'profile'),
  feature('draft',['上传为 TikTok 草稿','Upload TikTok drafts'],['上传后仍需到 TikTok 内确认并发布。','Finish editing and publishing inside TikTok.'],[['video.upload']],'video')
 ],
 instagram:[
  feature('profile',['读取账号资料','Read account details'],['读取此 Instagram 账号的基本资料。','Read this Instagram account’s basic details.'],[['instagram_business_basic']],'profile'),
  feature('publish',['发布内容','Publish content'],['发布此账号支持的图片和视频内容。','Publish supported photos and videos to this account.'],[['instagram_business_basic','instagram_business_content_publish']],'publish'),
  feature('comments',['读取和回复评论','Read and reply to comments'],['平台授权范围；当前软件未开放 Instagram 评论入口。','Platform permission only; Instagram comments are not currently offered in this app.'],[['instagram_business_basic','instagram_business_manage_comments']],'comment'),
  feature('messages',['收发私信','Read and reply to messages'],['平台授权范围；当前软件未开放 Instagram 私信入口。','Platform permission only; Instagram messaging is not currently offered in this app.'],[['instagram_business_basic','instagram_business_manage_messages']],'message')
 ],
 facebook:[
  feature('publish',['发布公共主页帖子','Publish Page posts'],['向此公共主页发布内容，不包含个人账号发帖。','Publish to this Page, not a personal profile.'],[['pages_manage_posts','pages_read_engagement']],'publish'),
  feature('profile',['读取主页资料','Read Page details'],['读取公共主页的内容和互动信息。','Read Page content and engagement information.'],[['pages_read_engagement']],'profile'),
  feature('pages',['读取主页列表','Read Page list'],['读取已授权管理的公共主页列表。','Read the list of Pages granted to this connection.'],[['pages_show_list']],'board')
 ],
 youtube:[
  feature('profile',['读取频道资料','Read channel details'],['读取此 YouTube 频道的基本资料。','Read this YouTube channel’s basic details.'],youtubeRead,'profile'),
  feature('publish',['上传发布视频','Upload and publish videos'],['将视频上传到此 YouTube 频道。','Upload videos to this YouTube channel.'],[[youtube+'.upload'],[youtube],[youtube+'.force-ssl']],'publish'),
  feature('videos',['读取频道视频','Read channel videos'],['读取此频道的视频与播放列表信息。','Read this channel’s video and playlist information.'],youtubeRead,'video')
 ],
 pinterest:[
  feature('profile',['读取账号资料','Read account details'],['读取 Pinterest 账号资料。','Read Pinterest account details.'],[['user_accounts:read']],'profile'),
  feature('publish',['发布 Pin','Publish Pins'],['创建或更新此账号的公开 Pin。','Create or update public Pins for this account.'],[['pins:write']],'publish'),
  feature('pins',['读取 Pin','Read Pins'],['读取此账号的公开 Pin。','Read this account’s public Pins.'],[['pins:read']],'video'),
  feature('boards',['读取画板','Read boards'],['读取可用于发布的公开画板。','Read public boards for publishing.'],[['boards:read']],'board'),
  feature('create-board',['创建画板','Create boards'],['创建或更新此账号的公开画板。','Create or update public boards for this account.'],[['boards:write']],'board')
 ]
};
export function accountPermissionFeatures(account:SocialAccount,now=Date.now()){
 const scopes=account.credential?.scopes;
 const recorded=Array.isArray(scopes)&&scopes.length>0;
 const expiry=account.credential?.expiresAt;
 const stale=!!expiry&&(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=now);
 return (definitions[account.platform]??[]).map(item=>{
  let state:PermissionState;
  if(account.status==='token_expired'||account.status==='authorization_invalid')state='expired';
  else if(account.status!=='active'||!recorded||stale)state='unknown';
  else state=item.grants.some(group=>group.every(scope=>scopes!.includes(scope)))?'granted':'unrecorded';
  return {...item,state};
 });
}
export const permissionStateLabels:Record<PermissionState,[string,string]>={
 granted:['已授权','Granted'],unrecorded:['未记录授权','No grant recorded'],expired:['授权已失效','Authorization expired'],unknown:['待核实','Not verified'],verified:['已核实可用','Verified available'],restricted:['权限或角色受限','Permission or role restricted']
};
