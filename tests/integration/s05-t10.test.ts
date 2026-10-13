import { describe, expect, it } from "vitest";
import {
  readArchiveForApply,
  validateZipArchive,
  ZipValidationError,
} from "../../apps/jobs/src/imports/zip.js";
import { buildZip, minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

describe("S05-T10 validated archive materialization", () => {
  it("reopens nested source and binary entries with their exact validated bytes", async () => {
    const source = Buffer.from("\\documentclass{article}\n\\begin{document}Hi\\end{document}\n");
    const image = minimalPng();
    const archive = buildZip([
      { name: "main.tex", data: source },
      { name: "images/chart.png", data: image },
    ]);
    const manifest = await validateZipArchive(archive);

    const files = await readArchiveForApply(archive, manifest);

    expect([...files.keys()].sort()).toEqual(["images/chart.png", "main.tex"]);
    expect(files.get("main.tex")).toEqual(source);
    expect(files.get("images/chart.png")).toEqual(image);
    expect(manifest.entries.find((entry) => entry.path === "main.tex")).toMatchObject({
      sha256: sha256Hex(source),
    });
  });

  it("rejects changed archive bytes and a tampered validated manifest", async () => {
    const archive = buildZip([{ name: "main.tex", data: "Original\n" }]);
    const manifest = await validateZipArchive(archive);
    const changed = buildZip([{ name: "main.tex", data: "Modified\n" }]);
    await expect(readArchiveForApply(changed, manifest)).rejects.toBeInstanceOf(ZipValidationError);
    const tampered = structuredClone(manifest);
    const file = tampered.entries.find((entry) => entry.path === "main.tex");
    if (!file || file.kind === "DIRECTORY") throw new Error("missing fixture file");
    file.sha256 = "0".repeat(64);
    await expect(readArchiveForApply(archive, tampered)).rejects.toBeInstanceOf(ZipValidationError);
  });

  it("rejects a file used as an ancestor folder", async () => {
    const archive = buildZip([
      { name: "style.sty", data: "\\ProvidesPackage{style}\n" },
      { name: "style.sty/main.tex", data: "Nested\n" },
    ]);
    await expect(validateZipArchive(archive)).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  });
});
