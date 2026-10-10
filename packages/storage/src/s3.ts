import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectRef, StorageAdapter } from "@latex-collab/contracts";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export class StorageSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSecurityError";
  }
}

export function validateKey(key: string): void {
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new StorageSecurityError("Key must be a non-empty string");
  }

  // Check for raw traversal or illegal control characters
  if (
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.includes("//")
  ) {
    throw new StorageSecurityError("Path traversal or illegal characters detected in object key");
  }

  // Normalize / decode URI sequences to prevent percent-encoded traversal attacks (%2e%2e, %5c, %00)
  let decoded = key;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    throw new StorageSecurityError("Malformed URI encoding in object key");
  }

  if (
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("//")
  ) {
    throw new StorageSecurityError("Path traversal or illegal characters detected in object key");
  }

  // Reject relative dot segments: "/./" or ending with "/."
  if (/(^|\/)\.\.?(\/|$)/.test(decoded)) {
    throw new StorageSecurityError("Relative path segments detected in object key");
  }

  const allowedPrefixes = ["projects/", "artifacts/", "revisions/", "templates/"];
  if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
    throw new StorageSecurityError(`Object key must start with an authorized prefix: ${key}`);
  }
}

export function assertProjectKeyScope(key: string, authorizedProjectId: string): void {
  validateKey(key);
  const expectedPrefix = `projects/${authorizedProjectId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new StorageSecurityError(
      `Access denied: key "${key}" is outside authorized scope for project "${authorizedProjectId}"`,
    );
  }
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        // Ignore if already exists or race in creation
      }
    }
  }

  async put(key: string, bytes: Uint8Array, mime: string): Promise<ObjectRef> {
    validateKey(key);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sizeBytes = bytes.byteLength;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: Buffer.from(bytes),
          ContentType: mime,
          Metadata: {
            sha256,
          },
        }),
      );
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error.name === "NoSuchBucket") {
        await this.ensureBucketExists();
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: Buffer.from(bytes),
            ContentType: mime,
            Metadata: {
              sha256,
            },
          }),
        );
      } else {
        throw err;
      }
    }

    return {
      key,
      sha256,
      sizeBytes,
      mime,
    };
  }

  async get(key: string): Promise<Uint8Array> {
    validateKey(key);
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Empty body returned for key: ${key}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return byteArray;
  }

  async head(key: string): Promise<ObjectRef | null> {
    validateKey(key);
    try {
      const response = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const sizeBytes = response.ContentLength ?? 0;
      const mime = response.ContentType ?? "application/octet-stream";
      const sha256 = response.Metadata?.["sha256"] ?? "";

      return {
        key,
        sha256,
        sizeBytes,
        mime,
      };
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        err.name === "NotFound" ||
        err.name === "NoSuchBucket" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    validateKey(key);
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async presign(key: string, operation: "get" | "put", ttlSeconds = 60): Promise<string> {
    validateKey(key);
    const command =
      operation === "get"
        ? new GetObjectCommand({ Bucket: this.bucket, Key: key })
        : new PutObjectCommand({ Bucket: this.bucket, Key: key });

    return await getSignedUrl(this.s3, command, { expiresIn: ttlSeconds });
  }
}
