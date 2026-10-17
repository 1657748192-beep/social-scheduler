import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { createApiServer,closeApiServer } from "./httpServer";
import {localUploadRuntime,localUploadRedis} from './uploads/local/runtime';
import {startLocalUploadCleanup} from './uploads/local/cleanup';
import {facebookManagementRuntime} from './facebookManagement/runtime';
import {startFacebookManagementPump} from './facebookManagement/receptionPump';
import {createInboxRetention} from './interactionInbox/retention';
import {startInboxRetention} from './interactionInbox/sourceLifetime';
import {getInstagramManagementRuntime} from './instagramManagement/defaultRuntime';
import {startInstagramManagementPump} from './instagramManagement/receptionPump';

const instagramRuntime=getInstagramManagementRuntime();
const app = createApp({instagramManagement:instagramRuntime});
const instagramPump=startInstagramManagementPump({enabled:instagramRuntime.receptionEnabled,store:instagramRuntime.receptionStore});
const uploadCleanup=startLocalUploadCleanup(localUploadRuntime);
const facebookPump=startFacebookManagementPump({enabled:facebookManagementRuntime.enabled,store:facebookManagementRuntime.receptionStore});
const inboxRetention=startInboxRetention(createInboxRetention({db:prisma}));

const server = createApiServer(app).listen(config.API_PORT, () => {
  console.log(`API listening on http://localhost:${config.API_PORT}`);
});

async function shutdown() {
  console.log("Shutting down API");
  await closeApiServer(server,async()=>{await Promise.all([uploadCleanup.stop(),facebookPump.stop(),instagramPump.stop(),inboxRetention.stop()]);},async () => {
    await prisma.$disconnect();
    localUploadRedis.disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
