import {Prisma,type PrismaClient} from '@prisma/client';
import {liveInboxCaseSql} from './sourceLifetime';
export function createInboxRetention({db}:{db:PrismaClient}){
 return{async pruneInbox(now:Date,limit:number){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid retention batch');
  const cutoff=new Date(now.getTime()-90*86400000),rows=await db.interactionItem.findMany({where:{receivedAt:{lt:cutoff}},take:limit,select:{id:true}});
  // No new raw-event copies exist. The original receiver still owns its own retention policy.
  const removed=await db.interactionItem.deleteMany({where:{id:{in:rows.map(r=>r.id)},receivedAt:{lt:cutoff}}});
  const dead=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT c.id FROM "InteractionCase" c WHERE NOT (${liveInboxCaseSql(now)}) ORDER BY c.id LIMIT ${limit}`);
  await db.interactionCase.deleteMany({where:{id:{in:dead.map(r=>r.id)}}});
  const stale=await db.interactionCase.findMany({where:{items:{none:{}},lastInboundAt:{lt:cutoff}},take:limit,select:{id:true}});
  await db.interactionCase.deleteMany({where:{id:{in:stale.map(r=>r.id)},items:{none:{}}}});
  // Identity display caches must not outlive their source; manual notes remain local until explicit deletion.
  const identities=await db.interactionIdentity.findMany({where:{customer:{cases:{none:{}}}},take:limit,select:{id:true}});
  await db.interactionIdentity.deleteMany({where:{id:{in:identities.map(i=>i.id)},customer:{cases:{none:{}}}}});
  return removed.count;
 }};
}
