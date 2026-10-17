import { useCallback, useEffect, useMemo, useState } from "react";
import { parsePublicConfig } from "@latex-collab/config";

const defaultApiUrl = parsePublicConfig(import.meta.env).VITE_API_URL;

/**
 * S12-T05 sync status diff and resolution UI (INT-05).
 *
 * The panel renders the frozen three-way sync plan produced by S12-T03/T08 —
 * every path with its base/local/remote state and the action the planner chose
 * — and lets an authorized editor resolve conflicts explicitly as keep-local,
 * keep-remote or manual. It never claims a pending, failed or manually deferred
 * action is synced, and it never emits an automatic force push: resolutions are
 * validated against the frozen conflict set before any request is sent.
 */

export const GITHUB_PROVIDER = "github" as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncAction =
  "add" | "update" | "delete" | "keep-local" | "keep-deleted" | "unchanged" | "conflict";
export type SyncResolution = "keep-local" | "keep-remote" | "manual";
export type SyncConflictKind = "text" | "binary" | "tree";
export type SyncDirection = "pull" | "push";
export type SyncUiState =
  "disconnected" | "connected" | "sync_pending" | "syncing" | "conflict" | "error" | "synced";

/** Mirrors the S12-T03 frozen pull plan entry (structurally compatible). */
export interface SyncPlanEntry {
  path: string;
  action: SyncAction;
  localKind: "text" | "binary" | "folder" | null;
  remoteKind: "file" | "folder" | null;
  localFingerprint: string | null;
  remoteSha: string | null;
  sizeBytes: number | null;
}

export interface SyncConflict {
  path: string;
  kind: SyncConflictKind;
}

export interface SyncBaseEntry {
  path: string;
  kind: "text" | "binary";
  localFingerprint: string;
  remoteSha: string | null;
}

export interface SyncBaseManifest {
  version: 1;
  remoteSha: string;
  entries: SyncBaseEntry[];
}

/** The frozen plan the resolution UI operates on. */
export interface SyncPlan {
  status: "synced" | "changes" | "conflict";
  remoteSha: string;
  localRevisionId: string;
  base: SyncBaseManifest | null;
  entries: SyncPlanEntry[];
  conflicts: SyncConflict[];
}

/** One side (base, local or remote) of a path in the diff view. */
export interface SyncDiffCell {
  present: boolean;
  kind: "text" | "binary" | "folder" | "file" | null;
  marker: string | null;
}

export interface SyncDiffRow {
  path: string;
  base: SyncDiffCell;
  local: SyncDiffCell;
  remote: SyncDiffCell;
  action: SyncAction;
  conflictKind: SyncConflictKind | null;
  requiresResolution: boolean;
}

export const RESOLUTION_OPTIONS: readonly SyncResolution[] = [
  "keep-local",
  "keep-remote",
  "manual",
];

const EMPTY_CELL: SyncDiffCell = { present: false, kind: null, marker: null };
const SAFE_ACTIONS = new Set<SyncAction>(["add", "update", "delete"]);

function localCell(entry: SyncPlanEntry): SyncDiffCell {
  if (entry.localKind === null) return EMPTY_CELL;
  return { present: true, kind: entry.localKind, marker: entry.localFingerprint };
}

function remoteCell(entry: SyncPlanEntry, conflictKind: SyncConflictKind | null): SyncDiffCell {
  if (entry.remoteKind === null) return EMPTY_CELL;
  if (entry.remoteKind === "folder")
    return { present: true, kind: "folder", marker: entry.remoteSha };
  const kind: SyncDiffCell["kind"] =
    conflictKind === "text" || conflictKind === "binary" ? conflictKind : "file";
  return { present: true, kind, marker: entry.remoteSha };
}

function baseCell(base: SyncBaseManifest | null, path: string): SyncDiffCell {
  const entry = (base?.entries ?? []).find((candidate) => candidate.path === path);
  if (!entry) return EMPTY_CELL;
  return { present: true, kind: entry.kind, marker: entry.remoteSha ?? entry.localFingerprint };
}

/**
 * Three-way diff rows for the plan. Unchanged paths are omitted so the user only
 * sees paths where at least one side moved. Conflicts always require an explicit
 * resolution; binary and tree conflicts included, since they can never be merged
 * automatically.
 */
export function buildSyncDiffRows(plan: SyncPlan): SyncDiffRow[] {
  const conflictKinds = new Map<string, SyncConflictKind>(
    plan.conflicts.map((conflict) => [conflict.path, conflict.kind]),
  );
  const rows: SyncDiffRow[] = plan.entries
    .filter((entry) => entry.action !== "unchanged")
    .map((entry) => {
      const conflictKind = conflictKinds.get(entry.path) ?? null;
      return {
        path: entry.path,
        base: baseCell(plan.base, entry.path),
        local: localCell(entry),
        remote: remoteCell(entry, conflictKind),
        action: entry.action,
        conflictKind,
        requiresResolution: entry.action === "conflict",
      };
    });
  // A minimal status view carries conflicts without the full plan; synthesize the
  // missing conflict rows so every conflict stays visible and resolvable.
  const seen = new Set(rows.map((row) => row.path));
  for (const conflict of plan.conflicts) {
    if (seen.has(conflict.path)) continue;
    rows.push({
      path: conflict.path,
      base: baseCell(plan.base, conflict.path),
      local: EMPTY_CELL,
      remote: EMPTY_CELL,
      action: "conflict",
      conflictKind: conflict.kind,
      requiresResolution: true,
    });
  }
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export interface SyncRowSummary {
  additions: number;
  updates: number;
  deletions: number;
  kept: number;
  conflicts: number;
  total: number;
}

export function summarizeSyncRows(rows: SyncDiffRow[]): SyncRowSummary {
  const summary: SyncRowSummary = {
    additions: 0,
    updates: 0,
    deletions: 0,
    kept: 0,
    conflicts: 0,
    total: rows.length,
  };
  for (const row of rows) {
    if (row.action === "add") summary.additions += 1;
    else if (row.action === "update") summary.updates += 1;
    else if (row.action === "delete") summary.deletions += 1;
    else if (row.action === "keep-local" || row.action === "keep-deleted") summary.kept += 1;
    else if (row.action === "conflict") summary.conflicts += 1;
  }
  return summary;
}

export function conflictPaths(rows: SyncDiffRow[]): string[] {
  return rows
    .filter((row) => row.requiresResolution)
    .map((row) => row.path)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function unresolvedConflictPaths(
  rows: SyncDiffRow[],
  decisions: Readonly<Record<string, SyncResolution>>,
): string[] {
  return conflictPaths(rows).filter((path) => !(path in decisions));
}

export type ResolutionRequestResult =
  | {
      ok: true;
      resolutions: Array<{ path: string; decision: SyncResolution }>;
      applyPaths: string[];
    }
  | {
      ok: false;
      code: "UNRESOLVED_CONFLICTS" | "UNKNOWN_PATH" | "INVALID_DECISION";
      paths: string[];
    };

/**
 * Validates the editor's decisions against the frozen conflict set and produces
 * the request payload. A path that is not a conflict, an unknown decision (for
 * example an attempted automatic force directive) or an unresolved conflict all
 * fail with a typed result and leave the plan untouched.
 */
export function buildResolutionRequest(
  rows: SyncDiffRow[],
  decisions: Readonly<Record<string, SyncResolution>>,
): ResolutionRequestResult {
  const conflicts = new Set(conflictPaths(rows));
  const invalidDecision: string[] = [];
  const unknownPath: string[] = [];
  const resolutions: Array<{ path: string; decision: SyncResolution }> = [];
  for (const [path, decision] of Object.entries(decisions)) {
    if (!RESOLUTION_OPTIONS.includes(decision)) {
      invalidDecision.push(path);
      continue;
    }
    if (!conflicts.has(path)) {
      unknownPath.push(path);
      continue;
    }
    resolutions.push({ path, decision });
  }
  const sortPaths = (values: string[]) => values.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (invalidDecision.length > 0)
    return { ok: false, code: "INVALID_DECISION", paths: sortPaths(invalidDecision) };
  if (unknownPath.length > 0)
    return { ok: false, code: "UNKNOWN_PATH", paths: sortPaths(unknownPath) };
  const unresolved = unresolvedConflictPaths(rows, decisions);
  if (unresolved.length > 0) return { ok: false, code: "UNRESOLVED_CONFLICTS", paths: unresolved };
  const applyPaths = rows
    .filter((row) =>
      conflicts.has(row.path)
        ? decisions[row.path] === "keep-remote"
        : SAFE_ACTIONS.has(row.action),
    )
    .map((row) => row.path)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    ok: true,
    resolutions: resolutions.sort((a, b) => (a.path < b.path ? -1 : 1)),
    applyPaths,
  };
}

export interface DeriveSyncStateInput {
  transport: SyncUiState;
  rows: SyncDiffRow[];
  decisions: Readonly<Record<string, SyncResolution>>;
  applying?: boolean | undefined;
}

/**
 * Single source of truth for the visible sync state. A pending/failed/manual
 * action can never surface as "synced": only a server "synced" transport with no
 * unresolved conflicts and no manual deferrals is rendered as synced.
 */
export function deriveSyncUiState(input: DeriveSyncStateInput): SyncUiState {
  const { transport, rows, decisions } = input;
  if (input.applying) return "syncing";
  if (transport === "error") return "error";
  if (transport === "disconnected" || transport === "connected") return transport;
  if (transport === "sync_pending") return "sync_pending";
  if (transport === "syncing") return "syncing";

  const unresolved = unresolvedConflictPaths(rows, decisions);
  if (transport === "conflict") return unresolved.length > 0 ? "conflict" : "sync_pending";
  if (unresolved.length > 0) return "conflict";
  const manual = Object.values(decisions).some((decision) => decision === "manual");
  return manual ? "sync_pending" : "synced";
}

/** Apply is offered only when the plan is fully resolved and awaiting the server. */
export function canStartSync(state: SyncUiState): boolean {
  return state === "sync_pending";
}

export const SYNC_STATE_LABELS: Record<SyncUiState, string> = {
  disconnected: "Not connected",
  connected: "Connected",
  sync_pending: "Pending sync",
  syncing: "Syncing",
  conflict: "Conflicts need a choice",
  error: "Sync error",
  synced: "Synced",
};

// ---------------------------------------------------------------------------
// Typed HTTP client for the documented integration sync routes.
// ---------------------------------------------------------------------------

export interface GitHubSyncStatusView {
  id: string;
  status: SyncUiState;
  sourceRevisionId: string;
  remoteRevision: string | null;
  conflicts: SyncConflict[];
  base: SyncBaseManifest | null;
  entries: SyncPlanEntry[];
}

export interface SyncStartInput {
  direction: SyncDirection;
  sourceRevisionId: string;
  expectedRemoteRevision: string;
  resolutions?: Array<{ path: string; decision: SyncResolution }> | undefined;
}

export interface SyncStartResult {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
}

export class GitHubSyncClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "GitHubSyncClientError";
    this.status = status;
    this.code = code;
  }
}

function messageForStatus(status: number): string {
  if (status === 400) return "The sync request was rejected as invalid.";
  if (status === 401) return "Session expired. Sign in and try again.";
  if (status === 403) return "Only an editor or owner can synchronize this project.";
  if (status === 404) return "The project or its GitHub link was not found.";
  if (status === 409)
    return "The remote advanced or the local state changed. Refresh and review again.";
  if (status === 412) return "The frozen revision no longer matches. Refresh and try again.";
  if (status === 413) return "The remote content exceeds the project limits.";
  if (status === 422) return "The remote content is not supported by the project policy.";
  if (status === 429) return "GitHub rate limit reached. Try again later.";
  if (status === 502) return "GitHub is unavailable right now.";
  if (status === 503) return "Synchronization is temporarily unavailable.";
  return "The sync request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseConflictView(raw: unknown): SyncConflict {
  if (
    !isRecord(raw) ||
    typeof raw.path !== "string" ||
    raw.path.length === 0 ||
    raw.path.length > 10000
  )
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (raw.kind !== "text" && raw.kind !== "binary" && raw.kind !== "tree")
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  return { path: raw.path, kind: raw.kind };
}

const SYNC_VIEW_STATES = new Set<SyncUiState>([
  "disconnected",
  "connected",
  "sync_pending",
  "syncing",
  "conflict",
  "error",
  "synced",
]);

const SYNC_ACTIONS = new Set<SyncAction>([
  "add",
  "update",
  "delete",
  "keep-local",
  "keep-deleted",
  "unchanged",
  "conflict",
]);

function invalidResponse(): never {
  throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
}

function parsePlanEntry(raw: unknown): SyncPlanEntry {
  if (!isRecord(raw)) return invalidResponse();
  const { path, action, localKind, remoteKind, localFingerprint, remoteSha, sizeBytes } = raw;
  if (typeof path !== "string" || path.length === 0) return invalidResponse();
  if (typeof action !== "string" || !SYNC_ACTIONS.has(action as SyncAction))
    return invalidResponse();
  if (
    localKind !== null &&
    localKind !== "text" &&
    localKind !== "binary" &&
    localKind !== "folder"
  )
    return invalidResponse();
  if (remoteKind !== null && remoteKind !== "file" && remoteKind !== "folder")
    return invalidResponse();
  if (localFingerprint !== null && typeof localFingerprint !== "string") return invalidResponse();
  if (remoteSha !== null && typeof remoteSha !== "string") return invalidResponse();
  if (sizeBytes !== null && typeof sizeBytes !== "number") return invalidResponse();
  return {
    path,
    action: action as SyncAction,
    localKind: localKind as SyncPlanEntry["localKind"],
    remoteKind: remoteKind as SyncPlanEntry["remoteKind"],
    localFingerprint: localFingerprint as string | null,
    remoteSha: remoteSha as string | null,
    sizeBytes: sizeBytes as number | null,
  };
}

function parseBaseManifest(raw: unknown): SyncBaseManifest | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.remoteSha !== "string")
    return invalidResponse();
  if (!Array.isArray(raw.entries)) return invalidResponse();
  const entries: SyncBaseEntry[] = raw.entries.map((item) => {
    if (!isRecord(item)) return invalidResponse();
    if (typeof item.path !== "string" || (item.kind !== "text" && item.kind !== "binary"))
      return invalidResponse();
    if (typeof item.localFingerprint !== "string") return invalidResponse();
    if (item.remoteSha !== null && typeof item.remoteSha !== "string") return invalidResponse();
    return {
      path: item.path,
      kind: item.kind,
      localFingerprint: item.localFingerprint,
      remoteSha: item.remoteSha as string | null,
    };
  });
  return { version: 1, remoteSha: raw.remoteSha, entries };
}

function parseSyncStatusView(raw: unknown): GitHubSyncStatusView {
  if (!isRecord(raw)) throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  const { id, status, sourceRevisionId, remoteRevision, conflicts, base, entries } = raw;
  if (typeof id !== "string" || !UUID_PATTERN.test(id))
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (typeof status !== "string" || !SYNC_VIEW_STATES.has(status as SyncUiState))
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (typeof sourceRevisionId !== "string" || !UUID_PATTERN.test(sourceRevisionId))
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (remoteRevision !== null && typeof remoteRevision !== "string")
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (!Array.isArray(conflicts) || conflicts.length > 2000)
    throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
  if (entries !== undefined && entries !== null && !Array.isArray(entries))
    return invalidResponse();
  return {
    id,
    status: status as SyncUiState,
    sourceRevisionId,
    remoteRevision: remoteRevision as string | null,
    conflicts: conflicts.map(parseConflictView),
    base: parseBaseManifest(base),
    entries: (entries ?? []).map(parsePlanEntry),
  };
}

export function validateSyncStartInput(input: unknown): SyncStartInput {
  if (!isRecord(input)) throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
  const { direction, sourceRevisionId, expectedRemoteRevision, resolutions } = input;
  if (direction !== "pull" && direction !== "push")
    throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
  if (typeof sourceRevisionId !== "string" || !UUID_PATTERN.test(sourceRevisionId))
    throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
  if (
    typeof expectedRemoteRevision !== "string" ||
    expectedRemoteRevision.length === 0 ||
    expectedRemoteRevision.length > 10000
  )
    throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
  let parsedResolutions: SyncStartInput["resolutions"];
  if (resolutions !== undefined) {
    if (resolutions !== null && !Array.isArray(resolutions))
      throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
    parsedResolutions = (resolutions ?? []).map((entry) => {
      if (!isRecord(entry) || typeof entry.path !== "string" || entry.path.length === 0)
        throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
      if (!RESOLUTION_OPTIONS.includes(entry.decision as SyncResolution))
        throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
      return { path: entry.path, decision: entry.decision as SyncResolution };
    });
  }
  const parsed: SyncStartInput = {
    direction,
    sourceRevisionId,
    expectedRemoteRevision,
  };
  if (parsedResolutions !== undefined) parsed.resolutions = parsedResolutions;
  return parsed;
}

function assertIdempotencyKey(key: string): void {
  if (key.length < 16 || key.length > 128) throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
}

function assertProjectId(projectId: string): void {
  if (!UUID_PATTERN.test(projectId)) throw new GitHubSyncClientError(400, "VALIDATION_ERROR");
}

export interface GitHubSyncClientOptions {
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  fetcher?: typeof fetch | undefined;
}

export function createGitHubSyncClient(options: GitHubSyncClientOptions = {}) {
  const apiUrl = options.apiUrl ?? defaultApiUrl;
  const doFetch = options.fetcher ?? fetch;
  const csrf = () =>
    options.csrfToken ??
    (typeof sessionStorage === "undefined" ? "" : (sessionStorage.getItem("csrf_token") ?? ""));
  const base = (projectId: string) =>
    `${apiUrl}/projects/${projectId}/integrations/${GITHUB_PROVIDER}`;

  async function requireOk(response: Response): Promise<Response> {
    if (!response.ok) {
      throw new GitHubSyncClientError(response.status, messageForStatus(response.status));
    }
    return response;
  }

  async function status(projectId: string): Promise<GitHubSyncStatusView> {
    assertProjectId(projectId);
    const response = await requireOk(
      await doFetch(`${base(projectId)}/status`, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json", "x-csrf-token": csrf() },
      }),
    );
    return parseSyncStatusView(await response.json());
  }

  async function startSync(
    projectId: string,
    input: SyncStartInput,
    idempotencyKey: string,
  ): Promise<SyncStartResult> {
    assertProjectId(projectId);
    assertIdempotencyKey(idempotencyKey);
    const parsed = validateSyncStartInput(input);
    const response = await requireOk(
      await doFetch(`${base(projectId)}/sync`, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrf(),
        },
        body: JSON.stringify(parsed),
      }),
    );
    const raw: unknown = await response.json();
    if (!isRecord(raw) || typeof raw.id !== "string" || !UUID_PATTERN.test(raw.id))
      throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
    const status = raw.status;
    if (
      status !== "queued" &&
      status !== "running" &&
      status !== "succeeded" &&
      status !== "failed"
    )
      throw new GitHubSyncClientError(502, "INVALID_RESPONSE");
    return { id: raw.id, status };
  }

  return { status, startSync };
}

// ---------------------------------------------------------------------------
// React UI
// ---------------------------------------------------------------------------

function cellText(cell: SyncDiffCell): string {
  if (!cell.present) return "—";
  return cell.kind === null ? "present" : cell.kind;
}

function actionLabel(action: SyncAction): string {
  switch (action) {
    case "add":
      return "Add remote file";
    case "update":
      return "Update from remote";
    case "delete":
      return "Delete local file";
    case "keep-local":
      return "Keep local";
    case "keep-deleted":
      return "Stay deleted";
    case "conflict":
      return "Conflict — choose";
    default:
      return action;
  }
}

export interface SyncResolutionViewProps {
  plan: SyncPlan;
  decisions: Readonly<Record<string, SyncResolution>>;
  state: SyncUiState;
  summary: SyncRowSummary;
  busy?: boolean | undefined;
  error?: string | null | undefined;
  notice?: string | null | undefined;
  onDecide?: ((path: string, decision: SyncResolution) => void) | undefined;
  onApply?: (() => void) | undefined;
  onRefresh?: (() => void) | undefined;
}

/**
 * Presentational diff + resolution view. Renders the base/local/remote columns,
 * the planner action, the per-conflict resolution selector and the honest state
 * label. It is deliberately data-driven so the container owns networking.
 */
export function SyncResolutionView({
  plan,
  decisions,
  state,
  summary,
  busy = false,
  error = null,
  notice = null,
  onDecide,
  onApply,
  onRefresh,
}: SyncResolutionViewProps) {
  const rows = useMemo(() => buildSyncDiffRows(plan), [plan]);
  const unresolved = unresolvedConflictPaths(rows, decisions);
  const canApply =
    canStartSync(state) &&
    unresolved.length === 0 &&
    !Object.values(decisions).includes("manual") &&
    !busy;

  return (
    <section
      className="github-sync-panel"
      aria-label="GitHub synchronization"
      data-sync-state={state}
    >
      <header className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold">GitHub synchronization</h2>
        <span
          role="status"
          aria-live="polite"
          className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {SYNC_STATE_LABELS[state]}
        </span>
      </header>

      <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
        {summary.additions} to add · {summary.updates} to update · {summary.deletions} to delete ·{" "}
        {summary.kept} kept · {summary.conflicts} conflicting
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No local, remote or base changes to review.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-gray-500">
              <th scope="col">Path</th>
              <th scope="col">Base</th>
              <th scope="col">Local</th>
              <th scope="col">Remote</th>
              <th scope="col">Action</th>
              <th scope="col">Resolution</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.path} data-action={row.action}>
                <td className="font-mono">{row.path}</td>
                <td data-side="base">{cellText(row.base)}</td>
                <td data-side="local">{cellText(row.local)}</td>
                <td data-side="remote">{cellText(row.remote)}</td>
                <td>{actionLabel(row.action)}</td>
                <td>
                  {row.requiresResolution && onDecide ? (
                    <label className="flex items-center gap-1">
                      <span className="sr-only">{`Resolution for ${row.path}`}</span>
                      <select
                        aria-label={`Resolution for ${row.path}`}
                        value={decisions[row.path] ?? ""}
                        disabled={busy}
                        onChange={(event) =>
                          onDecide(row.path, event.target.value as SyncResolution)
                        }
                      >
                        <option value="" disabled>
                          Choose…
                        </option>
                        <option value="keep-local">Keep local</option>
                        <option value="keep-remote">Keep remote</option>
                        <option value="manual">Manual merge</option>
                      </select>
                    </label>
                  ) : (
                    <span className="text-gray-400">Automatic</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unresolved.length > 0 && state === "conflict" ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">
          {unresolved.length} conflict{unresolved.length === 1 ? "" : "s"} still need an explicit
          choice (keep local, keep remote or manual). Nothing is overwritten until then.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2">{notice}</p>
      ) : null}

      <footer className="flex justify-end gap-2 mt-3">
        {onRefresh ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRefresh}
            className="px-3 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Refresh
          </button>
        ) : null}
        {onApply ? (
          <button
            type="button"
            disabled={!canApply}
            onClick={onApply}
            className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Apply remote changes
          </button>
        ) : null}
      </footer>
    </section>
  );
}

export interface GitHubSyncPanelProps {
  projectId: string;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  fetcher?: typeof fetch | undefined;
  canEdit?: boolean | undefined;
}

/**
 * Container that loads the authorized sync status and submits the resolved plan
 * through the integration sync route. It renders the honest transport/error
 * state and never fabricates a "synced" result after a failed or pending call.
 */
export function GitHubSyncPanel({
  projectId,
  apiUrl,
  csrfToken,
  fetcher,
  canEdit = true,
}: GitHubSyncPanelProps) {
  const client = useMemo(
    () =>
      createGitHubSyncClient({
        apiUrl,
        csrfToken,
        fetcher,
      }),
    [apiUrl, csrfToken, fetcher],
  );
  const [view, setView] = useState<GitHubSyncStatusView | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SyncResolution>>({});
  const [transport, setTransport] = useState<SyncUiState>("connected");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const current = await client.status(projectId);
      setDecisions({});
      setIdempotencyKey(null);
      setView(current);
      setTransport(current.status);
    } catch (cause) {
      setTransport("error");
      setError(cause instanceof Error ? cause.message : "Could not load sync status.");
    }
  }, [client, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan: SyncPlan = useMemo(
    () => ({
      status:
        view?.status === "conflict" ? "conflict" : view?.entries.length ? "changes" : "synced",
      remoteSha: view?.remoteRevision ?? "",
      localRevisionId: view?.sourceRevisionId ?? "",
      base: view?.base ?? null,
      entries: view?.entries ?? [],
      conflicts: view?.conflicts ?? [],
    }),
    [view],
  );
  const rows = useMemo(() => buildSyncDiffRows(plan), [plan]);
  const summary = useMemo(() => summarizeSyncRows(rows), [rows]);
  const state = deriveSyncUiState({ transport, rows, decisions, applying });

  function decide(path: string, decision: SyncResolution) {
    setDecisions((previous) => ({ ...previous, [path]: decision }));
    setNotice(null);
  }

  async function apply() {
    if (!view) return;
    const request = buildResolutionRequest(rows, decisions);
    if (!request.ok) {
      setError(
        request.code === "UNRESOLVED_CONFLICTS"
          ? "Resolve every conflict before syncing."
          : "The resolution request was rejected.",
      );
      return;
    }
    if (request.resolutions.some((resolution) => resolution.decision === "manual")) return;
    const key = idempotencyKey ?? `sync-${projectId}-${Date.now()}`;
    setIdempotencyKey(key);
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      const result = await client.startSync(
        projectId,
        {
          direction: "pull",
          sourceRevisionId: view.sourceRevisionId,
          expectedRemoteRevision: view.remoteRevision ?? view.sourceRevisionId,
          ...(request.resolutions.length > 0 ? { resolutions: request.resolutions } : {}),
        },
        key,
      );
      if (result.status === "succeeded") {
        await refresh();
        setNotice("Sync completed. The status and diff have been refreshed.");
      } else {
        setNotice(`Sync ${result.status}. Refresh to review the result.`);
      }
    } catch (cause) {
      setTransport("error");
      setError(cause instanceof Error ? cause.message : "The sync request failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <SyncResolutionView
      plan={plan}
      decisions={decisions}
      state={state}
      summary={summary}
      busy={applying}
      error={error}
      notice={notice}
      {...(canEdit ? { onDecide: decide, onApply: () => void apply() } : {})}
      onRefresh={() => void refresh()}
    />
  );
}
