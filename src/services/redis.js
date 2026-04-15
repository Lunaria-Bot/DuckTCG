const Redis = require("ioredis");
const logger = require("../utils/logger");

let client = null;

async function connectRedis() {
  client = new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });

  client.on("error", (err) => logger.error("Redis error:", err));
  client.on("connect", () => logger.info("Redis connected"));

  await client.connect();
  return client;
}

function getRedis() {
  if (!client) throw new Error("Redis not initialized");
  return client;
}

module.exports = { connectRedis, getRedis };
