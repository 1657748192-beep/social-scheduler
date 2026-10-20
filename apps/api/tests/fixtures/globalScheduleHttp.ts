import {createApp} from '../../src/app';
import {prisma} from '../../src/prisma';
import {redis} from '../../src/redis';
import {publishQueue} from '../../src/queues/publishQueue';
const server=createApp().listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as any).port}));
process.on('message',message=>{
  if(message!=='stop')return;
  server.closeAllConnections();
  server.close(async()=>{await publishQueue.close();await prisma.$disconnect();redis.disconnect();process.exit(0);});
});
