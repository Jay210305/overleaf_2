import { describe, expect, it, vi } from "vitest";
import {
  buildResolutionRequest,
  buildSyncDiffRows,
  createGitHubSyncClient,
  deriveSyncUiState,
  GitHubSyncClientError,
  summarizeSyncRows,
  unresolvedConflictPaths,
  validateSyncStartInput,
  type SyncPlan,
  type SyncResolution,
} from "../../apps/web/src/features/integrations/github-sync.js";
import {
  classifyPull,
  fingerprintBinary,
  fingerprintText,
  type LocalFile,
  type RemoteTreeEntry,
  type SyncBaseManifest,
} from "../../apps/jobs/src/sync/github-pull.js";
import { resolvePullPlan } from "../../apps/jobs/src/sync/apply-changes.js";

const sha = (c: string) => c.repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111";
const sourceRevisionId = "22222222-2222-4222-8222-222222222222";
const remoteFile = (path: string, shaValue: string | null): RemoteTreeEntry => ({
  path,
  kind: "file",
  sizeBytes: 10,
  sha: shaValue,
});
const local = (path: string, kind: "text" | "binary", fingerprint: string): LocalFile => ({
  path,
  kind,
  fingerprint,
  sizeBytes: 10,
});

/**
 * Builds the plan from the real S12-T03 classifier so the UI model is exercised
 * against the exact entry/action shape the jobs pull service produces.
 */
function realPlan(): SyncPlan {
  const base: SyncBaseManifest = {
    version: 1,
    remoteSha: sha("0"),
    entries: [
      {
        path: "main.tex",
        kind: "text",
        localFingerprint: fingerprintText("main"),
        remoteSha: sha("a"),
      },
      {
        path: "old.tex",
        kind: "text",
        localFingerprint: fingerprintText("old"),
        remoteSha: sha("b"),
      },
      {
        path: "doc.tex",
        kind: "text",
        localFingerprint: fingerprintText("doc-old"),
        remoteSha: sha("c"),
      },
      {
        path: "img.png",
        kind: "binary",
        localFingerprint: fingerprintBinary("img-old"),
        remoteSha: sha("d"),
      },
      {
        path: "gone.tex",
        kind: "text",
        localFingerprint: fingerprintText("gone"),
        remoteSha: sha("e"),
      },
      {
        path: "keep.tex",
        kind: "text",
        localFingerprint: fingerprintText("keep"),
        remoteSha: sha("f"),
      },
    ],
  };
  const localFiles: LocalFile[] = [
    local("main.tex", "text", fingerprintText("main")),
    local("old.tex", "text", fingerprintText("old")),
    local("doc.tex", "text", fingerprintText("doc-new")),
    local("img.png", "binary", fingerprintBinary("img-new")),
    local("gone.tex", "text", fingerprintText("gone")),
    local("local-only.tex", "text", fingerprintText("local")),
    local("shared-new.tex", "text", fingerprintText("shared")),
  ];
  const remoteEntries: RemoteTreeEntry[] = [
    remoteFile("main.tex", sha("a")),
    remoteFile("old.tex", sha("j")),
    remoteFile("doc.tex", sha("k")),
    remoteFile("img.png", sha("l")),
    remoteFile("keep.tex", sha("f")),
    remoteFile("added.tex", sha("m")),
    remoteFile("shared-new.tex", sha("n")),
  ];
  const classified = classifyPull({ base, localFiles, remoteEntries });
  return {
    status: classified.conflicts.length > 0 ? "conflict" : "changes",
    remoteSha: sha("9"),
    localRevisionId: sourceRevisionId,
    base,
    entries: classified.entries,
    conflicts: classified.conflicts,
  };
}

const resolvedDecisions: Record<string, SyncResolution> = {
  "doc.tex": "keep-remote",
  "img.png": "keep-local",
  "shared-new.tex": "manual",
};

describe("S12-T05 sync status diff and resolution UI", () => {
  it("turns explicit conflict choices into safe apply actions and defers manual merge", () => {
    const plan = realPlan();
    expect(() => resolvePullPlan(plan.entries, plan.conflicts, [])).toThrow();
    expect(() =>
      resolvePullPlan(plan.entries, plan.conflicts, [
        { path: "doc.tex", decision: "manual" },
        { path: "img.png", decision: "keep-local" },
        { path: "shared-new.tex", decision: "keep-remote" },
      ]),
    ).toThrow();
    const resolved = resolvePullPlan(plan.entries, plan.conflicts, [
      { path: "doc.tex", decision: "keep-remote" },
      { path: "img.png", decision: "keep-local" },
      { path: "shared-new.tex", decision: "keep-remote" },
    ]);
    expect(resolved.find((entry) => entry.path === "doc.tex")?.action).toBe("update");
    expect(resolved.find((entry) => entry.path === "img.png")?.action).toBe("keep-local");
    expect(resolved.find((entry) => entry.path === "shared-new.tex")?.action).toBe("update");
  });
  it("renders local, remote and base changes with the planner action for every path", () => {
    const rows = buildSyncDiffRows(realPlan());
    expect(rows.map((row) => `${row.action}:${row.path}`)).toEqual([
      "add:added.tex",
      "conflict:doc.tex",
      "delete:gone.tex",
      "conflict:img.png",
      "keep-deleted:keep.tex",
      "keep-local:local-only.tex",
      "update:old.tex",
      "conflict:shared-new.tex",
    ]);

    const doc = rows.find((row) => row.path === "doc.tex")!;
    expect(doc.base).toEqual({ present: true, kind: "text", marker: sha("c") });
    expect(doc.local.present).toBe(true);
    expect(doc.remote).toEqual({ present: true, kind: "text", marker: sha("k") });
    expect(doc.requiresResolution).toBe(true);
    expect(doc.conflictKind).toBe("text");

    const image = rows.find((row) => row.path === "img.png")!;
    expect(image.conflictKind).toBe("binary");
    expect(image.local.kind).toBe("binary");
    expect(image.remote.kind).toBe("binary");

    const localOnly = rows.find((row) => row.path === "local-only.tex")!;
    expect(localOnly.remote.present).toBe(false);
    expect(localOnly.requiresResolution).toBe(false);

    const added = rows.find((row) => row.path === "added.tex")!;
    expect(added.base.present).toBe(false);
    expect(added.remote).toEqual({ present: true, kind: "file", marker: sha("m") });
  });

  it("summarizes additions, updates, deletions, keeps and conflicts", () => {
    expect(summarizeSyncRows(buildSyncDiffRows(realPlan()))).toEqual({
      additions: 1,
      updates: 1,
      deletions: 1,
      kept: 2,
      conflicts: 3,
      total: 8,
    });
  });

  it("requires an explicit resolution for every conflict and accepts keep-local, keep-remote and manual", () => {
    const rows = buildSyncDiffRows(realPlan());

    const unresolved = buildResolutionRequest(rows, {});
    expect(unresolved).toEqual({
      ok: false,
      code: "UNRESOLVED_CONFLICTS",
      paths: ["doc.tex", "img.png", "shared-new.tex"],
    });
    expect(unresolvedConflictPaths(rows, {})).toEqual(["doc.tex", "img.png", "shared-new.tex"]);

    const resolved = buildResolutionRequest(rows, resolvedDecisions);
    expect(resolved).toEqual({
      ok: true,
      resolutions: [
        { path: "doc.tex", decision: "keep-remote" },
        { path: "img.png", decision: "keep-local" },
        { path: "shared-new.tex", decision: "manual" },
      ],
      applyPaths: ["added.tex", "doc.tex", "gone.tex", "old.tex"],
    });
  });

  it("rejects resolutions for non-conflict paths and unknown or force decisions without changing the plan", () => {
    const rows = buildSyncDiffRows(realPlan());

    expect(buildResolutionRequest(rows, { "old.tex": "keep-local" })).toEqual({
      ok: false,
      code: "UNKNOWN_PATH",
      paths: ["old.tex"],
    });

    // "force" is not a permitted resolution: automatic force push stays rejected.
    const forced = { "doc.tex": "force" } as unknown as Record<string, SyncResolution>;
    expect(buildResolutionRequest(rows, forced)).toEqual({
      ok: false,
      code: "INVALID_DECISION",
      paths: ["doc.tex"],
    });

    // The reducer is pure: the plan is untouched by a rejected request.
    expect(unresolvedConflictPaths(rows, {})).toHaveLength(3);
  });

  it("never reports a pending, failed or manually deferred action as synced", () => {
    const rows = buildSyncDiffRows(realPlan());

    expect(deriveSyncUiState({ transport: "conflict", rows, decisions: {} })).toBe("conflict");
    expect(deriveSyncUiState({ transport: "synced", rows, decisions: {} })).toBe("conflict");
    expect(deriveSyncUiState({ transport: "error", rows, decisions: resolvedDecisions })).toBe(
      "error",
    );
    expect(deriveSyncUiState({ transport: "sync_pending", rows, decisions: {} })).toBe(
      "sync_pending",
    );
    expect(deriveSyncUiState({ transport: "conflict", rows, decisions: resolvedDecisions })).toBe(
      "sync_pending",
    );
    // A manual merge is deferred work, so the plan is not synced yet.
    expect(deriveSyncUiState({ transport: "synced", rows, decisions: resolvedDecisions })).toBe(
      "sync_pending",
    );
    // Applying is always an in-flight state.
    expect(
      deriveSyncUiState({
        transport: "conflict",
        rows,
        decisions: resolvedDecisions,
        applying: true,
      }),
    ).toBe("syncing");
  });

  it("loads the authorized sync status for a project over the documented route", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return Response.json({
        id: projectId,
        status: "conflict",
        sourceRevisionId,
        remoteRevision: sha("9"),
        conflicts: [{ path: "doc.tex", kind: "text" }],
        entries: [
          {
            path: "doc.tex",
            action: "conflict",
            localKind: "text",
            remoteKind: "file",
            localFingerprint: "fp",
            remoteSha: sha("k"),
            sizeBytes: 10,
          },
        ],
      });
    });
    const client = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      csrfToken: "csrf-test-token",
      fetcher: fetcher as unknown as typeof fetch,
    });

    const view = await client.status(projectId);
    expect(calls[0]!.url).toBe(
      `http://api.test/api/v1/projects/${projectId}/integrations/github/status`,
    );
    expect(calls[0]!.init.credentials).toBe("include");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>)["x-csrf-token"]).toBe(
      "csrf-test-token",
    );
    expect((calls[0]!.init.headers as Record<string, string>).accept).toBe("application/json");
    expect(view.status).toBe("conflict");
    expect(view.entries).toHaveLength(1);
    expect(
      buildSyncDiffRows({
        status: "conflict",
        remoteSha: sha("9"),
        localRevisionId: sourceRevisionId,
        base: null,
        entries: view.entries,
        conflicts: view.conflicts,
      }),
    ).toHaveLength(1);
  });

  it("submits the resolved plan as a pull sync with an idempotency key and no force directive", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return Response.json({ id: projectId, status: "queued" });
    });
    const client = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      csrfToken: "csrf-token",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const request = buildResolutionRequest(buildSyncDiffRows(realPlan()), resolvedDecisions);
    if (!request.ok) throw new Error("expected the plan to be resolvable");

    const result = await client.startSync(
      projectId,
      {
        direction: "pull",
        sourceRevisionId,
        expectedRemoteRevision: sha("9"),
        resolutions: request.resolutions,
      },
      "idempotency-key-0001",
    );

    expect(result).toEqual({ id: projectId, status: "queued" });
    expect(calls[0]!.url).toBe(
      `http://api.test/api/v1/projects/${projectId}/integrations/github/sync`,
    );
    expect(calls[0]!.init.method).toBe("POST");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe("idempotency-key-0001");
    expect(headers["x-csrf-token"]).toBe("csrf-token");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.direction).toBe("pull");
    expect(body).not.toHaveProperty("force");
    expect(body.resolutions).toEqual(request.resolutions);
  });

  it("validates input before any network call and maps provider failures honestly", async () => {
    const fetcher = vi.fn(async () => Response.json({}, { status: 500 }));
    const client = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(client.status("not-a-uuid")).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    await expect(
      client.startSync(
        projectId,
        { direction: "pull", sourceRevisionId, expectedRemoteRevision: sha("9") },
        "short",
      ),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(fetcher).not.toHaveBeenCalled();

    expect(() =>
      validateSyncStartInput({
        direction: "pull",
        sourceRevisionId,
        expectedRemoteRevision: sha("9"),
        resolutions: [{ path: "doc.tex", decision: "force" }],
      }),
    ).toThrowError(GitHubSyncClientError);

    const failing = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      fetcher: (async () =>
        new Response(JSON.stringify({ code: "REMOTE_CONFLICT" }), {
          status: 409,
        })) as unknown as typeof fetch,
    });
    await expect(
      failing.startSync(
        projectId,
        { direction: "pull", sourceRevisionId, expectedRemoteRevision: sha("9") },
        "idempotency-key-0001",
      ),
    ).rejects.toMatchObject({ status: 409 });

    const malformed = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      fetcher: (async () => Response.json({ status: "conflict" })) as unknown as typeof fetch,
    });
    await expect(malformed.status(projectId)).rejects.toMatchObject({
      status: 502,
      code: "INVALID_RESPONSE",
    });
  });

  it("treats a status response without a diff as conflict-only and still never claims synced", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: projectId,
        status: "conflict",
        sourceRevisionId,
        remoteRevision: sha("9"),
        conflicts: [{ path: "doc.tex", kind: "tree" }],
      }),
    );
    const client = createGitHubSyncClient({
      apiUrl: "http://api.test/api/v1",
      fetcher: fetcher as unknown as typeof fetch,
    });
    const view = await client.status(projectId);
    const rows = buildSyncDiffRows({
      status: "conflict",
      remoteSha: sha("9"),
      localRevisionId: view.sourceRevisionId,
      base: view.base,
      entries: view.entries,
      conflicts: view.conflicts,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.conflictKind).toBe("tree");
    expect(rows[0]!.requiresResolution).toBe(true);
    expect(deriveSyncUiState({ transport: view.status, rows, decisions: {} })).toBe("conflict");
  });
});
