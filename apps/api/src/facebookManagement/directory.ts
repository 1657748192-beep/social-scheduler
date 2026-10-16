import {randomUUID} from 'node:crypto';
import type {PrismaClient,FacebookManagementConnection} from '@prisma/client';
import type {ManagementContext,ManagedPageDto,ReadPage,DirectoryPage,DirectoryUserPage} from './types';
import {createFacebookDirectoryClient,readAllDirectoryPages,FacebookDirectoryError} from './graphDirectory';
import {requireManagementMember,activeManagementOwner,FacebookPageAccessError} from './access';

type Filter={connectionId?:string;businessId?:string;query?:string;cursor?:string};
type SnapshotPage=DirectoryPage&{user?:DirectoryUserPage;businesses:Array<{businessId:string;name:string;relation:'owned'|'client'}>};
export function createFacebookDirectoryService(deps:{db:PrismaClient;decrypt:(v:string)=>string;encrypt:(v:string)=>string;
  createClient:(connection:FacebookManagementConnection&{userToken:string})=>ReturnType<typeof createFacebookDirectoryClient>}){
  const successful=new Map<string,number>(),failures=new Map<string,{code:string;diagnosticId:string}>();
  async function list(ctx:ManagementContext,filter:Filter={}):Promise<ReadPage<ManagedPageDto>>{
    await requireManagementMember(deps.db,ctx);
    if(filter.query&&filter.query.length>200||filter.cursor&&(!/^\d{1,8}$/.test(filter.cursor)))throw new FacebookPageAccessError(403);
    if(filter.connectionId&&!await deps.db.facebookManagementConnection.findFirst({where:{id:filter.connectionId,workspaceId:ctx.workspaceId}}))throw new FacebookPageAccessError();
    const connections=await deps.db.facebookManagementConnection.findMany({where:{workspaceId:ctx.workspaceId,...(filter.connectionId?{id:filter.connectionId}:{})},include:{pages:{include:{businesses:true}}},orderBy:{id:'asc'}});
    const accounts=await deps.db.socialAccount.findMany({where:{workspaceId:ctx.workspaceId,platform:'facebook',accountType:'page',status:'active'},select:{id:true,providerAccountId:true}});
    const selections=await deps.db.facebookManagementPageSelection.findMany({where:{workspaceId:ctx.workspaceId}});
    const managers=new Set((await deps.db.workspaceMember.findMany({where:{workspaceId:ctx.workspaceId,status:'active',role:{in:['owner','admin']}},select:{userId:true}})).map(m=>m.userId));
    type Connection=(typeof connections)[number];
    const groups=new Map<string,Array<{page:Connection['pages'][number];connection:Connection}>>();
    for(const connection of connections)for(const page of connection.pages){const group=groups.get(page.pageId)??[];group.push({page,connection});groups.set(page.pageId,group);}
    const now=Date.now();let stale=connections.some(c=>!successful.has(c.id)||now-successful.get(c.id)!>=60000||failures.has(c.id));
    const available=({page,connection}:{page:Connection['pages'][number];connection:Connection})=>managers.has(connection.userId)&&connection.status==='active'&&Boolean(connection.userTokenEncrypted)&&page.active&&Boolean(page.pageTokenEncrypted)&&page.tasks.length>0&&(!page.expiresAt||page.expiresAt.getTime()>now)&&(!connection.expiresAt||connection.expiresAt.getTime()>now);
    const warnings=connections.flatMap(c=>failures.has(c.id)?[failures.get(c.id)!]:!successful.has(c.id)?[{code:c.directoryReadAt?'cached_snapshot':'directory_not_read',diagnosticId:randomUUID()}]:[]);
    const rows:ManagedPageDto[]=[];
    for(const [pageId,candidates] of groups){
      const selected=selections.find(s=>s.pageId===pageId)?.managedPageId??null;
      const {page,connection}=candidates.find(c=>c.page.id===selected)??candidates[0];
      const businesses=[...new Map(candidates.flatMap(c=>c.page.businesses).map(b=>[`${b.businessId}:${b.relation}`,{id:b.businessId,name:b.name,relation:b.relation as 'owned'|'client'}])).values()];
      if(filter.businessId&&!businesses.some(b=>b.id===filter.businessId))continue;
      if(filter.query&&!page.name.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase()))continue;
      const expired=Boolean(page.expiresAt&&page.expiresAt.getTime()<=now||connection.expiresAt&&connection.expiresAt.getTime()<=now);
      rows.push({id:page.id,connectionId:connection.id,pageId,name:page.name,profileUrl:page.profileUrl,avatarUrl:page.avatarUrl,businesses,
        publishingAccountId:accounts.find(a=>a.providerAccountId===pageId)?.id??null,
        authorization:expired?'expired':available({page,connection})?'available':'missing',lastReadAt:page.lastReadAt?.toISOString()??null,
        selectedManagedPageId:selected,connectionChoices:candidates.map(c=>({managedPageId:c.page.id,connectionId:c.connection.id,available:available(c)}))});
    }
    rows.sort((a,b)=>a.pageId.localeCompare(b.pageId));
    const offset=Number(filter.cursor??0),items=rows.slice(offset,offset+25);
    const times=connections.map(c=>c.directoryReadAt?.getTime()).filter((v):v is number=>v!==undefined);
    if(!connections.length)stale=false;
    return {items,nextCursor:offset+25<rows.length?String(offset+25):null,readAt:times.length?new Date(Math.min(...times)).toISOString():new Date().toISOString(),source:'graph',stale,warnings};
  }
  return {
    list,
    async refresh(ctx:ManagementContext,connectionId:string,options:{force?:boolean}={}){
      await requireManagementMember(deps.db,ctx,false,true);
      const connection=await deps.db.facebookManagementConnection.findFirst({where:{id:connectionId,workspaceId:ctx.workspaceId,status:'active',user:activeManagementOwner(ctx.workspaceId)}});
      if(!connection?.userTokenEncrypted||connection.expiresAt&&connection.expiresAt<=new Date())throw new FacebookPageAccessError();
      if(options.force===false&&!failures.has(connectionId)&&Date.now()-(successful.get(connectionId)??0)<60000)return list(ctx,{connectionId});
      try{
        const client=deps.createClient({...connection,userToken:deps.decrypt(connection.userTokenEncrypted)});
        const businesses=await readAllDirectoryPages(after=>client.listBusinesses(after));
        const pages=new Map<string,SnapshotPage>();
        for(const business of businesses)for(const relation of ['owned','client'] as const){
          for(const p of await readAllDirectoryPages(after=>client.listBusinessPages(business.id,relation,after))){
            const previous=pages.get(p.id)??{...p,businesses:[]};
            if(!previous.businesses.some(b=>b.businessId===business.id&&b.relation===relation))previous.businesses.push({businessId:business.id,name:business.name,relation});
            pages.set(p.id,previous);
          }
        }
        for(const p of await readAllDirectoryPages(after=>client.listUserPages(after))){const previous=pages.get(p.id);pages.set(p.id,{...p,businesses:previous?.businesses??[],user:p});}
        const normalized:Array<{p:SnapshotPage;scopes:string[];expiresAt:Date|null;pageToken:string|null}>=[];
        for(const p of pages.values()){
          let scopes:string[]=[],expiresAt:Date|null=null,pageToken=p.user?.pageToken??null;
          if(pageToken){try{const inspected=await client.inspectPageToken(p.id,pageToken);scopes=inspected.scopes.filter(s=>!inspected.granularScopes.some(g=>g.scope===s&&g.targetIds!==null&&!g.targetIds.includes(p.id)));expiresAt=inspected.expiresAt?new Date(inspected.expiresAt):null;}
            catch(error){if(error instanceof FacebookDirectoryError&&['authorization_invalid','permission_missing'].includes(error.kind))pageToken=null;else throw error;}}
          normalized.push({p,scopes,expiresAt,pageToken});
        }
        const readAt=new Date();
        await deps.db.$transaction(async tx=>{
          await requireManagementMember(tx,ctx,false,true);
          const changed=await tx.facebookManagementConnection.updateMany({where:{id:connectionId,workspaceId:ctx.workspaceId,status:'active',version:connection.version,user:activeManagementOwner(ctx.workspaceId)},data:{directoryReadAt:readAt,version:{increment:1}}});
          if(changed.count!==1)throw new FacebookPageAccessError();
          await tx.facebookManagedPage.updateMany({where:{connectionId,pageId:{notIn:normalized.map(row=>row.p.id)}},data:{active:false,pageTokenEncrypted:null,notificationsEnabled:false}});
          for(const {p,scopes,expiresAt,pageToken} of normalized){
            const data={name:p.name,profileUrl:p.profileUrl,avatarUrl:p.avatarUrl,tasks:p.user?.tasks??[],scopes,expiresAt,pageTokenEncrypted:pageToken?deps.encrypt(pageToken):null,active:true,lastReadAt:readAt};
            const saved=await tx.facebookManagedPage.upsert({where:{connectionId_pageId:{connectionId,pageId:p.id}},create:{connectionId,pageId:p.id,...data},update:data});
            await tx.facebookManagedPageBusiness.deleteMany({where:{managedPageId:saved.id}});
            if(p.businesses.length)await tx.facebookManagedPageBusiness.createMany({data:p.businesses.map(b=>({...b,managedPageId:saved.id}))});
          }
        },{timeout:20000});
        successful.set(connectionId,Date.now());failures.delete(connectionId);
      }catch(error){
        if(error instanceof FacebookPageAccessError)throw error;
        failures.set(connectionId,{code:error instanceof FacebookDirectoryError?error.kind:'directory_refresh_failed',diagnosticId:error instanceof FacebookDirectoryError?error.diagnosticId:randomUUID()});
        if(!connection.directoryReadAt)throw new FacebookDirectoryError('temporary_failure');
      }
      return list(ctx,{connectionId});
    },
    async select(ctx:ManagementContext,managedPageId:string){
      return deps.db.$transaction(async tx=>{
        await requireManagementMember(tx,ctx,false,true);
        const page=await tx.facebookManagedPage.findFirst({where:{id:managedPageId,active:true,connection:{workspaceId:ctx.workspaceId,status:'active',user:activeManagementOwner(ctx.workspaceId)}}});
        if(!page)throw new FacebookPageAccessError();
        await tx.facebookManagementPageSelection.upsert({where:{workspaceId_pageId:{workspaceId:ctx.workspaceId,pageId:page.pageId}},create:{workspaceId:ctx.workspaceId,pageId:page.pageId,managedPageId},update:{managedPageId}});
        return {managedPageId};
      });
    }
  };
}
