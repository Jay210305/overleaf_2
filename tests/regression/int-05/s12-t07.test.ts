import { describe, expect, it } from "vitest";
import { maxFileBytes } from "@latex-collab/storage";
import { createGitHubRestReader } from "../../../apps/api/src/modules/integrations/github-rest.js";
import {
  createGitHubRestPushWriter,
  type GitHubPushWriter,
} from "../../../apps/jobs/src/sync/github-push.js";
import {
  classifyPull,
  mapProviderError,
  type GitHubPullError,
} from "../../../apps/jobs/src/sync/github-pull.js";

/**
 * INT-05 scoped slice of S12-T07: the GitHub REST boundaries reject expired
 * tokens, rate limits, redirects and inconsistent blobs with typed codes, the
 * non-force ref update surfaces a remote advance as REMOTE_CONFLICT, and the
 * conservative classifier never silently overwrites a shared path without a
 * recorded agreement.
 */

const SHA = "a".repeat(40);
const response = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const readerError = async (fetchMock: typeof fetch) => {
  try {
    await createGitHubRestReader(fetchMock).readFile(
      "server-held-token",
      "octo/docs",
      "main",
      "main.tex",
      SHA,
    );
    throw new Error("expected the reader to reject");
  } catch (error) {
    return mapProviderError(error) as GitHubPullError;
  }
};

describe("INT-05 GitHub provider failure boundaries", () => {
  it("maps expired tokens, rate limits and missing credentials to typed codes", async () => {
    expect(await readerError((async () => response(401)) as unknown as typeof fetch)).toMatchObject(
      {
        status: 401,
        code: "TOKEN_EXPIRED",
      },
    );
    expect(await readerError((async () => response(429)) as unknown as typeof fetch)).toMatchObject(
      { status: 429, code: "RATE_LIMITED" },
    );
    expect(await readerError((async () => response(403)) as unknown as typeof fetch)).toMatchObject(
      {
        status: 401,
        code: "CREDENTIALS_MISSING",
      },
    );
  });

  it("rejects a truncated or inconsistent blob instead of reading it", async () => {
    expect(
      await readerError((async () =>
        response(200, {
          encoding: "base64",
          size: maxFileBytes + 1,
          content: Buffer.from("x").toString("base64"),
        })) as unknown as typeof fetch),
    ).toMatchObject({ status: 413, code: "QUOTA_EXCEEDED" });

    const mismatched = await readerError((async () =>
      response(200, {
        encoding: "base64",
        size: 5,
        content: Buffer.from("abc").toString("base64"),
      })) as unknown as typeof fetch);
    expect(mismatched).toMatchObject({ status: 502, code: "PROVIDER_UNAVAILABLE" });

    const notBase64 = await readerError((async () =>
      response(200, { encoding: "utf-8", size: 3, content: "abc" })) as unknown as typeof fetch);
    expect(notBase64).toMatchObject({ status: 502, code: "PROVIDER_UNAVAILABLE" });
  });

  it("never follows a redirect and rejects a non-JSON provider body", async () => {
    const redirects: Array<RequestRedirect | undefined> = [];
    const redirecting = (async (_url: string | URL | Request, init?: RequestInit) => {
      redirects.push(init?.redirect);
      return response(200, { encoding: "base64", size: 0, content: "" });
    }) as unknown as typeof fetch;
    await createGitHubRestReader(redirecting).readFile(
      "token",
      "octo/docs",
      "main",
      "main.tex",
      SHA,
    );
    expect(redirects).toEqual(["error"]);

    const notJson = await readerError((async () =>
      response(200, "<html>not json</html>")) as unknown as typeof fetch);
    expect(notJson).toMatchObject({ status: 502, code: "PROVIDER_UNAVAILABLE" });
  });

  it("treats a non-fast-forward ref update as REMOTE_CONFLICT, never a force push", async () => {
    let requestBody: unknown;
    const writer = createGitHubRestPushWriter((async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestBody = JSON.parse(String(init?.body));
      return response(409, { message: "Update is not a fast forward" });
    }) as unknown as typeof fetch) as GitHubPushWriter;
    let caught: unknown;
    try {
      await writer.updateBranch("token", "octo/docs", "main", SHA);
    } catch (error) {
      caught = error;
    }
    expect(requestBody).toEqual({ sha: SHA, force: false });
    expect(mapProviderError(caught)).toMatchObject({ status: 409, code: "REMOTE_CONFLICT" });
  });

  it("classifies a shared path as a conflict when no agreement was recorded", () => {
    const withoutBase = classifyPull({
      base: null,
      localFiles: [
        { path: "doc.tex", kind: "text", fingerprint: "local-fingerprint", sizeBytes: 3 },
      ],
      remoteEntries: [{ path: "doc.tex", kind: "file", sizeBytes: 4, sha: SHA }],
    });
    expect(withoutBase.entries).toEqual([
      expect.objectContaining({ path: "doc.tex", action: "conflict" }),
    ]);
    expect(withoutBase.conflicts).toEqual([{ path: "doc.tex", kind: "text" }]);

    const withBase = classifyPull({
      base: {
        version: 1,
        remoteSha: SHA,
        entries: [
          { path: "doc.tex", kind: "text", localFingerprint: "local-fingerprint", remoteSha: SHA },
        ],
      },
      localFiles: [
        { path: "doc.tex", kind: "text", fingerprint: "local-fingerprint", sizeBytes: 3 },
      ],
      remoteEntries: [{ path: "doc.tex", kind: "file", sizeBytes: 4, sha: SHA }],
    });
    expect(withBase.entries).toEqual([
      expect.objectContaining({ path: "doc.tex", action: "unchanged" }),
    ]);
    expect(withBase.conflicts).toEqual([]);
  });
});
