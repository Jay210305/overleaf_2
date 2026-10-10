# Compilation Contract

## Request and Job

```ts
type Compiler = 'pdflatex' | 'xelatex' | 'lualatex' | 'latex';
type CompileStatus = 'queued' | 'running' | 'succeeded' | 'failed' |
  'timed_out' | 'cancel_requested' | 'cancelled';
type CreateCompilationRequest = { compiler?: Compiler; forceClean?: boolean; targetRevisionId?: string };
type Diagnostic = { severity: 'error' | 'warning' | 'info'; filePath?: string; line?: number; message: string };
type CompilationView = { id: string; projectId: string; sourceRevisionId: string;
  status: CompileStatus; startedAt: string | null; finishedAt: string | null;
  pdfAvailable: boolean; diagnostics: Diagnostic[] };
type ExecuteInput = { jobId: string; manifest: import('./storage').RevisionManifest;
  compiler: Compiler; imageDigest: string; policyVersion: string;
  limits: { timeoutSeconds: number; memoryMiB: number; cpuCores: number; maxOutputBytes: number } };
type ExecuteOutput = { status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  exitCode: number | null; diagnostics: Diagnostic[];
  artifacts: Array<{ name: string; mime: string; bytes: Uint8Array; sha256: string }> };
interface CompilerExecutor { execute(input: ExecuteInput, signal: AbortSignal): Promise<ExecuteOutput> }
```

The illustrative import above names the planned runtime contract module `packages/contracts/src/storage.ts`. It is a type reference, not a file already present. Limits are server policy; proposed trusted values are timeout 60s, memory 512 MiB, 1 CPU core, output 25 MiB, 1 active job/user and project. Resource values require runtime verification and adjustment; API never honors client-supplied arbitrary RAM/flags/timeouts.

## State and Execution Sequence

Authorize/quota → checkpoint barrier → immutable manifest/hash → transactional compile_jobs and idempotent enqueue intent → BullMQ stable jobId → claim/status check → read-only staged input → separate executor → fixed engine profile → collect/validate bounded artifacts → private upload → transactionally record artifact_set/status → invalidation event → cleanup on every terminal/crash path. Reconcile DB and queue after outage; DB identifies durable job state.

Allowed transitions: queued→running/cancelled; running→succeeded/failed/timed_out/cancel_requested; cancel_requested→cancelled or a terminal result if execution already completed. Do not mark a running job cancelled before termination. Retry infrastructure failures with bounded backoff; do not retry deterministic user TeX errors. API crash never loses the job or leaves unbounded running state.

## Engine Profiles

Pin TeX Live image tag/digest and justified package manifest. Trusted pdfLaTeX argv conceptually uses `latexmk -pdf -interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape -outdir=/work/out /work/input/main.tex`; verify flags against the pinned image. Use spawn/execFile with literal argv and controlled cwd at reconstructed project root, including subdirectory roots; no interpolated shell.

XeLaTeX, LuaLaTeX and latex→DVI→PDF need separate fixtures. `latexmk` orchestrates repeated passes, BibTeX and Biber. No internet package install per document; deny arbitrary `latexmkrc` execution and dangerous user flags under public policy. Parse errors/warnings/undefined refs/overfull boxes/missing packages and redact host paths while preserving authorized original log downloads.

## Trust Profiles

TrustedWorkerExecutor accepts only allowlisted team-owned documents and is isolated from API/collab secrets with finite resources, non-root runtime, ephemeral cwd and restricted egress. This separation alone does not prove hostile multi-tenant isolation.

IsolatedExecutor is NOT_IMPLEMENTED until G5 provider research/provision/adversarial proof succeeds. Public profile needs verified mounts/namespaces, process/seccomp/resource enforcement, no network, no inherited secrets, no Docker socket and no host/other-job access. Fail closed on an unavailable public executor; keep signup/untrusted flags false. Manual joint public approval is separate from planning delegation.

## Artifacts, Cache and Automatic Compile

Allow PDF, .log, .blg, .synctex.gz and declared bounded auxiliary manifest. Validate PDF parsing, expected fixture text/pages and source provenance. UI retains previous valid PDF on failure and marks it old. Cache key is SHA-256 of manifestHash + compiler + imageDigest + normalized options + policyVersion; access stays project-scoped. ForceClean clears auxiliary cache. Automatic compile starts with proposed 1s debounce and coalesces queued successors, retaining active job state; stale/orphan maintenance is idempotent.

## Valid and Invalid Examples

Valid: replay same Idempotency-Key/body returns one existing queued job; edits after enqueue change current revision but not sourceRevisionId or resulting PDF label.

Invalid: unsafe compiler/flag → 400; unauthorized project → 403/404; quota exceeded → 429; loop exceeds limit → timed_out and executor healthy; missing public isolation → SERVICE_UNAVAILABLE with closed feature; PDF named output.pdf without parseable contents → failed artifact validation.
