import type {PrismaClient,Prisma} from '@prisma/client';
import type {ManagementContext,PageContext,PageTokenInspection} from './types';

export class FacebookPageAccessError extends Error{
  constructor(readonly status:403|404=404){super(status===403?'Facebook management access denied':'Facebook Page unavailable');}
}
type AccessDb=Pick<PrismaClient,'workspaceMember'|'userSession'>;
export async function requireManagementMember(db:AccessDb,ctx:ManagementContext,write=false,manager=false){
  const [session,member]=await Promise.all([
    db.userSession.findFirst({where:{id:ctx.sessionId,userId:ctx.userId,revokedAt:null,expiresAt:{gt:new Date()}}}),
    db.workspaceMember.findFirst({where:{userId:ctx.userId,workspaceId:ctx.workspaceId,status:'active'}})
  ]);
  if(!session||!member||(write&&member.role==='viewer')||(manager&&!['owner','admin'].includes(member.role)))throw new FacebookPageAccessError(403);
  return member;
}
export function activeManagementOwner(workspaceId:string):Prisma.UserWhereInput{
  return {memberships:{some:{workspaceId,status:'active',role:{in:['owner','admin']}}}};
}
export function createFacebookPageAccess(deps:{db:PrismaClient;decrypt:(v:string)=>string;
  inspect:(pageId:string,token:string,connection?:{id:string;appId:string;userTokenEncrypted:string|null})=>Promise<PageTokenInspection>}){
  return {async resolvePageAccess(ctx:PageContext,options:{write?:boolean;requirePublishingBinding?:boolean}={}){
    const member=await requireManagementMember(deps.db,ctx,options.write);
    const page=await deps.db.facebookManagedPage.findFirst({where:{id:ctx.managedPageId,active:true,connection:{workspaceId:ctx.workspaceId,status:'active',user:activeManagementOwner(ctx.workspaceId)}},include:{connection:true}});
    if(!page?.pageTokenEncrypted||!page.connection.userTokenEncrypted||!page.tasks.length||page.expiresAt&&page.expiresAt<=new Date()||page.connection.expiresAt&&page.connection.expiresAt<=new Date())throw new FacebookPageAccessError();
    const selection=await deps.db.facebookManagementPageSelection.findUnique({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:page.pageId}}});
    if(selection?.managedPageId!==page.id)throw new FacebookPageAccessError();
    const account=await deps.db.socialAccount.findFirst({where:{workspaceId:ctx.workspaceId,platform:'facebook',providerAccountId:page.pageId,accountType:'page',status:'active'},select:{id:true}});
    if(options.requirePublishingBinding!==false&&!account)throw new FacebookPageAccessError();
    let pageToken:string,inspection:PageTokenInspection;
    try{pageToken=deps.decrypt(page.pageTokenEncrypted);inspection=await deps.inspect(page.pageId,pageToken,page.connection);}catch{throw new FacebookPageAccessError();}
    if(inspection.pageId!==page.pageId||inspection.expiresAt&&new Date(inspection.expiresAt)<=new Date())throw new FacebookPageAccessError();
    const scopes=inspection.scopes.filter(scope=>!inspection.granularScopes.some(g=>g.scope===scope&&g.targetIds!==null&&!g.targetIds.includes(page.pageId)));
    if(!scopes.length)throw new FacebookPageAccessError();
    return {managedPageId:page.id,pageId:page.pageId,connectionId:page.connectionId,connectionVersion:page.connection.version,appId:page.connection.appId,pageToken,tasks:page.tasks,scopes,role:member.role,publishingAccountId:account?.id??null};
  }};
}
