import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./prisma";
import { redis } from "./redis";

const app = createApp();

const server = app.listen(config.API_PORT, () => {
  console.log(`API listening on http://localhost:${config.API_PORT}`);
});

async function shutdown() {
  console.log("Shutting down API");
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
