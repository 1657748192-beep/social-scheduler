import type {PrismaClient} from '@prisma/client';import type {LiveInboxPolicy} from './livePolicy';
import type {MetaDeletionNamespace} from './metaDeletionRoutes';import type {MetaDeletionAsset} from './deletion';
import {createMetaSourceRetention,createInboxRetention,type MetaSourcePhase} from './retention';

/** One bounded source phase or derived batch; no timer and no provider I/O. */
export function createMetaExpiryMaintenance({db,policy,namespaces,now=()=>new Date()}:{db:PrismaClient;policy:LiveInboxPolicy;namespaces:MetaDeletionNamespace[];now?:()=>Date}){
 if(namespaces.length>2||namespaces.some(n=>!['facebook','instagram'].includes(n.platform)||!/^\d{1,256}$/.test(n.appId))||new Set(namespaces.map(n=>JSON.stringify(n))).size!==namespaces.length)throw Error('Meta expiry namespace unavailable');
 const scopes=namespaces.map(n=>({...n})),source=createMetaSourceRetention({db,policy}),derived=createInboxRetention({db,policy}),positions=new Map<string,{after?:string;phase:number}>();let turn=0,nextScope=0;
 const igPhases:Array<Exclude<MetaSourcePhase,'threads'>>=['raw','messages','comments','sends'],fbPhases:MetaSourcePhase[]=['raw','messages','comments','threads','sends'];
 async function target(n:MetaDeletionNamespace,after?:string):Promise<{id:string;asset:MetaDeletionAsset}|null>{
  if(n.platform==='instagram'){
   const c=await db.instagramManagementConnection.findFirst({where:{appId:n.appId,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},select:{id:true,workspaceId:true,providerAccountId:true,version:true}});
   return c?{id:c.id,asset:{workspaceId:c.workspaceId,platform:n.platform,appId:n.appId,providerAssetId:c.providerAccountId,connectionId:c.id,connectionVersion:c.version}}:null;
  }
  const p=await db.facebookManagedPage.findFirst({where:{connection:{appId:n.appId},...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},select:{id:true,pageId:true,connectionId:true,connection:{select:{workspaceId:true,version:true}}}});
  return p?{id:p.id,asset:{workspaceId:p.connection.workspaceId,platform:n.platform,appId:n.appId,providerAssetId:p.pageId,connectionId:p.connectionId,connectionVersion:p.connection.version}}:null;
 }
 return{async tick():Promise<number>{
  if(!scopes.length)return 0;
  if(++turn%3===0){
   // Do not invalidate a durable active-case continuation while its explicit
   // deletion is progressing. Exhausted jobs remain pending for diagnosis.
   if(await db.metaInboxDeletionRequest.findFirst({where:{status:'pending',attempts:{lt:8},OR:scopes.map(n=>({...n}))},select:{id:true}}))return 0;
   return derived.pruneInbox(now(),50);
  }
  const n=scopes[nextScope];nextScope=(nextScope+1)%scopes.length;const key=JSON.stringify(n),position=positions.get(key)??{phase:0};positions.set(key,position);
  let current=await target(n,position.after);
  if(!current&&position.after){position.after=undefined;position.phase++;current=await target(n);}
  if(!current)return 0;position.after=current.id;
  return n.platform==='instagram'?source.pruneInstagram(current.asset,now(),50,igPhases[position.phase%igPhases.length]):source.pruneFacebook(current.asset,now(),50,fbPhases[position.phase%fbPhases.length]);
 }};
}
