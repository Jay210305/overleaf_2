import { randomUUID } from "node:crypto";
import type { ExecuteOutputArtifact } from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

export class PdfValidationError extends Error {
  readonly code = "INVALID_PDF_ARTIFACT" as const;
  readonly status = 422 as const;

  constructor(message = "Artifact named output.pdf is not a valid PDF document (missing %PDF- header)") {
    super(message);
    this.name = "PdfValidationError";
  }
}

/**
 * Validates that binary bytes correspond to a genuine PDF document.
 * Must start with standard %PDF- (0x25, 0x50, 0x44, 0x46) header.
 */
export function isValidPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

export type PersistArtifactsParams = {
  db: DatabaseClient;
  storage: StorageAdapter;
  projectId: string;
  jobId: string;
  sourceHash: string;
  artifacts: ExecuteOutputArtifact[];
  retentionDays?: number;
};

export type PersistedArtifactSet = {
  id: string;
  compileJobId: string;
  pdfKey: string | null;
  logKey: string | null;
  synctexKey: string | null;
  sourceHash: string;
  createdAt: Date;
  expiresAt: Date | null;
};

/**
 * Validates and privately persists compilation artifacts (PDF, log, SyncTeX)
 * into storage and records the immutable artifact_sets database record (S06-T06, CMP-01, CMP-09, NFR-06).
 */
export async function persistJobArtifacts(
  params: PersistArtifactsParams,
): Promise<PersistedArtifactSet> {
  let pdfKey: string | null = null;
  let logKey: string | null = null;
  let synctexKey: string | null = null;

  for (const artifact of params.artifacts) {
    if (artifact.name === "output.pdf" || artifact.name.endsWith(".pdf")) {
      if (!isValidPdf(artifact.bytes)) {
        throw new PdfValidationError();
      }
      const key = `projects/${params.projectId}/artifacts/${params.jobId}/output.pdf`;
      await params.storage.put(key, artifact.bytes, "application/pdf");
      pdfKey = key;
    } else if (artifact.name === "compile.log" || artifact.name.endsWith(".log")) {
      const key = `projects/${params.projectId}/artifacts/${params.jobId}/compile.log`;
      await params.storage.put(key, artifact.bytes, "text/plain");
      logKey = key;
    } else if (artifact.name.includes("synctex")) {
      const key = `projects/${params.projectId}/artifacts/${params.jobId}/output.synctex.gz`;
      await params.storage.put(key, artifact.bytes, "application/gzip");
      synctexKey = key;
    }
  }

  const retentionDays = params.retentionDays ?? 14;
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  const artifactSetId = randomUUID();

  const insertRes = await params.db.query<{
    id: string;
    compile_job_id: string;
    pdf_key: string | null;
    log_key: string | null;
    synctex_key: string | null;
    source_hash: string;
    created_at: Date;
    expires_at: Date | null;
  }>(
    `INSERT INTO artifact_sets (
       id, compile_job_id, pdf_key, log_key, synctex_key, source_hash, created_at, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     ON CONFLICT (compile_job_id) DO UPDATE
       SET pdf_key = EXCLUDED.pdf_key,
           log_key = EXCLUDED.log_key,
           synctex_key = EXCLUDED.synctex_key,
           source_hash = EXCLUDED.source_hash,
           expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [
      artifactSetId,
      params.jobId,
      pdfKey,
      logKey,
      synctexKey,
      params.sourceHash,
      expiresAt,
    ],
  );

  const row = insertRes.rows[0]!;

  // Update compile_jobs artifact_set_id and pdf_available
  await params.db.query(
    `UPDATE compile_jobs
     SET artifact_set_id = $1,
         pdf_available = $2,
         updated_at = now()
     WHERE id = $3`,
    [row.id, Boolean(pdfKey), params.jobId],
  );

  return {
    id: row.id,
    compileJobId: row.compile_job_id,
    pdfKey: row.pdf_key,
    logKey: row.log_key,
    synctexKey: row.synctex_key,
    sourceHash: row.source_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
