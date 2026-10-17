// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  GitHubSyncPanel,
  SyncResolutionView,
  buildSyncDiffRows,
  deriveSyncUiState,
  summarizeSyncRows,
  type SyncPlan,
  type SyncResolution,
  type SyncUiState,
} from "../../../apps/web/src/features/integrations/github-sync.js";

/**
 * INT-05 scoped slice of S12-T05: the resolution UI shows base/local/remote
 * changes, offers keep-local/keep-remote/manual for each conflict, and never
 * labels a pending, failing or manually deferred plan as synced.
 */

const plan: SyncPlan = {
  status: "conflict",
  remoteSha: "r".repeat(40),
  localRevisionId: "11111111-1111-4111-8111-111111111111",
  base: {
    version: 1,
    remoteSha: "r".repeat(40),
    entries: [
      {
        path: "doc.tex",
        kind: "text",
        localFingerprint: "base-fingerprint",
        remoteSha: "s".repeat(40),
      },
    ],
  },
  entries: [
    {
      path: "doc.tex",
      action: "conflict",
      localKind: "text",
      remoteKind: "file",
      localFingerprint: "local-fingerprint",
      remoteSha: "t".repeat(40),
      sizeBytes: 10,
    },
    {
      path: "added.tex",
      action: "add",
      localKind: null,
      remoteKind: "file",
      localFingerprint: null,
      remoteSha: "u".repeat(40),
      sizeBytes: 5,
    },
  ],
  conflicts: [{ path: "doc.tex", kind: "text" }],
};

const rows = buildSyncDiffRows(plan);
const summary = summarizeSyncRows(rows);

afterEach(() => {
  cleanup();
});

function renderView(
  overrides: {
    decisions?: Record<string, SyncResolution>;
    state?: SyncUiState;
    error?: string | null;
    onDecide?: (path: string, decision: SyncResolution) => void;
    onApply?: () => void;
  } = {},
) {
  const decisions = overrides.decisions ?? {};
  return render(
    createElement(SyncResolutionView, {
      plan,
      decisions,
      state: overrides.state ?? deriveSyncUiState({ transport: "conflict", rows, decisions }),
      summary,
      error: overrides.error ?? null,
      onDecide: overrides.onDecide ?? (() => {}),
      onApply: overrides.onApply ?? (() => {}),
    }),
  );
}

it("shows base, local and remote changes with a resolution control per conflict", () => {
  const { container } = renderView();

  expect(screen.getByText("doc.tex")).toBeTruthy();
  expect(screen.getByText("added.tex")).toBeTruthy();

  const docRow = container.querySelector('tr[data-action="conflict"]')!;
  expect(docRow.querySelector('[data-side="base"]')!.textContent).toBe("text");
  expect(docRow.querySelector('[data-side="local"]')!.textContent).toBe("text");
  expect(docRow.querySelector('[data-side="remote"]')!.textContent).toBe("text");

  const addedRow = container.querySelector('tr[data-action="add"]')!;
  expect(addedRow.querySelector('[data-side="base"]')!.textContent).toBe("—");
  expect(addedRow.querySelector('[data-side="remote"]')!.textContent).toBe("file");

  const select = screen.getByLabelText("Resolution for doc.tex");
  expect(select).toBeTruthy();
  expect((select as HTMLSelectElement).value).toBe("");
  // The safe "add" path needs no manual resolution.
  expect(screen.queryByLabelText("Resolution for added.tex")).toBeNull();
});

it("submits keep-local, keep-remote and manual decisions through the callback", () => {
  const onDecide = vi.fn();
  renderView({ onDecide });

  fireEvent.change(screen.getByLabelText("Resolution for doc.tex"), {
    target: { value: "keep-remote" },
  });
  expect(onDecide).toHaveBeenCalledWith("doc.tex", "keep-remote");

  fireEvent.change(screen.getByLabelText("Resolution for doc.tex"), {
    target: { value: "manual" },
  });
  expect(onDecide).toHaveBeenCalledWith("doc.tex", "manual");
});

it("never labels an unresolved, pending, failing or manual plan as synced", () => {
  const conflict = renderView({ state: "conflict" });
  expect(screen.getByText("Conflicts need a choice")).toBeTruthy();
  expect(screen.queryByText("Synced")).toBeNull();
  conflict.unmount();

  const pending = renderView({ state: "sync_pending", decisions: { "doc.tex": "manual" } });
  expect(screen.getByText("Pending sync")).toBeTruthy();
  expect(screen.queryByText("Synced")).toBeNull();
  pending.unmount();

  const error = renderView({
    state: "error",
    decisions: { "doc.tex": "keep-remote" },
    error: "The remote advanced. Refresh and review again.",
  });
  expect(screen.getByText("Sync error")).toBeTruthy();
  expect(screen.getByText("The remote advanced. Refresh and review again.")).toBeTruthy();
  expect(screen.queryByText("Synced")).toBeNull();
  error.unmount();

  const synced = renderView({ state: "synced", decisions: { "doc.tex": "keep-local" } });
  expect(screen.getByText("Synced")).toBeTruthy();
  synced.unmount();
});

it("blocks apply until every conflict is resolved and re-enables it afterwards", () => {
  const unresolved = renderView({ state: "conflict" });
  const applyButton = screen.getByRole("button", { name: "Apply remote changes" });
  expect((applyButton as HTMLButtonElement).disabled).toBe(true);
  unresolved.unmount();

  const resolved = renderView({ state: "sync_pending", decisions: { "doc.tex": "keep-remote" } });
  expect(
    (screen.getByRole("button", { name: "Apply remote changes" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  resolved.unmount();

  const manual = renderView({ state: "sync_pending", decisions: { "doc.tex": "manual" } });
  expect(
    (screen.getByRole("button", { name: "Apply remote changes" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  manual.unmount();
});

it("discards conflict decisions when a refreshed plan changes", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  let revision = "22222222-2222-4222-8222-222222222222";
  const fetcher = vi.fn(async () =>
    Response.json({
      id: projectId,
      status: "conflict",
      sourceRevisionId: revision,
      remoteRevision: "a".repeat(40),
      conflicts: [{ path: "doc.tex", kind: "text" }],
      entries: plan.entries,
      base: plan.base,
    }),
  );
  render(
    createElement(GitHubSyncPanel, {
      projectId,
      apiUrl: "http://api.test/api/v1",
      fetcher: fetcher as unknown as typeof fetch,
    }),
  );
  await screen.findByLabelText("Resolution for doc.tex");
  fireEvent.change(screen.getByLabelText("Resolution for doc.tex"), {
    target: { value: "keep-remote" },
  });
  expect((screen.getByLabelText("Resolution for doc.tex") as HTMLSelectElement).value).toBe(
    "keep-remote",
  );
  revision = "33333333-3333-4333-8333-333333333333";
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect((screen.getByLabelText("Resolution for doc.tex") as HTMLSelectElement).value).toBe(""),
  );
  expect(
    (screen.getByRole("button", { name: "Apply remote changes" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
