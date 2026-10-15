import { createHash } from "node:crypto";

export interface CacheKeyInput {
  manifestHash: string;
  compiler: string;
  imageDigest: string;
  rootFile?: string | undefined;
  draft?: boolean | undefined;
  policyVersion: string;
}

export class ForeignArtifactAccessDeniedError extends Error {
  readonly code = "FOREIGN_ARTIFACT_ACCESS_DENIED" as const;
  readonly status = 403 as const;

  constructor(message = "Cache hit cannot authorize another project's artifacts") {
    super(message);
    this.name = "ForeignArtifactAccessDeniedError";
  }
}

/**
 * Computes deterministic SHA-256 compilation cache key (CMP-11).
 * Invalidated by any change in:
 * - File manifest content hash
 * - TeX engine / compiler profile
 * - Container image digest / version
 * - Options (root file, draft mode)
 * - Security policy version
 */
export function computeCompilationCacheKey(input: CacheKeyInput): string {
  const normalized = JSON.stringify([
    input.manifestHash,
    input.compiler,
    input.imageDigest,
    input.rootFile ?? "main.tex",
    Boolean(input.draft),
    input.policyVersion,
  ]);

  return createHash("sha256").update(normalized).digest("hex");
}

export interface CachedCompilationRecord {
  cacheKey: string;
  projectId: string;
  sourceRevision: number;
  manifestHash: string;
  compiler: string;
  imageDigest: string;
  pdfKey: string;
  synctexKey?: string | undefined;
  logKey: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Authorized content-aware compilation cache manager (CMP-11, NFR-06).
 * Enforces strict project tenant isolation: foreign projects can never access
 * or authorize another project's cached artifacts.
 */
export class CompilationCache {
  private cache = new Map<string, CachedCompilationRecord>();

  /**
   * Look up cached compilation by key, enforcing strict tenant project authorization.
   * Throws ForeignArtifactAccessDeniedError if a foreign project attempts to claim another project's artifacts.
   */
  public get(cacheKey: string, requestingProjectId: string): CachedCompilationRecord | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Strict tenant isolation: foreign project cannot claim or view another project's cache entry
    if (entry.projectId !== requestingProjectId) {
      throw new ForeignArtifactAccessDeniedError(
        `Project '${requestingProjectId}' is unauthorized to access cached artifacts owned by project '${entry.projectId}'`
      );
    }

    return entry;
  }

  /**
   * Saves a valid compilation output to the cache.
   */
  public set(entry: CachedCompilationRecord): void {
    this.cache.set(entry.cacheKey, entry);
  }

  /**
   * Invalidates all cache entries for a specific project.
   */
  public invalidateProject(projectId: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.projectId === projectId) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Flushes all cached entries.
   */
  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

/**
 * Validates that cached PDF artifacts strictly match the requested source revision and manifest hash (NFR-06).
 */
export function verifyManifestAndRevisionMatch(
  record: CachedCompilationRecord,
  expectedRevision: number,
  expectedManifestHash: string,
): boolean {
  return (
    record.sourceRevision === expectedRevision &&
    record.manifestHash === expectedManifestHash
  );
}
