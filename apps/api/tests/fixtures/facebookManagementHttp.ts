import {createApp} from '../../src/app';
import {createFacebookManagementRuntime} from '../../src/facebookManagement/runtime';
import {prisma} from '../../src/prisma';
import {redis} from '../../src/redis';
const settings={enabled:true,appId:'123',graphVersion:'v26.0',loginConfigId:'456',callbackUrl:'https://example.test/api/v1/integrations/facebook-management/oauth/callback'};
const runtime=createFacebookManagementRuntime({db:prisma,settings,appSecret:'test-secret',verifyToken:'verify',encrypt:v=>v,decrypt:v=>v,fetchImpl:async()=>{throw Error('Real Meta requests are forbidden in this fixture');}});
const server=createApp({facebookManagement:runtime}).listen(0,'127.0.0.1',()=>{const address=server.address();if(address&&typeof address!=='string')process.send?.({port:address.port});});
process.on('message',async message=>{if(message==='stop'){await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();redis.disconnect();process.exit(0);}});
