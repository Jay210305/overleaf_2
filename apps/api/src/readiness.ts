import pg from "pg";
import { createClient } from "redis";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { ServerConfig } from "@latex-collab/config/server";
export function createReadiness(config: ServerConfig) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
    max: 2,
  });
  pool.on("error", () => {
    /* Next readiness probe will reflect availability without logging credentials. */
  });
  const s3 = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  async function redisPing() {
    const client = createClient({
      url: config.REDIS_URL,
      socket: { connectTimeout: 1500, reconnectStrategy: false },
    });
    client.on("error", () => {});
    try {
      await client.connect();
      return (await client.ping()) === "PONG";
    } finally {
      if (client.isOpen) client.destroy();
    }
  }
  return {
    async check() {
      const results = await Promise.allSettled([
        pool.query("SELECT 1").then(() => true),
        redisPing(),
        s3
          .send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }), {
            abortSignal: AbortSignal.timeout(1500),
          })
          .then(() => true),
        config.NODE_ENV === "production"
          ? Promise.resolve(true)
          : fetch(`${config.MAILPIT_URL}/livez`, { signal: AbortSignal.timeout(1500) })
              .then((response) => response.ok)
              .catch(() => false),
      ]);
      return results.every((result) => result.status === "fulfilled" && result.value === true);
    },
    async close() {
      s3.destroy();
      await pool.end();
    },
  };
}
