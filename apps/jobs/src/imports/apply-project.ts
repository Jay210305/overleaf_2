import type { StorageAdapter } from "@latex-collab/storage";

export type ImportFileKind = "TEXT" | "BINARY";

export type ImportFileBytes = {
  data: Buffer;
  mime: string;
  sha256: string;
  kind: ImportFileKind;
};

/** Content-addressed private key for one verified import binary. */
export function importBlobKey(projectId: string, sha256: string): string {
  return `projects/${projectId}/blobs/${sha256}`;
}

/**
 * Writes every manifest-declared binary to its verified content-addressed
 * key before any project row exists. Keys are deterministic, so a retry
 * reconciles the same objects. A storage failure propagates with the job
 * still validated and no project row, and no key ever reaches the caller.
 */
export async function prepareImportBlobs(
  storage: StorageAdapter,
  projectId: string,
  files: Map<string, ImportFileBytes>,
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  for (const [path, file] of files) {
    if (file.kind !== "BINARY") continue;
    const key = importBlobKey(projectId, file.sha256);
    const stored = await storage.put(key, file.data, file.mime);
    if (stored.sha256 !== file.sha256 || stored.sizeBytes !== file.data.length) {
      throw new Error("Import blob verification failed");
    }
    keys.set(path, key);
  }
  return keys;
}
