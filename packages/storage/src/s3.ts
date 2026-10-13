import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectListPage, ObjectRef, StorageAdapter } from "@latex-collab/contracts";

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

export class StorageLimitError extends Error {
  constructor() {
    super("Object exceeds the allowed byte limit");
    this.name = "StorageLimitError";
  }
}

export function validateKey(key: string): void {
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new StorageSecurityError("Key must be a non-empty string");
  }

  // Iteratively decode to catch nested and double-encoded traversal sequences (%252e%252e, %255c, etc.)
  let current = key;
  for (let depth = 0; depth < 5; depth++) {
    if (
      current.includes("..") ||
      current.startsWith("/") ||
      current.includes("\\") ||
      current.includes("\0") ||
      current.includes("//") ||
      /(^|\/)\.\.?(\/|$)/.test(current)
    ) {
      throw new StorageSecurityError("Path traversal or illegal characters detected in object key");
    }

    try {
      const next = decodeURIComponent(current);
      if (next === current) {
        break;
      }
      if (depth === 4) {
        throw new StorageSecurityError("Excessive URI encoding layers detected in object key");
      }
      current = next;
    } catch {
      // If the first layer of percent-encoding is malformed, reject it.
      // If subsequent layers fail (e.g. valid literal '%' after decoding), stop iterating.
      if (depth === 0) {
        throw new StorageSecurityError("Malformed URI encoding in object key");
      }
      break;
    }
  }

  const allowedPrefixes = ["projects/", "artifacts/", "revisions/", "templates/", "avatars/"];
  if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
    throw new StorageSecurityError(`Object key must start with an authorized prefix: ${key}`);
  }
}

export function assertProjectKeyScope(key: string, authorizedProjectId: string): void {
  if (
    !authorizedProjectId ||
    typeof authorizedProjectId !== "string" ||
    authorizedProjectId.trim() === ""
  ) {
    throw new StorageSecurityError("Authorized project ID must be a non-empty string");
  }
  validateKey(key);
  const expectedPrefix = `projects/${authorizedProjectId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new StorageSecurityError(
      `Access denied: key "${key}" is outside authorized scope for project "${authorizedProjectId}"`,
    );
  }
}

export function assertAvatarKeyScope(key: string, authorizedUserId: string): void {
  validateKey(key);
  if (!key.startsWith(`avatars/${authorizedUserId}/`))
    throw new StorageSecurityError("Avatar object is outside the authorized user scope");
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

  async getLimited(key: string, maxBytes: number): Promise<Uint8Array> {
    validateKey(key);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
      throw new StorageLimitError();
    }
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error("Object has no body");
    const body = response.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        body.destroy?.();
        throw new StorageLimitError();
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
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
        lastModified: response.LastModified,
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

  async list(prefix: string, cursor?: string, limit = 1000): Promise<ObjectListPage> {
    validateKey(prefix);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new StorageLimitError();
    }
    const response = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: cursor,
        MaxKeys: limit,
      }),
    );
    if (response.IsTruncated && !response.NextContinuationToken) {
      throw new Error("Object listing did not return a continuation token");
    }
    return {
      objects: (response.Contents ?? [])
        .filter((item) => item.Key?.startsWith(prefix))
        .map((item) => ({
          key: item.Key!,
          sizeBytes: item.Size ?? 0,
          lastModified: item.LastModified ?? null,
        })),
      cursor: response.IsTruncated ? response.NextContinuationToken! : null,
    };
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
