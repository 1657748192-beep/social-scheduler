import IORedis from "ioredis";
import { config } from "./config";

function redisUrlToConnectionOptions() {
  const url = new URL(config.REDIS_URL);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null
  };
}

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const redisConnection = redisUrlToConnectionOptions();
