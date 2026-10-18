import {createApp} from '../../src/app';
import {prisma} from '../../src/prisma';import {redis} from '../../src/redis';
import {localUploadRedis} from '../../src/uploads/local/runtime';import {publishQueue} from '../../src/queues/publishQueue';
globalThis.fetch=async()=>{throw Error('Provider I/O is forbidden in this fixture');};
async function start(){
 await(await publishQueue.waitUntilReady()).ping();
 const server=createApp().listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as any).port}));
 process.on('message',async message=>{if(message==='stop'){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await publishQueue.close();localUploadRedis.disconnect();redis.disconnect();await prisma.$disconnect();process.exit(0);}});
}
void start().catch(()=>process.exit(1));
