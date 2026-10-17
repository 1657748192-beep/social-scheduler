import type {PrismaClient} from '@prisma/client';import {z} from 'zod';import {HttpError} from '../utils/errors';
import type {InboxAccess} from './access';import type {Scope,TagDto} from './types';import {resolveInboxCustomer} from './customers';
const color=z.enum(['green','blue','orange','red','purple','gray']),name=z.string().transform(s=>s.normalize('NFC').trim()).pipe(z.string().min(1).max(30));
const schema=z.discriminatedUnion('op',[z.object({op:z.literal('create'),kind:z.enum(['customer','case']),name,color}).strict(),z.object({op:z.literal('rename'),id:z.string().uuid(),version:z.number().int().positive(),name,color}).strict(),z.object({op:z.literal('delete'),id:z.string().uuid(),version:z.number().int().positive()}).strict()]);
export function createInboxLabels({db,access}:{db:PrismaClient;access:InboxAccess}){
 async function listTags(ctx:Scope){await access.require(ctx);const rows=await db.interactionTag.findMany({where:{workspaceId:ctx.workspaceId,deletedAt:null},orderBy:{normalizedName:'asc'},take:200});return rows.map(t=>({id:t.id,kind:t.kind,name:t.name,color:t.color,version:t.version}));}
 async function mutateTag(ctx:Scope,input:unknown):Promise<TagDto|null>{
  const v=schema.parse(input);return access.write(ctx,async tx=>{
   await tx.$queryRaw`SELECT id FROM workspaces WHERE id=${ctx.workspaceId}::uuid FOR UPDATE`;
   if(v.op==='create'){
    if(await tx.interactionTag.count({where:{workspaceId:ctx.workspaceId,deletedAt:null}})>=200)throw new HttpError(409,'Tag limit reached');
    if(await tx.interactionTag.findFirst({where:{workspaceId:ctx.workspaceId,kind:v.kind,normalizedName:v.name.toLocaleLowerCase('en-US'),deletedAt:null}}))throw new HttpError(409,'Tag already exists');
    const t=await tx.interactionTag.create({data:{workspaceId:ctx.workspaceId,kind:v.kind,name:v.name,normalizedName:v.name.toLocaleLowerCase('en-US'),color:v.color}});return{id:t.id,kind:t.kind,name:t.name,color:t.color,version:t.version};
   }
   const old=await tx.interactionTag.findFirst({where:{id:v.id,workspaceId:ctx.workspaceId,deletedAt:null,version:v.version}});if(!old)throw new HttpError(409,'Tag changed');
   if(v.op==='delete'){await tx.interactionCustomerTag.deleteMany({where:{workspaceId:ctx.workspaceId,tagId:v.id}});await tx.interactionCaseTag.deleteMany({where:{workspaceId:ctx.workspaceId,tagId:v.id}});await tx.interactionTag.update({where:{id:v.id},data:{deletedAt:new Date(),version:{increment:1}}});return null;}
   if(await tx.interactionTag.findFirst({where:{id:{not:v.id},workspaceId:ctx.workspaceId,kind:old.kind,normalizedName:v.name.toLocaleLowerCase('en-US'),deletedAt:null}}))throw new HttpError(409,'Tag already exists');
   const t=await tx.interactionTag.update({where:{id:v.id},data:{name:v.name,normalizedName:v.name.toLocaleLowerCase('en-US'),color:v.color,version:{increment:1}}});return{id:t.id,kind:t.kind,name:t.name,color:t.color,version:t.version};
  },'manage');
 }
 async function setTags(ctx:Scope,target:{kind:'customer'|'case';id:string},tagIds:string[],version:number){
  const ids=z.array(z.string().uuid()).max(10).parse(tagIds);if(new Set(ids).size!==ids.length)throw new HttpError(400,'Duplicate tags');
  return access.write(ctx,async tx=>{
   if(target.kind==='customer'){await tx.$queryRaw`SELECT id FROM "InteractionCustomer" WHERE id=${target.id}::uuid FOR UPDATE`;await resolveInboxCustomer(tx,access,ctx,target.id,true);}else await access.resolveCase(ctx,target.id,'write',tx);
   if(await tx.interactionTag.count({where:{id:{in:ids},workspaceId:ctx.workspaceId,kind:target.kind,deletedAt:null}})!==ids.length)throw new HttpError(404,'Tag unavailable');
   if(target.kind==='customer'){
    const r=await tx.interactionCustomer.updateMany({where:{id:target.id,workspaceId:ctx.workspaceId,version},data:{version:{increment:1}}});if(r.count!==1)throw new HttpError(409,'Customer changed');await tx.interactionCustomerTag.deleteMany({where:{customerId:target.id,workspaceId:ctx.workspaceId}});await tx.interactionCustomerTag.createMany({data:ids.map(tagId=>({workspaceId:ctx.workspaceId,customerId:target.id,tagId}))});
   }else{
    const r=await tx.interactionCase.updateMany({where:{id:target.id,workspaceId:ctx.workspaceId,version},data:{version:{increment:1}}});if(r.count!==1)throw new HttpError(409,'Interaction changed');await tx.interactionCaseTag.deleteMany({where:{caseId:target.id,workspaceId:ctx.workspaceId}});await tx.interactionCaseTag.createMany({data:ids.map(tagId=>({workspaceId:ctx.workspaceId,caseId:target.id,tagId}))});
   }
  });
 }
 return{listTags,mutateTag,setTags};
}
