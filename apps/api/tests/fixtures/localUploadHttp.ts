import express from 'express';
import {prisma} from '../../src/prisma';
import Redis from 'ioredis';
import {createLocalUploadDisk} from '../../src/uploads/local/disk';
import {createUploadLeases} from '../../src/uploads/local/leases';
import {createLocalUploadRouter} from '../../src/uploads/local/routes';
import {errorHandler} from '../../src/middleware/errorHandler';
import {createApiServer} from '../../src/httpServer';

const redis=new Redis(process.env.REDIS_URL!,{maxRetriesPerRequest:0,enableOfflineQueue:false,commandTimeout:2000});
redis.on('error',()=>{});
async function main(){
  await new Promise<void>(resolve=>redis.once('ready',resolve));
  const disk=createLocalUploadDisk(process.env.LOCAL_UPLOAD_HTTP_ROOT!);
  let stopQueue=async()=>{};
  const app=express(); app.use(express.json({limit:'1mb'}));
  app.use('/api/v1',createLocalUploadRouter({db:prisma,now:()=>new Date(),availableBytes:disk.availableBytes,disk,leases:createUploadLeases(redis,process.env.LOCAL_UPLOAD_HTTP_PREFIX!)}));
  if(process.env.LOCAL_UPLOAD_HTTP_COMPOSER==='1'){
    // Real BullMQ operations, namespaced only inside this isolated test child.
    // The production producer/Worker configuration is deliberately untouched.
    const modulePath=require.resolve('bullmq'),bull=require(modulePath);
    class NamespacedQueue extends bull.Queue{constructor(name:string,options:any){super(name,{...options,prefix:process.env.LOCAL_UPLOAD_HTTP_PREFIX!});}}
    require.cache[modulePath]!.exports={...bull,Queue:NamespacedQueue};
    const {composerRoutes}=await import('../../src/routes/composerRoutes');
    const {scheduleRoutes}=await import('../../src/routes/scheduleRoutes');
    const {publishQueue}=await import('../../src/queues/publishQueue');
    const {redis:sharedRedis}=await import('../../src/redis');
    app.use('/api/v1',composerRoutes);app.use('/api/v1',scheduleRoutes);
    stopQueue=async()=>{await publishQueue.close();sharedRedis.disconnect();};
  }
  app.use(errorHandler);
  const server=createApiServer(app);
  server.listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as any).port}));
  process.on('message',message=>{if(message==='stop')server.close(async()=>{await stopQueue();redis.disconnect();await prisma.$disconnect();process.exit(0);});});
}
main().catch(()=>process.exit(1));
