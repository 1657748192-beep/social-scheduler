import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { createApiServer,closeApiServer } from "./httpServer";
import {localUploadRuntime,localUploadRedis} from './uploads/local/runtime';
import {startLocalUploadCleanup} from './uploads/local/cleanup';

const app = createApp();
const uploadCleanup=startLocalUploadCleanup(localUploadRuntime);

const server = createApiServer(app).listen(config.API_PORT, () => {
  console.log(`API listening on http://localhost:${config.API_PORT}`);
});

async function shutdown() {
  console.log("Shutting down API");
  await closeApiServer(server,()=>uploadCleanup.stop(),async () => {
    await prisma.$disconnect();
    localUploadRedis.disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
