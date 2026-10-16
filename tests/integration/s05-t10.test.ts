import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  readArchiveForApply,
  validateZipArchive,
  ZipValidationError,
} from "../../apps/jobs/src/imports/zip.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { applyImportMigrations } from "../helpers/import-migrations.js";
import { buildZip, minimalPng } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

const mainTex = "\\documentclass{article}\n\\begin{document}Hola\\end{document}\n";
const introTex = "\\section{Intro}\nContenido.\n";

function validArchive(): Buffer {
  return buildZip([
    { name: "main.tex", data: mainTex },
    { name: "chapters/", data: undefined },
    { name: "chapters/intro.tex", data: introTex },
    { name: "assets/fig.png", data: minimalPng() },
  ]);
}

describe("S05-T10 validated import application", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    await fixture.seed();
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
    void storage;
    void randomUUID;
  });

  it("reopens a validated archive with exact file bytes", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const files = await readArchiveForApply(bytes, manifest);
    expect(files.get("main.tex")?.toString("utf8")).toBe(mainTex);
    expect(files.get("chapters/intro.tex")?.toString("utf8")).toBe(introTex);
    expect(files.get("assets/fig.png")).toEqual(minimalPng());
    expect(files.has("chapters/")).toBe(false);
  });

  it("rejects archive bytes changed after validation without a partial map", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const tampered = Buffer.from(bytes);
    const marker = Buffer.from("Hola");
    const at = tampered.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    tampered[at] = tampered[at]! ^ 0xff;
    let files: Map<string, Buffer> | null = null;
    await expect(
      readArchiveForApply(tampered, manifest).then(
        (result) => {
          files = result;
        },
        (error) => {
          throw error;
        },
      ),
    ).rejects.toBeInstanceOf(ZipValidationError);
    expect(files).toBeNull();
  });

  it("rejects a tampered manifest hash or version", async () => {
    const bytes = validArchive();
    const manifest = await validateZipArchive(bytes);
    const tamperedHash = {
      version: 1 as const,
      entries: manifest.entries.map((entry, index) =>
        index === 0 && entry.kind !== "DIRECTORY"
          ? { ...entry, sha256: "0".repeat(64) }
          : entry,
      ),
    };
    await expect(readArchiveForApply(bytes, tamperedHash)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    const tamperedVersion = { version: 2, entries: manifest.entries } as unknown as typeof manifest;
    await expect(readArchiveForApply(bytes, tamperedVersion)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
  });

  it("rejects a folder/file path collision before any project row commits", async () => {
    const bytes = buildZip([
      { name: "notes.tex", data: "file blocks the folder\n" },
      { name: "notes.tex/extra.tex", data: mainTex },
    ]);
    const manifest = await validateZipArchive(bytes);
    await expect(readArchiveForApply(bytes, manifest)).rejects.toBeInstanceOf(ZipValidationError);
  });
});
