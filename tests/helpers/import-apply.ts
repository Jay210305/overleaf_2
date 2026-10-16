import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "../../packages/db/src/client.js";
import {
  ImportJobRepository,
  type ImportJobView,
} from "../../packages/db/src/repositories/import-jobs.js";
import type { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { runImportValidationPass } from "../../apps/jobs/src/imports/worker.js";
import { buildZip, minimalPng, sha256Hex } from "./zip-fixtures.js";

export const importMainTex = "\\documentclass{article}\n\\begin{document}Hola\\end{document}\n";
export const importIntroTex = "\\section{Intro}\nContenido.\n";

export function buildImportArchive(): Buffer {
  return buildZip([
    { name: "main.tex", data: importMainTex },
    { name: "chapters/", data: undefined },
    { name: "chapters/intro.tex", data: importIntroTex },
    { name: "refs.bib", data: "@book{key, title={T}}\n" },
    { name: "assets/fig.png", data: minimalPng() },
  ]);
}

/**
 * Stage one archive through reserve/enqueue/validate and settle OUR job.
 * Each caller passes a unique title so parallel suites sharing local
 * services never observe each other's projects.
 */
export async function settleValidatedJob(
  db: DatabaseClient,
  storage: S3StorageAdapter,
  jobs: ImportJobRepository,
  actorId: string,
  title: string,
  bytes: Buffer = buildImportArchive(),
): Promise<{ bytes: Buffer; job: ImportJobView }> {
  const reserved = await jobs.reserve({
    actorId,
    idempotencyKey: randomUUID(),
    archiveSha256: sha256Hex(bytes),
    archiveSize: bytes.length,
    title,
  });
  await storage.put(reserved.job.archiveKey, bytes, "application/zip");
  await jobs.enqueue(reserved.job.id, {
    archiveSha256: sha256Hex(bytes),
    archiveSize: bytes.length,
  });
  for (let attempt = 0; attempt < 25; attempt++) {
    const current = await jobs.get(reserved.job.id);
    if (current && current.status === "validated") return { bytes, job: current };
    if (current && current.status === "failed") {
      throw new Error(`import job unexpectedly failed: ${current.errorCode}`);
    }
    await runImportValidationPass(db, storage, { limit: 5 });
  }
  throw new Error("import job did not validate");
}
