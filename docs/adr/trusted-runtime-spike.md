# S06-T12 — Trusted TeX Runtime and Image Limits Spike

**Status:** ACCEPTED by Julio & Project Co-owner. **Task:** [S06-T12](../../implementation/sprint-06-trusted-compilation/S06-T12-research-trusted-tex-runtime-and-image-limits.md). **Requirements:** CMP-01, PL-07.

## Question and Review Checklist

What runtime image, security flags, resource caps, and execution boundaries are required for the trusted TeX Live compiler in G1?

- [x] Pinned TeX Live image architecture and package schemes.
- [x] Hardened execution flags prohibiting shell escapes and arbitrary command execution.
- [x] Enforceable server-side resource quotas (CPU, memory, timeout, artifact size).
- [x] Complete isolation of secrets (database, Redis, S3, session tokens) from compiler context.
- [x] Explicit fails-closed boundary for public / untrusted compilation mode until G5.

## Findings and Evidence

### 1. Pinned TeX Live Profile

- **Base Image:** Debian / Alpine with TeX Live 2024 scheme-small / scheme-medium plus standard LaTeX packages (`latexmk`, `collection-latexrecommended`, `collection-fontsrecommended`, `amsmath`, `hyperref`, `biblatex`, `biber`).
- **Engine Support:** G1 baseline supports `pdflatex`, with typed contracts ready for `xelatex`, `lualatex`, and `latex`.
- **Driver Tool:** `latexmk` orchestrates multiple passes, BibTeX/Biber resolution, and SyncTeX synchronization.

### 2. Hardened Engine Flags

Compilers are invoked using fixed, allowlisted command arguments via `execFile` without shell interpolation:
```bash
latexmk -pdf -interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape -outdir=/work/out /work/input/main.tex
```
- `-no-shell-escape`: Strictly enforced; disables `\write18` and prevents arbitrary subprocess execution.
- `-interaction=nonstopmode`: Prevents the engine from hanging on syntax errors awaiting stdin.
- `-file-line-error`: Normalizes diagnostic outputs to standard `file:line: error` syntax for deterministic parsing.
- `-synctex=1`: Generates `.synctex.gz` for editor-to-PDF cross-navigation.
- Denies custom `.latexmkrc` files inside user projects to prevent Perl code execution.

### 3. Resource Limits & Quotas (CMP-04, NFR-07)

- **Execution Timeout:** 60 seconds (kill via `AbortController` and SIGKILL).
- **Process Memory Limit:** 512 MiB maximum resident set size.
- **CPU Allocation:** 1 virtual CPU core.
- **Output Artifact Cap:** 25 MiB maximum PDF/auxiliary file output.
- **Concurrent Quota:** Exactly 1 active compilation job per user and per project concurrently. Excess requests are rejected with HTTP 429 `QUOTA_EXCEEDED` (`Retry-After: 5`).

### 4. Secret & Credential Isolation (PL-07)

- TeX compiler processes execute in ephemeral directories containing only the read-only frozen source files for the target revision.
- **NEVER** expose environment variables containing `DATABASE_URL`, `REDIS_URL`, `S3_SECRET_ACCESS_KEY`, session secrets, or SMTP credentials to the TeX executor container/process.
- Output artifacts (`output.pdf`, `compile.log`, `output.synctex.gz`) are collected into memory/temporary storage and uploaded to S3 by the trusted worker adapter, not by TeX itself.

### 5. Multi-Tenant / Public Mode Status (PL-07, G5)

- **Public Untrusted Mode:** NOT_IMPLEMENTED (fails closed).
- Anonymous registration and public anonymous compilation remain permanently disabled in G1.
- `IsolatedCompilerExecutor` throws `NOT_IMPLEMENTED` if invoked before G5 container isolation verification.

## Decision Summary

Adopt the hardened `latexmk` profile with `-no-shell-escape`, 60-second execution timeout, 512 MiB RAM cap, 25 MiB output limit, and strict secret stripping for S06-T03/T04/T13 implementation.
