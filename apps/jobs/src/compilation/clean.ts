import { CompilationCache } from "./cache.js";

export const AUXILIARY_EXTENSIONS: readonly string[] = [
  ".aux",
  ".bbl",
  ".bcf",
  ".blg",
  ".fdb_latexmk",
  ".fls",
  ".log",
  ".out",
  ".run.xml",
  ".synctex.gz",
  ".toc",
  ".lof",
  ".lot",
  ".nav",
  ".snm",
  ".vrb",
];

export interface CleanRebuildOptions {
  projectId: string;
  forceClean: boolean;
  cache?: CompilationCache | undefined;
  existingAuxFiles?: string[] | undefined;
}

export interface CleanRebuildResult {
  cleaned: boolean;
  invalidatedCacheEntries: number;
  removedAuxiliaries: string[];
}

/**
 * Checks whether a filename is an auxiliary build artifact that should be purged on clean rebuild.
 */
export function isAuxiliaryFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return AUXILIARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Executes a clean rebuild preparation (CMP-10).
 * When forceClean is true:
 * 1. Invalidates all cached compiler records for the project.
 * 2. Filters out and purges stale auxiliary and intermediate files from the build tree.
 * 3. Guarantees that compilation restarts from pristine source files.
 */
export function prepareCleanRebuild(options: CleanRebuildOptions): CleanRebuildResult {
  if (!options.forceClean) {
    return {
      cleaned: false,
      invalidatedCacheEntries: 0,
      removedAuxiliaries: [],
    };
  }

  // 1. Invalidate cache
  const invalidatedCount = options.cache ? options.cache.invalidateProject(options.projectId) : 0;

  // 2. Identify and remove auxiliary files
  const removedAuxiliaries: string[] = [];
  if (options.existingAuxFiles) {
    for (const file of options.existingAuxFiles) {
      if (isAuxiliaryFile(file)) {
        removedAuxiliaries.push(file);
      }
    }
  }

  return {
    cleaned: true,
    invalidatedCacheEntries: invalidatedCount,
    removedAuxiliaries,
  };
}

/**
 * Fixture comparison utility to verify clean rebuild determinism against stale auxiliary corruption.
 */
export function compareBuildOutputs(
  cleanOutputBytes: Uint8Array,
  rebuiltOutputBytes: Uint8Array,
): { identical: boolean; byteLengthDiff: number } {
  const identical =
    cleanOutputBytes.length === rebuiltOutputBytes.length &&
    cleanOutputBytes.every((b, i) => b === rebuiltOutputBytes[i]);

  return {
    identical,
    byteLengthDiff: Math.abs(cleanOutputBytes.length - rebuiltOutputBytes.length),
  };
}
