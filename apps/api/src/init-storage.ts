import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { parseServerConfig } from "@latex-collab/config/server";
const c = parseServerConfig(process.env);
const client = new S3Client({
  endpoint: c.S3_ENDPOINT,
  region: c.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY },
  maxAttempts: 1,
});
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: c.S3_BUCKET }));
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
      throw error;
    await client.send(new CreateBucketCommand({ Bucket: c.S3_BUCKET }));
  }
  console.log("Private development bucket ready.");
} finally {
  client.destroy();
}
