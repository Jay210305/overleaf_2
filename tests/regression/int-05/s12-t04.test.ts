import { describe, expect, it } from "vitest";
import { createGitHubRestPushWriter } from "../../../apps/jobs/src/sync/github-push.js";
import { mapProviderError } from "../../../apps/jobs/src/sync/github-pull.js";

describe("INT-05 GitHub ref protection", () => {
  it("treats GitHub's non-fast-forward response as a conflict", async () => {
    let requestBody: unknown;
    const request = async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ message: "Reference update failed" }), { status: 422 });
    };
    let caught: unknown;
    try {
      await createGitHubRestPushWriter(request as typeof fetch).updateBranch(
        "server-held-token",
        "octo/docs",
        "main",
        "c".repeat(40),
      );
    } catch (error) {
      caught = error;
    }
    expect(requestBody).toEqual({ sha: "c".repeat(40), force: false });
    expect(mapProviderError(caught)).toMatchObject({ status: 409, code: "REMOTE_CONFLICT" });
  });
});
